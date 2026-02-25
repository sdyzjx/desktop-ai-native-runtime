const test = require('node:test');
const assert = require('node:assert/strict');
const {
  detectExplicitPreferenceSignal,
  maybePersistPersonaPreference
} = require('../../../apps/runtime/persona/personaPreferenceWriteback');

test('detectExplicitPreferenceSignal identifies explicit chinese preference signals', () => {
  assert.ok(detectExplicitPreferenceSignal('以后都用理性模式这样回复我'));
  assert.equal(detectExplicitPreferenceSignal('今天天气不错'), null);
});

test('maybePersistPersonaPreference writes to memory when signal exists', async () => {
  const writes = [];
  const result = await maybePersistPersonaPreference({
    input: '以后都按这个风格回复我',
    mode: 'rational',
    memoryStore: {
      async addEntry(payload) {
        writes.push(payload);
        return { id: 'mem-1' };
      }
    },
    sessionId: 's1',
    config: { writeback: { enabled: true } }
  });

  assert.equal(result.persisted, true);
  assert.equal(writes.length, 1);
  assert.match(writes[0].content, /preferred mode=rational/);
});
