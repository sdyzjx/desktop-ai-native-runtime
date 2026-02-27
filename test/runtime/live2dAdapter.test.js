const test = require('node:test');
const assert = require('node:assert/strict');
const { WebSocketServer } = require('ws');

const live2dAdapters = require('../../apps/runtime/tooling/adapters/live2d');

const { invokeLive2dRpc, normalizeRpcUrl } = live2dAdapters.__internal;

async function createWsServer() {
  const wss = new WebSocketServer({ port: 0, host: '127.0.0.1' });
  await new Promise((resolve, reject) => {
    wss.once('listening', resolve);
    wss.once('error', reject);
  });
  const port = wss.address().port;
  return { wss, port };
}

test('normalizeRpcUrl builds ws url with token', () => {
  const url = normalizeRpcUrl({ host: '127.0.0.1', port: 17373, token: 'abc' });
  assert.equal(url, 'ws://127.0.0.1:17373/?token=abc');
});

test('invokeLive2dRpc returns rpc result', async (t) => {
  const token = 'token-1';
  const { wss, port } = await createWsServer();
  t.after(async () => {
    await new Promise((resolve) => wss.close(resolve));
  });

  wss.on('connection', (ws, request) => {
    const url = new URL(request.url || '/', 'ws://localhost');
    if (url.searchParams.get('token') !== token) {
      ws.close(1008, 'unauthorized');
      return;
    }

    ws.on('message', (raw) => {
      const req = JSON.parse(String(raw));
      ws.send(JSON.stringify({
        jsonrpc: '2.0',
        id: req.id,
        result: { ok: true, echoedMethod: req.method, echoedParams: req.params }
      }));
    });
  });

  const result = await invokeLive2dRpc({
    method: 'model.param.set',
    params: { name: 'ParamAngleX', value: 10 },
    env: {
      DESKTOP_LIVE2D_RPC_HOST: '127.0.0.1',
      DESKTOP_LIVE2D_RPC_PORT: String(port),
      DESKTOP_LIVE2D_RPC_TOKEN: token
    }
  });

  assert.equal(result.ok, true);
  assert.equal(result.echoedMethod, 'model.param.set');
  assert.equal(result.echoedParams.name, 'ParamAngleX');
});

test('live2d.motion.play adapter maps to model.motion.play', async (t) => {
  const token = 'token-2';
  const { wss, port } = await createWsServer();
  t.after(async () => {
    await new Promise((resolve) => wss.close(resolve));
  });

  wss.on('connection', (ws, request) => {
    const url = new URL(request.url || '/', 'ws://localhost');
    if (url.searchParams.get('token') !== token) {
      ws.close(1008, 'unauthorized');
      return;
    }

    ws.on('message', (raw) => {
      const req = JSON.parse(String(raw));
      ws.send(JSON.stringify({
        jsonrpc: '2.0',
        id: req.id,
        result: { method: req.method, params: req.params }
      }));
    });
  });

  const previousEnv = {
    DESKTOP_LIVE2D_RPC_HOST: process.env.DESKTOP_LIVE2D_RPC_HOST,
    DESKTOP_LIVE2D_RPC_PORT: process.env.DESKTOP_LIVE2D_RPC_PORT,
    DESKTOP_LIVE2D_RPC_TOKEN: process.env.DESKTOP_LIVE2D_RPC_TOKEN
  };

  process.env.DESKTOP_LIVE2D_RPC_HOST = '127.0.0.1';
  process.env.DESKTOP_LIVE2D_RPC_PORT = String(port);
  process.env.DESKTOP_LIVE2D_RPC_TOKEN = token;

  try {
    const payload = await live2dAdapters['live2d.motion.play']({ group: 'Idle', index: 1 });
    const parsed = JSON.parse(payload);
    assert.equal(parsed.ok, true);
    assert.equal(parsed.method, 'model.motion.play');
    assert.equal(parsed.result.method, 'model.motion.play');
    assert.equal(parsed.result.params.group, 'Idle');
  } finally {
    if (previousEnv.DESKTOP_LIVE2D_RPC_HOST == null) delete process.env.DESKTOP_LIVE2D_RPC_HOST;
    else process.env.DESKTOP_LIVE2D_RPC_HOST = previousEnv.DESKTOP_LIVE2D_RPC_HOST;

    if (previousEnv.DESKTOP_LIVE2D_RPC_PORT == null) delete process.env.DESKTOP_LIVE2D_RPC_PORT;
    else process.env.DESKTOP_LIVE2D_RPC_PORT = previousEnv.DESKTOP_LIVE2D_RPC_PORT;

    if (previousEnv.DESKTOP_LIVE2D_RPC_TOKEN == null) delete process.env.DESKTOP_LIVE2D_RPC_TOKEN;
    else process.env.DESKTOP_LIVE2D_RPC_TOKEN = previousEnv.DESKTOP_LIVE2D_RPC_TOKEN;
  }
});
