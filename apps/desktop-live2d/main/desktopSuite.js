const fs = require('node:fs');
const path = require('node:path');

const { resolveDesktopLive2dConfig } = require('./config');
const { validateModelAssetDirectory } = require('./modelAssets');
const { GatewaySupervisor } = require('./gatewaySupervisor');
const { Live2dRpcServer } = require('./rpcServer');
const { IpcRpcBridge } = require('./ipcBridge');

const CHANNELS = Object.freeze({
  invoke: 'live2d:rpc:invoke',
  result: 'live2d:rpc:result',
  rendererReady: 'live2d:renderer:ready',
  rendererError: 'live2d:renderer:error',
  getRuntimeConfig: 'live2d:get-runtime-config'
});

async function startDesktopSuite({ app, BrowserWindow, ipcMain, logger = console } = {}) {
  if (!app || !BrowserWindow || !ipcMain) {
    throw new Error('startDesktopSuite requires app, BrowserWindow, and ipcMain');
  }

  const config = resolveDesktopLive2dConfig();
  const modelValidation = validateModelAssetDirectory({
    modelDir: config.modelDir,
    modelJsonName: config.modelJsonName
  });

  logger.info?.('[desktop-live2d] desktop_up_start', {
    modelDir: config.modelDir,
    rpcPort: config.rpcPort,
    gatewayExternal: config.gatewayExternal
  });

  const gatewaySupervisor = new GatewaySupervisor({
    projectRoot: config.projectRoot,
    gatewayUrl: config.gatewayUrl,
    gatewayHost: config.gatewayHost,
    gatewayPort: config.gatewayPort,
    external: config.gatewayExternal
  });

  await gatewaySupervisor.start();

  const window = createMainWindow({ BrowserWindow, preloadPath: path.join(__dirname, 'preload.js') });

  ipcMain.handle(CHANNELS.getRuntimeConfig, () => ({
    modelRelativePath: config.modelRelativePath,
    modelName: modelValidation.modelName,
    gatewayUrl: config.gatewayUrl
  }));

  const rendererReadyPromise = waitForRendererReady({ ipcMain, timeoutMs: 15000 });

  await window.loadFile(path.join(config.projectRoot, 'apps', 'desktop-live2d', 'renderer', 'index.html'));
  await rendererReadyPromise;

  const bridge = new IpcRpcBridge({
    ipcMain,
    webContents: window.webContents,
    invokeChannel: CHANNELS.invoke,
    resultChannel: CHANNELS.result,
    timeoutMs: config.rendererTimeoutMs
  });

  const rpcServer = new Live2dRpcServer({
    host: config.rpcHost,
    port: config.rpcPort,
    token: config.rpcToken,
    requestHandler: async ({ method, params }) => bridge.invoke({ method, params, timeoutMs: config.rendererTimeoutMs }),
    logger
  });
  const rpcInfo = await rpcServer.start();

  const summary = {
    startedAt: new Date().toISOString(),
    rpcUrl: rpcInfo.url,
    rpcToken: config.rpcToken,
    gatewayUrl: config.gatewayUrl,
    modelJsonPath: modelValidation.modelJsonPath,
    methods: ['state.get', 'param.set', 'chat.show']
  };
  writeRuntimeSummary(config.runtimeSummaryPath, summary);

  let stopped = false;
  async function stop() {
    if (stopped) return;
    stopped = true;

    ipcMain.removeHandler(CHANNELS.getRuntimeConfig);

    await rpcServer.stop();
    bridge.dispose();

    if (!window.isDestroyed()) {
      window.destroy();
    }

    await gatewaySupervisor.stop();
  }

  return {
    config,
    summary,
    window,
    stop
  };
}

function createMainWindow({ BrowserWindow, preloadPath }) {
  const win = new BrowserWindow({
    width: 640,
    height: 720,
    minWidth: 420,
    minHeight: 520,
    frame: false,
    transparent: true,
    hasShadow: false,
    alwaysOnTop: true,
    backgroundColor: '#00000000',
    webPreferences: {
      preload: preloadPath,
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false
    }
  });

  return win;
}

function waitForRendererReady({ ipcMain, timeoutMs }) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      cleanup();
      reject(new Error(`renderer ready timeout after ${timeoutMs}ms`));
    }, timeoutMs);

    const onReady = () => {
      cleanup();
      resolve();
    };

    const onError = (_event, payload) => {
      cleanup();
      const reason = payload?.message || 'renderer reported error';
      reject(new Error(reason));
    };

    function cleanup() {
      clearTimeout(timer);
      ipcMain.off(CHANNELS.rendererReady, onReady);
      ipcMain.off(CHANNELS.rendererError, onError);
    }

    ipcMain.on(CHANNELS.rendererReady, onReady);
    ipcMain.on(CHANNELS.rendererError, onError);
  });
}

function writeRuntimeSummary(summaryPath, payload) {
  fs.mkdirSync(path.dirname(summaryPath), { recursive: true });
  fs.writeFileSync(summaryPath, JSON.stringify(payload, null, 2), 'utf8');
}

module.exports = {
  CHANNELS,
  startDesktopSuite,
  waitForRendererReady,
  createMainWindow,
  writeRuntimeSummary
};
