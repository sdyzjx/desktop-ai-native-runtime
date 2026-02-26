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

test('voice adapter emits policy and job events via publishEvent', async () => {
  const { ttsAliyunVc, cooldownStore, idempotencyStore } = voiceAdapters.__internal;
  cooldownStore.calls.clear();
  idempotencyStore.clear();

  const tmp = await fs.mkdtemp(path.join(os.tmpdir(), 'voice-cli-events-'));
  const script = path.join(tmp, 'mock-voice-reply.sh');
  await fs.writeFile(script, '#!/usr/bin/env bash\necho "/tmp/mock-event-audio.ogg"\n', { mode: 0o755 });

  const previousCli = process.env.VOICE_REPLY_CLI;
  process.env.VOICE_REPLY_CLI = script;

  const events = [];

  try {
    await ttsAliyunVc(
      {
        text: '继续推进下一步',
        voiceId: 'voice-A',
        model: 'qwen3-tts-vc-2026-01-22',
        voiceTag: 'zh',
        replyMeta: { inputType: 'audio', sentenceCount: 1 }
      },
      {
        session_id: 'session-events',
        voiceRegistry: {
          'voice-A': { targetModel: 'qwen3-tts-vc-2026-01-22' }
        },
        publishEvent: (topic, payload) => events.push({ topic, payload })
      }
    );

    const topics = events.map((e) => e.topic);
    assert.equal(topics.includes('voice.policy.checked'), true);
    assert.equal(topics.includes('voice.job.started'), true);
    assert.equal(topics.includes('voice.job.completed'), true);
  } finally {
    if (previousCli) process.env.VOICE_REPLY_CLI = previousCli;
    else delete process.env.VOICE_REPLY_CLI;
  }
});

test('voice adapter deduplicates same idempotencyKey and avoids duplicate cli calls', async () => {
  const { ttsAliyunVc, cooldownStore, idempotencyStore } = voiceAdapters.__internal;
  cooldownStore.calls.clear();
  idempotencyStore.clear();

  const tmp = await fs.mkdtemp(path.join(os.tmpdir(), 'voice-idempotency-'));
  const counter = path.join(tmp, 'counter.txt');
  const script = path.join(tmp, 'mock-voice-reply.sh');
  await fs.writeFile(
    script,
    `#!/usr/bin/env bash\ncount=0\nif [ -f "${counter}" ]; then count=$(cat "${counter}"); fi\ncount=$((count+1))\necho $count > "${counter}"\necho "/tmp/mock-idem-$count.ogg"\n`,
    { mode: 0o755 }
  );

  const previousCli = process.env.VOICE_REPLY_CLI;
  process.env.VOICE_REPLY_CLI = script;

  try {
    const args = {
      text: '去重测试',
      voiceId: 'voice-A',
      model: 'qwen3-tts-vc-2026-01-22',
      voiceTag: 'zh',
      turnId: 'turn-1',
      idempotencyKey: 'sess1-turn1-voice',
      replyMeta: { inputType: 'audio', sentenceCount: 1 }
    };

    const context = {
      session_id: 'session-idem',
      voiceRegistry: { 'voice-A': { targetModel: 'qwen3-tts-vc-2026-01-22' } }
    };

    const first = JSON.parse(await ttsAliyunVc(args, context));
    const second = JSON.parse(await ttsAliyunVc(args, context));

    assert.equal(first.audioRef, 'file:///tmp/mock-idem-1.ogg');
    assert.equal(second.audioRef, 'file:///tmp/mock-idem-1.ogg');

    const countRaw = await fs.readFile(counter, 'utf8');
    assert.equal(Number(countRaw.trim()), 1);
  } finally {
    if (previousCli) process.env.VOICE_REPLY_CLI = previousCli;
    else delete process.env.VOICE_REPLY_CLI;
  }
});

test('voice adapter cancels stale job when superseded by newer request', async () => {
  const { ttsAliyunVc, cooldownStore, idempotencyStore, activeJobStore } = voiceAdapters.__internal;
  cooldownStore.calls.clear();
  idempotencyStore.clear();
  activeJobStore.clear();

  const tmp = await fs.mkdtemp(path.join(os.tmpdir(), 'voice-cancel-'));
  const script = path.join(tmp, 'mock-voice-reply.sh');
  await fs.writeFile(
    script,
    '#!/usr/bin/env bash\nif [ "$7" = "slow" ]; then sleep 1; fi\necho "/tmp/mock-cancel-$7.ogg"\n',
    { mode: 0o755 }
  );

  const previousCli = process.env.VOICE_REPLY_CLI;
  process.env.VOICE_REPLY_CLI = script;

  try {
    const base = {
      voiceId: 'voice-A',
      model: 'qwen3-tts-vc-2026-01-22',
      voiceTag: 'zh',
      replyMeta: { inputType: 'audio', sentenceCount: 1 }
    };
    const ctx = {
      session_id: 'session-cancel',
      voiceRegistry: { 'voice-A': { targetModel: 'qwen3-tts-vc-2026-01-22' } }
    };

    const slowPromise = ttsAliyunVc({ ...base, text: 'slow' }, ctx);
    slowPromise.catch(() => {});
    await new Promise((r) => setTimeout(r, 100));
    const fastResult = JSON.parse(await ttsAliyunVc({ ...base, text: 'fast' }, ctx));

    assert.equal(fastResult.audioRef, 'file:///tmp/mock-cancel-fast.ogg');

    await assert.rejects(
      async () => {
        await slowPromise;
      },
      (err) => err && err.code === 'TTS_CANCELLED'
    );
  } finally {
    if (previousCli) process.env.VOICE_REPLY_CLI = previousCli;
    else delete process.env.VOICE_REPLY_CLI;
  }
});

test('voice adapter retries once on provider error then succeeds', async () => {
  const { ttsAliyunVc, cooldownStore, idempotencyStore, activeJobStore } = voiceAdapters.__internal;
  cooldownStore.calls.clear();
  idempotencyStore.clear();
  activeJobStore.clear();

  const tmp = await fs.mkdtemp(path.join(os.tmpdir(), 'voice-retry-'));
  const marker = path.join(tmp, 'attempt.txt');
  const script = path.join(tmp, 'mock-voice-reply.sh');
  await fs.writeFile(
    script,
    `#!/usr/bin/env bash\nif [ ! -f "${marker}" ]; then echo 1 > "${marker}"; echo "first fail" 1>&2; exit 1; fi\necho "/tmp/mock-retry-ok.ogg"\n`,
    { mode: 0o755 }
  );

  const previousCli = process.env.VOICE_REPLY_CLI;
  process.env.VOICE_REPLY_CLI = script;

  try {
    const result = JSON.parse(await ttsAliyunVc(
      {
        text: 'retry test',
        voiceId: 'voice-A',
        model: 'qwen3-tts-vc-2026-01-22',
        voiceTag: 'zh',
        replyMeta: { inputType: 'audio', sentenceCount: 1 }
      },
      {
        session_id: 'session-retry',
        voiceRegistry: { 'voice-A': { targetModel: 'qwen3-tts-vc-2026-01-22' } }
      }
    ));

    assert.equal(result.audioRef, 'file:///tmp/mock-retry-ok.ogg');
  } finally {
    if (previousCli) process.env.VOICE_REPLY_CLI = previousCli;
    else delete process.env.VOICE_REPLY_CLI;
  }
});

test('voice adapter maps timeout to TTS_TIMEOUT without retrying', async () => {
  const { ttsAliyunVc, cooldownStore, idempotencyStore, activeJobStore } = voiceAdapters.__internal;
  cooldownStore.calls.clear();
  idempotencyStore.clear();
  activeJobStore.clear();

  const tmp = await fs.mkdtemp(path.join(os.tmpdir(), 'voice-timeout-'));
  const script = path.join(tmp, 'mock-voice-reply.sh');
  await fs.writeFile(script, '#!/usr/bin/env bash\nsleep 2\necho "/tmp/never.ogg"\n', { mode: 0o755 });

  const previousCli = process.env.VOICE_REPLY_CLI;
  process.env.VOICE_REPLY_CLI = script;

  try {
    await assert.rejects(
      () => ttsAliyunVc(
        {
          text: 'timeout test',
          voiceId: 'voice-A',
          model: 'qwen3-tts-vc-2026-01-22',
          voiceTag: 'zh',
          timeoutSec: 1,
          replyMeta: { inputType: 'audio', sentenceCount: 1 }
        },
        {
          session_id: 'session-timeout',
          voiceRegistry: { 'voice-A': { targetModel: 'qwen3-tts-vc-2026-01-22' } }
        }
      ),
      (err) => err && err.code === 'TTS_TIMEOUT'
    );
  } finally {
    if (previousCli) process.env.VOICE_REPLY_CLI = previousCli;
    else delete process.env.VOICE_REPLY_CLI;
  }
});
