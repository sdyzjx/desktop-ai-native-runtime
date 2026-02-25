const { randomUUID } = require('node:crypto');
const WebSocket = require('ws');

function toGatewayWsUrl(gatewayUrl) {
  const parsed = new URL(gatewayUrl);
  parsed.protocol = parsed.protocol === 'https:' ? 'wss:' : 'ws:';

  if (parsed.pathname.endsWith('/ws')) {
    return parsed.toString();
  }

  if (parsed.pathname.endsWith('/')) {
    parsed.pathname = `${parsed.pathname}ws`;
  } else {
    parsed.pathname = `${parsed.pathname}/ws`;
  }
  return parsed.toString();
}

function mapGatewayMessageToDesktopEvent(message) {
  if (message && message.jsonrpc === '2.0' && typeof message.method === 'string') {
    if (message.method === 'runtime.start' || message.method === 'runtime.event' || message.method === 'runtime.final') {
      return {
        type: message.method,
        timestamp: Date.now(),
        data: message.params || {}
      };
    }
    return null;
  }

  if (message && typeof message.type === 'string') {
    if (message.type === 'start' || message.type === 'event' || message.type === 'final') {
      return {
        type: `legacy.${message.type}`,
        timestamp: Date.now(),
        data: message
      };
    }
  }

  return null;
}

class GatewayRuntimeClient {
  constructor({
    gatewayUrl,
    sessionId = 'desktop-live2d',
    requestTimeoutMs = 120000,
    onNotification = null,
    WebSocketImpl = WebSocket,
    logger = console
  }) {
    this.gatewayWsUrl = toGatewayWsUrl(gatewayUrl);
    this.sessionId = sessionId;
    this.requestTimeoutMs = requestTimeoutMs;
    this.onNotification = onNotification;
    this.WebSocketImpl = WebSocketImpl;
    this.logger = logger;
  }

  async runInput({ input, permissionLevel } = {}) {
    const content = String(input || '').trim();
    if (!content) {
      throw new Error('gateway runtime input must be non-empty');
    }

    const requestId = `desktop-${randomUUID()}`;
    const payload = {
      jsonrpc: '2.0',
      id: requestId,
      method: 'runtime.run',
      params: {
        session_id: this.sessionId,
        input: content
      }
    };
    if (permissionLevel) {
      payload.params.permission_level = permissionLevel;
    }

    return new Promise((resolve, reject) => {
      const ws = new this.WebSocketImpl(this.gatewayWsUrl);
      let settled = false;

      const timer = setTimeout(() => {
        settled = true;
        ws.terminate();
        reject(new Error(`gateway runtime timeout after ${this.requestTimeoutMs}ms`));
      }, this.requestTimeoutMs);

      const finish = (fn, value) => {
        if (settled) {
          return;
        }
        settled = true;
        clearTimeout(timer);
        try {
          ws.close();
        } catch {
          // ignore close errors during shutdown
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

        const desktopEvent = mapGatewayMessageToDesktopEvent(message);
        if (desktopEvent && typeof this.onNotification === 'function') {
          try {
            this.onNotification(desktopEvent, message);
          } catch (err) {
            this.logger.error?.('[desktop-live2d] failed to process gateway notification', err);
          }
        }

        if (message?.id !== requestId) {
          return;
        }

        if (message.error) {
          finish(reject, new Error(message.error.message || 'gateway runtime call failed'));
          return;
        }

        finish(resolve, message.result || null);
      });

      ws.on('error', (err) => {
        finish(reject, err);
      });

      ws.on('close', () => {
        if (!settled) {
          finish(reject, new Error('gateway connection closed before runtime result'));
        }
      });
    });
  }
}

module.exports = {
  toGatewayWsUrl,
  mapGatewayMessageToDesktopEvent,
  GatewayRuntimeClient
};
