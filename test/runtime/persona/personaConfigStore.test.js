const test = require('node:test');
const assert = require('node:assert/strict');
const { PersonaConfigStore, normalizeConfig } = require('../../../apps/runtime/persona/personaConfigStore');
const path = require('node:path');

test('PersonaConfigStore loads config/persona.yaml', () => {
  const store = new PersonaConfigStore({ configPath: path.resolve(process.cwd(), 'config/persona.yaml') });
  const cfg = store.load();
  assert.equal(cfg.version, 1);
  assert.equal(cfg.defaults.mode, 'hybrid');
  assert.equal(cfg.defaults.profile, 'yachiyo');
  assert.equal(cfg.defaults.sharedAcrossSessions, true);
  assert.equal(cfg.source.preferredRoot, '.');
});

test('normalizeConfig validates root', () => {
  assert.throws(() => normalizeConfig(null), /root must be object/);
});
