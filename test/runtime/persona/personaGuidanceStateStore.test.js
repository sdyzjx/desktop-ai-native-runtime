const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const { PersonaGuidanceStateStore } = require('../../../apps/runtime/persona/personaGuidanceStateStore');

test('shouldPromptForCustomName respects cooldown', () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'persona-guidance-'));
  const statePath = path.join(tmp, 'state.json');
  const store = new PersonaGuidanceStateStore({ statePath });

  const profile = {
    addressing: { custom_name: '' },
    guidance: { prompt_if_missing_name: true, remind_cooldown_hours: 24 }
  };

  const now = Date.now();
  assert.equal(store.shouldPromptForCustomName({ profile, now }), true);
  store.markPrompted({ now });
  assert.equal(store.shouldPromptForCustomName({ profile, now: now + 1000 }), false);
  assert.equal(store.shouldPromptForCustomName({ profile, now: now + 25 * 60 * 60 * 1000 }), true);
});

test('shouldPromptForCustomName disabled when custom name exists', () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'persona-guidance-'));
  const statePath = path.join(tmp, 'state.json');
  const store = new PersonaGuidanceStateStore({ statePath });
  const profile = {
    addressing: { custom_name: '昵称' },
    guidance: { prompt_if_missing_name: true, remind_cooldown_hours: 24 }
  };
  assert.equal(store.shouldPromptForCustomName({ profile }), false);
});
