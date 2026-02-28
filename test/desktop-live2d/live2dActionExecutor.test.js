const test = require('node:test');
const assert = require('node:assert/strict');

const {
  createLive2dActionExecutor
} = require('../../apps/desktop-live2d/renderer/live2dActionExecutor');

function createRpcError(code, message) {
  const err = new Error(message);
  err.code = code;
  return err;
}

test('createLive2dActionExecutor maps expression action to setExpression call', async () => {
  const calls = [];
  const execute = createLive2dActionExecutor({
    setExpression: (params) => {
      calls.push({ type: 'expression', params });
      return { ok: true };
    },
    playMotion: () => {
      throw new Error('should not call playMotion');
    },
    createError: createRpcError
  });

  await execute({
    type: 'expression',
    name: 'tear_drop',
    args: {}
  });

  assert.equal(calls.length, 1);
  assert.deepEqual(calls[0], {
    type: 'expression',
    params: { name: 'tear_drop' }
  });
});

test('createLive2dActionExecutor maps motion action to playMotion call', async () => {
  const calls = [];
  const execute = createLive2dActionExecutor({
    setExpression: () => {
      throw new Error('should not call setExpression');
    },
    playMotion: (params) => {
      calls.push({ type: 'motion', params });
      return { ok: true };
    },
    createError: createRpcError
  });

  await execute({
    type: 'motion',
    name: 'Greet',
    args: {
      group: 'Greet',
      index: 0
    }
  });

  assert.equal(calls.length, 1);
  assert.deepEqual(calls[0], {
    type: 'motion',
    params: { group: 'Greet', index: 0 }
  });
});

test('createLive2dActionExecutor resolves emote action with preset expression and params', async () => {
  const calls = [];
  const execute = createLive2dActionExecutor({
    setExpression: (params) => {
      calls.push({ type: 'expression', params });
      return { ok: true };
    },
    playMotion: () => ({ ok: true }),
    setParamBatch: (params) => {
      calls.push({ type: 'param_batch', params });
      return { ok: true };
    },
    presetConfig: {
      version: 1,
      emote: {
        happy: {
          low: {
            expression: 'smile',
            params: [{ name: 'ParamMouthForm', value: 0.3 }]
          }
        }
      }
    },
    createError: createRpcError
  });

  await execute({
    type: 'emote',
    name: 'happy',
    args: { intensity: 'low' }
  });

  assert.deepEqual(calls, [
    { type: 'expression', params: { name: 'smile' } },
    { type: 'param_batch', params: { updates: [{ name: 'ParamMouthForm', value: 0.3 }] } }
  ]);
});

test('createLive2dActionExecutor resolves react action sequence including wait', async () => {
  const calls = [];
  const waitCalls = [];
  const execute = createLive2dActionExecutor({
    setExpression: (params) => {
      calls.push({ type: 'expression', params });
      return { ok: true };
    },
    playMotion: (params) => {
      calls.push({ type: 'motion', params });
      return { ok: true };
    },
    sleep: async (ms) => {
      waitCalls.push(ms);
    },
    presetConfig: {
      version: 1,
      react: {
        waiting: [
          { type: 'expression', name: 'narrow_eyes' },
          { type: 'wait', ms: 220 },
          { type: 'motion', group: 'Idle', index: 0 }
        ]
      }
    },
    createError: createRpcError
  });

  await execute({
    type: 'react',
    name: 'waiting',
    args: {}
  });

  assert.deepEqual(waitCalls, [220]);
  assert.deepEqual(calls, [
    { type: 'expression', params: { name: 'narrow_eyes' } },
    { type: 'motion', params: { group: 'Idle', index: 0 } }
  ]);
});

test('createLive2dActionExecutor rejects missing semantic preset', async () => {
  const execute = createLive2dActionExecutor({
    setExpression: () => ({ ok: true }),
    playMotion: () => ({ ok: true }),
    presetConfig: { version: 1, gesture: {} },
    createError: createRpcError
  });

  await assert.rejects(
    execute({ type: 'gesture', name: 'greet', args: {} }),
    (err) => {
      assert.equal(err.code, -32602);
      assert.match(err.message, /gesture preset not found/i);
      return true;
    }
  );
});

test('createLive2dActionExecutor rejects unsupported action type', async () => {
  const execute = createLive2dActionExecutor({
    setExpression: () => ({ ok: true }),
    playMotion: () => ({ ok: true }),
    createError: createRpcError
  });

  await assert.rejects(
    execute({ type: 'unknown', name: 'greet', args: {} }),
    (err) => {
      assert.equal(err.code, -32602);
      assert.match(err.message, /unsupported live2d action type/i);
      return true;
    }
  );
});
