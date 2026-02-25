class PersonaStateStore {
  constructor() {
    this.stateBySession = new Map();
  }

  get(sessionId) {
    return this.stateBySession.get(String(sessionId)) || null;
  }

  set(sessionId, patch = {}) {
    const key = String(sessionId);
    const current = this.stateBySession.get(key) || {};
    const next = {
      ...current,
      ...patch,
      updated_at: new Date().toISOString()
    };
    this.stateBySession.set(key, next);
    return next;
  }

  clear(sessionId) {
    this.stateBySession.delete(String(sessionId));
  }
}

module.exports = { PersonaStateStore };
