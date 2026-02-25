const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const { ToolExecutor } = require('../../apps/runtime/executor/toolExecutor');
const { createLocalTools } = require('../../apps/runtime/executor/localTools');
const { LongTermMemoryStore } = require('../../apps/runtime/session/longTermMemoryStore');

function createExecutor() {
  const rootDir = fs.mkdtempSync(path.join(os.tmpdir(), 'memory-tools-'));
  const memoryStore = new LongTermMemoryStore({ rootDir });
  const tools = createLocalTools({ memoryStore });
  return new ToolExecutor(tools);
}

test('memory_write tool stores durable entry', async () => {
  const executor = createExecutor();
  const result = await executor.execute(
    {
      name: 'memory_write',
      args: {
        content: 'favorite database is sqlite',
        keywords: ['database', 'sqlite']
      }
    },
    {
      session_id: 'sess-a',
      trace_id: 'trace-a'
    }
  );

  assert.equal(result.ok, true);
  const parsed = JSON.parse(result.result);
  assert.equal(parsed.ok, true);
  assert.match(parsed.content, /sqlite/i);
});

test('memory_search tool returns matched entries', async () => {
  const executor = createExecutor();
  await executor.execute({
    name: 'memory_write',
    args: {
      content: 'preferred city is tokyo',
      keywords: ['city', 'tokyo']
    }
  });

  const search = await executor.execute({
    name: 'memory_search',
    args: {
      query: 'what city do I prefer',
      limit: 5
    }
  });

  assert.equal(search.ok, true);
  const parsed = JSON.parse(search.result);
  assert.equal(parsed.ok, true);
  assert.ok(parsed.items.length >= 1);
  assert.match(parsed.items[0].content, /tokyo/i);
});
