const test = require('node:test');
const assert = require('node:assert/strict');
const WebSocket = require('ws');

const { Live2dRpcServer } = require('../../apps/desktop-live2d/main/rpcServer');
const { getFreePort } = require('../helpers/net');

function waitForOpen(ws) {
  return new Promise((resolve, reject) => {
    ws.once('open', resolve);
    ws.once('error', reject);
  });
}

function waitForMessage(ws) {
  return new Promise((resolve, reject) => {
    ws.once('message', (data) => resolve(JSON.parse(String(data))));
    ws.once('error', reject);
  });
}

function waitForClose(ws) {
  return new Promise((resolve) => {
    ws.once('close', (code) => resolve(code));
  });
}

test('Live2dRpcServer handles authorized request and returns result', async () => {
  const port = await getFreePort();
  const server = new Live2dRpcServer({
    host: '127.0.0.1',
    port,
    token: 't1',
    requestHandler: async ({ method }) => ({ method })
  });

  await server.start();

  const ws = new WebSocket(`ws://127.0.0.1:${port}?token=t1`);
  await waitForOpen(ws);

  ws.send(JSON.stringify({
    jsonrpc: '2.0',
    id: 'id-1',
    method: 'state.get',
    params: {}
  }));

  const response = await waitForMessage(ws);
  assert.equal(response.id, 'id-1');
  assert.deepEqual(response.result, { method: 'state.get' });

  ws.close();
  await server.stop();
});

test('Live2dRpcServer closes unauthorized connection', async () => {
  const port = await getFreePort();
  const server = new Live2dRpcServer({
    host: '127.0.0.1',
    port,
    token: 'token-ok',
    requestHandler: async () => ({ ok: true })
  });

  await server.start();

  const ws = new WebSocket(`ws://127.0.0.1:${port}?token=wrong`);
  const closeCode = await waitForClose(ws);
  assert.equal(closeCode, 1008);

  await server.stop();
});

test('Live2dRpcServer sends desktop.event notifications to connected clients', async () => {
  const port = await getFreePort();
  const server = new Live2dRpcServer({
    host: '127.0.0.1',
    port,
    token: 'notify-token',
    requestHandler: async () => ({ ok: true })
  });

  await server.start();

  const ws = new WebSocket(`ws://127.0.0.1:${port}?token=notify-token`);
  await waitForOpen(ws);

  const notified = waitForMessage(ws);
  const count = server.notify({
    method: 'desktop.event',
    params: {
      type: 'runtime.event',
      data: { event: 'plan' }
    }
  });
  assert.equal(count, 1);

  const message = await notified;
  assert.equal(message.method, 'desktop.event');
  assert.equal(message.params.type, 'runtime.event');

  ws.close();
  await server.stop();
});
