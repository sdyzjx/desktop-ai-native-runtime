class SkillSnapshotStore {
  constructor() {
    this.version = 1;
    this.cache = new Map();
  }

  bump(reason = 'manual') {
    this.version += 1;
    this.cache.clear();
    return { version: this.version, reason };
  }

  getVersion() {
    return this.version;
  }

  get(sessionId) {
    return this.cache.get(sessionId) || null;
  }

  set(sessionId, snapshot) {
    this.cache.set(sessionId, { ...snapshot, version: this.version });
  }
}

module.exports = { SkillSnapshotStore };
