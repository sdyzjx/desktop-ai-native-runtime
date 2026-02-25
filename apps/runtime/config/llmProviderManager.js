const { OpenAIReasoner } = require('../llm/openaiReasoner');

class LlmProviderManager {
  constructor({ store }) {
    this.store = store;
    this.cacheKey = null;
    this.cachedReasoner = null;
  }

  getActiveProviderSnapshot() {
    const config = this.store.load();
    const activeName = config.active_provider;
    const provider = config.providers[activeName];

    const resolvedApiKey = provider.api_key || process.env[provider.api_key_env] || null;

    return {
      active_name: activeName,
      provider,
      has_api_key: Boolean(resolvedApiKey)
    };
  }

  getReasoner() {
    const snapshot = this.getActiveProviderSnapshot();
    const provider = snapshot.provider;
    const apiKey = provider.api_key || process.env[provider.api_key_env];

    if (!apiKey) {
      throw new Error(
        `No API key for provider "${snapshot.active_name}". Set api_key in YAML or env ${provider.api_key_env}.`
      );
    }

    const key = JSON.stringify({
      name: snapshot.active_name,
      base_url: provider.base_url,
      model: provider.model,
      timeout_ms: provider.timeout_ms || 20000,
      api_key: apiKey
    });

    if (this.cacheKey === key && this.cachedReasoner) {
      return this.cachedReasoner;
    }

    this.cachedReasoner = new OpenAIReasoner({
      apiKey,
      baseUrl: provider.base_url,
      model: provider.model,
      timeoutMs: Number(provider.timeout_ms) || 20000
    });
    this.cacheKey = key;
    return this.cachedReasoner;
  }

  loadYaml() {
    return this.store.loadRawYaml();
  }

  getConfig() {
    return this.store.load();
  }

  saveYaml(rawYaml) {
    const config = this.store.saveRawYaml(rawYaml);
    this.cacheKey = null;
    this.cachedReasoner = null;
    return config;
  }

  saveConfig(config) {
    this.store.save(config);
    this.cacheKey = null;
    this.cachedReasoner = null;
    return this.store.load();
  }

  getConfigSummary() {
    const config = this.store.load();
    const activeName = config.active_provider;
    const active = config.providers[activeName];
    const hasApiKey = Boolean(active.api_key || process.env[active.api_key_env]);

    return {
      active_provider: activeName,
      providers: Object.keys(config.providers),
      active_model: active.model,
      active_base_url: active.base_url,
      active_type: active.type,
      has_api_key: hasApiKey
    };
  }
}

module.exports = { LlmProviderManager };
