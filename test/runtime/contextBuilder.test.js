const test = require('node:test');
const assert = require('node:assert/strict');

const { buildRecentContextMessages } = require('../../apps/runtime/session/contextBuilder');

test('buildRecentContextMessages returns latest user/assistant messages in order', () => {
  const session = {
    messages: [
      { role: 'user', content: 'u1' },
      { role: 'assistant', content: 'a1' },
      { role: 'tool', content: 'tool output' },
      { role: 'user', content: 'u2' },
      { role: 'assistant', content: 'a2' }
    ]
  };

  const messages = buildRecentContextMessages(session, { maxMessages: 3, maxChars: 100 });
  assert.deepEqual(messages, [
    { role: 'assistant', content: 'a1' },
    { role: 'user', content: 'u2' },
    { role: 'assistant', content: 'a2' }
  ]);
});

test('buildRecentContextMessages respects char budget', () => {
  const session = {
    messages: [
      { role: 'user', content: 'short' },
      { role: 'assistant', content: 'this is very very long content' }
    ]
  };

  const messages = buildRecentContextMessages(session, { maxMessages: 10, maxChars: 10 });
  assert.deepEqual(messages, []);
});
