const test = require('node:test');
const assert = require('node:assert/strict');

const { RuntimeEventBus } = require('../../apps/runtime/bus/eventBus');
const { RpcInputQueue } = require('../../apps/runtime/queue/rpcInputQueue');
const { RuntimeRpcWorker } = require('../../apps/runtime/rpc/runtimeRpcWorker');

test('RuntimeRpcWorker processes runtime.run and emits rpc result', async () => {
  const queue = new RpcInputQueue();
  const bus = new RuntimeEventBus();

  let seedMessagesSeen = null;
  let runtimeContextSeen = null;
  const runner = {
    async run({ sessionId, input, seedMessages, runtimeContext, onEvent }) {
      seedMessagesSeen = seedMessages;
       runtimeContextSeen = runtimeContext;
      onEvent({ event: 'plan', payload: { input } });
      return { output: `ok:${input}`, traceId: 't-1', state: 'DONE', sessionId };
    }
  };

  const worker = new RuntimeRpcWorker({ queue, runner, bus });
  worker.start();

  const sends = [];
  const sendEvents = [];
  let startHookCalled = false;
  let finalHookCalled = false;
  const runtimeEventSeen = [];
  let buildPromptCalled = false;
  let buildRunContextCalled = false;

  const accepted = await queue.submit({
    jsonrpc: '2.0',
    id: 'rpc-1',
    method: 'runtime.run',
    params: { input: 'hello', session_id: 'abc' }
  }, {
    send: (payload) => sends.push(payload),
    sendEvent: (payload) => sendEvents.push(payload),
    buildPromptMessages: async ({ session_id: sessionId, input, input_images: inputImages }) => {
      buildPromptCalled = sessionId === 'abc' && input === 'hello';
      assert.equal(Array.isArray(inputImages), true);
      assert.equal(inputImages.length, 0);
      return [
        { role: 'user', content: 'earlier question' },
        { role: 'assistant', content: 'earlier answer' }
      ];
    },
    buildRunContext: async ({ session_id: sessionId, input }) => {
      buildRunContextCalled = sessionId === 'abc' && input === 'hello';
      return { permission_level: 'high', workspace_root: '/tmp/ws-abc' };
    },
    onRunStart: async ({ session_id: sessionId, input }) => {
      startHookCalled = sessionId === 'abc' && input === 'hello';
    },
    onRuntimeEvent: async (event) => {
      runtimeEventSeen.push(event.event);
    },
    onRunFinal: async ({ session_id: sessionId, output }) => {
      finalHookCalled = sessionId === 'abc' && output === 'ok:hello';
    }
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
  assert.equal(startHookCalled, true);
  assert.equal(finalHookCalled, true);
  assert.equal(buildPromptCalled, true);
  assert.equal(buildRunContextCalled, true);
  assert.deepEqual(seedMessagesSeen, [
    { role: 'user', content: 'earlier question' },
    { role: 'assistant', content: 'earlier answer' }
  ]);
  assert.deepEqual(runtimeContextSeen, { permission_level: 'high', workspace_root: '/tmp/ws-abc' });
  assert.ok(runtimeEventSeen.includes('plan'));

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

test('RuntimeRpcWorker accepts image-only input_images and forwards to runner', async () => {
  const queue = new RpcInputQueue();
  const bus = new RuntimeEventBus();
  const sampleDataUrl = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8Xw8AAoMBgU8Vf4QAAAAASUVORK5CYII=';

  let seenInput = null;
  let seenInputImages = null;
  const runner = {
    async run({ input, inputImages }) {
      seenInput = input;
      seenInputImages = inputImages;
      return { output: 'ok:image', traceId: 't-img-1', state: 'DONE' };
    }
  };

  const worker = new RuntimeRpcWorker({ queue, runner, bus });
  worker.start();

  const sends = [];
  const accepted = await queue.submit({
    jsonrpc: '2.0',
    id: 'img-1',
    method: 'runtime.run',
    params: {
      session_id: 'img-session',
      input: '',
      input_images: [
        {
          name: 'tiny.png',
          mime_type: 'image/png',
          size_bytes: 67,
          data_url: sampleDataUrl
        }
      ]
    }
  }, {
    send: (payload) => sends.push(payload)
  });

  assert.equal(accepted.accepted, true);
  await new Promise((resolve) => setTimeout(resolve, 60));

  assert.equal(seenInput, '');
  assert.equal(Array.isArray(seenInputImages), true);
  assert.equal(seenInputImages.length, 1);
  assert.equal(seenInputImages[0].name, 'tiny.png');
  assert.equal(sends.some((item) => item.id === 'img-1' && item.result?.output === 'ok:image'), true);

  worker.stop();
});
