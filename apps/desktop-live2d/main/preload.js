const { contextBridge, ipcRenderer } = require('electron');

const CHANNELS = {
  invoke: 'live2d:rpc:invoke',
  result: 'live2d:rpc:result',
  rendererReady: 'live2d:renderer:ready',
  rendererError: 'live2d:renderer:error',
  getRuntimeConfig: 'live2d:get-runtime-config',
  chatInputSubmit: 'live2d:chat:input:submit',
  windowDrag: 'live2d:window:drag',
  windowControl: 'live2d:window:control',
  chatPanelVisibility: 'live2d:chat:panel-visibility'
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
  sendChatInput(payload = {}) {
    ipcRenderer.send(CHANNELS.chatInputSubmit, payload);
  },
  sendWindowDrag(payload = {}) {
    ipcRenderer.send(CHANNELS.windowDrag, payload);
  },
  sendWindowControl(payload = {}) {
    ipcRenderer.send(CHANNELS.windowControl, payload);
  },
  sendChatPanelVisibility(payload = {}) {
    ipcRenderer.send(CHANNELS.chatPanelVisibility, payload);
  },
  getRuntimeConfig() {
    return ipcRenderer.invoke(CHANNELS.getRuntimeConfig);
  }
});
