const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const { LongTermMemoryStore } = require('../../apps/runtime/session/longTermMemoryStore');

function createStore() {
  const rootDir = fs.mkdtempSync(path.join(os.tmpdir(), 'long-term-memory-store-'));
  return new LongTermMemoryStore({ rootDir });
}

test('LongTermMemoryStore add/search/list/bootstrap', async () => {
  const store = createStore();

  const first = await store.addEntry({
    content: 'user likes concise answer style',
    keywords: ['style', 'concise'],
    source_session_id: 's1'
  });
  assert.ok(first.id);

  await store.addEntry({
    content: 'project uses event bus for tool calls',
    keywords: ['event-bus', 'tool']
  });

  const listed = await store.listEntries({ limit: 10, offset: 0 });
  assert.equal(listed.total, 2);

  const searched = await store.searchEntries({ query: 'tool calls event bus', limit: 3 });
  assert.ok(searched.items.length >= 1);
  assert.match(searched.items[0].content, /event bus/i);

  const bootstrap = await store.getBootstrapEntries({ limit: 1, maxChars: 1000 });
  assert.equal(bootstrap.length, 1);
});

test('LongTermMemoryStore deduplicates by content', async () => {
  const store = createStore();

  await store.addEntry({ content: 'preferred language is chinese', keywords: ['language'] });
  await store.addEntry({ content: 'preferred language is chinese', keywords: ['zh'] });

  const listed = await store.listEntries({ limit: 10, offset: 0 });
  assert.equal(listed.total, 1);
  assert.ok(listed.items[0].keywords.includes('language'));
  assert.ok(listed.items[0].keywords.includes('zh'));
});
