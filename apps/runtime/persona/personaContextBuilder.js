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
      ? `IMPORTANT - Auto Voice Reply Mode (ENABLED):
你必须在每次文本回复后立即调用 voice.tts_aliyun_vc 工具生成语音回复。这是强制要求，不是可选的。

语音回复要求：
- 长度：不超过${autoVoiceReplyMaxChars}字
- 内容：独立的口语化短句，不是朗读文字回复
- 风格：可以是总结、吐槽或评论，根据氛围决定
- 示例：
  * 文字回复是代码 → 语音说"代码写好了，试试看"
  * 文字回复是解释 → 语音说"明白了吗？有问题再问我"
  * 文字回复是建议 → 语音说"按这个方法试试吧"

调用格式（必须严格遵守）：
{
  "text": "你的简短语音文本（不超过${autoVoiceReplyMaxChars}字）",
  "voiceTag": "zh",
  "replyMeta": {
    "isAutoVoiceReply": true,
    "containsCode": false,
    "containsTable": false
  }
}

记住：每次回复后都必须调用一次 voice.tts_aliyun_vc，这是系统要求。`
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
