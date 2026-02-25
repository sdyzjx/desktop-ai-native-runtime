const test = require('node:test');
const assert = require('node:assert/strict');

const {
  buildSessionLongTermMemory,
  buildLongTermMemoryPromptMessages,
  retrieveMemoryEntries
} = require('../../apps/runtime/session/longTermMemory');

test('buildSessionLongTermMemory archives earlier turns and keeps summary', () => {
  const session = {
    messages: [
      { role: 'user', content: 'project codename is hana' },
      { role: 'assistant', content: 'noted codename hana' },
      { role: 'user', content: 'latest question' },
      { role: 'assistant', content: 'latest answer' }
    ]
  };

  const memory = buildSessionLongTermMemory(session, {
    recentWindowMessages: 2,
    summaryMaxChars: 500,
    maxEntries: 20
  });

  assert.equal(memory.archived_message_count, 2);
  assert.equal(memory.entries.length, 2);
  assert.match(memory.summary, /codename is hana/i);
});

test('retrieveMemoryEntries returns top scored snippets', () => {
  const memory = {
    entries: [
      { role: 'user', content: 'preferred city is tokyo' },
      { role: 'assistant', content: 'favorite food is ramen' },
      { role: 'user', content: 'project uses websocket queue' }
    ]
  };

  const recalled = retrieveMemoryEntries(memory, 'what city do I prefer', { topK: 2 });
  assert.equal(recalled.length, 1);
  assert.match(recalled[0].content, /tokyo/i);
});

test('buildLongTermMemoryPromptMessages emits summary and retrieval messages', () => {
  const session = {
    memory: {
      summary: 'User likes concise answers.',
      entries: [
        { role: 'user', content: 'favorite database is sqlite', created_at: '2026-01-01T00:00:00.000Z' },
        { role: 'assistant', content: 'tool bus topic is tool.call.requested', created_at: '2026-01-02T00:00:00.000Z' }
      ]
    }
  };

  const promptMessages = buildLongTermMemoryPromptMessages(session, {
    input: 'which database do I prefer',
    retrieveTopK: 2
  });

  assert.ok(promptMessages.length >= 1);
  assert.equal(promptMessages[0].role, 'system');
  assert.match(promptMessages[0].content, /long-term summary/i);
  assert.ok(promptMessages.some((msg) => /sqlite/i.test(msg.content)));
});
