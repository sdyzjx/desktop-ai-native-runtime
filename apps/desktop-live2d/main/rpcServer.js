const { WebSocketServer } = require('ws');

const { validateRpcRequest, buildRpcError } = require('./rpcValidator');
const { RpcRateLimiter } = require('./rpcRateLimiter');

function extractToken(request) {
  const auth = request.headers?.authorization;
  if (typeof auth === 'string') {
    const match = auth.match(/^Bearer\s+(.+)$/i);
    if (match) return match[1];
  }

  const url = new URL(request.url || '/', 'ws://localhost');
  const token = url.searchParams.get('token');
  return token || null;
}

function toRpcResponse({ id, result, error }) {
  const payload = {
    jsonrpc: '2.0',
    id: id ?? null
  };
  if (error) {
    payload.error = error;
  } else {
    payload.result = result;
  }
  return payload;
}

function sendJson(ws, payload) {
  if (ws.readyState !== 1) return;
  ws.send(JSON.stringify(payload));
}

class Live2dRpcServer {
  constructor({
    host,
    port,
    token,
    requestHandler,
    validate = validateRpcRequest,
    limiter = new RpcRateLimiter(),
    logger = console
  }) {
    this.host = host;
    this.port = port;
    this.token = token;
    this.requestHandler = requestHandler;
    this.validate = validate;
    this.limiter = limiter;
    this.logger = logger;
    this.wss = null;
  }

  async start() {
    this.wss = new WebSocketServer({
      host: this.host,
      port: this.port
    });

    this.wss.on('connection', (ws, request) => {
      const inboundToken = extractToken(request);
      if (this.token && inboundToken !== this.token) {
        ws.close(1008, 'unauthorized');
        return;
      }

      const clientId = `${request.socket.remoteAddress || 'local'}:${request.headers['sec-websocket-key'] || 'no-key'}`;

      ws.on('message', async (message) => {
        await this.handleMessage({ ws, message, clientId });
      });
    });

    await new Promise((resolve, reject) => {
      this.wss.once('listening', resolve);
      this.wss.once('error', reject);
    });

    return {
      host: this.host,
      port: this.port,
      url: `ws://${this.host}:${this.port}`
    };
  }

  async handleMessage({ ws, message, clientId }) {
    let payload;
    try {
      payload = JSON.parse(String(message));
    } catch {
      sendJson(ws, toRpcResponse({
        id: null,
        error: buildRpcError(-32600, 'invalid json payload')
      }));
      return;
    }

    const validation = this.validate(payload);
    if (!validation.ok) {
      sendJson(ws, toRpcResponse({
        id: validation.id ?? payload.id ?? null,
        error: validation.error
      }));
      return;
    }

    const { request } = validation;
    const limit = this.limiter.check({ clientId, method: request.method });
    if (!limit.ok) {
      sendJson(ws, toRpcResponse({
        id: request.id,
        error: buildRpcError(-32002, 'rate limited', { retryAfterMs: limit.retryAfterMs })
      }));
      return;
    }

    try {
      const result = await this.requestHandler(request);
      if (request.id !== undefined) {
        sendJson(ws, toRpcResponse({ id: request.id, result }));
      }
    } catch (err) {
      const error = normalizeError(err);
      this.logger.error?.('rpc request failed', { method: request.method, error });
      if (request.id !== undefined) {
        sendJson(ws, toRpcResponse({ id: request.id, error }));
      }
    }
  }

  async stop() {
    if (!this.wss) return;

    const wss = this.wss;
    this.wss = null;

    for (const client of wss.clients) {
      client.terminate();
    }

    await new Promise((resolve, reject) => {
      wss.close((err) => (err ? reject(err) : resolve()));
    });
  }
}

function normalizeError(err) {
  if (err && typeof err === 'object' && typeof err.code === 'number' && typeof err.message === 'string') {
    return err;
  }
  return buildRpcError(-32005, err?.message || String(err || 'internal error'));
}

module.exports = {
  Live2dRpcServer,
  extractToken,
  normalizeError
};
