const { execFile } = require('node:child_process');
const path = require('node:path');
const { loadVoicePolicy, evaluateVoicePolicy } = require('../voice/policy');
const { InMemoryVoiceCooldownStore } = require('../voice/cooldownStore');

const cooldownStore = new InMemoryVoiceCooldownStore();

function execFileAsync(cmd, args, options = {}) {
  return new Promise((resolve, reject) => {
    execFile(cmd, args, options, (err, stdout, stderr) => {
      if (err) {
        const message = stderr || stdout || err.message || String(err);
        reject(new Error(message.trim()));
        return;
      }
      resolve({ stdout: String(stdout || ''), stderr: String(stderr || '') });
    });
  });
}

function resolveVoiceReplyCli() {
  return process.env.VOICE_REPLY_CLI || path.resolve(process.cwd(), 'skills/yachiyo-qwen-voice-reply/bin/voice-reply');
}

function resolveVoiceTag(args) {
  const input = String(args.voiceTag || 'zh').toLowerCase();
  if (['zh', 'jp', 'en'].includes(input)) return input;
  return 'zh';
}

function makeToolError(code, message, details = {}) {
  const err = new Error(message);
  err.code = code;
  err.details = details;
  return err;
}

function enforceRateLimit({ sessionId, nowMs, policy }) {
  const state = cooldownStore.getState(sessionId, nowMs);

  if (state.lastCallAt) {
    const gapSec = (nowMs - state.lastCallAt) / 1000;
    if (gapSec < policy.limits.cooldown_sec_per_session) {
      throw makeToolError('TTS_POLICY_REJECTED', 'tts cooldown is active', {
        cooldownSec: policy.limits.cooldown_sec_per_session,
        waitSec: Math.ceil(policy.limits.cooldown_sec_per_session - gapSec)
      });
    }
  }

  if (state.callsInLastMinute >= policy.limits.max_tts_calls_per_minute) {
    throw makeToolError('TTS_RATE_LIMITED', 'tts rate limit exceeded', {
      maxPerMinute: policy.limits.max_tts_calls_per_minute
    });
  }
}

function checkModelVoiceCompatibility({ model, voiceId, registry = {} }) {
  if (!registry || !voiceId) return;
  const profile = registry[String(voiceId)] || null;
  if (!profile || !profile.targetModel) return;
  if (String(profile.targetModel) !== String(model)) {
    throw makeToolError(
      'TTS_MODEL_VOICE_MISMATCH',
      `voice target model mismatch: expected ${profile.targetModel}, got ${model}`,
      { expected: profile.targetModel, actual: model, voiceId }
    );
  }
}

async function ttsAliyunVc(args = {}, context = {}) {
  const policy = loadVoicePolicy();
  const policyResult = evaluateVoicePolicy(args, context, policy);
  if (!policyResult.allow) {
    throw makeToolError(policyResult.code, policyResult.reason, { policyReason: policyResult.reason });
  }

  const sessionId = context.session_id || args.sessionId || 'global';
  const nowMs = Date.now();
  enforceRateLimit({ sessionId, nowMs, policy });

  checkModelVoiceCompatibility({
    model: args.model,
    voiceId: args.voiceId,
    registry: context.voiceRegistry || {}
  });

  const cliPath = resolveVoiceReplyCli();
  const voiceTag = resolveVoiceTag(args);
  const text = String(args.text || '').trim();

  const cmdArgs = [
    '--voice-tag',
    voiceTag,
    '--model',
    String(args.model || 'qwen3-tts-vc-2026-01-22'),
    '--voice',
    String(args.voiceId || ''),
    text
  ];

  const timeoutMs = Math.max(1, Number(args.timeoutSec || 45)) * 1000;
  const { stdout } = await execFileAsync(cliPath, cmdArgs, { timeout: timeoutMs });
  const audioPath = String(stdout || '').trim().split('\n').filter(Boolean).pop();

  if (!audioPath) {
    throw makeToolError('TTS_PROVIDER_DOWN', 'tts output is empty');
  }

  cooldownStore.addCall(sessionId, nowMs);

  return JSON.stringify({
    audioRef: `file://${audioPath}`,
    format: 'ogg',
    voiceTag,
    model: String(args.model || 'qwen3-tts-vc-2026-01-22'),
    voiceId: String(args.voiceId || ''),
    policyReason: policyResult.reason
  });
}

module.exports = {
  'voice.tts_aliyun_vc': ttsAliyunVc,
  __internal: {
    ttsAliyunVc,
    resolveVoiceReplyCli,
    resolveVoiceTag,
    checkModelVoiceCompatibility,
    enforceRateLimit,
    cooldownStore
  }
};
