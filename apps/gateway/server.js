const express = require('express');
const { WebSocketServer } = require('ws');
const path = require('path');
const { v4: uuidv4 } = require('uuid');

const { ToolExecutor } = require('../runtime/executor/toolExecutor');
const { ToolLoopRunner } = require('../runtime/loop/toolLoopRunner');
const { RuntimeEventBus } = require('../runtime/bus/eventBus');
const { ToolCallDispatcher } = require('../runtime/orchestrator/toolCallDispatcher');
const { RpcInputQueue } = require('../runtime/queue/rpcInputQueue');
const { RuntimeRpcWorker } = require('../runtime/rpc/runtimeRpcWorker');
const { RpcErrorCode, createRpcError } = require('../runtime/rpc/jsonRpc');
const { ProviderConfigStore } = require('../runtime/config/providerConfigStore');
const { LlmProviderManager } = require('../runtime/config/llmProviderManager');
const { ToolConfigManager } = require('../runtime/config/toolConfigManager');
const { FileSessionStore } = require('../runtime/session/fileSessionStore');
const { buildRecentContextMessages } = require('../runtime/session/contextBuilder');
const { getDefaultLongTermMemoryStore } = require('../runtime/session/longTermMemoryStore');
const { loadMemorySop } = require('../runtime/session/memorySopLoader');
const { getDefaultSessionWorkspaceManager } = require('../runtime/session/workspaceManager');
const {
  isSessionPermissionLevel,
  normalizeSessionPermissionLevel,
  normalizeWorkspaceSettings
} = require('../runtime/session/sessionPermissions');
const { canReadLongTermMemory } = require('../runtime/security/sessionPermissionPolicy');
const { SkillRuntimeManager } = require('../runtime/skills/skillRuntimeManager');
const { PersonaContextBuilder } = require('../runtime/persona/personaContextBuilder');

const app = express();
app.use(express.json({ limit: '1mb' }));
app.use('/assets', express.static(path.join(__dirname, '..', '..', 'assets')));
app.use(express.static(path.join(__dirname, 'public')));

const bus = new RuntimeEventBus();
const queue = new RpcInputQueue({ maxSize: 2000 });
const toolConfigManager = new ToolConfigManager();
const toolRuntime = toolConfigManager.buildRegistry();
const executor = new ToolExecutor(toolRuntime.registry, { policy: toolRuntime.policy, exec: toolRuntime.exec });
const providerStore = new ProviderConfigStore();
const llmManager = new LlmProviderManager({ store: providerStore });
const sessionStore = new FileSessionStore();
const longTermMemoryStore = getDefaultLongTermMemoryStore();
const workspaceManager = getDefaultSessionWorkspaceManager();
const skillRuntimeManager = new SkillRuntimeManager({ workspaceDir: process.cwd() });
const personaContextBuilder = new PersonaContextBuilder({
  workspaceDir: process.cwd(),
  memoryStore: longTermMemoryStore
});

const contextMaxMessages = Math.max(0, Number(process.env.CONTEXT_MAX_MESSAGES) || 12);
const contextMaxChars = Math.max(0, Number(process.env.CONTEXT_MAX_CHARS) || 12000);
const memoryBootstrapMaxEntries = Math.max(0, Number(process.env.MEMORY_BOOTSTRAP_MAX_ENTRIES) || 10);
const memoryBootstrapMaxChars = Math.max(0, Number(process.env.MEMORY_BOOTSTRAP_MAX_CHARS) || 2400);
const memorySopMaxChars = Math.max(0, Number(process.env.MEMORY_SOP_MAX_CHARS) || 8000);

const runner = new ToolLoopRunner({
  bus,
  getReasoner: () => llmManager.getReasoner(),
  listTools: () => executor.listTools(),
  resolvePersonaContext: ({ sessionId, input }) => personaContextBuilder.build({ sessionId, input }),
  resolveSkillsContext: ({ sessionId, input }) => skillRuntimeManager.buildTurnContext({ sessionId, input }),
  maxStep: 8,
  toolResultTimeoutMs: 10000
});

const dispatcher = new ToolCallDispatcher({ bus, executor });
dispatcher.start();

const worker = new RuntimeRpcWorker({ queue, runner, bus });
worker.start();

app.get('/health', async (_, res) => {
  const sessionStats = await sessionStore.getStats();
  res.json({
    ok: true,
    queue_size: queue.size(),
    llm: llmManager.getConfigSummary(),
    tools: toolConfigManager.getSummary(),
    session_store: sessionStats,
    workspace_store: {
      root_dir: workspaceManager.rootDir
    }
  });
});

app.get('/api/sessions', async (req, res) => {
  const limit = Math.max(1, Math.min(Number(req.query.limit) || 50, 200));
  const offset = Math.max(0, Number(req.query.offset) || 0);
  const result = await sessionStore.listSessions({ limit, offset });
  res.json({ ok: true, data: result });
});

app.get('/api/sessions/:sessionId', async (req, res) => {
  const session = await sessionStore.getSession(req.params.sessionId);
  if (!session) {
    res.status(404).json({ ok: false, error: 'session not found' });
    return;
  }
  res.json({ ok: true, data: session });
});

app.get('/api/sessions/:sessionId/events', async (req, res) => {
  const limit = Math.max(1, Math.min(Number(req.query.limit) || 200, 500));
  const offset = Math.max(0, Number(req.query.offset) || 0);
  const events = await sessionStore.getSessionEvents(req.params.sessionId, { limit, offset });
  res.json({ ok: true, data: events });
});

app.get('/api/sessions/:sessionId/memory', async (req, res) => {
  const session = await sessionStore.getSession(req.params.sessionId);
  if (!session) {
    res.status(404).json({ ok: false, error: 'session not found' });
    return;
  }
  res.json({ ok: true, data: session.memory || null });
});

app.get('/api/sessions/:sessionId/settings', async (req, res) => {
  const settings = await sessionStore.getSessionSettings(req.params.sessionId);
  if (!settings) {
    res.status(404).json({ ok: false, error: 'session not found' });
    return;
  }
  res.json({ ok: true, data: settings });
});

app.put('/api/sessions/:sessionId/settings', async (req, res) => {
  const settings = req.body?.settings;
  if (!settings || typeof settings !== 'object' || Array.isArray(settings)) {
    res.status(400).json({ ok: false, error: 'body.settings must be an object' });
    return;
  }

  if (
    Object.prototype.hasOwnProperty.call(settings, 'permission_level')
    && !isSessionPermissionLevel(settings.permission_level)
  ) {
    res.status(400).json({ ok: false, error: 'settings.permission_level must be low|medium|high' });
    return;
  }

  if (Object.prototype.hasOwnProperty.call(settings, 'workspace')) {
    if (!settings.workspace || typeof settings.workspace !== 'object' || Array.isArray(settings.workspace)) {
      res.status(400).json({ ok: false, error: 'settings.workspace must be an object' });
      return;
    }
  }

  const updated = await sessionStore.updateSessionSettings(req.params.sessionId, settings);
  res.json({ ok: true, data: updated });
});

app.get('/api/memory', async (req, res) => {
  const limit = Math.max(1, Math.min(Number(req.query.limit) || 50, 200));
  const offset = Math.max(0, Number(req.query.offset) || 0);
  const result = await longTermMemoryStore.listEntries({ limit, offset });
  res.json({ ok: true, data: result });
});

app.get('/api/memory/search', async (req, res) => {
  const query = String(req.query.q || '');
  const limit = Math.max(1, Math.min(Number(req.query.limit) || 10, 50));
  if (!query.trim()) {
    res.status(400).json({ ok: false, error: 'query q is required' });
    return;
  }
  const result = await longTermMemoryStore.searchEntries({ query, limit });
  res.json({ ok: true, data: result });
});

app.get('/api/config/providers', (_, res) => {
  res.json({ ok: true, data: llmManager.getConfigSummary() });
});

app.get('/api/config/providers/config', (_, res) => {
  try {
    res.json({ ok: true, data: llmManager.getConfig() });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message || String(err) });
  }
});

app.get('/api/config/providers/raw', (_, res) => {
  res.json({ ok: true, yaml: llmManager.loadYaml() });
});

app.get('/api/config/tools/config', (_, res) => {
  try {
    res.json({ ok: true, data: toolConfigManager.getConfig() });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message || String(err) });
  }
});

app.get('/api/config/tools/raw', (_, res) => {
  try {
    res.json({ ok: true, yaml: toolConfigManager.loadYaml() });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message || String(err) });
  }
});

app.put('/api/config/providers/config', (req, res) => {
  const config = req.body?.config;
  if (!config || typeof config !== 'object' || Array.isArray(config)) {
    res.status(400).json({ ok: false, error: 'body.config must be an object' });
    return;
  }

  try {
    llmManager.saveConfig(config);
    res.json({ ok: true, data: llmManager.getConfigSummary() });
  } catch (err) {
    res.status(400).json({ ok: false, error: err.message || String(err) });
  }
});

app.put('/api/config/providers/raw', (req, res) => {
  const yaml = req.body?.yaml;
  if (typeof yaml !== 'string') {
    res.status(400).json({ ok: false, error: 'body.yaml must be a string' });
    return;
  }

  try {
    llmManager.saveYaml(yaml);
    res.json({ ok: true, data: llmManager.getConfigSummary() });
  } catch (err) {
    res.status(400).json({ ok: false, error: err.message || String(err) });
  }
});

const port = Number(process.env.PORT) || 3000;
const host = process.env.HOST || '0.0.0.0';

const server = app.listen(port, host, () => {
  const summary = llmManager.getConfigSummary();
  console.log(`Debug web: http://localhost:${port} (listening on ${host})`);
  console.log(`LLM provider: ${summary.active_provider} / ${summary.active_model} / has_api_key=${summary.has_api_key}`);
});

const wss = new WebSocketServer({ server, path: '/ws' });

function sendSafe(ws, payload) {
  if (ws.readyState !== 1) return;
  ws.send(JSON.stringify(payload));
}

async function enqueueRpc(ws, rpcPayload, mode) {
  const requestInput = String(rpcPayload.params?.input || '');
  const requestId = rpcPayload.id ?? null;
  const requestedPermissionLevel = rpcPayload.params?.permission_level;

  if (requestedPermissionLevel !== undefined && !isSessionPermissionLevel(requestedPermissionLevel)) {
    if (mode === 'legacy') {
      sendSafe(ws, { type: 'error', message: 'permission_level must be low|medium|high' });
      return;
    }
    sendSafe(ws, createRpcError(requestId, RpcErrorCode.INVALID_PARAMS, 'params.permission_level must be low|medium|high'));
    return;
  }

  const context = {
    buildRunContext: async ({ session_id: sessionId }) => {
      const existingSettings = await sessionStore.getSessionSettings(sessionId);
      const permissionLevel = normalizeSessionPermissionLevel(
        requestedPermissionLevel !== undefined
          ? requestedPermissionLevel
          : existingSettings?.permission_level
      );
      const workspace = await workspaceManager.getWorkspaceInfo(sessionId);
      const normalizedWorkspace = normalizeWorkspaceSettings(workspace);

      await sessionStore.updateSessionSettings(sessionId, {
        permission_level: permissionLevel,
        workspace: normalizedWorkspace
      });

      return {
        permission_level: permissionLevel,
        workspace_root: normalizedWorkspace.root_dir
      };
    },
    send: (payload) => sendSafe(ws, payload),
    buildPromptMessages: async ({ session_id: sessionId, runtime_context: runtimeContext }) => {
      const session = await sessionStore.getSession(sessionId);
      const isSessionStart = !session || !Array.isArray(session.messages) || session.messages.length === 0;
      const permissionLevel = normalizeSessionPermissionLevel(
        runtimeContext?.permission_level || session?.settings?.permission_level
      );
      const allowMemoryRead = canReadLongTermMemory(permissionLevel);
      const seedMessages = [];

      if (isSessionStart && allowMemoryRead) {
        const sop = await loadMemorySop({ maxChars: memorySopMaxChars });
        if (sop) {
          seedMessages.push({
            role: 'system',
            content: [
              'Long-term memory SOP (Markdown). Follow this policy when calling memory tools.',
              sop
            ].join('\n\n')
          });
        }

        const bootstrapEntries = await longTermMemoryStore.getBootstrapEntries({
          limit: memoryBootstrapMaxEntries,
          maxChars: memoryBootstrapMaxChars
        });
        if (bootstrapEntries.length) {
          const lines = bootstrapEntries.map((entry, index) => {
            const keywords = Array.isArray(entry.keywords) && entry.keywords.length
              ? ` [keywords: ${entry.keywords.join(', ')}]`
              : '';
            return `${index + 1}. ${entry.content}${keywords}`;
          });
          seedMessages.push({
            role: 'system',
            content: [
              'Bootstrap long-term memory context for this new session.',
              ...lines
            ].join('\n')
          });
        }
      }

      const recentMessages = buildRecentContextMessages(session, {
        maxMessages: contextMaxMessages,
        maxChars: contextMaxChars
      });

      return [...seedMessages, ...recentMessages];
    },
    onRunStart: async ({ session_id: sessionId, runtime_context: runtimeContext }) => {
      await sessionStore.createSessionIfNotExists({ sessionId, title: 'New chat' });
      await sessionStore.appendMessage(sessionId, {
        role: 'user',
        content: requestInput,
        request_id: requestId,
        metadata: {
          mode,
          permission_level: runtimeContext?.permission_level || normalizeSessionPermissionLevel(requestedPermissionLevel),
          workspace_root: runtimeContext?.workspace_root || null
        }
      });
    },
    onRuntimeEvent: async (event) => {
      const sessionId = event.session_id || rpcPayload.params?.session_id;
      if (!sessionId) return;
      await sessionStore.appendEvent(sessionId, event);
    },
    onRunFinal: async ({ session_id: sessionId, trace_id: traceId, output, state, runtime_context: runtimeContext }) => {
      const settings = await sessionStore.getSessionSettings(sessionId);
      const permissionLevel = normalizeSessionPermissionLevel(settings?.permission_level);

      await sessionStore.appendMessage(sessionId, {
        role: 'assistant',
        content: String(output || ''),
        trace_id: traceId,
        request_id: requestId,
        metadata: {
          state,
          mode,
          permission_level: permissionLevel,
          workspace_root: runtimeContext?.workspace_root || settings?.workspace?.root_dir || null
        }
      });
      await sessionStore.appendRun(sessionId, {
        request_id: requestId,
        trace_id: traceId,
        input: requestInput,
        output: String(output || ''),
        state,
        mode,
        permission_level: permissionLevel,
        workspace_root: runtimeContext?.workspace_root || settings?.workspace?.root_dir || null
      });
    },
    sendEvent: (eventPayload) => {
      if (mode === 'legacy') {
        if (eventPayload.method === 'runtime.start') {
          sendSafe(ws, { type: 'start', ...eventPayload.params });
          return;
        }

        if (eventPayload.method === 'runtime.event') {
          sendSafe(ws, { type: 'event', data: eventPayload.params });
          return;
        }

        if (eventPayload.method === 'runtime.final') {
          sendSafe(ws, { type: 'final', ...eventPayload.params });
          return;
        }

        return;
      }

      sendSafe(ws, eventPayload);
    }
  };

  const result = await queue.submit(rpcPayload, context);
  if (result.accepted) return;

  if (mode === 'legacy') {
    sendSafe(ws, { type: 'error', message: result.response.error?.message || 'request rejected' });
    return;
  }

  sendSafe(ws, result.response);
}

wss.on('connection', (ws) => {
  ws.on('message', async (raw) => {
    let msg;
    try {
      msg = JSON.parse(raw.toString());
    } catch {
      sendSafe(ws, createRpcError(null, RpcErrorCode.PARSE_ERROR, 'Invalid JSON'));
      return;
    }

    if (msg && msg.jsonrpc === '2.0') {
      await enqueueRpc(ws, msg, 'rpc');
      return;
    }

    if (msg && msg.type === 'run') {
      const rpcPayload = {
        jsonrpc: '2.0',
        method: 'runtime.run',
        params: {
          session_id: msg.session_id || `web-${uuidv4()}`,
          input: msg.input || '',
          permission_level: msg.permission_level
        }
      };

      await enqueueRpc(ws, rpcPayload, 'legacy');
      return;
    }

    sendSafe(ws, createRpcError(null, RpcErrorCode.INVALID_REQUEST, 'Unsupported message format'));
  });
});
