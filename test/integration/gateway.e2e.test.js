const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const http = require('node:http');
const { spawn } = require('node:child_process');
const WebSocket = require('ws');

const { getFreePort } = require('../helpers/net');
const { waitFor, sleep } = require('../helpers/wait');

async function startMockLlmServer(port) {
  const state = {
    requestCount: 0,
    secondTurnSawFirstTurnContext: false,
    sawMemorySopOnNewSession: false,
    sawBootstrapMemoryOnNewSession: false,
    lowPermissionSawMemorySop: false,
    lowPermissionSawBootstrapMemory: false,
    sawMultimodalImageInput: false
  };

  const server = http.createServer((req, res) => {
    if (req.method !== 'POST' || req.url !== '/chat/completions') {
      res.writeHead(404).end('not found');
      return;
    }

    let raw = '';
    req.on('data', (chunk) => { raw += chunk; });
    req.on('end', () => {
      state.requestCount += 1;
      const body = JSON.parse(raw || '{}');
      const messages = body.messages || [];
      const last = messages[messages.length - 1] || {};
      const lastUser = [...messages].reverse().find((msg) => msg.role === 'user');
      const extractUserText = (content) => {
        if (typeof content === 'string') return content;
        if (!Array.isArray(content)) return '';
        return content
          .filter((part) => part?.type === 'text' && typeof part.text === 'string')
          .map((part) => part.text)
          .join(' ');
      };
      const hasUserImagePart = (content) => {
        if (!Array.isArray(content)) return false;
        return content.some(
          (part) => part?.type === 'image_url' && typeof part.image_url?.url === 'string' && part.image_url.url.startsWith('data:image/')
        );
      };
      const lastUserText = extractUserText(lastUser?.content);

      if (lastUserText === 'second turn') {
        const hasFirstTurnHistory = messages.some(
          (msg) => msg.role === 'user' && msg.content === 'first turn'
        );
        if (hasFirstTurnHistory) {
          state.secondTurnSawFirstTurnContext = true;
        }
      }

      if (lastUserText === 'ask memory in new session') {
        state.sawMemorySopOnNewSession = messages.some(
          (msg) => msg.role === 'system' && /Long-term memory SOP/i.test(String(msg.content || ''))
        );
        state.sawBootstrapMemoryOnNewSession = messages.some(
          (msg) => msg.role === 'system' && /favorite color is blue/i.test(String(msg.content || ''))
        );
      }

      if (lastUserText === 'ask memory in low permission session') {
        state.lowPermissionSawMemorySop = messages.some(
          (msg) => msg.role === 'system' && /Long-term memory SOP/i.test(String(msg.content || ''))
        );
        state.lowPermissionSawBootstrapMemory = messages.some(
          (msg) => msg.role === 'system' && /favorite color is blue/i.test(String(msg.content || ''))
        );
      }

      if (lastUserText === 'describe this uploaded image') {
        state.sawMultimodalImageInput = hasUserImagePart(lastUser?.content);
      }

      let message;
      if (lastUserText === 'save memory: my favorite color is blue') {
        if (last.role === 'tool' && last.name === 'memory_write') {
          message = { role: 'assistant', content: 'saved: long-term memory written' };
        } else {
          message = {
            role: 'assistant',
            content: '',
            tool_calls: [
              {
                id: 'call_mem_write_1',
                type: 'function',
                function: {
                  name: 'memory_write',
                  arguments: JSON.stringify({
                    content: 'user favorite color is blue',
                    keywords: ['favorite', 'color', 'blue']
                  })
                }
              }
            ]
          };
        }
      } else if (lastUserText === 'ask memory in new session') {
        if (last.role === 'tool' && last.name === 'memory_search') {
          message = { role: 'assistant', content: `memory_result:${last.content}` };
        } else {
          message = {
            role: 'assistant',
            content: '',
            tool_calls: [
              {
                id: 'call_mem_search_1',
                type: 'function',
                function: {
                  name: 'memory_search',
                  arguments: JSON.stringify({
                    query: 'favorite color blue',
                    limit: 3
                  })
                }
              }
            ]
          };
        }
      } else if (lastUserText === 'ask memory in low permission session') {
        message = { role: 'assistant', content: 'low permission memory bootstrap disabled' };
      } else if (lastUserText === 'describe this uploaded image') {
        message = { role: 'assistant', content: 'image analyzed: success' };
      } else if (last.role === 'tool') {
        message = { role: 'assistant', content: `final:${last.content}` };
      } else {
        message = {
          role: 'assistant',
          content: '',
          tool_calls: [
            {
              id: 'call_mock_1',
              type: 'function',
              function: {
                name: 'add',
                arguments: JSON.stringify({ a: 20, b: 22 })
              }
            }
          ]
        };
      }

      res.setHeader('content-type', 'application/json');
      res.end(JSON.stringify({ choices: [{ message }] }));
    });
  });

  await new Promise((resolve) => server.listen(port, '127.0.0.1', resolve));
  return { server, state };
}

async function startGateway({ port, providerConfigPath, sessionStoreDir, longTermMemoryDir }) {
  const child = spawn('node', ['apps/gateway/server.js'], {
    cwd: path.resolve(__dirname, '../..'),
    env: {
      ...process.env,
      PORT: String(port),
      PROVIDER_CONFIG_PATH: providerConfigPath,
      SESSION_STORE_DIR: sessionStoreDir,
      LONG_TERM_MEMORY_DIR: longTermMemoryDir,
      MEMORY_BOOTSTRAP_MAX_ENTRIES: '2'
    },
    stdio: ['ignore', 'pipe', 'pipe']
  });

  let logs = '';
  child.stdout.on('data', (chunk) => { logs += chunk.toString(); });
  child.stderr.on('data', (chunk) => { logs += chunk.toString(); });

  await waitFor(async () => {
    try {
      const resp = await fetch(`http://127.0.0.1:${port}/health`);
      return resp.ok;
    } catch {
      return false;
    }
  }, { timeoutMs: 7000, intervalMs: 150 });

  return { child, getLogs: () => logs };
}

async function stopProcess(child) {
  if (!child || child.killed) return;
  child.kill('SIGTERM');
  for (let i = 0; i < 20; i += 1) {
    if (child.exitCode !== null) return;
    await sleep(50);
  }
  child.kill('SIGKILL');
}

function wsRequest(url, payload, { expectRpcId } = {}) {
  return new Promise((resolve, reject) => {
    const ws = new WebSocket(url);
    const events = [];

    const timer = setTimeout(() => {
      ws.close();
      reject(new Error('ws request timeout'));
    }, 12000);

    ws.on('open', () => ws.send(JSON.stringify(payload)));
    ws.on('message', (buf) => {
      const msg = JSON.parse(buf.toString());
      events.push(msg);

      if (msg.type === 'final') {
        clearTimeout(timer);
        ws.close();
        resolve({ messages: events, final: msg });
        return;
      }

      if (expectRpcId !== undefined && msg.id === expectRpcId) {
        clearTimeout(timer);
        ws.close();
        resolve({ messages: events, result: msg });
      }
    });
    ws.on('error', (err) => {
      clearTimeout(timer);
      reject(err);
    });
  });
}

test('gateway end-to-end covers health, config api, legacy ws and json-rpc ws', async () => {
  const llmPort = await getFreePort();
  const gatewayPort = await getFreePort();

  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'gateway-e2e-'));
  const providerConfigPath = path.join(tmpDir, 'providers.yaml');
  const sessionStoreDir = path.join(tmpDir, 'session-store');
  const longTermMemoryDir = path.join(tmpDir, 'long-term-memory');
  fs.writeFileSync(providerConfigPath, [
    'active_provider: mock',
    'providers:',
    '  mock:',
    '    type: openai_compatible',
    '    display_name: Mock',
    `    base_url: http://127.0.0.1:${llmPort}`,
    '    model: mock-model',
    '    api_key: mock-key',
    '    timeout_ms: 2000'
  ].join('\n'));

  const llm = await startMockLlmServer(llmPort);
  let gateway;

  try {
    gateway = await startGateway({ port: gatewayPort, providerConfigPath, sessionStoreDir, longTermMemoryDir });

    const health = await fetch(`http://127.0.0.1:${gatewayPort}/health`).then((r) => r.json());
    assert.equal(health.ok, true);
    assert.equal(health.llm.active_provider, 'mock');
    assert.equal(health.session_store.root_dir, sessionStoreDir);

    const configSummary = await fetch(`http://127.0.0.1:${gatewayPort}/api/config/providers`).then((r) => r.json());
    assert.equal(configSummary.ok, true);
    assert.equal(configSummary.data.active_model, 'mock-model');

    const legacy = await wsRequest(`ws://127.0.0.1:${gatewayPort}/ws`, {
      type: 'run',
      session_id: 'legacy-s1',
      permission_level: 'high',
      input: 'please compute'
    });

    assert.ok(legacy.final);
    assert.equal(legacy.final.output, 'final:42');
    const legacyEvents = legacy.messages.filter((m) => m.type === 'event').map((m) => m.data.event);
    assert.ok(legacyEvents.includes('tool.call'));
    assert.ok(legacyEvents.includes('tool.result'));

    const rpc = await wsRequest(`ws://127.0.0.1:${gatewayPort}/ws`, {
      jsonrpc: '2.0',
      id: 'rpc-1',
      method: 'runtime.run',
      params: { input: 'rpc request', session_id: 'rpc-s1' }
    }, { expectRpcId: 'rpc-1' });

    assert.ok(rpc.result);
    assert.equal(rpc.result.result.state, 'DONE');
    assert.equal(rpc.result.result.output, 'final:42');

    const sessions = await fetch(`http://127.0.0.1:${gatewayPort}/api/sessions`).then((r) => r.json());
    assert.equal(sessions.ok, true);
    assert.ok(sessions.data.total >= 2);

    const legacySession = await fetch(`http://127.0.0.1:${gatewayPort}/api/sessions/legacy-s1`).then((r) => r.json());
    assert.equal(legacySession.ok, true);
    assert.ok(legacySession.data.messages.length >= 2);
    assert.equal(legacySession.data.runs.length, 1);
    assert.equal(legacySession.data.settings.permission_level, 'high');
    assert.equal(legacySession.data.settings.workspace.mode, 'session');
    assert.ok(typeof legacySession.data.settings.workspace.root_dir === 'string');
    assert.ok(legacySession.data.settings.workspace.root_dir.length > 0);
    assert.equal(legacySession.data.runs[0].permission_level, 'high');
    assert.equal(legacySession.data.runs[0].workspace_root, legacySession.data.settings.workspace.root_dir);

    const legacySettings = await fetch(`http://127.0.0.1:${gatewayPort}/api/sessions/legacy-s1/settings`).then((r) => r.json());
    assert.equal(legacySettings.ok, true);
    assert.equal(legacySettings.data.permission_level, 'high');

    const patchedSettings = await fetch(`http://127.0.0.1:${gatewayPort}/api/sessions/legacy-s1/settings`, {
      method: 'PUT',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        settings: {
          permission_level: 'low'
        }
      })
    }).then((r) => r.json());
    assert.equal(patchedSettings.ok, true);
    assert.equal(patchedSettings.data.permission_level, 'low');

    const invalidPermissionSettingsResp = await fetch(`http://127.0.0.1:${gatewayPort}/api/sessions/legacy-s1/settings`, {
      method: 'PUT',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        settings: {
          permission_level: 'super-admin'
        }
      })
    });
    assert.equal(invalidPermissionSettingsResp.status, 400);
    const invalidPermissionSettings = await invalidPermissionSettingsResp.json();
    assert.equal(invalidPermissionSettings.ok, false);

    const invalidWorkspaceSettingsResp = await fetch(`http://127.0.0.1:${gatewayPort}/api/sessions/legacy-s1/settings`, {
      method: 'PUT',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        settings: {
          workspace: 'not-an-object'
        }
      })
    });
    assert.equal(invalidWorkspaceSettingsResp.status, 400);
    const invalidWorkspaceSettings = await invalidWorkspaceSettingsResp.json();
    assert.equal(invalidWorkspaceSettings.ok, false);

    const legacyEventsResp = await fetch(`http://127.0.0.1:${gatewayPort}/api/sessions/legacy-s1/events`).then((r) => r.json());
    assert.equal(legacyEventsResp.ok, true);
    assert.ok(legacyEventsResp.data.total >= 1);

    const updateConfig = await fetch(`http://127.0.0.1:${gatewayPort}/api/config/providers/config`, {
      method: 'PUT',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        config: {
          active_provider: 'mock',
          providers: {
            mock: {
              type: 'openai_compatible',
              display_name: 'Mock',
              base_url: `http://127.0.0.1:${llmPort}`,
              model: 'mock-model-v2',
              api_key: 'mock-key',
              timeout_ms: 2000
            }
          }
        }
      })
    }).then((r) => r.json());

    assert.equal(updateConfig.ok, true);
    assert.equal(updateConfig.data.active_model, 'mock-model-v2');

    const firstTurn = await wsRequest(`ws://127.0.0.1:${gatewayPort}/ws`, {
      type: 'run',
      session_id: 'memory-s1',
      input: 'first turn'
    });
    assert.equal(firstTurn.final.output, 'final:42');

    const secondTurn = await wsRequest(`ws://127.0.0.1:${gatewayPort}/ws`, {
      type: 'run',
      session_id: 'memory-s1',
      input: 'second turn'
    });
    assert.equal(secondTurn.final.output, 'final:42');

    assert.equal(llm.state.secondTurnSawFirstTurnContext, true);

    const multimodalRun = await wsRequest(`ws://127.0.0.1:${gatewayPort}/ws`, {
      type: 'run',
      session_id: 'mm-s1',
      input: 'describe this uploaded image',
      input_images: [
        {
          name: 'tiny.png',
          mime_type: 'image/png',
          size_bytes: 67,
          data_url: 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8Xw8AAoMBgU8Vf4QAAAAASUVORK5CYII='
        }
      ]
    });
    assert.match(multimodalRun.final.output, /image analyzed/i);
    assert.equal(llm.state.sawMultimodalImageInput, true);

    const saveMemory = await wsRequest(`ws://127.0.0.1:${gatewayPort}/ws`, {
      type: 'run',
      session_id: 'memory-write-s1',
      permission_level: 'high',
      input: 'save memory: my favorite color is blue'
    });
    assert.match(saveMemory.final.output, /saved/i);

    const askMemory = await wsRequest(`ws://127.0.0.1:${gatewayPort}/ws`, {
      type: 'run',
      session_id: 'memory-read-s2',
      input: 'ask memory in new session'
    });
    assert.match(askMemory.final.output, /blue/i);
    assert.equal(llm.state.sawMemorySopOnNewSession, true);
    assert.equal(llm.state.sawBootstrapMemoryOnNewSession, true);

    const lowPermissionAskMemory = await wsRequest(`ws://127.0.0.1:${gatewayPort}/ws`, {
      type: 'run',
      session_id: 'memory-read-low-s3',
      permission_level: 'low',
      input: 'ask memory in low permission session'
    });
    assert.match(lowPermissionAskMemory.final.output, /bootstrap disabled/i);
    assert.equal(llm.state.lowPermissionSawMemorySop, false);
    assert.equal(llm.state.lowPermissionSawBootstrapMemory, false);

    const memoryList = await fetch(`http://127.0.0.1:${gatewayPort}/api/memory`).then((r) => r.json());
    assert.equal(memoryList.ok, true);
    assert.ok(memoryList.data.total >= 1);
    assert.ok(memoryList.data.items.some((item) => /favorite color is blue/i.test(String(item.content))));

    const memorySearch = await fetch(`http://127.0.0.1:${gatewayPort}/api/memory/search?q=blue`).then((r) => r.json());
    assert.equal(memorySearch.ok, true);
    assert.ok(memorySearch.data.items.some((item) => /blue/i.test(String(item.content))));
  } catch (err) {
    const logs = gateway?.getLogs?.() || '';
    err.message = `${err.message}\n--- gateway logs ---\n${logs}`;
    throw err;
  } finally {
    await stopProcess(gateway?.child);
    llm.server.close();
  }
});
