const { randomUUID } = require('node:crypto');
const WebSocket = require('ws');
const { ToolingError, ErrorCode } = require('../errors');

const DEFAULT_RPC_HOST = '127.0.0.1';
const DEFAULT_RPC_PORT = 17373;
const DEFAULT_TIMEOUT_MS = 4000;

function normalizeRpcUrl({ host = DEFAULT_RPC_HOST, port = DEFAULT_RPC_PORT, token = '' } = {}) {
  const safeHost = String(host || DEFAULT_RPC_HOST).trim() || DEFAULT_RPC_HOST;
  const safePort = Number(port) > 0 ? Number(port) : DEFAULT_RPC_PORT;
  const url = new URL(`ws://${safeHost}:${safePort}`);
  if (token) {
    url.searchParams.set('token', String(token));
  }
  return url.toString();
}

function invokeLive2dRpc({ method, params = {}, timeoutMs = DEFAULT_TIMEOUT_MS, env = process.env, WebSocketImpl = WebSocket } = {}) {
  if (!method) {
    throw new ToolingError(ErrorCode.VALIDATION_ERROR, 'live2d rpc method is required');
  }

  const rpcUrl = normalizeRpcUrl({
    host: env.DESKTOP_LIVE2D_RPC_HOST || DEFAULT_RPC_HOST,
    port: env.DESKTOP_LIVE2D_RPC_PORT || DEFAULT_RPC_PORT,
    token: env.DESKTOP_LIVE2D_RPC_TOKEN || ''
  });

  const requestId = `live2d-${randomUUID()}`;
  const payload = {
    jsonrpc: '2.0',
    id: requestId,
    method,
    params
  };

  return new Promise((resolve, reject) => {
    const ws = new WebSocketImpl(rpcUrl);
    let settled = false;

    const timer = setTimeout(() => {
      settled = true;
      try {
        ws.terminate();
      } catch {
        // ignore
      }
      reject(new ToolingError(ErrorCode.TIMEOUT, `live2d rpc timeout after ${timeoutMs}ms`));
    }, Math.max(500, Number(timeoutMs) || DEFAULT_TIMEOUT_MS));

    const finish = (fn, value) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      try {
        ws.close();
      } catch {
        // ignore
      }
      fn(value);
    };

    ws.on('open', () => {
      ws.send(JSON.stringify(payload));
    });

    ws.on('message', (raw) => {
      let message;
      try {
        message = JSON.parse(String(raw));
      } catch {
        return;
      }

      if (message?.id !== requestId) return;

      if (message.error) {
        finish(
          reject,
          new ToolingError(
            ErrorCode.RUNTIME_ERROR,
            `live2d rpc error(${message.error.code}): ${message.error.message || 'unknown error'}`,
            { rpcError: message.error }
          )
        );
        return;
      }

      finish(resolve, message.result || null);
    });

    ws.on('error', (err) => {
      finish(reject, new ToolingError(ErrorCode.RUNTIME_ERROR, `live2d rpc connection failed: ${err.message || String(err)}`));
    });

    ws.on('close', () => {
      if (!settled) {
        finish(reject, new ToolingError(ErrorCode.RUNTIME_ERROR, 'live2d rpc connection closed before response'));
      }
    });
  });
}

function withLive2dMethod(method) {
  return async (args = {}, context = {}) => {
    const timeoutMs = Math.max(500, Number(args.timeoutMs || context.timeoutMs || DEFAULT_TIMEOUT_MS));
    const result = await invokeLive2dRpc({
      method,
      params: args,
      timeoutMs,
      env: process.env
    });
    return JSON.stringify({ ok: true, method, result });
  };
}

module.exports = {
  'live2d.param.set': withLive2dMethod('model.param.set'),
  'live2d.param.batch_set': withLive2dMethod('model.param.batchSet'),
  'live2d.motion.play': withLive2dMethod('model.motion.play'),
  'live2d.expression.set': withLive2dMethod('model.expression.set'),
  __internal: {
    invokeLive2dRpc,
    normalizeRpcUrl,
    withLive2dMethod
  }
};
