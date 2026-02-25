const test = require('node:test');
const assert = require('node:assert/strict');

const { RuntimeEventBus } = require('../../apps/runtime/bus/eventBus');
const { RpcInputQueue } = require('../../apps/runtime/queue/rpcInputQueue');
const { RuntimeRpcWorker } = require('../../apps/runtime/rpc/runtimeRpcWorker');

test('RuntimeRpcWorker processes runtime.run and emits rpc result', async () => {
  const queue = new RpcInputQueue();
  const bus = new RuntimeEventBus();

  const runner = {
    async run({ sessionId, input, onEvent }) {
      onEvent({ event: 'plan', payload: { input } });
      return { output: `ok:${input}`, traceId: 't-1', state: 'DONE', sessionId };
    }
  };

  const worker = new RuntimeRpcWorker({ queue, runner, bus });
  worker.start();

  const sends = [];
  const sendEvents = [];

  const accepted = await queue.submit({
    jsonrpc: '2.0',
    id: 'rpc-1',
    method: 'runtime.run',
    params: { input: 'hello', session_id: 'abc' }
  }, {
    send: (payload) => sends.push(payload),
    sendEvent: (payload) => sendEvents.push(payload)
  });

  assert.equal(accepted.accepted, true);

  await new Promise((resolve) => setTimeout(resolve, 60));

  const response = sends.find((item) => item.id === 'rpc-1');
  assert.ok(response);
  assert.equal(response.result.output, 'ok:hello');

  const hasStart = sendEvents.some((evt) => evt.method === 'runtime.start');
  const hasFinal = sendEvents.some((evt) => evt.method === 'runtime.final');
  assert.equal(hasStart, true);
  assert.equal(hasFinal, true);

  worker.stop();
});

test('RuntimeRpcWorker returns method_not_found on unsupported method', async () => {
  const queue = new RpcInputQueue();
  const bus = new RuntimeEventBus();
  const worker = new RuntimeRpcWorker({ queue, runner: { run: async () => ({}) }, bus });
  worker.start();

  const sends = [];
  await queue.submit({ jsonrpc: '2.0', id: 'x1', method: 'runtime.unknown', params: {} }, {
    send: (payload) => sends.push(payload)
  });

  await new Promise((resolve) => setTimeout(resolve, 40));
  assert.equal(sends[0].error.code, -32601);

  worker.stop();
});
