const test = require('node:test');
const assert = require('node:assert/strict');
const os = require('node:os');
const path = require('node:path');
const fs = require('node:fs/promises');

const shellAdapters = require('../../apps/runtime/tooling/adapters/shell');

const runShellExec = shellAdapters['shell.exec'];

test('shell.exec publishes stdout and exit events when debug mode is enabled', async () => {
  const workspaceRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'shell-debug-on-'));
  const events = [];

  const out = await runShellExec(
    { command: 'echo hello' },
    {
      security: 'allowlist',
      safeBins: ['echo'],
      workspaceRoot,
      bus: { isDebugMode: () => true },
      publishEvent: (topic, payload) => events.push({ topic, payload })
    }
  );

  assert.match(out, /hello/);
  assert.equal(events.some((item) => item.topic === 'shell.exec.stdout'), true);
  assert.equal(events.some((item) => item.topic === 'shell.exec.exit'), true);
});

test('shell.exec does not publish stream events when debug mode is disabled', async () => {
  const workspaceRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'shell-debug-off-'));
  const events = [];

  const out = await runShellExec(
    { command: 'echo quiet' },
    {
      security: 'allowlist',
      safeBins: ['echo'],
      workspaceRoot,
      bus: { isDebugMode: () => false },
      publishEvent: (topic, payload) => events.push({ topic, payload })
    }
  );

  assert.match(out, /quiet/);
  assert.equal(events.length, 0);
});
