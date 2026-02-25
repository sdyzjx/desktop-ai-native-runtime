const { contextBridge } = require('electron');

contextBridge.exposeInMainWorld('desktopRuntime', {
  platform: process.platform,
  electronVersion: process.versions.electron
});
