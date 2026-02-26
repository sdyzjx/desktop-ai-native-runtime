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
  resolveWindowMetrics,
  resolveWindowSizeForChatPanel,
  resizeWindowKeepingBottomRight,
  normalizeChatInputPayload,
  normalizeWindowDragPayload,
  normalizeWindowControlPayload,
  normalizeChatPanelVisibilityPayload,
  normalizeModelBoundsPayload,
  createWindowDragListener,
  createWindowControlListener,
  createChatPanelVisibilityListener,
  createModelBoundsListener,
  createChatInputListener,
  handleDesktopRpcRequest,
  isNewSessionCommand,
  computeChatWindowBounds,
  computeBubbleWindowBounds,
  computeFittedAvatarWindowBounds
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

test('computeChatWindowBounds anchors near avatar and clamps into work area', () => {
  const bounds = computeChatWindowBounds({
    avatarBounds: { x: 20, y: 640, width: 300, height: 420 },
    chatWidth: 320,
    chatHeight: 220,
    display: {
      workArea: {
        x: 0,
        y: 0,
        width: 1440,
        height: 900
      }
    }
  });

  assert.equal(bounds.width, 320);
  assert.equal(bounds.height, 220);
  assert.ok(bounds.x >= 16);
  assert.ok(bounds.y >= 16);
});

test('computeBubbleWindowBounds anchors near avatar top area', () => {
  const bounds = computeBubbleWindowBounds({
    avatarBounds: { x: 1000, y: 420, width: 300, height: 500 },
    bubbleWidth: 320,
    bubbleHeight: 120,
    display: {
      workArea: {
        x: 0,
        y: 0,
        width: 1728,
        height: 1117
      }
    }
  });

  assert.equal(bounds.width, 320);
  assert.equal(bounds.height, 120);
  assert.ok(bounds.x <= 1728 - 320 - 16);
  assert.ok(bounds.y >= 16);
});

test('resolveWindowMetrics returns compact profile and chat default visibility', () => {
  const metrics = resolveWindowMetrics({
    window: {
      width: 460,
      height: 620,
      compactWidth: 280,
      compactHeight: 540,
      compactWhenChatHidden: true
    },
    chat: {
      panel: {
        enabled: true,
        defaultVisible: false
      }
    }
  });

  assert.equal(metrics.expandedWidth, 460);
  assert.equal(metrics.expandedHeight, 620);
  assert.equal(metrics.compactWidth, 280);
  assert.equal(metrics.compactHeight, 540);
  assert.equal(metrics.defaultChatPanelVisible, false);
});

test('resolveWindowSizeForChatPanel switches expanded/compact by visibility', () => {
  const metrics = resolveWindowMetrics({
    window: {
      width: 460,
      height: 620,
      compactWidth: 300,
      compactHeight: 560
    },
    chat: {
      panel: {
        enabled: true,
        defaultVisible: false
      }
    }
  });

  assert.deepEqual(resolveWindowSizeForChatPanel({ windowMetrics: metrics, chatPanelVisible: true }), {
    width: 460,
    height: 620
  });
  assert.deepEqual(resolveWindowSizeForChatPanel({ windowMetrics: metrics, chatPanelVisible: false }), {
    width: 300,
    height: 560
  });
});

test('resizeWindowKeepingBottomRight preserves anchor while changing size', () => {
  const calls = [];
  const fakeWindow = {
    getBounds() {
      return { x: 1000, y: 300, width: 460, height: 620 };
    },
    setBounds(bounds) {
      calls.push(bounds);
    }
  };

  resizeWindowKeepingBottomRight({
    window: fakeWindow,
    width: 300,
    height: 560
  });

  assert.equal(calls.length, 1);
  assert.deepEqual(calls[0], { x: 1160, y: 360, width: 300, height: 560 });
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

test('normalizeWindowDragPayload validates action and screen coordinates', () => {
  const valid = normalizeWindowDragPayload({ action: ' move ', screenX: 100.4, screenY: 250.9 });
  assert.deepEqual(valid, {
    action: 'move',
    screenX: 100,
    screenY: 251
  });

  assert.equal(normalizeWindowDragPayload({ action: 'drag', screenX: 1, screenY: 2 }), null);
  assert.equal(normalizeWindowDragPayload({ action: 'start', screenX: 'x', screenY: 2 }), null);
});

test('normalizeWindowControlPayload and normalizeChatPanelVisibilityPayload validate payloads', () => {
  assert.deepEqual(normalizeWindowControlPayload({ action: 'hide' }), { action: 'hide' });
  assert.deepEqual(normalizeWindowControlPayload({ action: ' close_pet ' }), { action: 'close_pet' });
  assert.equal(normalizeWindowControlPayload({ action: 'quit' }), null);

  assert.deepEqual(normalizeChatPanelVisibilityPayload({ visible: true }), { visible: true });
  assert.equal(normalizeChatPanelVisibilityPayload({ visible: 'true' }), null);
});

test('normalizeModelBoundsPayload validates numeric bounds payload', () => {
  assert.deepEqual(normalizeModelBoundsPayload({
    x: 12.2,
    y: 18.8,
    width: 205.1,
    height: 390.7,
    stageWidth: 320,
    stageHeight: 500
  }), {
    x: 12,
    y: 19,
    width: 205,
    height: 391,
    stageWidth: 320,
    stageHeight: 500
  });
  assert.equal(normalizeModelBoundsPayload({ x: 1, y: 2, width: 0, height: 10, stageWidth: 10, stageHeight: 10 }), null);
});

test('computeFittedAvatarWindowBounds shrinks to model bounds and keeps screen safety margin', () => {
  const next = computeFittedAvatarWindowBounds({
    windowBounds: { x: 1300, y: 560, width: 320, height: 500 },
    modelBounds: { x: 70, y: 20, width: 180, height: 430 },
    display: {
      workArea: {
        x: 0,
        y: 25,
        width: 1728,
        height: 1080
      }
    }
  });

  assert.ok(next.width <= 320);
  assert.ok(next.height <= 500);
  assert.ok(next.x >= 8);
  assert.ok(next.y >= 33);
});

test('createWindowDragListener repositions window across start/move/end', () => {
  const fakeWindow = {
    x: 300,
    y: 420,
    getPosition() {
      return [this.x, this.y];
    },
    setPosition(nextX, nextY) {
      this.x = nextX;
      this.y = nextY;
    }
  };

  const BrowserWindow = {
    fromWebContents(sender) {
      return sender?.id === 7 ? fakeWindow : null;
    }
  };

  const listener = createWindowDragListener({ BrowserWindow });
  const sender = { id: 7 };

  listener({ sender }, { action: 'start', screenX: 1100, screenY: 700 });
  listener({ sender }, { action: 'move', screenX: 1142, screenY: 755 });
  assert.deepEqual([fakeWindow.x, fakeWindow.y], [342, 475]);

  listener({ sender }, { action: 'end', screenX: 1142, screenY: 755 });
  listener({ sender }, { action: 'move', screenX: 1160, screenY: 760 });
  assert.deepEqual([fakeWindow.x, fakeWindow.y], [342, 475]);
});

test('createWindowControlListener handles hide and close actions for active window sender', () => {
  const webContents = { id: 3 };
  const window = {
    webContents,
    isDestroyed() {
      return false;
    }
  };
  let hideCount = 0;
  let closeCount = 0;
  const listener = createWindowControlListener({
    window,
    onHide: () => { hideCount += 1; },
    onClosePet: () => { closeCount += 1; }
  });

  listener({ sender: webContents }, { action: 'hide' });
  listener({ sender: webContents }, { action: 'close_pet' });
  listener({ sender: { id: 99 } }, { action: 'hide' });

  assert.equal(hideCount, 1);
  assert.equal(closeCount, 1);
});

test('createChatPanelVisibilityListener resizes when visibility changes', () => {
  const webContents = { id: 6 };
  const setBoundsCalls = [];
  const state = { x: 1000, y: 300, width: 460, height: 620 };
  const window = {
    webContents,
    isDestroyed() {
      return false;
    },
    getBounds() {
      return { ...state };
    },
    setBounds(bounds) {
      setBoundsCalls.push(bounds);
      state.x = bounds.x;
      state.y = bounds.y;
      state.width = bounds.width;
      state.height = bounds.height;
    }
  };
  const metrics = resolveWindowMetrics({
    window: { width: 460, height: 620, compactWidth: 300, compactHeight: 560 },
    chat: { panel: { enabled: true, defaultVisible: false } }
  });

  const listener = createChatPanelVisibilityListener({ window, windowMetrics: metrics });
  listener({ sender: webContents }, { visible: false });
  listener({ sender: webContents }, { visible: false });
  listener({ sender: webContents }, { visible: true });

  assert.equal(setBoundsCalls.length, 2);
  assert.deepEqual(setBoundsCalls[0], { x: 1160, y: 360, width: 300, height: 560 });
  assert.deepEqual(setBoundsCalls[1], { x: 1000, y: 300, width: 460, height: 620 });
});

test('createModelBoundsListener forwards normalized bounds for avatar sender only', () => {
  const webContents = { id: 10 };
  const window = {
    webContents,
    isDestroyed() {
      return false;
    }
  };
  const received = [];
  const listener = createModelBoundsListener({
    window,
    onModelBounds: (payload) => received.push(payload)
  });

  listener({ sender: webContents }, { x: 10, y: 20, width: 200, height: 420, stageWidth: 320, stageHeight: 500 });
  listener({ sender: { id: 99 } }, { x: 10, y: 20, width: 200, height: 420, stageWidth: 320, stageHeight: 500 });
  listener({ sender: webContents }, { x: 10, y: 20, width: 0, height: 420, stageWidth: 320, stageHeight: 500 });

  assert.equal(received.length, 1);
  assert.equal(received[0].width, 200);
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

test('handleDesktopRpcRequest returns tool list without touching renderer bridge', async () => {
  const result = await handleDesktopRpcRequest({
    request: { method: 'tool.list', params: {} },
    bridge: {
      invoke: async () => {
        throw new Error('should not be called');
      }
    },
    rendererTimeoutMs: 3000
  });

  assert.ok(Array.isArray(result.tools));
  assert.ok(result.tools.some((tool) => tool.name === 'desktop_chat_show'));
});

test('handleDesktopRpcRequest maps tool.invoke to renderer method', async () => {
  const calls = [];
  const result = await handleDesktopRpcRequest({
    request: {
      method: 'tool.invoke',
      params: {
        name: 'desktop_model_set_param',
        arguments: { name: 'ParamAngleX', value: 3 }
      }
    },
    bridge: {
      invoke: async (payload) => {
        calls.push(payload);
        return { ok: true };
      }
    },
    rendererTimeoutMs: 3456
  });

  assert.equal(calls.length, 1);
  assert.equal(calls[0].method, 'model.param.set');
  assert.equal(calls[0].timeoutMs, 3456);
  assert.deepEqual(calls[0].params, { name: 'ParamAngleX', value: 3 });
  assert.equal(result.ok, true);
});

test('isNewSessionCommand matches /new command only', () => {
  assert.equal(isNewSessionCommand('/new'), true);
  assert.equal(isNewSessionCommand('  /NEW  '), true);
  assert.equal(isNewSessionCommand('/new session'), false);
  assert.equal(isNewSessionCommand('hello'), false);
});
