const fs = require('fs');
const path = require('path');
const os = require('os');
const YAML = require('yaml');

const DEFAULT_PROFILE_PATH = path.join(os.homedir(), '.openclaw', 'workspace', 'persona', 'profile.yaml');

const DEFAULT_PROFILE = {
  version: 1,
  profile: 'yachiyo',
  addressing: {
    default_user_title: '主人',
    custom_name: '',
    use_custom_first: true
  },
  guidance: {
    prompt_if_missing_name: true,
    remind_cooldown_hours: 24
  }
};

function normalizeProfile(raw) {
  const root = (!raw || typeof raw !== 'object' || Array.isArray(raw)) ? {} : raw;
  const addressing = root.addressing || {};
  const guidance = root.guidance || {};

  return {
    version: 1,
    profile: String(root.profile || DEFAULT_PROFILE.profile),
    addressing: {
      default_user_title: String(addressing.default_user_title || DEFAULT_PROFILE.addressing.default_user_title),
      custom_name: String(addressing.custom_name || ''),
      use_custom_first: addressing.use_custom_first !== false
    },
    guidance: {
      prompt_if_missing_name: guidance.prompt_if_missing_name !== false,
      remind_cooldown_hours: Math.max(1, Number(guidance.remind_cooldown_hours) || 24)
    }
  };
}

class PersonaProfileStore {
  constructor({ profilePath } = {}) {
    this.profilePath = profilePath || process.env.PERSONA_PROFILE_PATH || DEFAULT_PROFILE_PATH;
  }

  ensureProfileExists() {
    const dir = path.dirname(this.profilePath);
    fs.mkdirSync(dir, { recursive: true });
    if (!fs.existsSync(this.profilePath)) {
      fs.writeFileSync(this.profilePath, YAML.stringify(DEFAULT_PROFILE), 'utf8');
    }
  }

  load() {
    this.ensureProfileExists();
    const raw = fs.readFileSync(this.profilePath, 'utf8');
    return normalizeProfile(YAML.parse(raw));
  }

  save(profilePatch = {}) {
    const current = this.load();
    const merged = {
      ...current,
      ...profilePatch,
      addressing: {
        ...current.addressing,
        ...(profilePatch.addressing || {})
      },
      guidance: {
        ...current.guidance,
        ...(profilePatch.guidance || {})
      }
    };

    const normalized = normalizeProfile(merged);
    fs.writeFileSync(this.profilePath, YAML.stringify(normalized), 'utf8');
    return normalized;
  }
}

module.exports = {
  PersonaProfileStore,
  normalizeProfile,
  DEFAULT_PROFILE,
  DEFAULT_PROFILE_PATH
};
