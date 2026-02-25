const test = require('node:test');
const assert = require('node:assert/strict');

const { ToolExecutor } = require('../../apps/runtime/executor/toolExecutor');
const localTools = require('../../apps/runtime/executor/localTools');

test('ToolExecutor listTools returns tool contracts', () => {
  const executor = new ToolExecutor(localTools);
  const tools = executor.listTools();

  const names = tools.map((tool) => tool.name);
  assert.ok(names.includes('add'));
  assert.ok(names.includes('echo'));
});

test('ToolExecutor execute runs local tool', async () => {
  const executor = new ToolExecutor(localTools);
  const result = await executor.execute({ name: 'add', args: { a: 12, b: 30 } });

  assert.equal(result.ok, true);
  assert.equal(result.result, '42');
});

test('ToolExecutor execute returns error for unknown tool', async () => {
  const executor = new ToolExecutor(localTools);
  const result = await executor.execute({ name: 'unknown', args: {} });

  assert.equal(result.ok, false);
  assert.match(result.error, /tool not found/);
});
