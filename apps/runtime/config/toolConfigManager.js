const { ToolConfigStore } = require('../tooling/toolConfigStore');
const { ToolRegistry } = require('../tooling/toolRegistry');

class ToolConfigManager {
  constructor({ store } = {}) {
    this.store = store || new ToolConfigStore();
  }

  getConfig() {
    return this.store.load();
  }

  loadYaml() {
    return this.store.loadRawYaml();
  }

  buildRegistry() {
    const cfg = this.getConfig();
    return {
      registry: new ToolRegistry({ config: cfg }),
      policy: cfg.policy || { allow: [], deny: [], byProvider: {} },
      exec: cfg.exec || {}
    };
  }

  getSummary() {
    const cfg = this.getConfig();
    return {
      tools: (cfg.tools || []).map((t) => t.name),
      allow: cfg.policy?.allow || [],
      deny: cfg.policy?.deny || [],
      security: cfg.exec?.security || 'allowlist'
    };
  }
}

module.exports = { ToolConfigManager };
