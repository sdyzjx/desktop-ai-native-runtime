class RpcRateLimiter {
  constructor({ limitsPerSecond } = {}) {
    this.limitsPerSecond = {
      'state.get': 30,
      'param.set': 60,
      'chat.show': 10,
      ...(limitsPerSecond || {})
    };
    this.windows = new Map();
  }

  check({ clientId, method, nowMs = Date.now() }) {
    const limit = this.limitsPerSecond[method];
    if (!limit) {
      return { ok: true, remaining: Number.POSITIVE_INFINITY };
    }

    const key = `${clientId || 'anonymous'}:${method}`;
    const existing = this.windows.get(key);

    if (!existing || nowMs - existing.windowStartMs >= 1000) {
      const next = { windowStartMs: nowMs, count: 1 };
      this.windows.set(key, next);
      return { ok: true, remaining: Math.max(0, limit - next.count) };
    }

    if (existing.count >= limit) {
      return {
        ok: false,
        retryAfterMs: Math.max(1, 1000 - (nowMs - existing.windowStartMs)),
        remaining: 0
      };
    }

    existing.count += 1;
    return { ok: true, remaining: Math.max(0, limit - existing.count) };
  }
}

module.exports = { RpcRateLimiter };
