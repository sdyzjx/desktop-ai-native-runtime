const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const crypto = require('node:crypto');
const { execFile } = require('node:child_process');
const { loadVoicePolicy, evaluateVoicePolicy } = require('../voice/policy');
const { InMemoryVoiceCooldownStore, InMemoryVoiceIdempotencyStore, InMemoryVoiceActiveJobStore } = require('../voice/cooldownStore');
const { ProviderConfigStore } = require('../../config/providerConfigStore');

// TTS provider name in providers.yaml
const TTS_PROVIDER_KEY = process.env.TTS_PROVIDER_KEY || 'qwen3_tts';

function loadTtsProviderConfig() {
  try {
    const store = new ProviderConfigStore();
    const config = store.load();
    const provider = config.providers && config.providers[TTS_PROVIDER_KEY];
    if (!provider || provider.type !== 'tts_dashscope') {
      return null;
    }
    return provider;
  } catch (_) {
    return null;
  }
}

const cooldownStore = new InMemoryVoiceCooldownStore();
const idempotencyStore = new InMemoryVoiceIdempotencyStore();
const activeJobStore = new InMemoryVoiceActiveJobStore();
const voiceMetrics = {
  tts_total: 0,
  tts_success: 0,
  tts_failed: 0,
  tts_cancelled: 0,
  tts_deduplicated: 0,
  tts_retry_total: 0,
  tts_timeout: 0,
  tts_provider_down: 0,
  policy_denied: 0
};

function execFileAsync(cmd, args, options = {}) {
  return new Promise((resolve, reject) => {
    execFile(cmd, args, options, (err, stdout, stderr) => {
      if (err) {
        const message = stderr || stdout || err.message || String(err);
        const wrapped = new Error(String(message || '').trim());
        wrapped.raw = err;
        reject(wrapped);
        return;
      }
      resolve({ stdout: String(stdout || ''), stderr: String(stderr || '') });
    });
  });
}

async function callDashscopeTts({ text, model, voiceId, voiceTag, timeoutMs = 60_000 }) {
  // 优先从 providers.yaml 的 tts_dashscope provider 读配置，env 作为 fallback
  const providerCfg = loadTtsProviderConfig();

  const defaultModel = (providerCfg && providerCfg.tts_model) || 'qwen3-tts-vc-2026-01-22';
  const defaultVoice = (providerCfg && providerCfg.tts_voice) || '';

  const cliOverride = process.env.VOICE_REPLY_CLI;

  let cmd, cmdArgs, execEnv;
  if (cliOverride) {
    // test/override mode: text at position $7 for mock script compatibility
    cmd = cliOverride;
    cmdArgs = [voiceTag, defaultModel, defaultVoice, '--emit-manifest', '--', '--', text];
    execEnv = process.env;
  } else {
    const apiKey = (providerCfg && providerCfg.api_key) || process.env.DASHSCOPE_API_KEY;
    if (!apiKey) {
      const err = new Error('DASHSCOPE_API_KEY is not set and no tts_dashscope provider configured');
      err.code = 'TTS_CONFIG_MISSING';
      throw err;
    }
    // base_url 从 providers.yaml 读取，切换区域只需改 providers.yaml 的 base_url：
    // 北京区: https://dashscope.aliyuncs.com/api/v1
    // 新加坡区: https://dashscope-intl.aliyuncs.com/api/v1
    const baseUrl = (providerCfg && providerCfg.base_url)
      || process.env.DASHSCOPE_BASE_URL
      || 'https://dashscope.aliyuncs.com/api/v1';

    const scriptPath = path.resolve(process.cwd(), 'scripts/qwen_voice_reply.py');
    cmd = 'python3';
    cmdArgs = [scriptPath, '--voice-tag', voiceTag, '--model', defaultModel, '--voice', defaultVoice, '--emit-manifest', text];
    execEnv = { ...process.env, DASHSCOPE_API_KEY: apiKey, DASHSCOPE_BASE_URL: baseUrl };
  }

  const { stdout } = await execFileAsync(cmd, cmdArgs, { env: execEnv, timeout: timeoutMs });

  const output = String(stdout || '').trim();
  if (!output) {
    const err = new Error('tts output is empty');
    err.code = 'TTS_PROVIDER_DOWN';
    throw err;
  }

  // cliOverride mode: script prints plain path directly
  if (cliOverride) {
    return output;
  }

  let manifest;
  try {
    manifest = JSON.parse(output);
  } catch (e) {
    const err = new Error('failed to parse tts manifest json');
    err.code = 'TTS_PROVIDER_DOWN';
    throw err;
  }

  const audioPath = manifest && typeof manifest.audio_path === 'string' ? manifest.audio_path : '';
  if (!audioPath) {
    const err = new Error('tts manifest missing audio_path');
    err.code = 'TTS_PROVIDER_DOWN';
    throw err;
  }

  return audioPath;
}

function normalizeExecError(err) {
  const raw = err?.raw || err;
  const isTimeout = (raw && (raw.killed || raw.signal === 'SIGTERM' || raw.code === 'ETIMEDOUT'))
    || err.code === 'TTS_TIMEOUT'
    || (err.message && err.message.includes('ETIMEDOUT'));
  if (isTimeout) {
    return makeToolError('TTS_TIMEOUT', err.message || 'tts timeout');
  }
  if (err.code === 'TTS_CONFIG_MISSING') {
    return makeToolError('TTS_CONFIG_MISSING', err.message || 'tts config missing');
  }
  if (err.code === 'TTS_REGION_REQUIRED') {
    return makeToolError('TTS_REGION_REQUIRED', err.message || 'tts region not selected');
  }
  return makeToolError('TTS_PROVIDER_DOWN', err?.message || String(err));
}

function shouldRetryOnce(err) {
  return err && err.code === 'TTS_PROVIDER_DOWN';
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

function publishVoiceEvent(context, topic, payload = {}) {
  if (typeof context.publishEvent === 'function') {
    context.publishEvent(topic, payload);
  }
}

function incMetric(key) {
  voiceMetrics[key] = Number(voiceMetrics[key] || 0) + 1;
}

function snapshotMetrics() {
  return {
    ...voiceMetrics,
    updated_at: new Date().toISOString()
  };
}

function resetMetrics() {
  for (const key of Object.keys(voiceMetrics)) {
    voiceMetrics[key] = 0;
  }
}

async function ttsAliyunVc(args = {}, context = {}) {
  const policy = loadVoicePolicy();
  const sessionId = context.session_id || args.sessionId || 'global';
  const nowMs = Date.now();
  const voiceTag = resolveVoiceTag(args);
  const text = String(args.text || '').trim();

  const policyResult = evaluateVoicePolicy(args, context, policy);
  publishVoiceEvent(context, 'voice.policy.checked', {
    allow: policyResult.allow,
    code: policyResult.code,
    reason: policyResult.reason,
    text_length: text.length,
    voice_tag: voiceTag
  });

  if (!policyResult.allow) {
    incMetric('policy_denied');
    throw makeToolError(policyResult.code, policyResult.reason, { policyReason: policyResult.reason });
  }

  const idempotencyKey = String(args.idempotencyKey || '').trim();
  const cached = idempotencyStore.get(sessionId, idempotencyKey);
  if (cached) {
    incMetric('tts_deduplicated');
    publishVoiceEvent(context, 'voice.job.deduplicated', {
      session_id: sessionId,
      idempotency_key: idempotencyKey,
      audio_ref: cached.audioRef
    });
    return JSON.stringify(cached);
  }

  incMetric('tts_total');

  const jobId = `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
  activeJobStore.setActive(sessionId, jobId);

  publishVoiceEvent(context, 'voice.job.started', {
    session_id: sessionId,
    model: String(args.model || 'qwen3-tts-vc-2026-01-22'),
    voice_id: String(args.voiceId || ''),
    voice_tag: voiceTag,
    idempotency_key: idempotencyKey || null,
    job_id: jobId
  });

  try {
    enforceRateLimit({ sessionId, nowMs, policy });

    checkModelVoiceCompatibility({
      model: args.model,
      voiceId: args.voiceId,
      registry: context.voiceRegistry || {}
    });

    const timeoutMs = Math.max(1, Number(args.timeoutSec || 45)) * 1000;

    let audioPath = '';
    let attempt = 0;
    while (attempt < 2) {
      attempt += 1;
      try {
        const controller = new AbortController();
        const timer = setTimeout(() => controller.abort(), timeoutMs);
        audioPath = await callDashscopeTts({
          text,
          model: args.model,   // undefined 时 callDashscopeTts 内部会用 providerCfg.tts_model
          voiceId: args.voiceId, // 同上，undefined 时用 providerCfg.tts_voice
          voiceTag,
          timeoutMs,
          signal: controller.signal
        });
        clearTimeout(timer);
        break;
      } catch (err) {
        const normalizedErr = normalizeExecError(err);
        incMetric('tts_retry_total');
        publishVoiceEvent(context, 'voice.job.retry', {
          session_id: sessionId,
          job_id: jobId,
          attempt,
          code: normalizedErr.code,
          will_retry: attempt < 2 && shouldRetryOnce(normalizedErr)
        });

        if (attempt < 2 && shouldRetryOnce(normalizedErr)) {
          continue;
        }
        throw normalizedErr;
      }
    }

    if (!audioPath) {
      throw makeToolError('TTS_PROVIDER_DOWN', 'tts output is empty');
    }

    const activeJobId = activeJobStore.getActive(sessionId);
    if (activeJobId !== jobId) {
      incMetric('tts_cancelled');
      publishVoiceEvent(context, 'voice.job.cancelled', {
        session_id: sessionId,
        job_id: jobId,
        active_job_id: activeJobId,
        reason: 'superseded_by_newer_request'
      });
      throw makeToolError('TTS_CANCELLED', 'tts result superseded by newer request');
    }

    cooldownStore.addCall(sessionId, nowMs);

    try {
      const wavPath = audioPath.replace(/\.ogg$/, '.wav');

      // 核心：强制用 await 锁住当前进程，不要让工具提前执行完！
      await new Promise((resolve) => {
        const { spawn } = require('node:child_process');
        const ffmpeg = spawn('ffmpeg', ['-v', 'quiet', '-y', '-i', audioPath, wavPath]);

        ffmpeg.on('close', (code) => {
          if (code === 0) {
            if (typeof context.publishEvent === 'function') {
              context.publishEvent('voice.play', { audioPath: wavPath });
            }
          }
          // 事件发完了，我才允许这个 Promise 结束，工具这时候才可以返回！
          resolve();
        });
      });

    } catch (_) { /* autoplay failure is non-fatal */ }

    const payload = {
      audioRef: `${audioPath}`,
      format: 'ogg',
      voiceTag,
      model: String(args.model || 'qwen3-tts-vc-2026-01-22'),
      voiceId: String(args.voiceId || ''),
      policyReason: policyResult.reason,
      idempotencyKey: idempotencyKey || null,
      turnId: args.turnId ? String(args.turnId) : null
    };

    incMetric('tts_success');
    publishVoiceEvent(context, 'voice.job.completed', {
      session_id: sessionId,
      audio_ref: payload.audioRef,
      format: payload.format,
      idempotency_key: idempotencyKey || null
    });

    idempotencyStore.set(sessionId, idempotencyKey, payload);

    return JSON.stringify({
      status: 'success',
      message: 'Voice synthesized and playing. DO NOT output the file path or audio reference to the user.'
    });
  } catch (error) {
    const code = error.code || 'TTS_PROVIDER_DOWN';
    if (code === 'TTS_TIMEOUT') incMetric('tts_timeout');
    if (code === 'TTS_PROVIDER_DOWN') incMetric('tts_provider_down');
    if (code !== 'TTS_CANCELLED') incMetric('tts_failed');

    publishVoiceEvent(context, 'voice.job.failed', {
      session_id: sessionId,
      code,
      error: error.message || String(error)
    });
    throw error;
  }
}

async function voiceStats() {
  return JSON.stringify(snapshotMetrics());
}

module.exports = {
  'voice.tts_aliyun_vc': ttsAliyunVc,
  'voice.stats': voiceStats,
  __internal: {
    ttsAliyunVc,
    voiceStats,
    resolveVoiceTag,
    checkModelVoiceCompatibility,
    enforceRateLimit,
    cooldownStore,
    idempotencyStore,
    activeJobStore,
    snapshotMetrics,
    resetMetrics,
    callDashscopeTts
  }
};
