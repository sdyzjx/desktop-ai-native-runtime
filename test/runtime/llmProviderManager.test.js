const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');

const { ProviderConfigStore } = require('../../apps/runtime/config/providerConfigStore');
const { LlmProviderManager } = require('../../apps/runtime/config/llmProviderManager');

function createManagerWithConfig(rawYaml) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'llm-manager-'));
  const configPath = path.join(dir, 'providers.yaml');
  fs.writeFileSync(configPath, rawYaml, 'utf8');

  const store = new ProviderConfigStore({ configPath });
  return { manager: new LlmProviderManager({ store }), dir };
}

test('LlmProviderManager resolves api key from env and caches reasoner', () => {
  const previous = process.env.TEST_DASHSCOPE_KEY;
  process.env.TEST_DASHSCOPE_KEY = 'env-key-1';

  try {
    const { manager } = createManagerWithConfig([
      'active_provider: qwen',
      'providers:',
      '  qwen:',
      '    type: openai_compatible',
      '    display_name: Qwen',
      '    base_url: http://127.0.0.1:4100',
      '    model: qwen3.5-plus',
      '    api_key_env: TEST_DASHSCOPE_KEY'
    ].join('\n'));

    const summary = manager.getConfigSummary();
    assert.equal(summary.active_provider, 'qwen');
    assert.equal(summary.has_api_key, true);

    const first = manager.getReasoner();
    const second = manager.getReasoner();
    assert.equal(first, second);
  } finally {
    if (previous === undefined) delete process.env.TEST_DASHSCOPE_KEY;
    else process.env.TEST_DASHSCOPE_KEY = previous;
  }
});

test('LlmProviderManager saveConfig invalidates reasoner cache', () => {
  const { manager } = createManagerWithConfig([
    'active_provider: x',
    'providers:',
    '  x:',
    '    type: openai_compatible',
    '    display_name: X',
    '    base_url: http://127.0.0.1:4100',
    '    model: m1',
    '    api_key: key-1'
  ].join('\n'));

  const reasoner1 = manager.getReasoner();

  manager.saveConfig({
    active_provider: 'x',
    providers: {
      x: {
        type: 'openai_compatible',
        display_name: 'X',
        base_url: 'http://127.0.0.1:4100',
        model: 'm2',
        api_key: 'key-1'
      }
    }
  });

  const reasoner2 = manager.getReasoner();
  assert.notEqual(reasoner1, reasoner2);
  assert.equal(manager.getConfigSummary().active_model, 'm2');
});
