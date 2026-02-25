const test = require('node:test');
const assert = require('node:assert/strict');
const { EventEmitter } = require('node:events');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const {
  waitForRendererReady,
  writeRuntimeSummary,
  computeWindowBounds,
  computeRightBottomWindowBounds,
  normalizeChatInputPayload,
  createChatInputListener
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

test('computeRightBottomWindowBounds places window at display corner', () => {
  const bounds = computeRightBottomWindowBounds({
    width: 460,
    height: 620,
    display: {
      workArea: {
        x: 0,
        y: 25,
        width: 1728,
        height: 1080
      }
    },
    marginRight: 18,
    marginBottom: 18
  });

  assert.equal(bounds.x, 1250);
  assert.equal(bounds.y, 467);
});

test('computeWindowBounds supports top-left and center anchors', () => {
  const display = {
    workArea: {
      x: 10,
      y: 20,
      width: 1200,
      height: 800
    }
  };

  const topLeft = computeWindowBounds({
    width: 400,
    height: 600,
    display,
    anchor: 'top-left',
    marginLeft: 25,
    marginTop: 30
  });

  const center = computeWindowBounds({
    width: 400,
    height: 600,
    display,
    anchor: 'center'
  });

  assert.deepEqual(topLeft, { x: 35, y: 50 });
  assert.deepEqual(center, { x: 410, y: 120 });
});

test('normalizeChatInputPayload sanitizes and validates payload', () => {
  const result = normalizeChatInputPayload({
    role: 'assistant',
    text: ' hello ',
    source: 'chat-panel',
    timestamp: 1234
  });
  assert.equal(result.role, 'assistant');
  assert.equal(result.text, 'hello');
  assert.equal(result.source, 'chat-panel');
  assert.equal(result.timestamp, 1234);

  const fallback = normalizeChatInputPayload({ role: 'bad', text: 'x' });
  assert.equal(fallback.role, 'user');
  assert.equal(typeof fallback.timestamp, 'number');

  const invalid = normalizeChatInputPayload({ text: '   ' });
  assert.equal(invalid, null);
});

test('createChatInputListener forwards normalized payload to callback', () => {
  const logs = [];
  const received = [];
  const listener = createChatInputListener({
    logger: { info: (...args) => logs.push(args) },
    onChatInput: (payload) => received.push(payload)
  });

  listener(null, { role: 'tool', text: ' invoke ', source: 'chat-panel' });
  listener(null, { text: '   ' });

  assert.equal(logs.length, 1);
  assert.equal(received.length, 1);
  assert.equal(received[0].role, 'tool');
  assert.equal(received[0].text, 'invoke');
});
