const test = require('node:test');
const assert = require('node:assert/strict');

const { validateRpcRequest } = require('../../apps/desktop-live2d/main/rpcValidator');

test('validateRpcRequest accepts V1 methods with valid params', () => {
  const input = {
    jsonrpc: '2.0',
    id: '1',
    method: 'chat.show',
    params: { text: 'hello', durationMs: 1200 }
  };

  const result = validateRpcRequest(input);
  assert.equal(result.ok, true);
  assert.equal(result.request.method, 'chat.show');
});

test('validateRpcRequest rejects non-whitelisted method', () => {
  const result = validateRpcRequest({
    jsonrpc: '2.0',
    id: 'x',
    method: 'motion.play',
    params: {}
  });

  assert.equal(result.ok, false);
  assert.equal(result.error.code, -32601);
});

test('validateRpcRequest rejects invalid param types', () => {
  const result = validateRpcRequest({
    jsonrpc: '2.0',
    id: 9,
    method: 'param.set',
    params: { name: 'ParamAngleX', value: 'not-number' }
  });

  assert.equal(result.ok, false);
  assert.equal(result.error.code, -32602);
});
