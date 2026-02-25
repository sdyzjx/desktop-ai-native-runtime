const fs = require('fs');
const path = require('path');
const os = require('os');

const DEFAULT_STATE_PATH = path.join(os.homedir(), '.openclaw', 'workspace', 'persona', 'state.json');

function readJsonSafe(filePath) {
  try {
    return JSON.parse(fs.readFileSync(filePath, 'utf8'));
  } catch {
    return {};
  }
}

class PersonaGuidanceStateStore {
  constructor({ statePath } = {}) {
    this.statePath = statePath || process.env.PERSONA_STATE_PATH || DEFAULT_STATE_PATH;
  }

  ensureDir() {
    fs.mkdirSync(path.dirname(this.statePath), { recursive: true });
  }

  load() {
    this.ensureDir();
    return readJsonSafe(this.statePath);
  }

  save(next) {
    this.ensureDir();
    fs.writeFileSync(this.statePath, JSON.stringify(next, null, 2), 'utf8');
    return next;
  }

  shouldPromptForCustomName({ profile, now = Date.now() } = {}) {
    const customName = String(profile?.addressing?.custom_name || '').trim();
    if (customName) return false;
    if (!profile?.guidance?.prompt_if_missing_name) return false;

    const state = this.load();
    const last = Number(state.lastPromptForCustomNameAt || 0);
    const cooldownHours = Math.max(1, Number(profile?.guidance?.remind_cooldown_hours) || 24);
    const cooldownMs = cooldownHours * 60 * 60 * 1000;

    return (now - last) >= cooldownMs;
  }

  markPrompted({ now = Date.now() } = {}) {
    const state = this.load();
    state.lastPromptForCustomNameAt = now;
    this.save(state);
    return state;
  }
}

module.exports = { PersonaGuidanceStateStore, DEFAULT_STATE_PATH };
