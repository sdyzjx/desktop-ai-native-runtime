const test = require('node:test');
const assert = require('node:assert/strict');

const {
  isTruthyConfigPath,
  evaluateSkillEligibility,
  filterEligibleSkills
} = require('../../../apps/runtime/skills/skillEligibility');

function mkSkill(name, frontmatter = {}) {
  return { name, frontmatter };
}

test('isTruthyConfigPath resolves nested fields', () => {
  const cfg = { a: { b: { c: true } } };
  assert.equal(isTruthyConfigPath(cfg, 'a.b.c'), true);
  assert.equal(isTruthyConfigPath(cfg, 'a.b.x'), false);
});

test('eligibility blocks disabled skills from config.entries', () => {
  const skill = mkSkill('s1');
  const cfg = { entries: { s1: { enabled: false } } };
  const r = evaluateSkillEligibility({ skill, config: cfg });
  assert.equal(r.include, false);
  assert.equal(r.reason, 'disabled_by_config');
});

test('eligibility validates required env vars from frontmatter', () => {
  const skill = mkSkill('s1', { requires_env: 'TEST_REQUIRED_ENV' });
  const old = process.env.TEST_REQUIRED_ENV;
  delete process.env.TEST_REQUIRED_ENV;
  try {
    const cfg = { entries: {} };
    const r1 = evaluateSkillEligibility({ skill, config: cfg });
    assert.equal(r1.include, false);
    assert.match(r1.reason, /missing_env/);

    process.env.TEST_REQUIRED_ENV = '1';
    const r2 = evaluateSkillEligibility({ skill, config: cfg });
    assert.equal(r2.include, true);
  } finally {
    if (old === undefined) delete process.env.TEST_REQUIRED_ENV;
    else process.env.TEST_REQUIRED_ENV = old;
  }
});

test('eligibility validates required config paths from frontmatter', () => {
  const skill = mkSkill('s1', { requires_config: 'tools.exec.enabled' });
  const cfg1 = { entries: {}, tools: { exec: { enabled: false } } };
  const cfg2 = { entries: {}, tools: { exec: { enabled: true } } };

  const r1 = evaluateSkillEligibility({ skill, config: cfg1 });
  const r2 = evaluateSkillEligibility({ skill, config: cfg2 });

  assert.equal(r1.include, false);
  assert.equal(r2.include, true);
});

test('filterEligibleSkills returns accepted and dropped lists', () => {
  const skills = [
    mkSkill('ok'),
    mkSkill('need_env', { requires_env: 'NO_SUCH_ENV_FOR_TEST' })
  ];

  const result = filterEligibleSkills({ skills, config: { entries: {} } });
  assert.equal(result.accepted.some((s) => s.name === 'ok'), true);
  assert.equal(result.dropped.some((d) => d.name === 'need_env'), true);
});
