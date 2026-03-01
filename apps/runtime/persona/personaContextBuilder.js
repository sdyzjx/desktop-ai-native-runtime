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
      ? `Voice Reply Mode: 在每次回复后，你应该主动调用 voice.tts_aliyun_vc 工具生成一段简短的语音回复（不超过${autoVoiceReplyMaxChars}字）。

重要提示：
- 语音内容应该是独立的、口语化的短句，不是直接朗读你的文字回复
- 即使你的文字回复包含代码、表格等技术内容，语音回复也应该是简单的总结或评论
- 例如：文字回复是代码示例时，语音可以说"代码已经写好了，试试看吧"
- 语音可以是：对回复内容的精炼总结、对用户问题的轻松吐槽、简短的互动性回应
- 根据对话氛围自行决定风格，保持自然和个性化

调用示例：
{
  "text": "你的简短语音文本",
  "voiceTag": "zh",
  "replyMeta": {
    "isAutoVoiceReply": true,
    "containsCode": false,
    "containsTable": false
  }
}

注意：必须设置 isAutoVoiceReply: true 来标记这是自动语音回复。`
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
