const fs = require('fs');
const path = require('path');
const YAML = require('yaml');

const DEFAULT_CONFIG = {
  active_provider: 'openai',
  providers: {
    openai: {
      type: 'openai_compatible',
      display_name: 'OpenAI',
      base_url: 'https://api.openai.com/v1',
      model: 'gpt-4o-mini',
      api_key_env: 'OPENAI_API_KEY',
      timeout_ms: 20000
    }
  }
};

function isObject(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function validateConfig(config) {
  if (!isObject(config)) {
    throw new Error('providers.yaml root must be an object');
  }

  const providers = config.providers;
  const activeProvider = config.active_provider;

  if (!isObject(providers) || Object.keys(providers).length === 0) {
    throw new Error('providers must be a non-empty map');
  }

  if (typeof activeProvider !== 'string' || !activeProvider) {
    throw new Error('active_provider must be a non-empty string');
  }

  if (!providers[activeProvider]) {
    throw new Error(`active_provider not found in providers: ${activeProvider}`);
  }

  for (const [name, provider] of Object.entries(providers)) {
    if (!isObject(provider)) {
      throw new Error(`provider ${name} must be an object`);
    }

    if (provider.type !== 'openai_compatible') {
      throw new Error(`provider ${name} type must be openai_compatible`);
    }

    if (typeof provider.base_url !== 'string' || !provider.base_url) {
      throw new Error(`provider ${name} must define base_url`);
    }

    if (typeof provider.model !== 'string' || !provider.model) {
      throw new Error(`provider ${name} must define model`);
    }

    const hasInlineKey = typeof provider.api_key === 'string' && provider.api_key.length > 0;
    const hasEnvKey = typeof provider.api_key_env === 'string' && provider.api_key_env.length > 0;
    if (!hasInlineKey && !hasEnvKey) {
      throw new Error(`provider ${name} must define api_key or api_key_env`);
    }
  }
}

class ProviderConfigStore {
  constructor({ configPath } = {}) {
    this.configPath = configPath
      || process.env.PROVIDER_CONFIG_PATH
      || path.resolve(process.cwd(), 'config/providers.yaml');
    this.ensureExists();
  }

  ensureExists() {
    if (fs.existsSync(this.configPath)) return;
    fs.mkdirSync(path.dirname(this.configPath), { recursive: true });
    fs.writeFileSync(this.configPath, YAML.stringify(DEFAULT_CONFIG), 'utf8');
  }

  loadRawYaml() {
    this.ensureExists();
    return fs.readFileSync(this.configPath, 'utf8');
  }

  load() {
    const raw = this.loadRawYaml();
    const parsed = YAML.parse(raw);
    validateConfig(parsed);
    return parsed;
  }

  saveRawYaml(rawYaml) {
    const parsed = YAML.parse(rawYaml);
    validateConfig(parsed);
    fs.writeFileSync(this.configPath, YAML.stringify(parsed), 'utf8');
    return parsed;
  }

  save(config) {
    validateConfig(config);
    fs.writeFileSync(this.configPath, YAML.stringify(config), 'utf8');
  }
}

module.exports = { ProviderConfigStore, validateConfig };
