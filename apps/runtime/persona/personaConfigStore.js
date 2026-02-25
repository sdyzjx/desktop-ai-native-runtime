const fs = require('fs');
const path = require('path');
const YAML = require('yaml');

const DEFAULT_PATH = path.resolve(process.cwd(), 'config/persona.yaml');

function normalizeConfig(raw) {
  if (!raw || typeof raw !== 'object') throw new Error('persona.yaml root must be object');
  if (raw.version !== 1) throw new Error('persona.yaml version must be 1');

  const defaults = raw.defaults || {};
  const source = raw.source || {};

  return {
    version: 1,
    defaults: {
      profile: String(defaults.profile || 'yachiyo'),
      mode: String(defaults.mode || 'hybrid'),
      injectEnabled: defaults.injectEnabled !== false,
      maxContextChars: Math.max(256, Number(defaults.maxContextChars) || 1500),
      sharedAcrossSessions: defaults.sharedAcrossSessions !== false
    },
    source: {
      preferredRoot: String(source.preferredRoot || '.'),
      allowWorkspaceOverride: source.allowWorkspaceOverride === true
    },
    modes: raw.modes || {},
    writeback: {
      enabled: raw.writeback?.enabled !== false,
      explicitOnly: raw.writeback?.explicitOnly === true,
      minSignals: Math.max(1, Number(raw.writeback?.minSignals) || 3)
    }
  };
}

class PersonaConfigStore {
  constructor({ configPath } = {}) {
    this.configPath = configPath || process.env.PERSONA_CONFIG_PATH || DEFAULT_PATH;
  }

  load() {
    const raw = fs.readFileSync(this.configPath, 'utf8');
    return normalizeConfig(YAML.parse(raw));
  }
}

module.exports = { PersonaConfigStore, normalizeConfig };
