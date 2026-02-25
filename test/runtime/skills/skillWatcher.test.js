const test = require('node:test');
const assert = require('node:assert/strict');

const { SkillWatcher } = require('../../../apps/runtime/skills/skillWatcher');

test('SkillWatcher schedule debounces and triggers onChange', async () => {
  const events = [];
  const watcher = new SkillWatcher({
    roots: [],
    debounceMs: 10,
    onChange: (e) => events.push(e)
  });

  watcher.schedule('/tmp/a/SKILL.md');
  watcher.schedule('/tmp/b/SKILL.md');

  await new Promise((r) => setTimeout(r, 30));
  watcher.stop();

  assert.equal(events.length, 1);
  assert.equal(events[0].changedPath, '/tmp/b/SKILL.md');
});
