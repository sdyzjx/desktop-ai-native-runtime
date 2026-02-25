const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const { PersonaLoader, resolvePersonaRoot } = require('../../../apps/runtime/persona/personaLoader');

test('resolvePersonaRoot uses preferredRoot by default', () => {
  const root = resolvePersonaRoot({
    workspaceDir: '/tmp/workspace-x',
    config: { source: { preferredRoot: '~/abc-persona', allowWorkspaceOverride: false } }
  });
  assert.equal(root, path.join(os.homedir(), 'abc-persona'));
});

test('PersonaLoader loads SOUL/IDENTITY/USER from preferredRoot', () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'persona-root-'));
  fs.writeFileSync(path.join(tmp, 'SOUL.md'), 'SOUL-X', 'utf8');
  fs.writeFileSync(path.join(tmp, 'IDENTITY.md'), 'IDENTITY-X', 'utf8');
  fs.writeFileSync(path.join(tmp, 'USER.md'), 'USER-X', 'utf8');

  const loader = new PersonaLoader({ workspaceDir: '/tmp/unused-workspace' });
  const loaded = loader.load({ source: { preferredRoot: tmp, allowWorkspaceOverride: false } });

  assert.equal(loaded.soul, 'SOUL-X');
  assert.equal(loaded.identity, 'IDENTITY-X');
  assert.equal(loaded.user, 'USER-X');
});
