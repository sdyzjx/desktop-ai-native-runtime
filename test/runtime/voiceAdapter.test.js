const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');

const voiceAdapters = require('../../apps/runtime/tooling/adapters/voice');

test('voice adapter enforces model/voice compatibility', () => {
  assert.throws(
    () => {
      voiceAdapters.__internal.checkModelVoiceCompatibility({
        model: 'qwen3-tts-vc-2026-01-22',
        voiceId: 'voice-A',
        registry: {
          'voice-A': {
            targetModel: 'qwen3-tts-vc-realtime-2026-01-15'
          }
        }
      });
    },
    (err) => err && err.code === 'TTS_MODEL_VOICE_MISMATCH'
  );
});

test('voice adapter applies cooldown and per-minute rate limit', () => {
  const { cooldownStore, enforceRateLimit } = voiceAdapters.__internal;
  cooldownStore.calls.clear();

  const policy = {
    limits: {
      cooldown_sec_per_session: 20,
      max_tts_calls_per_minute: 2
    }
  };

  enforceRateLimit({ sessionId: 's1', nowMs: 1_000, policy });
  cooldownStore.addCall('s1', 1_000);

  assert.throws(
    () => enforceRateLimit({ sessionId: 's1', nowMs: 5_000, policy }),
    (err) => err && err.code === 'TTS_POLICY_REJECTED'
  );

  enforceRateLimit({ sessionId: 's1', nowMs: 22_000, policy });
  cooldownStore.addCall('s1', 22_000);

  assert.throws(
    () => enforceRateLimit({ sessionId: 's1', nowMs: 43_000, policy }),
    (err) => err && err.code === 'TTS_RATE_LIMITED'
  );
});

test('voice adapter executes configured CLI and returns audioRef', async () => {
  const { ttsAliyunVc, cooldownStore } = voiceAdapters.__internal;
  cooldownStore.calls.clear();

  const tmp = await fs.mkdtemp(path.join(os.tmpdir(), 'voice-cli-'));
  const script = path.join(tmp, 'mock-voice-reply.sh');
  await fs.writeFile(script, '#!/usr/bin/env bash\necho "/tmp/mock-audio.ogg"\n', { mode: 0o755 });

  const previousCli = process.env.VOICE_REPLY_CLI;
  process.env.VOICE_REPLY_CLI = script;

  try {
    const resultJson = await ttsAliyunVc(
      {
        text: '这是一个短回复',
        voiceId: 'voice-A',
        model: 'qwen3-tts-vc-2026-01-22',
        voiceTag: 'zh',
        replyMeta: { inputType: 'audio', sentenceCount: 1 }
      },
      {
        session_id: 'session-1',
        voiceRegistry: {
          'voice-A': { targetModel: 'qwen3-tts-vc-2026-01-22' }
        }
      }
    );

    const result = JSON.parse(resultJson);
    assert.equal(result.format, 'ogg');
    assert.equal(result.audioRef, 'file:///tmp/mock-audio.ogg');
  } finally {
    if (previousCli) process.env.VOICE_REPLY_CLI = previousCli;
    else delete process.env.VOICE_REPLY_CLI;
  }
});
