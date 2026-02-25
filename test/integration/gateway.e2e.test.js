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
  const server = http.createServer((req, res) => {
    if (req.method !== 'POST' || req.url !== '/chat/completions') {
      res.writeHead(404).end('not found');
      return;
    }

    let raw = '';
    req.on('data', (chunk) => { raw += chunk; });
    req.on('end', () => {
      const body = JSON.parse(raw || '{}');
      const messages = body.messages || [];
      const last = messages[messages.length - 1] || {};

      const message = last.role === 'tool'
        ? { role: 'assistant', content: `final:${last.content}` }
        : {
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

      res.setHeader('content-type', 'application/json');
      res.end(JSON.stringify({ choices: [{ message }] }));
    });
  });

  await new Promise((resolve) => server.listen(port, '127.0.0.1', resolve));
  return server;
}

async function startGateway({ port, providerConfigPath }) {
  const child = spawn('node', ['apps/gateway/server.js'], {
    cwd: path.resolve(__dirname, '../..'),
    env: {
      ...process.env,
      PORT: String(port),
      PROVIDER_CONFIG_PATH: providerConfigPath
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

  const llmServer = await startMockLlmServer(llmPort);
  let gateway;

  try {
    gateway = await startGateway({ port: gatewayPort, providerConfigPath });

    const health = await fetch(`http://127.0.0.1:${gatewayPort}/health`).then((r) => r.json());
    assert.equal(health.ok, true);
    assert.equal(health.llm.active_provider, 'mock');

    const configSummary = await fetch(`http://127.0.0.1:${gatewayPort}/api/config/providers`).then((r) => r.json());
    assert.equal(configSummary.ok, true);
    assert.equal(configSummary.data.active_model, 'mock-model');

    const legacy = await wsRequest(`ws://127.0.0.1:${gatewayPort}/ws`, {
      type: 'run',
      session_id: 'legacy-s1',
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
  } catch (err) {
    const logs = gateway?.getLogs?.() || '';
    err.message = `${err.message}\n--- gateway logs ---\n${logs}`;
    throw err;
  } finally {
    await stopProcess(gateway?.child);
    llmServer.close();
  }
});
