const JSON_RPC_VERSION = '2.0';

const RpcErrorCode = {
  PARSE_ERROR: -32700,
  INVALID_REQUEST: -32600,
  METHOD_NOT_FOUND: -32601,
  INVALID_PARAMS: -32602,
  INTERNAL_ERROR: -32603,
  SERVER_ERROR: -32000
};

function isPlainObject(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function isValidId(id) {
  return ['string', 'number'].includes(typeof id) || id === null;
}

function createRpcError(id, code, message, data) {
  const error = { code, message };
  if (data !== undefined) error.data = data;
  return {
    jsonrpc: JSON_RPC_VERSION,
    id: id === undefined ? null : id,
    error
  };
}

function createRpcResult(id, result) {
  return {
    jsonrpc: JSON_RPC_VERSION,
    id,
    result
  };
}

function validateRpcRequest(payload) {
  if (!isPlainObject(payload)) {
    return { ok: false, error: createRpcError(null, RpcErrorCode.INVALID_REQUEST, 'Request must be an object') };
  }

  if (payload.jsonrpc !== JSON_RPC_VERSION) {
    return { ok: false, error: createRpcError(payload.id, RpcErrorCode.INVALID_REQUEST, 'jsonrpc must be "2.0"') };
  }

  if (typeof payload.method !== 'string' || payload.method.length === 0) {
    return { ok: false, error: createRpcError(payload.id, RpcErrorCode.INVALID_REQUEST, 'method must be a non-empty string') };
  }

  if (payload.id !== undefined && !isValidId(payload.id)) {
    return { ok: false, error: createRpcError(null, RpcErrorCode.INVALID_REQUEST, 'id must be string, number, or null') };
  }

  if (payload.params !== undefined && !isPlainObject(payload.params) && !Array.isArray(payload.params)) {
    return { ok: false, error: createRpcError(payload.id, RpcErrorCode.INVALID_PARAMS, 'params must be object or array') };
  }

  return {
    ok: true,
    request: {
      jsonrpc: JSON_RPC_VERSION,
      id: payload.id,
      method: payload.method,
      params: payload.params ?? {}
    }
  };
}

function toRpcEvent(method, params) {
  return { jsonrpc: JSON_RPC_VERSION, method, params };
}

module.exports = {
  JSON_RPC_VERSION,
  RpcErrorCode,
  createRpcError,
  createRpcResult,
  validateRpcRequest,
  toRpcEvent
};
