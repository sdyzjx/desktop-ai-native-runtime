const { PersonaConfigStore } = require('./personaConfigStore');
const { PersonaLoader } = require('./personaLoader');
const { resolvePersonaMode } = require('./personaModeResolver');
const { PersonaStateStore } = require('./personaStateStore');
const { PersonaProfileStore } = require('./personaProfileStore');
const { PersonaGuidanceStateStore } = require('./personaGuidanceStateStore');
const { maybePersistPersonaPreference } = require('./personaPreferenceWriteback');
const { loadVoicePolicy } = require('../tooling/voice/policy');

function clip(text, maxChars) {
  const s = String(text || '').trim();
  if (s.length <= maxChars) return s;
  return `${s.slice(0, maxChars)}\n...[truncated]`;
}

class PersonaContextBuilder {
  constructor({ workspaceDir, configStore, loader, stateStore, profileStore, guidanceStore, memoryStore } = {}) {
    this.workspaceDir = workspaceDir || process.cwd();
    this.configStore = configStore || new PersonaConfigStore();
    this.loader = loader || new PersonaLoader({ workspaceDir: this.workspaceDir });
    this.stateStore = stateStore || new PersonaStateStore();
    this.profileStore = profileStore || new PersonaProfileStore();
    this.guidanceStore = guidanceStore || new PersonaGuidanceStateStore();
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

    const shouldPromptForCustomName = this.guidanceStore.shouldPromptForCustomName({ profile });

    // Load voice policy to check auto_voice_reply setting
    const voicePolicy = loadVoicePolicy();
    const autoVoiceReplyEnabled = voicePolicy.auto_voice_reply?.enabled || false;
    const autoVoiceReplyMaxChars = voicePolicy.auto_voice_reply?.max_chars || 50;

    const voiceReplyPrompt = autoVoiceReplyEnabled
      ? `Voice Reply Mode: 在每次回复后，你应该主动调用 voice.tts_aliyun_vc 工具生成一段简短的语音回复（不超过${autoVoiceReplyMaxChars}字）。这段语音可以是：\n- 对你回复内容的精炼总结\n- 对用户问题的轻松吐槽或评论\n- 简短的互动性回应\n根据对话氛围自行决定风格，保持自然和个性化。语音文本应该口语化、简洁有趣。`
      : '';

    const parts = [
      `Persona Profile: ${profile.profile || cfg.defaults.profile || 'yachiyo'}`,
      `Address user as: ${effectiveAddressing}`,
      shouldPromptForCustomName
        ? 'If user has not set preferred name, gently ask once: "你希望我怎么称呼你？我可以先用\'主人\'，也可以换成你指定的称呼。"'
        : '',
      'Persona Core:',
      clip(persona.soul || '', 600),
      clip(persona.identity || '', 400),
      'User Preference:',
      clip(persona.user || '', 400),
      `Active persona mode: ${modeResolved.mode}`,
      memoryHints.length ? `Memory preference hints:\n${memoryHints.join('\n')}` : '',
      voiceReplyPrompt
    ].filter(Boolean);

    const maxChars = cfg.defaults.maxContextChars;
    const prompt = clip(parts.join('\n\n'), maxChars);

    if (shouldPromptForCustomName) {
      this.guidanceStore.markPrompted();
    }

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
      guidance: { promptedForCustomName: shouldPromptForCustomName },
      sources: [persona.paths.soulPath, persona.paths.identityPath, persona.paths.userPath],
      writeback
    };
  }
}

module.exports = { PersonaContextBuilder };
