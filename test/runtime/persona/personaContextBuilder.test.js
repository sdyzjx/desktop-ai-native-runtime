const test = require('node:test');
const assert = require('node:assert/strict');
const { PersonaContextBuilder } = require('../../../apps/runtime/persona/personaContextBuilder');

test('PersonaContextBuilder builds prompt with mode and sources', async () => {
  const builder = new PersonaContextBuilder({
    configStore: { load: () => ({ defaults: { profile: 'yachiyo', mode: 'hybrid', injectEnabled: true, maxContextChars: 1000, sharedAcrossSessions: true }, writeback: { enabled: false } }) },
    profileStore: { load: () => ({ profile: 'yachiyo', addressing: { default_user_title: '主人', custom_name: '', use_custom_first: true }, guidance: { prompt_if_missing_name: true, remind_cooldown_hours: 24 } }) },
    guidanceStore: { shouldPromptForCustomName: () => true, markPrompted: () => ({}) },
    loader: { load: () => ({ soul: 'SOUL', identity: 'ID', user: 'USER', paths: { soulPath: 'SOUL.md', identityPath: 'IDENTITY.md', userPath: 'USER.md' } }) },
    stateStore: { get: () => null, set: () => ({}) },
    memoryStore: { searchEntries: async () => ({ items: [{ content: 'prefers concise style' }] }) }
  });

  const ctx = await builder.build({ sessionId: 's1', input: 'hello' });
  assert.match(ctx.prompt, /Persona Core/);
  assert.match(ctx.prompt, /Address user as: 主人/);
  assert.match(ctx.prompt, /Active persona mode/);
  assert.equal(ctx.guidance.promptedForCustomName, true);
  assert.equal(Array.isArray(ctx.sources), true);
});

test('PersonaContextBuilder shares mode across sessions when sharedAcrossSessions=true', async () => {
  const stateStore = {
    map: new Map(),
    get(k) { return this.map.get(k) || null; },
    set(k, v) { this.map.set(k, v); return v; }
  };

  const builder = new PersonaContextBuilder({
    configStore: {
      load: () => ({
        defaults: { profile: 'yachiyo', mode: 'hybrid', injectEnabled: true, maxContextChars: 1000, sharedAcrossSessions: true },
        source: { preferredRoot: '.', allowWorkspaceOverride: false },
        writeback: { enabled: false }
      })
    },
    profileStore: { load: () => ({ profile: 'yachiyo', addressing: { default_user_title: '主人', custom_name: '', use_custom_first: true }, guidance: { prompt_if_missing_name: true, remind_cooldown_hours: 24 } }) },
    guidanceStore: { shouldPromptForCustomName: () => false, markPrompted: () => ({}) },
    loader: { load: () => ({ soul: 'SOUL', identity: 'ID', user: 'USER', paths: { soulPath: 'SOUL.md', identityPath: 'IDENTITY.md', userPath: 'USER.md' } }) },
    stateStore,
    memoryStore: null
  });

  await builder.build({ sessionId: 's1', input: '请切换理性模式' });
  const second = await builder.build({ sessionId: 's2', input: 'hello again' });
  assert.equal(second.mode, 'rational');
});
