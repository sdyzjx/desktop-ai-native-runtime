const test = require('node:test');
const assert = require('node:assert/strict');

const { SkillSnapshotStore } = require('../../../apps/runtime/skills/skillSnapshotStore');

test('SkillSnapshotStore caches per session and bumps version', () => {
  const store = new SkillSnapshotStore();
  store.set('s1', { prompt: 'a' });
  const a = store.get('s1');
  assert.equal(a.prompt, 'a');
  assert.equal(a.version, 1);

  const bumped = store.bump('watch');
  assert.equal(bumped.version, 2);
  assert.equal(store.get('s1'), null);
});
