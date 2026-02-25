const test = require('node:test');
const assert = require('node:assert/strict');

const {
  JSON_RPC_VERSION,
  RpcErrorCode,
  createRpcError,
  createRpcResult,
  validateRpcRequest,
  toRpcEvent
} = require('../../apps/runtime/rpc/jsonRpc');

test('validateRpcRequest accepts valid request', () => {
  const result = validateRpcRequest({
    jsonrpc: '2.0',
    id: 'req-1',
    method: 'runtime.run',
    params: { input: 'hello' }
  });

  assert.equal(result.ok, true);
  assert.deepEqual(result.request, {
    jsonrpc: '2.0',
    id: 'req-1',
    method: 'runtime.run',
    params: { input: 'hello' }
  });
});

test('validateRpcRequest rejects invalid jsonrpc version', () => {
  const result = validateRpcRequest({ jsonrpc: '1.0', method: 'x' });
  assert.equal(result.ok, false);
  assert.equal(result.error.error.code, RpcErrorCode.INVALID_REQUEST);
});

test('validateRpcRequest rejects invalid id type', () => {
  const result = validateRpcRequest({ jsonrpc: '2.0', id: {}, method: 'runtime.run' });
  assert.equal(result.ok, false);
  assert.equal(result.error.error.code, RpcErrorCode.INVALID_REQUEST);
});

test('create helpers output valid rpc envelopes', () => {
  const error = createRpcError(undefined, RpcErrorCode.SERVER_ERROR, 'boom');
  assert.equal(error.jsonrpc, JSON_RPC_VERSION);
  assert.equal(error.id, null);
  assert.equal(error.error.message, 'boom');

  const result = createRpcResult(1, { ok: true });
  assert.deepEqual(result, {
    jsonrpc: JSON_RPC_VERSION,
    id: 1,
    result: { ok: true }
  });

  assert.deepEqual(toRpcEvent('runtime.event', { a: 1 }), {
    jsonrpc: JSON_RPC_VERSION,
    method: 'runtime.event',
    params: { a: 1 }
  });
});
