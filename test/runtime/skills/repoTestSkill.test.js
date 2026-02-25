const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');

const { readSkillFromDir } = require('../../../apps/runtime/skills/skillLoader');

test('repository smoke skill is loadable with expected metadata', () => {
  const skillDir = path.resolve(process.cwd(), 'skills/test_skill_smoke');
  const loaded = readSkillFromDir(skillDir, 'workspace');

  assert.ok(loaded);
  assert.equal(loaded.name, 'test_skill_smoke');
  assert.match(loaded.description, /smoke-test/i);
  assert.equal(loaded.source, 'workspace');
  assert.match(loaded.filePath, /skills\/test_skill_smoke\/SKILL\.md$/);
});
