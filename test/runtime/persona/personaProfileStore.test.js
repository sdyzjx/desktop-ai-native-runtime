const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const { PersonaProfileStore, normalizeProfile } = require('../../../apps/runtime/persona/personaProfileStore');

test('PersonaProfileStore creates default profile with 主人', () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'persona-profile-'));
  const profilePath = path.join(tmp, 'profile.yaml');
  const store = new PersonaProfileStore({ profilePath });
  const profile = store.load();

  assert.equal(profile.addressing.default_user_title, '主人');
  assert.equal(fs.existsSync(profilePath), true);
});

test('PersonaProfileStore save merges nested fields', () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'persona-profile-'));
  const profilePath = path.join(tmp, 'profile.yaml');
  const store = new PersonaProfileStore({ profilePath });
  store.load();
  const updated = store.save({ addressing: { custom_name: '测试称呼' } });
  assert.equal(updated.addressing.custom_name, '测试称呼');
  assert.equal(updated.addressing.default_user_title, '主人');
});

test('normalizeProfile handles invalid root', () => {
  const normalized = normalizeProfile(null);
  assert.equal(normalized.profile, 'yachiyo');
});
