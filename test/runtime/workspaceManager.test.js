const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const { SessionWorkspaceManager } = require('../../apps/runtime/session/workspaceManager');

test('SessionWorkspaceManager creates stable per-session workspace directories', async () => {
  const rootDir = fs.mkdtempSync(path.join(os.tmpdir(), 'session-workspace-'));
  const manager = new SessionWorkspaceManager({ rootDir });

  const first = await manager.getWorkspaceInfo('session-a');
  const second = await manager.getWorkspaceInfo('session-a');
  const another = await manager.getWorkspaceInfo('session-b');

  assert.equal(first.mode, 'session');
  assert.equal(first.root_dir, second.root_dir);
  assert.notEqual(first.root_dir, another.root_dir);
  assert.ok(fs.existsSync(first.root_dir));
  assert.ok(first.root_dir.startsWith(rootDir));
});
