const test = require('node:test');
const assert = require('node:assert/strict');

const { RpcInputQueue } = require('../../apps/runtime/queue/rpcInputQueue');

test('RpcInputQueue accepts valid request and pop returns envelope', async () => {
  const queue = new RpcInputQueue({ maxSize: 2 });

  const submitResult = await queue.submit({
    jsonrpc: '2.0',
    id: 'q-1',
    method: 'runtime.run',
    params: { input: 'hello' }
  }, { source: 'test' });

  assert.equal(submitResult.accepted, true);
  assert.equal(queue.size(), 1);

  const envelope = await queue.pop();
  assert.equal(envelope.request.id, 'q-1');
  assert.equal(envelope.request.method, 'runtime.run');
  assert.deepEqual(envelope.context, { source: 'test' });
  assert.equal(queue.size(), 0);
});

test('RpcInputQueue rejects invalid rpc payload', async () => {
  const queue = new RpcInputQueue({ maxSize: 2 });
  const result = await queue.submit({ method: 'runtime.run' });

  assert.equal(result.accepted, false);
  assert.equal(result.response.error.code, -32600);
});

test('RpcInputQueue rejects when queue is full', async () => {
  const queue = new RpcInputQueue({ maxSize: 1 });

  await queue.submit({ jsonrpc: '2.0', id: '1', method: 'runtime.run', params: { input: 'a' } });
  const second = await queue.submit({ jsonrpc: '2.0', id: '2', method: 'runtime.run', params: { input: 'b' } });

  assert.equal(second.accepted, false);
  assert.equal(second.response.error.code, -32001);
});

test('RpcInputQueue resolves waiting pop immediately after submit', async () => {
  const queue = new RpcInputQueue({ maxSize: 1 });

  const popPromise = queue.pop();
  await queue.submit({ jsonrpc: '2.0', id: 'w-1', method: 'runtime.run', params: { input: 'x' } });

  const envelope = await popPromise;
  assert.equal(envelope.request.id, 'w-1');
});
