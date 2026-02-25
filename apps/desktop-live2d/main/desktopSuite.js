const fs = require('node:fs');
const path = require('node:path');

const { resolveDesktopLive2dConfig } = require('./config');
const { validateModelAssetDirectory } = require('./modelAssets');
const { GatewaySupervisor } = require('./gatewaySupervisor');
const { Live2dRpcServer } = require('./rpcServer');
const { IpcRpcBridge } = require('./ipcBridge');
const { GatewayRuntimeClient, createDesktopSessionId } = require('./gatewayRuntimeClient');
const { listDesktopTools, resolveToolInvoke } = require('./toolRegistry');

const CHANNELS = Object.freeze({
  invoke: 'live2d:rpc:invoke',
  result: 'live2d:rpc:result',
  rendererReady: 'live2d:renderer:ready',
  rendererError: 'live2d:renderer:error',
  getRuntimeConfig: 'live2d:get-runtime-config',
  chatInputSubmit: 'live2d:chat:input:submit',
  windowDrag: 'live2d:window:drag'
});

function isNewSessionCommand(text) {
  return String(text || '').trim().toLowerCase() === '/new';
}

function normalizeWindowDragPayload(payload) {
  const action = String(payload?.action || '').trim().toLowerCase();
  if (!['start', 'move', 'end'].includes(action)) {
    return null;
  }

  const screenX = Number(payload?.screenX);
  const screenY = Number(payload?.screenY);
  if (!Number.isFinite(screenX) || !Number.isFinite(screenY)) {
    return null;
  }

  return {
    action,
    screenX: Math.round(screenX),
    screenY: Math.round(screenY)
  };
}

function createWindowDragListener({ BrowserWindow } = {}) {
  const dragStates = new Map();
  return (event, payload) => {
    const normalized = normalizeWindowDragPayload(payload);
    if (!normalized) {
      return;
    }

    const sender = event?.sender;
    if (!sender || !BrowserWindow || typeof BrowserWindow.fromWebContents !== 'function') {
      return;
    }

    const win = BrowserWindow.fromWebContents(sender);
    if (!win || typeof win.getPosition !== 'function' || typeof win.setPosition !== 'function') {
      return;
    }

    const senderId = Number(sender.id);
    if (!Number.isFinite(senderId)) {
      return;
    }

    if (normalized.action === 'start') {
      const [windowX, windowY] = win.getPosition();
      dragStates.set(senderId, {
        cursorX: normalized.screenX,
        cursorY: normalized.screenY,
        windowX,
        windowY
      });
      return;
    }

    if (normalized.action === 'move') {
      const state = dragStates.get(senderId);
      if (!state) {
        return;
      }
      const nextX = Math.round(state.windowX + normalized.screenX - state.cursorX);
      const nextY = Math.round(state.windowY + normalized.screenY - state.cursorY);
      win.setPosition(nextX, nextY);
      return;
    }

    if (normalized.action === 'end') {
      dragStates.delete(senderId);
    }
  };
}

async function startDesktopSuite({
  app,
  BrowserWindow,
  ipcMain,
  screen,
  logger = console,
  onChatInput = null
} = {}) {
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

  let rpcServerRef = null;
  let ipcBridgeRef = null;
  const gatewayRuntimeClient = new GatewayRuntimeClient({
    gatewayUrl: config.gatewayUrl,
    sessionId: 'desktop-live2d-chat',
    logger,
    onNotification: (desktopEvent) => {
      rpcServerRef?.notify({
        method: 'desktop.event',
        params: desktopEvent
      });

      if (desktopEvent.type !== 'runtime.final' || !ipcBridgeRef) {
        return;
      }

      const output = String(desktopEvent.data?.output || '').trim();
      if (!output) {
        return;
      }

      void ipcBridgeRef.invoke({
        method: 'chat.panel.append',
        params: {
          role: 'assistant',
          text: output,
          timestamp: Date.now()
        }
      }).catch((err) => {
        logger.error?.('[desktop-live2d] failed to append runtime.final into chat panel', err);
      });

      void ipcBridgeRef.invoke({
        method: 'chat.bubble.show',
        params: {
          text: output,
          durationMs: 5000
        }
      }).catch((err) => {
        logger.error?.('[desktop-live2d] failed to render runtime.final bubble', err);
      });
    }
  });
  const initialSessionId = createDesktopSessionId();
  gatewayRuntimeClient.setSessionId(initialSessionId);
  try {
    await gatewayRuntimeClient.ensureSession({ sessionId: initialSessionId, permissionLevel: 'medium' });
    logger.info?.('[desktop-live2d] gateway_session_bootstrap_ok', { sessionId: initialSessionId });
  } catch (err) {
    logger.error?.('[desktop-live2d] gateway_session_bootstrap_failed', err);
  }

  const window = createMainWindow({
    BrowserWindow,
    preloadPath: path.join(__dirname, 'preload.js'),
    display: screen?.getPrimaryDisplay?.(),
    uiConfig: config.uiConfig
  });

  ipcMain.handle(CHANNELS.getRuntimeConfig, () => ({
    modelRelativePath: config.modelRelativePath,
    modelName: modelValidation.modelName,
    gatewayUrl: config.gatewayUrl,
    uiConfig: config.uiConfig
  }));
  const windowDragListener = createWindowDragListener({ BrowserWindow });
  ipcMain.on(CHANNELS.windowDrag, windowDragListener);
  const chatInputListener = createChatInputListener({
    logger,
    onChatInput: (payload) => {
      if (typeof onChatInput === 'function') {
        onChatInput(payload);
      }

      if (isNewSessionCommand(payload.text)) {
        void gatewayRuntimeClient.createAndUseNewSession({ permissionLevel: 'medium' }).then((sessionId) => {
          logger.info?.('[desktop-live2d] gateway_session_switched', { sessionId });
          rpcServerRef?.notify({
            method: 'desktop.event',
            params: {
              type: 'session.new',
              timestamp: Date.now(),
              data: {
                session_id: sessionId
              }
            }
          });

          if (!ipcBridgeRef) {
            return;
          }

          void ipcBridgeRef.invoke({ method: 'chat.panel.clear', params: {} }).catch(() => {});
          void ipcBridgeRef.invoke({
            method: 'chat.panel.append',
            params: {
              role: 'system',
              text: `[session] switched to ${sessionId}`,
              timestamp: Date.now()
            }
          }).catch(() => {});
          void ipcBridgeRef.invoke({
            method: 'chat.bubble.show',
            params: {
              text: 'New session created',
              durationMs: 2200
            }
          }).catch(() => {});
        }).catch((err) => {
          logger.error?.('[desktop-live2d] /new session create failed', err);
        });
        return;
      }

      void gatewayRuntimeClient.runInput({ input: payload.text }).catch((err) => {
        logger.error?.('[desktop-live2d] gateway runtime input failed', err);
        rpcServerRef?.notify({
          method: 'desktop.event',
          params: {
            type: 'runtime.error',
            timestamp: Date.now(),
            data: {
              message: err?.message || String(err || 'unknown runtime error')
            }
          }
        });

        if (!ipcBridgeRef) {
          return;
        }
        void ipcBridgeRef.invoke({
          method: 'chat.panel.append',
          params: {
            role: 'system',
            text: `[runtime error] ${err?.message || String(err || 'unknown runtime error')}`,
            timestamp: Date.now()
          }
        }).catch(() => {});
      });
    }
  });
  ipcMain.on(CHANNELS.chatInputSubmit, chatInputListener);

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
  ipcBridgeRef = bridge;

  const rpcServer = new Live2dRpcServer({
    host: config.rpcHost,
    port: config.rpcPort,
    token: config.rpcToken,
    requestHandler: async (request) => handleDesktopRpcRequest({
      request,
      bridge,
      rendererTimeoutMs: config.rendererTimeoutMs
    }),
    logger
  });
  const rpcInfo = await rpcServer.start();
  rpcServerRef = rpcServer;

  const summary = {
    startedAt: new Date().toISOString(),
    rpcUrl: rpcInfo.url,
    rpcToken: config.rpcToken,
    gatewayUrl: config.gatewayUrl,
    currentSessionId: gatewayRuntimeClient.getSessionId(),
    modelJsonPath: modelValidation.modelJsonPath,
    methods: [
      'state.get',
      'param.set',
      'model.param.set',
      'model.param.batchSet',
      'model.motion.play',
      'model.expression.set',
      'chat.show',
      'chat.bubble.show',
      'chat.panel.show',
      'chat.panel.hide',
      'chat.panel.append',
      'chat.panel.clear',
      'tool.list',
      'tool.invoke'
    ]
  };
  writeRuntimeSummary(config.runtimeSummaryPath, summary);

  let stopped = false;
  async function stop() {
    if (stopped) return;
    stopped = true;

    ipcMain.removeHandler(CHANNELS.getRuntimeConfig);
    ipcMain.off(CHANNELS.windowDrag, windowDragListener);
    ipcMain.off(CHANNELS.chatInputSubmit, chatInputListener);

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

function normalizeChatInputPayload(payload) {
  const text = String(payload?.text || '').trim();
  if (!text) {
    return null;
  }

  const role = String(payload?.role || 'user').trim();
  const allowedRoles = new Set(['user', 'assistant', 'system', 'tool']);
  return {
    role: allowedRoles.has(role) ? role : 'user',
    text,
    source: String(payload?.source || 'chat-panel'),
    timestamp: Number.isFinite(Number(payload?.timestamp)) ? Number(payload.timestamp) : Date.now()
  };
}

function createChatInputListener({ logger = console, onChatInput = null } = {}) {
  return (_event, payload) => {
    const normalized = normalizeChatInputPayload(payload);
    if (!normalized) {
      return;
    }
    logger.info?.('[desktop-live2d] chat_input_submit', {
      role: normalized.role,
      textLength: normalized.text.length,
      source: normalized.source
    });
    if (typeof onChatInput === 'function') {
      onChatInput(normalized);
    }
  };
}

async function handleDesktopRpcRequest({ request, bridge, rendererTimeoutMs }) {
  if (request.method === 'tool.list') {
    return {
      tools: listDesktopTools()
    };
  }

  if (request.method === 'tool.invoke') {
    const resolved = resolveToolInvoke({
      name: request.params?.name,
      args: request.params?.arguments
    });
    const result = await bridge.invoke({
      method: resolved.method,
      params: resolved.params,
      timeoutMs: rendererTimeoutMs
    });
    return {
      ok: true,
      tool: resolved.toolName,
      result
    };
  }

  return bridge.invoke({
    method: request.method,
    params: request.params,
    timeoutMs: rendererTimeoutMs
  });
}

function createMainWindow({ BrowserWindow, preloadPath, display, uiConfig }) {
  const windowConfig = uiConfig?.window || {};
  const width = Number(windowConfig.width) || 460;
  const height = Number(windowConfig.height) || 620;
  const placement = windowConfig.placement || {};
  const windowBounds = computeWindowBounds({
    width,
    height,
    display,
    anchor: String(placement.anchor || 'bottom-right'),
    marginRight: Number(placement.marginRight) || 18,
    marginBottom: Number(placement.marginBottom) || 18,
    marginLeft: Number(placement.marginLeft) || 18,
    marginTop: Number(placement.marginTop) || 18,
    x: placement.x,
    y: placement.y
  });

  const win = new BrowserWindow({
    width,
    height,
    x: windowBounds.x,
    y: windowBounds.y,
    minWidth: Number(windowConfig.minWidth) || 360,
    minHeight: Number(windowConfig.minHeight) || 480,
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

function computeRightBottomWindowBounds({ width, height, display, marginRight = 16, marginBottom = 16 }) {
  const fallback = { x: undefined, y: undefined };
  const workArea = display?.workArea;
  if (!workArea || typeof workArea !== 'object') {
    return fallback;
  }

  const x = Math.round(workArea.x + workArea.width - width - marginRight);
  const y = Math.round(workArea.y + workArea.height - height - marginBottom);
  return { x, y };
}

function computeWindowBounds({ width, height, display, anchor = 'bottom-right', x, y, ...margins }) {
  const workArea = display?.workArea;
  if (!workArea || typeof workArea !== 'object') {
    return { x: undefined, y: undefined };
  }

  if (anchor === 'custom') {
    const customX = Number.isFinite(Number(x)) ? Math.round(Number(x)) : undefined;
    const customY = Number.isFinite(Number(y)) ? Math.round(Number(y)) : undefined;
    return { x: customX, y: customY };
  }

  const marginLeft = Number(margins.marginLeft) || 16;
  const marginTop = Number(margins.marginTop) || 16;
  const marginRight = Number(margins.marginRight) || 16;
  const marginBottom = Number(margins.marginBottom) || 16;

  if (anchor === 'top-left') {
    return {
      x: Math.round(workArea.x + marginLeft),
      y: Math.round(workArea.y + marginTop)
    };
  }

  if (anchor === 'top-right') {
    return {
      x: Math.round(workArea.x + workArea.width - width - marginRight),
      y: Math.round(workArea.y + marginTop)
    };
  }

  if (anchor === 'bottom-left') {
    return {
      x: Math.round(workArea.x + marginLeft),
      y: Math.round(workArea.y + workArea.height - height - marginBottom)
    };
  }

  if (anchor === 'center') {
    return {
      x: Math.round(workArea.x + (workArea.width - width) / 2),
      y: Math.round(workArea.y + (workArea.height - height) / 2)
    };
  }

  return computeRightBottomWindowBounds({ width, height, display, marginRight, marginBottom });
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
  computeWindowBounds,
  computeRightBottomWindowBounds,
  writeRuntimeSummary,
  normalizeChatInputPayload,
  normalizeWindowDragPayload,
  createWindowDragListener,
  createChatInputListener,
  handleDesktopRpcRequest,
  isNewSessionCommand
};
