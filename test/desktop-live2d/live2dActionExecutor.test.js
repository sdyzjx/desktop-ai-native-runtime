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

test('createLive2dActionExecutor maps expression action to setExpression call', () => {
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

  execute({
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

test('createLive2dActionExecutor maps motion action to playMotion call', () => {
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

  execute({
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

test('createLive2dActionExecutor rejects unsupported action type', () => {
  const execute = createLive2dActionExecutor({
    setExpression: () => ({ ok: true }),
    playMotion: () => ({ ok: true }),
    createError: createRpcError
  });

  assert.throws(
    () => execute({ type: 'gesture', name: 'greet', args: {} }),
    (err) => {
      assert.equal(err.code, -32602);
      assert.match(err.message, /unsupported live2d action type/i);
      return true;
    }
  );
});
