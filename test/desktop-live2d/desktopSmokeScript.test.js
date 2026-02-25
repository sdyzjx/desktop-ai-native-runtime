const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { WebSocketServer } = require('ws');

const { getFreePort } = require('../helpers/net');
const {
  loadRuntimeSummary,
  buildRpcUrlWithToken,
  runSmoke
} = require('../../scripts/desktop-live2d-smoke');

test('loadRuntimeSummary throws when summary file does not exist', () => {
  assert.throws(
    () => loadRuntimeSummary('/tmp/not-found-desktop-summary.json'),
    /runtime summary not found/i
  );
});

test('buildRpcUrlWithToken appends token query', () => {
  const url = buildRpcUrlWithToken('ws://127.0.0.1:17373', 'abc-token');
  assert.equal(url, 'ws://127.0.0.1:17373/?token=abc-token');
});

test('runSmoke completes rpc sanity checks against mock rpc server', async () => {
  const port = await getFreePort();
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'desktop-smoke-'));
  const summaryPath = path.join(tmpDir, 'runtime-summary.json');
  fs.writeFileSync(summaryPath, JSON.stringify({
    rpcUrl: `ws://127.0.0.1:${port}`,
    rpcToken: 'smoke-token'
  }), 'utf8');

  let tokenSeen = false;
  const methodsSeen = [];
  const wss = new WebSocketServer({ host: '127.0.0.1', port });

  wss.on('connection', (socket, request) => {
    tokenSeen = request.url?.includes('token=smoke-token') || false;

    socket.on('message', (raw) => {
      const rpc = JSON.parse(String(raw));
      methodsSeen.push(rpc.method);
      if (rpc.method === 'state.get') {
        socket.send(JSON.stringify({
          jsonrpc: '2.0',
          id: rpc.id,
          result: { modelLoaded: true }
        }));
        return;
      }
      if (rpc.method === 'tool.list') {
        socket.send(JSON.stringify({
          jsonrpc: '2.0',
          id: rpc.id,
          result: { tools: [{ name: 'desktop_model_set_param' }] }
        }));
        return;
      }
      if (rpc.method === 'chat.panel.append') {
        socket.send(JSON.stringify({
          jsonrpc: '2.0',
          id: rpc.id,
          result: { ok: true }
        }));
      }
    });
  });

  try {
    const result = await runSmoke({
      summaryPath,
      timeoutMs: 2000,
      logger: { info: () => {} }
    });

    assert.equal(tokenSeen, true);
    assert.deepEqual(methodsSeen, ['state.get', 'tool.list', 'chat.panel.append']);
    assert.equal(result.state.modelLoaded, true);
    assert.equal(result.toolsCount, 1);
  } finally {
    await new Promise((resolve, reject) => wss.close((err) => (err ? reject(err) : resolve())));
  }
});
