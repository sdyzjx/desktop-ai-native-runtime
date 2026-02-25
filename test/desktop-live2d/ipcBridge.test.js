const test = require('node:test');
const assert = require('node:assert/strict');
const { EventEmitter } = require('node:events');

const { IpcRpcBridge } = require('../../apps/desktop-live2d/main/ipcBridge');

class FakeIpcMain extends EventEmitter {}

function createFakeWebContents(onSend) {
  return {
    isDestroyed() {
      return false;
    },
    send(channel, payload) {
      onSend(channel, payload);
    }
  };
}

test('IpcRpcBridge resolves with renderer result payload', async () => {
  const ipcMain = new FakeIpcMain();
  const webContents = createFakeWebContents((_channel, payload) => {
    process.nextTick(() => {
      ipcMain.emit('live2d:rpc:result', null, {
        requestId: payload.requestId,
        result: { ok: true }
      });
    });
  });

  const bridge = new IpcRpcBridge({ ipcMain, webContents, timeoutMs: 300 });
  const result = await bridge.invoke({ method: 'state.get', params: {} });

  assert.deepEqual(result, { ok: true });
  bridge.dispose();
});

test('IpcRpcBridge rejects with timeout error when renderer does not respond', async () => {
  const ipcMain = new FakeIpcMain();
  const webContents = createFakeWebContents(() => {});
  const bridge = new IpcRpcBridge({ ipcMain, webContents, timeoutMs: 80 });

  await assert.rejects(
    () => bridge.invoke({ method: 'state.get', params: {} }),
    (err) => {
      assert.equal(err.code, -32003);
      return true;
    }
  );

  bridge.dispose();
});
