const { randomUUID } = require('node:crypto');
const WebSocket = require('ws');

function createDesktopSessionId() {
  const stamp = new Date().toISOString().replace(/[-:.TZ]/g, '').slice(0, 14);
  return `desktop-${stamp}-${randomUUID().slice(0, 8)}`;
}

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
    fetchImpl = globalThis.fetch,
    WebSocketImpl = WebSocket,
    logger = console
  }) {
    this.gatewayUrl = String(gatewayUrl);
    this.gatewayWsUrl = toGatewayWsUrl(gatewayUrl);
    this.sessionId = sessionId;
    this.requestTimeoutMs = requestTimeoutMs;
    this.onNotification = onNotification;
    this.fetchImpl = fetchImpl;
    this.WebSocketImpl = WebSocketImpl;
    this.logger = logger;
  }

  getSessionId() {
    return this.sessionId;
  }

  setSessionId(sessionId) {
    const normalized = String(sessionId || '').trim();
    if (!normalized) {
      throw new Error('sessionId must be non-empty');
    }
    this.sessionId = normalized;
    return this.sessionId;
  }

  async createAndUseNewSession({ permissionLevel = 'medium' } = {}) {
    const sessionId = createDesktopSessionId();
    this.setSessionId(sessionId);
    await this.ensureSession({ sessionId, permissionLevel });
    return sessionId;
  }

  async ensureSession({ sessionId = this.sessionId, permissionLevel = 'medium' } = {}) {
    if (typeof this.fetchImpl !== 'function') {
      throw new Error('fetch is unavailable for gateway session bootstrap');
    }

    const url = new URL(`/api/sessions/${encodeURIComponent(sessionId)}/settings`, this.gatewayUrl);
    const response = await this.fetchImpl(url, {
      method: 'PUT',
      headers: {
        'content-type': 'application/json'
      },
      body: JSON.stringify({
        settings: {
          permission_level: permissionLevel
        }
      })
    });

    if (!response.ok) {
      let bodyText = '';
      try {
        bodyText = await response.text();
      } catch {
        bodyText = '';
      }
      throw new Error(`failed to ensure gateway session ${sessionId}: status=${response.status} body=${bodyText}`);
    }

    try {
      return await response.json();
    } catch {
      return { ok: true };
    }
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

  startNotificationStream() {
    if (this._notifWs) return;

    const connect = () => {
      if (this._notifStopped) return;
      const ws = new this.WebSocketImpl(this.gatewayWsUrl);
      this._notifWs = ws;

      ws.on('message', (raw) => {
        let message;
        try { message = JSON.parse(String(raw)); } catch { return; }
        const desktopEvent = mapGatewayMessageToDesktopEvent(message);
        if (desktopEvent && typeof this.onNotification === 'function') {
          try { this.onNotification(desktopEvent, message); } catch { /* ignore */ }
        }
      });

      ws.on('close', () => {
        this._notifWs = null;
        if (!this._notifStopped) {
          setTimeout(connect, 2000);
        }
      });

      ws.on('error', () => { /* reconnect handled by close */ });
    };

    this._notifStopped = false;
    connect();
  }

  stopNotificationStream() {
    this._notifStopped = true;
    if (this._notifWs) {
      try { this._notifWs.close(); } catch { /* ignore */ }
      this._notifWs = null;
    }
  }
}

module.exports = {
  createDesktopSessionId,
  toGatewayWsUrl,
  mapGatewayMessageToDesktopEvent,
  GatewayRuntimeClient
};
