const test = require('node:test');
const assert = require('node:assert/strict');
const { EventEmitter } = require('node:events');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const {
  waitForRendererReady,
  writeRuntimeSummary
} = require('../../apps/desktop-live2d/main/desktopSuite');

class FakeIpcMain extends EventEmitter {}

test('waitForRendererReady resolves when renderer sends ready event', async () => {
  const ipcMain = new FakeIpcMain();
  const promise = waitForRendererReady({ ipcMain, timeoutMs: 200 });

  setTimeout(() => {
    ipcMain.emit('live2d:renderer:ready', null, { ok: true });
  }, 20);

  await promise;
});

test('waitForRendererReady rejects on timeout', async () => {
  const ipcMain = new FakeIpcMain();

  await assert.rejects(
    () => waitForRendererReady({ ipcMain, timeoutMs: 60 }),
    /timeout/i
  );
});

test('writeRuntimeSummary persists JSON payload', () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'live2d-summary-'));
  const summaryPath = path.join(tmpDir, 'desktop', 'runtime-summary.json');

  writeRuntimeSummary(summaryPath, { ok: true, rpcUrl: 'ws://127.0.0.1:17373' });
  const content = JSON.parse(fs.readFileSync(summaryPath, 'utf8'));

  assert.equal(content.ok, true);
  assert.equal(content.rpcUrl, 'ws://127.0.0.1:17373');
});
