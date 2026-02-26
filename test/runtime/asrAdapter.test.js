const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');

const asrAdapters = require('../../apps/runtime/tooling/adapters/asr');

test('asr adapter validates supported formats', () => {
  assert.equal(asrAdapters.__internal.isSupportedFormat('mp3'), true);
  assert.equal(asrAdapters.__internal.isSupportedFormat('flac'), false);
});

test('asr adapter parses json and plain text output', () => {
  const fromJson = asrAdapters.__internal.parseAsrResult('{"text":"你好","confidence":0.88,"segments":[]}');
  assert.equal(fromJson.text, '你好');
  assert.equal(fromJson.confidence, 0.88);

  const fromText = asrAdapters.__internal.parseAsrResult('plain result');
  assert.equal(fromText.text, 'plain result');
  assert.equal(fromText.confidence, 0.9);
});

test('asr adapter executes configured CLI and emits events', async () => {
  const { asrAliyun } = asrAdapters.__internal;
  const tmp = await fs.mkdtemp(path.join(os.tmpdir(), 'asr-cli-'));
  const script = path.join(tmp, 'mock-asr.sh');
  await fs.writeFile(script, '#!/usr/bin/env bash\necho "测试转写"\n', { mode: 0o755 });

  const previous = process.env.ASR_CLI;
  process.env.ASR_CLI = script;

  const events = [];
  try {
    const resultJson = await asrAliyun(
      { audioRef: 'file:///tmp/a.mp3', format: 'mp3', lang: 'zh' },
      { publishEvent: (topic, payload) => events.push({ topic, payload }) }
    );

    const result = JSON.parse(resultJson);
    assert.equal(result.text, '测试转写');
    assert.equal(result.confidence, 0.9);

    const topics = events.map((e) => e.topic);
    assert.equal(topics.includes('voice.job.started'), true);
    assert.equal(topics.includes('voice.job.completed'), true);
  } finally {
    if (previous) process.env.ASR_CLI = previous;
    else delete process.env.ASR_CLI;
  }
});

test('asr adapter rejects unsupported format', async () => {
  const { asrAliyun } = asrAdapters.__internal;
  await assert.rejects(
    () => asrAliyun({ audioRef: 'file:///tmp/a.flac', format: 'flac' }, {}),
    (err) => err && err.code === 'ASR_UNSUPPORTED_FORMAT'
  );
});
