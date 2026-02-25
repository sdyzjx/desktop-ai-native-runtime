const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');

const { ToolConfigStore } = require('../../apps/runtime/tooling/toolConfigStore');
const { ToolRegistry } = require('../../apps/runtime/tooling/toolRegistry');
const { ToolExecutor } = require('../../apps/runtime/executor/toolExecutor');

function buildExecutor() {
  const store = new ToolConfigStore({ configPath: path.resolve(process.cwd(), 'config/tools.yaml') });
  const config = store.load();
  const registry = new ToolRegistry({ config });
  return new ToolExecutor(registry, { policy: config.policy, exec: config.exec });
}

test('ToolConfigStore loads yaml and validates structure', () => {
  const store = new ToolConfigStore({ configPath: path.resolve(process.cwd(), 'config/tools.yaml') });
  const cfg = store.load();
  assert.equal(Array.isArray(cfg.tools), true);
  assert.ok(cfg.tools.some((t) => t.name === 'workspace.write_file'));
});

test('ToolExecutor rejects invalid args by schema', async () => {
  const executor = buildExecutor();
  const result = await executor.execute({ name: 'add', args: { a: 'x', b: 1 } });
  assert.equal(result.ok, false);
  assert.equal(result.code, 'VALIDATION_ERROR');
});

test('workspace.write_file writes under workspace', async () => {
  const executor = buildExecutor();
  const tmp = await fs.mkdtemp(path.join(os.tmpdir(), 'tooling-ws-'));

  const result = await executor.execute(
    {
      name: 'workspace.write_file',
      args: { path: 'notes/a.txt', content: 'hello', mode: 'overwrite' }
    },
    { workspaceRoot: tmp }
  );

  assert.equal(result.ok, true);
  const out = await fs.readFile(path.join(tmp, 'notes/a.txt'), 'utf8');
  assert.equal(out, 'hello');
});

test('workspace.write_file denies path escaping workspace', async () => {
  const executor = buildExecutor();
  const tmp = await fs.mkdtemp(path.join(os.tmpdir(), 'tooling-ws-'));

  const result = await executor.execute(
    {
      name: 'workspace.write_file',
      args: { path: '../evil.txt', content: 'x' }
    },
    { workspaceRoot: tmp }
  );

  assert.equal(result.ok, false);
  assert.equal(result.code, 'PERMISSION_DENIED');
});

test('shell.exec allowlist works', async () => {
  const executor = buildExecutor();
  const ok = await executor.execute({ name: 'shell.exec', args: { command: 'echo hello' } });
  assert.equal(ok.ok, true);
  assert.match(ok.result, /hello/);

  const denied = await executor.execute({ name: 'shell.exec', args: { command: 'whoami' } });
  assert.equal(denied.ok, false);
  assert.equal(denied.code, 'PERMISSION_DENIED');
});
