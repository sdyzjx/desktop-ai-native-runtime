const Ajv = require('ajv');

const { RPC_METHODS_V1 } = require('./constants');

const METHOD_SCHEMAS = Object.freeze({
  'state.get': {
    type: 'object',
    additionalProperties: false
  },
  'param.set': {
    type: 'object',
    required: ['name', 'value'],
    additionalProperties: false,
    properties: {
      name: { type: 'string', minLength: 1, maxLength: 128 },
      value: { type: 'number' }
    }
  },
  'chat.show': {
    type: 'object',
    required: ['text'],
    additionalProperties: false,
    properties: {
      text: { type: 'string', minLength: 1, maxLength: 2000 },
      durationMs: { type: 'integer', minimum: 500, maximum: 30000 },
      mood: { type: 'string', minLength: 1, maxLength: 64 }
    }
  }
});

const ajv = new Ajv({ allErrors: true, strict: false });
const validators = new Map(Object.entries(METHOD_SCHEMAS).map(([method, schema]) => [method, ajv.compile(schema)]));

function buildRpcError(code, message, data) {
  const error = { code, message };
  if (data !== undefined) {
    error.data = data;
  }
  return error;
}

function isValidRpcId(id) {
  return typeof id === 'string' || typeof id === 'number' || id === null;
}

function validateRpcRequest(payload) {
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
    return { ok: false, error: buildRpcError(-32600, 'invalid request payload') };
  }

  if (payload.jsonrpc !== '2.0') {
    return { ok: false, error: buildRpcError(-32600, 'jsonrpc must be 2.0'), id: payload.id };
  }

  if (payload.id !== undefined && !isValidRpcId(payload.id)) {
    return { ok: false, error: buildRpcError(-32600, 'invalid id type'), id: payload.id };
  }

  const { method } = payload;
  if (typeof method !== 'string' || !method) {
    return { ok: false, error: buildRpcError(-32600, 'method must be a non-empty string'), id: payload.id };
  }

  if (!RPC_METHODS_V1.includes(method)) {
    return { ok: false, error: buildRpcError(-32601, `method not found: ${method}`), id: payload.id };
  }

  const params = payload.params == null ? {} : payload.params;
  if (!params || typeof params !== 'object' || Array.isArray(params)) {
    return { ok: false, error: buildRpcError(-32602, 'params must be an object'), id: payload.id };
  }

  const validate = validators.get(method);
  if (!validate(params)) {
    return {
      ok: false,
      error: buildRpcError(-32602, 'invalid params', validate.errors || []),
      id: payload.id
    };
  }

  return {
    ok: true,
    request: {
      id: payload.id,
      method,
      params
    }
  };
}

module.exports = {
  METHOD_SCHEMAS,
  validateRpcRequest,
  buildRpcError
};
