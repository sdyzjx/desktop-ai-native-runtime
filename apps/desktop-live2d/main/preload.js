const { contextBridge, ipcRenderer } = require('electron');

const CHANNELS = {
  invoke: 'live2d:rpc:invoke',
  result: 'live2d:rpc:result',
  rendererReady: 'live2d:renderer:ready',
  rendererError: 'live2d:renderer:error',
  getRuntimeConfig: 'live2d:get-runtime-config'
};

contextBridge.exposeInMainWorld('desktopLive2dBridge', {
  onInvoke(handler) {
    const listener = (_event, payload) => handler(payload);
    ipcRenderer.on(CHANNELS.invoke, listener);
    return () => ipcRenderer.off(CHANNELS.invoke, listener);
  },
  sendResult(payload) {
    ipcRenderer.send(CHANNELS.result, payload);
  },
  notifyReady(payload = {}) {
    ipcRenderer.send(CHANNELS.rendererReady, payload);
  },
  notifyError(payload = {}) {
    ipcRenderer.send(CHANNELS.rendererError, payload);
  },
  getRuntimeConfig() {
    return ipcRenderer.invoke(CHANNELS.getRuntimeConfig);
  }
});
