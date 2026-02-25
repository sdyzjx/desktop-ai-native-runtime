const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');

const { ProviderConfigStore, validateConfig } = require('../../apps/runtime/config/providerConfigStore');

function createTempPath() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'provider-store-'));
  return { dir, configPath: path.join(dir, 'providers.yaml') };
}

test('ProviderConfigStore creates default config on first load', () => {
  const { configPath } = createTempPath();
  const store = new ProviderConfigStore({ configPath });

  const config = store.load();
  assert.equal(config.active_provider, 'openai');
  assert.ok(config.providers.openai);
  assert.equal(fs.existsSync(configPath), true);
});

test('ProviderConfigStore saveRawYaml persists and loads config', () => {
  const { configPath } = createTempPath();
  const store = new ProviderConfigStore({ configPath });

  const raw = [
    'active_provider: mock',
    'providers:',
    '  mock:',
    '    type: openai_compatible',
    '    display_name: Mock',
    '    base_url: http://127.0.0.1:4100',
    '    model: mock-model',
    '    api_key: test-key',
    '    timeout_ms: 1000'
  ].join('\n');

  store.saveRawYaml(raw);
  const loaded = store.load();
  assert.equal(loaded.active_provider, 'mock');
  assert.equal(loaded.providers.mock.model, 'mock-model');
});

test('validateConfig rejects invalid provider map', () => {
  assert.throws(() => {
    validateConfig({ active_provider: 'x', providers: {} });
  }, /providers must be a non-empty map/);

  assert.throws(() => {
    validateConfig({
      active_provider: 'x',
      providers: {
        x: {
          type: 'openai_compatible',
          base_url: 'http://example.com',
          model: 'm'
        }
      }
    });
  }, /must define api_key or api_key_env/);
});
