const test = require('node:test');
const assert = require('node:assert/strict');

const { evaluateVoicePolicy, defaultPolicy } = require('../../apps/runtime/tooling/voice/policy');

test('voice policy allows short conversational content', () => {
  const policy = defaultPolicy();
  const result = evaluateVoicePolicy(
    {
      text: '晚上好，要不要我帮你整理今天的进度？',
      replyMeta: { inputType: 'text', sentenceCount: 1 }
    },
    {},
    policy
  );

  assert.equal(result.allow, true);
  assert.equal(result.code, 'OK');
});

test('voice policy rejects code/troubleshooting content', () => {
  const policy = defaultPolicy();
  const result = evaluateVoicePolicy(
    {
      text: '请执行 npm test 并贴出日志',
      replyMeta: { sentenceCount: 1, containsCode: true, isTroubleshooting: true }
    },
    {},
    policy
  );

  assert.equal(result.allow, false);
  assert.equal(result.code, 'TTS_POLICY_REJECTED');
});

test('voice policy rejects too long text by max_chars', () => {
  const policy = defaultPolicy();
  const text = 'a'.repeat(260);
  const result = evaluateVoicePolicy(
    {
      text,
      replyMeta: { sentenceCount: 3 }
    },
    {},
    policy
  );

  assert.equal(result.allow, false);
  assert.equal(result.code, 'TTS_TEXT_TOO_LONG');
});
