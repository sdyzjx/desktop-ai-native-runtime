const { PersonaConfigStore } = require('./personaConfigStore');
const { PersonaLoader } = require('./personaLoader');
const { resolvePersonaMode } = require('./personaModeResolver');
const { PersonaStateStore } = require('./personaStateStore');
const { PersonaProfileStore } = require('./personaProfileStore');
const { maybePersistPersonaPreference } = require('./personaPreferenceWriteback');

function clip(text, maxChars) {
  const s = String(text || '').trim();
  if (s.length <= maxChars) return s;
  return `${s.slice(0, maxChars)}\n...[truncated]`;
}

class PersonaContextBuilder {
  constructor({ workspaceDir, configStore, loader, stateStore, profileStore, memoryStore } = {}) {
    this.workspaceDir = workspaceDir || process.cwd();
    this.configStore = configStore || new PersonaConfigStore();
    this.loader = loader || new PersonaLoader({ workspaceDir: this.workspaceDir });
    this.stateStore = stateStore || new PersonaStateStore();
    this.profileStore = profileStore || new PersonaProfileStore();
    this.memoryStore = memoryStore || null;
  }

  async build({ sessionId, input }) {
    const cfg = this.configStore.load();
    if (!cfg.defaults.injectEnabled) {
      return { prompt: '', mode: cfg.defaults.mode, source: 'disabled', sources: [] };
    }

    const profile = this.profileStore.load();
    const persona = this.loader.load(cfg);
    const personaSessionKey = cfg.defaults.sharedAcrossSessions ? '__persona_shared__' : sessionId;
    const sessionState = this.stateStore.get(personaSessionKey);
    const modeResolved = resolvePersonaMode({ input, sessionState, config: cfg });

    // Auto update in-memory session mode when detected from input.
    if (modeResolved.source === 'input') {
      this.stateStore.set(personaSessionKey, { mode: modeResolved.mode, mode_source: 'input' });
    }

    let memoryHints = [];
    if (this.memoryStore?.searchEntries) {
      try {
        const found = await this.memoryStore.searchEntries({
          query: 'preference style tone concise rational mode persona',
          limit: 3,
          minScore: 1,
          maxChars: 600
        });
        memoryHints = (found.items || []).map((e) => `- ${e.content}`);
      } catch {
        memoryHints = [];
      }
    }

    const effectiveAddressing = profile.addressing.use_custom_first && profile.addressing.custom_name
      ? profile.addressing.custom_name
      : profile.addressing.default_user_title;

    const parts = [
      `Persona Profile: ${profile.profile || cfg.defaults.profile || 'yachiyo'}`,
      `Address user as: ${effectiveAddressing}`,
      'Persona Core:',
      clip(persona.soul || '', 600),
      clip(persona.identity || '', 400),
      'User Preference:',
      clip(persona.user || '', 400),
      `Active persona mode: ${modeResolved.mode}`,
      memoryHints.length ? `Memory preference hints:\n${memoryHints.join('\n')}` : ''
    ].filter(Boolean);

    const maxChars = cfg.defaults.maxContextChars;
    const prompt = clip(parts.join('\n\n'), maxChars);

    const writeback = await maybePersistPersonaPreference({
      input,
      mode: modeResolved.mode,
      memoryStore: this.memoryStore,
      sessionId,
      config: cfg
    });

    return {
      prompt,
      mode: modeResolved.mode,
      source: modeResolved.source,
      addressing: effectiveAddressing,
      sources: [persona.paths.soulPath, persona.paths.identityPath, persona.paths.userPath],
      writeback
    };
  }
}

module.exports = { PersonaContextBuilder };
