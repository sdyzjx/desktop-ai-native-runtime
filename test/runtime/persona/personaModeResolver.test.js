const test = require('node:test');
const assert = require('node:assert/strict');
const { detectModeFromInput, resolvePersonaMode } = require('../../../apps/runtime/persona/personaModeResolver');

test('detectModeFromInput picks chinese mode keywords', () => {
  assert.equal(detectModeFromInput('请切换理性模式'), 'rational');
  assert.equal(detectModeFromInput('偶像模式来一段'), 'idol');
});

test('resolvePersonaMode priority session > input > default', () => {
  const cfg = { defaults: { mode: 'hybrid' } };
  assert.equal(resolvePersonaMode({ input: '理性模式', sessionState: { mode: 'strict' }, config: cfg }).mode, 'strict');
  assert.equal(resolvePersonaMode({ input: '理性模式', sessionState: null, config: cfg }).mode, 'rational');
  assert.equal(resolvePersonaMode({ input: '', sessionState: null, config: cfg }).mode, 'hybrid');
});
