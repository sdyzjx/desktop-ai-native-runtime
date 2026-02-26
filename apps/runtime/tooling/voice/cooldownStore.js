class InMemoryVoiceCooldownStore {
  constructor() {
    this.calls = new Map();
  }

  _bucket(sessionId) {
    const key = String(sessionId || 'global');
    if (!this.calls.has(key)) this.calls.set(key, []);
    return this.calls.get(key);
  }

  getState(sessionId, nowMs = Date.now()) {
    const bucket = this._bucket(sessionId);
    const oneMinuteAgo = nowMs - 60_000;
    const valid = bucket.filter((ts) => ts >= oneMinuteAgo);
    this.calls.set(String(sessionId || 'global'), valid);

    const lastCallAt = valid.length ? valid[valid.length - 1] : null;
    return {
      callsInLastMinute: valid.length,
      lastCallAt
    };
  }

  addCall(sessionId, nowMs = Date.now()) {
    const bucket = this._bucket(sessionId);
    bucket.push(nowMs);
    this.calls.set(String(sessionId || 'global'), bucket);
  }
}

module.exports = {
  InMemoryVoiceCooldownStore
};
