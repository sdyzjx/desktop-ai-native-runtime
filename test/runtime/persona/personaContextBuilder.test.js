const test = require('node:test');
const assert = require('node:assert/strict');
const { PersonaContextBuilder } = require('../../../apps/runtime/persona/personaContextBuilder');

test('PersonaContextBuilder builds prompt with mode and sources', async () => {
  const builder = new PersonaContextBuilder({
    configStore: { load: () => ({ defaults: { mode: 'hybrid', injectEnabled: true, maxContextChars: 1000 } }) },
    loader: { load: () => ({ soul: 'SOUL', identity: 'ID', user: 'USER', paths: { soulPath: 'SOUL.md', identityPath: 'IDENTITY.md', userPath: 'USER.md' } }) },
    stateStore: { get: () => null, set: () => ({}) },
    memoryStore: { searchEntries: async () => ({ items: [{ content: 'prefers concise style' }] }) }
  });

  const ctx = await builder.build({ sessionId: 's1', input: 'hello' });
  assert.match(ctx.prompt, /Persona Core/);
  assert.match(ctx.prompt, /Active persona mode/);
  assert.equal(Array.isArray(ctx.sources), true);
});
