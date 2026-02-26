const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const {
  expandHome,
  resolveYachiyoHome,
  getRuntimePaths
} = require('../../../apps/runtime/skills/runtimePaths');

test('expandHome resolves ~ and ~/ correctly', () => {
  assert.equal(expandHome('~'), os.homedir());
  assert.equal(expandHome('~/yachiyo'), path.join(os.homedir(), 'yachiyo'));
});

test('resolveYachiyoHome uses env override when provided', () => {
  const old = process.env.YACHIYO_HOME;
  process.env.YACHIYO_HOME = '/tmp/custom-yachiyo-home';

  try {
    assert.equal(resolveYachiyoHome(), '/tmp/custom-yachiyo-home');
  } finally {
    if (old === undefined) delete process.env.YACHIYO_HOME;
    else process.env.YACHIYO_HOME = old;
  }
});

test('getRuntimePaths creates expected directories', () => {
  const base = fs.mkdtempSync(path.join(os.tmpdir(), 'yachiyo-home-'));
  const customHome = path.join(base, 'home');

  const paths = getRuntimePaths({ envKey: 'NON_EXISTING_ENV_KEY', defaultPath: customHome });

  assert.equal(paths.home, customHome);
  assert.equal(fs.existsSync(paths.skillsDir), true);
  assert.equal(fs.existsSync(paths.dataDir), true);
  assert.equal(fs.existsSync(paths.configDir), true);
  assert.equal(fs.existsSync(paths.personaDir), true);
  assert.equal(fs.existsSync(paths.logsDir), true);
  assert.equal(fs.existsSync(paths.tmpDir), true);
});
