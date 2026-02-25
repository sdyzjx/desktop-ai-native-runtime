const express = require('express');
const { WebSocketServer } = require('ws');
const path = require('path');
const { v4: uuidv4 } = require('uuid');

const tools = require('../runtime/executor/localTools');
const { ToolExecutor } = require('../runtime/executor/toolExecutor');
const { ToolLoopRunner } = require('../runtime/loop/toolLoopRunner');
const { RuntimeEventBus } = require('../runtime/bus/eventBus');
const { ToolCallDispatcher } = require('../runtime/orchestrator/toolCallDispatcher');
const { RpcInputQueue } = require('../runtime/queue/rpcInputQueue');
const { RuntimeRpcWorker } = require('../runtime/rpc/runtimeRpcWorker');
const { RpcErrorCode, createRpcError } = require('../runtime/rpc/jsonRpc');
const { ProviderConfigStore } = require('../runtime/config/providerConfigStore');
const { LlmProviderManager } = require('../runtime/config/llmProviderManager');

const app = express();
app.use(express.json({ limit: '1mb' }));
app.use(express.static(path.join(__dirname, 'public')));

const bus = new RuntimeEventBus();
const queue = new RpcInputQueue({ maxSize: 2000 });
const executor = new ToolExecutor(tools);
const providerStore = new ProviderConfigStore();
const llmManager = new LlmProviderManager({ store: providerStore });

const runner = new ToolLoopRunner({
  bus,
  getReasoner: () => llmManager.getReasoner(),
  listTools: () => executor.listTools(),
  maxStep: 8,
  toolResultTimeoutMs: 10000
});

const dispatcher = new ToolCallDispatcher({ bus, executor });
dispatcher.start();

const worker = new RuntimeRpcWorker({ queue, runner, bus });
worker.start();

app.get('/health', (_, res) => {
  res.json({
    ok: true,
    queue_size: queue.size(),
    llm: llmManager.getConfigSummary()
  });
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

const server = app.listen(port, () => {
  const summary = llmManager.getConfigSummary();
  console.log(`Debug web: http://localhost:${port}`);
  console.log(`LLM provider: ${summary.active_provider} / ${summary.active_model} / has_api_key=${summary.has_api_key}`);
});

const wss = new WebSocketServer({ server, path: '/ws' });

function sendSafe(ws, payload) {
  if (ws.readyState !== 1) return;
  ws.send(JSON.stringify(payload));
}

async function enqueueRpc(ws, rpcPayload, mode) {
  const context = {
    send: (payload) => sendSafe(ws, payload),
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
          input: msg.input || ''
        }
      };

      await enqueueRpc(ws, rpcPayload, 'legacy');
      return;
    }

    sendSafe(ws, createRpcError(null, RpcErrorCode.INVALID_REQUEST, 'Unsupported message format'));
  });
});
