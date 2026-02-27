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
  chatPanelToggle: 'live2d:chat:panel-toggle',
  chatStateSync: 'live2d:chat:state-sync',
  bubbleStateSync: 'live2d:bubble:state-sync',
  bubbleMetricsUpdate: 'live2d:bubble:metrics-update',
  modelBoundsUpdate: 'live2d:model:bounds-update',
  windowDrag: 'live2d:window:drag',
  windowControl: 'live2d:window:control',
  chatPanelVisibility: 'live2d:chat:panel-visibility'
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

function toPositiveInt(value, fallback) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    return fallback;
  }
  return Math.floor(parsed);
}

function resolveWindowMetrics(uiConfig) {
  const windowConfig = uiConfig?.window || {};
  const chatPanelConfig = uiConfig?.chat?.panel || {};

  const expandedWidth = toPositiveInt(windowConfig.width, 460);
  const expandedHeight = toPositiveInt(windowConfig.height, 620);
  const compactWhenChatHidden = windowConfig.compactWhenChatHidden !== false;
  const compactWidth = toPositiveInt(windowConfig.compactWidth, Math.min(expandedWidth, 300));
  const compactHeight = toPositiveInt(windowConfig.compactHeight, Math.min(expandedHeight, 560));

  const minWidthRaw = toPositiveInt(windowConfig.minWidth, 360);
  const minHeightRaw = toPositiveInt(windowConfig.minHeight, 480);

  return {
    expandedWidth,
    expandedHeight,
    compactWidth,
    compactHeight,
    compactWhenChatHidden,
    minWidth: Math.max(120, Math.min(minWidthRaw, expandedWidth, compactWhenChatHidden ? compactWidth : expandedWidth)),
    minHeight: Math.max(160, Math.min(minHeightRaw, expandedHeight, compactWhenChatHidden ? compactHeight : expandedHeight)),
    defaultChatPanelVisible: Boolean(chatPanelConfig.enabled && chatPanelConfig.defaultVisible)
  };
}

function resolveWindowSizeForChatPanel({ windowMetrics, chatPanelVisible }) {
  if (!windowMetrics?.compactWhenChatHidden || chatPanelVisible) {
    return {
      width: windowMetrics?.expandedWidth || 460,
      height: windowMetrics?.expandedHeight || 620
    };
  }
  return {
    width: windowMetrics.compactWidth,
    height: windowMetrics.compactHeight
  };
}

function resizeWindowKeepingBottomRight({ window, width, height }) {
  if (!window || typeof window.getBounds !== 'function' || typeof window.setBounds !== 'function') {
    return;
  }

  const bounds = window.getBounds();
  if (bounds.width === width && bounds.height === height) {
    return;
  }

  const right = bounds.x + bounds.width;
  const bottom = bounds.y + bounds.height;

  window.setBounds({
    x: Math.round(right - width),
    y: Math.round(bottom - height),
    width,
    height
  }, false);
}

function normalizeWindowControlPayload(payload) {
  const action = String(payload?.action || '').trim().toLowerCase();
  if (!['hide', 'close_pet'].includes(action)) {
    return null;
  }
  return { action };
}

function createWindowControlListener({ window, windows = null, onHide = null, onClosePet = null } = {}) {
  const allowedWindows = Array.isArray(windows) && windows.length > 0
    ? windows
    : (window ? [window] : []);

  return (event, payload) => {
    const sender = event?.sender;
    if (!sender || allowedWindows.length === 0) {
      return;
    }

    const matched = allowedWindows.find((candidate) => (
      candidate
      && !candidate.isDestroyed?.()
      && candidate.webContents === sender
    ));
    if (!matched) {
      return;
    }

    const normalized = normalizeWindowControlPayload(payload);
    if (!normalized) {
      return;
    }

    if (normalized.action === 'hide') {
      if (typeof onHide === 'function') {
        onHide();
      }
      return;
    }

    if (normalized.action === 'close_pet' && typeof onClosePet === 'function') {
      onClosePet();
    }
  };
}

function normalizeChatPanelVisibilityPayload(payload) {
  if (typeof payload?.visible !== 'boolean') {
    return null;
  }
  return {
    visible: payload.visible
  };
}

function normalizeChatPanelTogglePayload(payload) {
  return {
    source: String(payload?.source || 'avatar-window')
  };
}

function createChatPanelToggleListener({ window, onToggle = null } = {}) {
  return (event, payload) => {
    if (!window || window.isDestroyed() || event?.sender !== window.webContents) {
      return;
    }
    normalizeChatPanelTogglePayload(payload);
    if (typeof onToggle === 'function') {
      onToggle();
    }
  };
}

function normalizeModelBoundsPayload(payload) {
  const x = Number(payload?.x);
  const y = Number(payload?.y);
  const width = Number(payload?.width);
  const height = Number(payload?.height);
  const stageWidth = Number(payload?.stageWidth);
  const stageHeight = Number(payload?.stageHeight);
  if (
    !Number.isFinite(x)
    || !Number.isFinite(y)
    || !Number.isFinite(width)
    || !Number.isFinite(height)
    || !Number.isFinite(stageWidth)
    || !Number.isFinite(stageHeight)
    || width <= 0
    || height <= 0
    || stageWidth <= 0
    || stageHeight <= 0
  ) {
    return null;
  }
  return {
    x: Math.round(x),
    y: Math.round(y),
    width: Math.round(width),
    height: Math.round(height),
    stageWidth: Math.round(stageWidth),
    stageHeight: Math.round(stageHeight)
  };
}

function createModelBoundsListener({ window, onModelBounds = null } = {}) {
  return (event, payload) => {
    if (!window || window.isDestroyed() || event?.sender !== window.webContents) {
      return;
    }
    const normalized = normalizeModelBoundsPayload(payload);
    if (!normalized) {
      return;
    }
    if (typeof onModelBounds === 'function') {
      onModelBounds(normalized);
    }
  };
}

function normalizeBubbleMetricsPayload(payload) {
  const width = Number(payload?.width);
  const height = Number(payload?.height);
  if (!Number.isFinite(width) || !Number.isFinite(height) || width <= 0 || height <= 0) {
    return null;
  }
  return {
    width: Math.round(width),
    height: Math.round(height)
  };
}

function createBubbleMetricsListener({ window, onBubbleMetrics = null } = {}) {
  return (event, payload) => {
    if (!window || window.isDestroyed() || event?.sender !== window.webContents) {
      return;
    }
    const normalized = normalizeBubbleMetricsPayload(payload);
    if (!normalized) {
      return;
    }
    if (typeof onBubbleMetrics === 'function') {
      onBubbleMetrics(normalized);
    }
  };
}

function createChatPanelVisibilityListener({ window, windowMetrics } = {}) {
  let lastVisible = null;
  return (event, payload) => {
    if (!window || window.isDestroyed() || event?.sender !== window.webContents) {
      return;
    }

    const normalized = normalizeChatPanelVisibilityPayload(payload);
    if (!normalized || normalized.visible === lastVisible) {
      return;
    }
    lastVisible = normalized.visible;

    const nextSize = resolveWindowSizeForChatPanel({
      windowMetrics,
      chatPanelVisible: normalized.visible
    });
    resizeWindowKeepingBottomRight({
      window,
      width: nextSize.width,
      height: nextSize.height
    });
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
  const display = screen?.getPrimaryDisplay?.();

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
  const windowMetrics = resolveWindowMetrics(config.uiConfig);
  const avatarWindow = createMainWindow({
    BrowserWindow,
    preloadPath: path.join(__dirname, 'preload.js'),
    display,
    uiConfig: config.uiConfig,
    windowMetrics
  });
  const avatarWindowBounds = avatarWindow.getBounds();

  const chatWindow = createChatWindow({
    BrowserWindow,
    preloadPath: path.join(__dirname, 'preload.js'),
    uiConfig: config.uiConfig,
    avatarBounds: avatarWindowBounds,
    display
  });
  const bubbleWindow = createBubbleWindow({
    BrowserWindow,
    preloadPath: path.join(__dirname, 'preload.js'),
    avatarBounds: avatarWindowBounds,
    display
  });
  await chatWindow.loadFile(path.join(config.projectRoot, 'apps', 'desktop-live2d', 'renderer', 'chat.html'));
  await bubbleWindow.loadFile(path.join(config.projectRoot, 'apps', 'desktop-live2d', 'renderer', 'bubble.html'));

  const chatPanelConfig = config.uiConfig?.chat?.panel || {};
  const chatState = {
    enabled: Boolean(chatPanelConfig.enabled),
    visible: Boolean(chatPanelConfig.enabled && chatPanelConfig.defaultVisible),
    maxMessages: toPositiveInt(chatPanelConfig.maxMessages, 200),
    inputEnabled: chatPanelConfig.inputEnabled !== false,
    messages: []
  };
  const bubbleState = {
    visible: false,
    text: '',
    width: 320,
    height: 160
  };
  let bubbleHideTimer = null;
  const fitWindowConfig = {
    enabled: true,
    minWidth: 180,
    minHeight: 260,
    maxWidth: 900,
    maxHeight: 1400,
    paddingX: 18,
    paddingTop: 18,
    paddingBottom: 14
  };

  function buildChatStateSnapshot() {
    return {
      enabled: chatState.enabled,
      visible: chatState.visible,
      inputEnabled: chatState.inputEnabled,
      maxMessages: chatState.maxMessages,
      messages: chatState.messages
    };
  }

  function syncChatStateToRenderer() {
    if (chatWindow.isDestroyed()) {
      return;
    }
    chatWindow.webContents.send(CHANNELS.chatStateSync, buildChatStateSnapshot());
  }

  function syncBubbleStateToRenderer() {
    if (bubbleWindow.isDestroyed()) {
      return;
    }
    bubbleWindow.webContents.send(CHANNELS.bubbleStateSync, {
      visible: bubbleState.visible,
      text: bubbleState.text
    });
  }

  function setWindowBoundsIfChanged(windowRef, nextBounds) {
    if (!windowRef || windowRef.isDestroyed?.() || !nextBounds) {
      return;
    }
    const current = windowRef.getBounds();
    if (
      current.x === nextBounds.x
      && current.y === nextBounds.y
      && current.width === nextBounds.width
      && current.height === nextBounds.height
    ) {
      return;
    }
    windowRef.setBounds(nextBounds, false);
  }

  function applyAvatarFitBounds(modelBounds) {
    if (!fitWindowConfig.enabled || avatarWindow.isDestroyed()) {
      return;
    }
    const nextBounds = computeFittedAvatarWindowBounds({
      windowBounds: avatarWindow.getBounds(),
      modelBounds,
      display,
      minWidth: fitWindowConfig.minWidth,
      minHeight: fitWindowConfig.minHeight,
      maxWidth: fitWindowConfig.maxWidth,
      maxHeight: fitWindowConfig.maxHeight,
      paddingX: fitWindowConfig.paddingX,
      paddingTop: fitWindowConfig.paddingTop,
      paddingBottom: fitWindowConfig.paddingBottom
    });
    if (!nextBounds) {
      return;
    }
    const current = avatarWindow.getBounds();
    const unchanged = Math.abs(current.x - nextBounds.x) < 2
      && Math.abs(current.y - nextBounds.y) < 2
      && Math.abs(current.width - nextBounds.width) < 3
      && Math.abs(current.height - nextBounds.height) < 3;
    if (unchanged) {
      return;
    }
    avatarWindow.setBounds(nextBounds, false);
  }

  function updateChatWindowBounds() {
    if (!chatState.enabled || chatWindow.isDestroyed()) {
      return;
    }
    const chatBounds = computeChatWindowBounds({
      avatarBounds: avatarWindow.getBounds(),
      chatWidth: toPositiveInt(chatPanelConfig.width, 320),
      chatHeight: toPositiveInt(chatPanelConfig.height, 220),
      display
    });
    setWindowBoundsIfChanged(chatWindow, chatBounds);
  }

  function updateBubbleWindowBounds() {
    if (!bubbleState.visible || bubbleWindow.isDestroyed()) {
      return;
    }
    const workArea = display?.workArea;
    const maxBubbleWidth = Math.max(120, (Number(workArea?.width) || 520) - 32);
    const maxBubbleHeight = Math.max(44, (Number(workArea?.height) || 1000) - 32);
    const bubbleWidth = clamp(Number(bubbleState.width) || 320, 120, maxBubbleWidth);
    const bubbleHeight = clamp(Number(bubbleState.height) || 160, 44, maxBubbleHeight);
    const bubbleBounds = computeBubbleWindowBounds({
      avatarBounds: avatarWindow.getBounds(),
      bubbleWidth,
      bubbleHeight,
      display
    });
    setWindowBoundsIfChanged(bubbleWindow, bubbleBounds);
  }

  function appendChatMessage(params, fallbackRole = 'assistant') {
    const text = String(params?.text || '').trim();
    if (!text) {
      return { ok: false, count: chatState.messages.length };
    }
    const role = String(params?.role || fallbackRole || 'assistant');
    const message = {
      role,
      text,
      timestamp: Number.isFinite(Number(params?.timestamp)) ? Number(params.timestamp) : Date.now()
    };
    chatState.messages = chatState.messages.concat(message);
    if (chatState.messages.length > chatState.maxMessages) {
      chatState.messages = chatState.messages.slice(chatState.messages.length - chatState.maxMessages);
    }
    syncChatStateToRenderer();
    return { ok: true, count: chatState.messages.length };
  }

  function clearChatMessages() {
    chatState.messages = [];
    syncChatStateToRenderer();
    return { ok: true, count: 0 };
  }

  function setChatPanelVisible(visible) {
    if (!chatState.enabled) {
      return { ok: false, visible: false };
    }
    chatState.visible = Boolean(visible);
    syncChatStateToRenderer();
    if (chatState.visible) {
      updateChatWindowBounds();
      chatWindow.show();
    } else {
      chatWindow.hide();
    }
    return { ok: true, visible: chatState.visible };
  }

  function toggleChatPanelVisible() {
    return setChatPanelVisible(!chatState.visible);
  }

  function hideBubbleWindow() {
    if (bubbleHideTimer) {
      clearTimeout(bubbleHideTimer);
      bubbleHideTimer = null;
    }
    bubbleState.visible = false;
    bubbleState.text = '';
    syncBubbleStateToRenderer();
    if (!bubbleWindow.isDestroyed()) {
      bubbleWindow.hide();
    }
  }

  function showBubble(params) {
    const text = String(params?.text || '').trim();
    if (!text) {
      return { ok: false };
    }
    const durationMs = Number.isFinite(Number(params?.durationMs))
      ? Math.max(500, Math.min(30000, Number(params.durationMs)))
      : 5000;
    bubbleState.visible = true;
    bubbleState.text = text;
    const roughLines = Math.max(
      1,
      text.split('\n').length + Math.floor(text.length / 20)
    );
    const workArea = display?.workArea;
    const maxBubbleHeight = Math.max(44, (Number(workArea?.height) || 1000) - 32);
    bubbleState.width = 320;
    bubbleState.height = clamp(44 + roughLines * 24, 60, maxBubbleHeight);
    updateBubbleWindowBounds();
    syncBubbleStateToRenderer();
    bubbleWindow.showInactive();

    if (bubbleHideTimer) {
      clearTimeout(bubbleHideTimer);
    }
    bubbleHideTimer = setTimeout(() => {
      hideBubbleWindow();
    }, durationMs);
    return { ok: true, expiresAt: Date.now() + durationMs };
  }

  function hidePetWindows() {
    if (!avatarWindow.isDestroyed()) {
      avatarWindow.hide();
    }
    if (!chatWindow.isDestroyed()) {
      chatWindow.hide();
    }
    hideBubbleWindow();
  }

  function showPetWindows() {
    if (avatarWindow.isDestroyed()) {
      return;
    }
    avatarWindow.show();
    avatarWindow.focus();
    if (chatState.visible && !chatWindow.isDestroyed()) {
      updateChatWindowBounds();
      chatWindow.show();
    }
    updateBubbleWindowBounds();
  }

  avatarWindow.on('move', () => {
    updateChatWindowBounds();
    updateBubbleWindowBounds();
  });
  avatarWindow.on('resize', () => {
    updateChatWindowBounds();
    updateBubbleWindowBounds();
  });
  avatarWindow.on('hide', () => {
    if (!chatWindow.isDestroyed()) {
      chatWindow.hide();
    }
    hideBubbleWindow();
  });
  avatarWindow.on('show', () => {
    if (chatState.visible && !chatWindow.isDestroyed()) {
      updateChatWindowBounds();
      chatWindow.show();
    }
  });

  const avatarUiConfig = {
    ...config.uiConfig,
    chat: {
      ...(config.uiConfig?.chat || {}),
      panel: {
        ...(config.uiConfig?.chat?.panel || {}),
        enabled: false
      }
    }
  };

  ipcMain.handle(CHANNELS.getRuntimeConfig, (event) => ({
    modelRelativePath: config.modelRelativePath,
    modelName: modelValidation.modelName,
    gatewayUrl: config.gatewayUrl,
    uiConfig: event?.sender === avatarWindow.webContents ? avatarUiConfig : config.uiConfig
  }));
  const windowDragListener = createWindowDragListener({ BrowserWindow });
  ipcMain.on(CHANNELS.windowDrag, windowDragListener);
  const chatPanelVisibilityListener = createChatPanelVisibilityListener({ window: avatarWindow, windowMetrics });
  ipcMain.on(CHANNELS.chatPanelVisibility, chatPanelVisibilityListener);
  const chatPanelToggleListener = createChatPanelToggleListener({
    window: avatarWindow,
    onToggle: () => {
      toggleChatPanelVisible();
    }
  });
  ipcMain.on(CHANNELS.chatPanelToggle, chatPanelToggleListener);
  const modelBoundsListener = createModelBoundsListener({
    window: avatarWindow,
    onModelBounds: (modelBounds) => {
      applyAvatarFitBounds(modelBounds);
    }
  });
  ipcMain.on(CHANNELS.modelBoundsUpdate, modelBoundsListener);
  const bubbleMetricsListener = createBubbleMetricsListener({
    window: bubbleWindow,
    onBubbleMetrics: (metrics) => {
      const workArea = display?.workArea;
      const maxBubbleWidth = Math.max(120, (Number(workArea?.width) || 520) - 32);
      const maxBubbleHeight = Math.max(44, (Number(workArea?.height) || 1000) - 32);
      bubbleState.width = clamp(metrics.width + 20, 120, maxBubbleWidth);
      bubbleState.height = clamp(metrics.height + 24, 44, maxBubbleHeight);
      if (bubbleState.visible) {
        updateBubbleWindowBounds();
      }
    }
  });
  ipcMain.on(CHANNELS.bubbleMetricsUpdate, bubbleMetricsListener);

  const windowControlListener = createWindowControlListener({
    windows: [avatarWindow, chatWindow],
    onHide: hidePetWindows,
    onClosePet: hidePetWindows
  });
  ipcMain.on(CHANNELS.windowControl, windowControlListener);

  const gatewayRuntimeClient = new GatewayRuntimeClient({
    gatewayUrl: config.gatewayUrl,
    sessionId: 'desktop-live2d-chat',
    logger,
    onNotification: (desktopEvent) => {
      rpcServerRef?.notify({
        method: 'desktop.event',
        params: desktopEvent
      });

      // handle voice playback for electron mode
      if (desktopEvent.type === 'runtime.event') {
        const eventName = desktopEvent.data?.event || desktopEvent.data?.payload?.event;
        if (eventName === 'voice.playback.electron') {
          const payload = desktopEvent.data?.payload || desktopEvent.data;
          const audioRef = payload?.audio_ref || payload?.audioRef;
          if (audioRef && !avatarWindow.isDestroyed()) {
            avatarWindow.webContents.send('desktop:voice:play', {
              audioRef,
              format: payload?.format || 'ogg',
              gatewayUrl: config.gatewayUrl
            });
          }
        }
        return;
      }

      if (desktopEvent.type !== 'runtime.final') {
        return;
      }

      const output = String(desktopEvent.data?.output || '').trim();
      if (!output) {
        return;
      }
      appendChatMessage({
        role: 'assistant',
        text: output,
        timestamp: Date.now()
      }, 'assistant');
      showBubble({
        text: output,
        durationMs: 5000
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

  const chatInputListener = createChatInputListener({
    logger,
    onChatInput: (payload) => {
      if (typeof onChatInput === 'function') {
        onChatInput(payload);
      }
      appendChatMessage({
        role: 'user',
        text: payload.text,
        timestamp: payload.timestamp
      }, 'user');

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
          clearChatMessages();
          appendChatMessage({
            role: 'system',
            text: `[session] switched to ${sessionId}`,
            timestamp: Date.now()
          }, 'system');
          showBubble({
            text: 'New session created',
            durationMs: 2200
          });
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
        appendChatMessage({
          role: 'system',
          text: `[runtime error] ${err?.message || String(err || 'unknown runtime error')}`,
          timestamp: Date.now()
        }, 'system');
      });
    }
  });
  ipcMain.on(CHANNELS.chatInputSubmit, chatInputListener);

  const rendererReadyPromise = waitForRendererReady({ ipcMain, timeoutMs: 15000 });

  await avatarWindow.loadFile(path.join(config.projectRoot, 'apps', 'desktop-live2d', 'renderer', 'index.html'));
  await rendererReadyPromise;
  syncChatStateToRenderer();
  syncBubbleStateToRenderer();
  if (chatState.visible) {
    updateChatWindowBounds();
    chatWindow.show();
  }

  const bridge = new IpcRpcBridge({
    ipcMain,
    webContents: avatarWindow.webContents,
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
      rendererTimeoutMs: config.rendererTimeoutMs,
      setChatPanelVisible,
      appendChatMessage,
      clearChatMessages,
      showBubble,
      avatarWindow
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
    ipcMain.off(CHANNELS.chatPanelVisibility, chatPanelVisibilityListener);
    ipcMain.off(CHANNELS.chatPanelToggle, chatPanelToggleListener);
    ipcMain.off(CHANNELS.modelBoundsUpdate, modelBoundsListener);
    ipcMain.off(CHANNELS.bubbleMetricsUpdate, bubbleMetricsListener);
    ipcMain.off(CHANNELS.windowControl, windowControlListener);
    ipcMain.off(CHANNELS.chatInputSubmit, chatInputListener);

    if (rpcServerRef) {
      await rpcServerRef.stop();
      rpcServerRef = null;
    }
    if (ipcBridgeRef) {
      ipcBridgeRef.dispose();
      ipcBridgeRef = null;
    }

    hideBubbleWindow();
    if (!bubbleWindow.isDestroyed()) {
      bubbleWindow.destroy();
    }
    if (!chatWindow.isDestroyed()) {
      chatWindow.destroy();
    }
    if (!avatarWindow.isDestroyed()) {
      avatarWindow.destroy();
    }

    await gatewaySupervisor.stop();
  }

  return {
    config,
    summary,
    window: avatarWindow,
    avatarWindow,
    chatWindow,
    bubbleWindow,
    showPetWindows,
    hidePetWindows,
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

async function handleDesktopRpcRequest({
  request,
  bridge,
  rendererTimeoutMs,
  setChatPanelVisible = null,
  appendChatMessage = null,
  clearChatMessages = null,
  showBubble = null,
  avatarWindow = null
}) {
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

  if (request.method === 'voice.play.test') {
    const audioRef = String(request.params?.audioRef || '');
    const gatewayUrl = String(request.params?.gatewayUrl || 'http://127.0.0.1:3000');
    if (!audioRef) return { ok: false, error: 'audioRef required' };
    if (!avatarWindow.isDestroyed()) {
      avatarWindow.webContents.send('desktop:voice:play', { audioRef, format: 'ogg', gatewayUrl });
      return { ok: true, audioRef };
    }
    return { ok: false, error: 'avatarWindow not available' };
  }

  if (request.method === 'chat.show' || request.method === 'chat.bubble.show') {
    if (typeof showBubble !== 'function') {
      return { ok: false };
    }
    return showBubble(request.params || {});
  }

  if (request.method === 'chat.panel.show') {
    return typeof setChatPanelVisible === 'function'
      ? setChatPanelVisible(true)
      : { ok: false, visible: false };
  }

  if (request.method === 'chat.panel.hide') {
    return typeof setChatPanelVisible === 'function'
      ? setChatPanelVisible(false)
      : { ok: false, visible: false };
  }

  if (request.method === 'chat.panel.append') {
    return typeof appendChatMessage === 'function'
      ? appendChatMessage(request.params || {}, 'assistant')
      : { ok: false, count: 0 };
  }

  if (request.method === 'chat.panel.clear') {
    return typeof clearChatMessages === 'function'
      ? clearChatMessages()
      : { ok: false, count: 0 };
  }

  return bridge.invoke({
    method: request.method,
    params: request.params,
    timeoutMs: rendererTimeoutMs
  });
}

function createMainWindow({ BrowserWindow, preloadPath, display, uiConfig, windowMetrics }) {
  const windowConfig = uiConfig?.window || {};
  const initialSize = {
    width: windowMetrics?.expandedWidth || 320,
    height: windowMetrics?.expandedHeight || 500
  };
  const placement = windowConfig.placement || {};
  const windowBounds = computeWindowBounds({
    width: initialSize.width,
    height: initialSize.height,
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
    width: initialSize.width,
    height: initialSize.height,
    x: windowBounds.x,
    y: windowBounds.y,
    minWidth: windowMetrics?.minWidth || 220,
    minHeight: windowMetrics?.minHeight || 320,
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

function createChatWindow({ BrowserWindow, preloadPath, uiConfig, avatarBounds, display }) {
  const panelConfig = uiConfig?.chat?.panel || {};
  const width = toPositiveInt(panelConfig.width, 320);
  const height = toPositiveInt(panelConfig.height, 220);
  const bounds = computeChatWindowBounds({
    avatarBounds,
    chatWidth: width,
    chatHeight: height,
    display
  });

  return new BrowserWindow({
    width,
    height,
    x: bounds.x,
    y: bounds.y,
    minWidth: Math.max(260, Math.min(width, width)),
    minHeight: Math.max(180, Math.min(height, height)),
    frame: false,
    transparent: true,
    hasShadow: true,
    alwaysOnTop: true,
    show: false,
    movable: false,
    backgroundColor: '#00000000',
    webPreferences: {
      preload: preloadPath,
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false
    }
  });
}

function createBubbleWindow({ BrowserWindow, preloadPath, avatarBounds, display }) {
  const bounds = computeBubbleWindowBounds({
    avatarBounds,
    bubbleWidth: 320,
    bubbleHeight: 160,
    display
  });

  const bubbleWindow = new BrowserWindow({
    width: bounds.width,
    height: bounds.height,
    x: bounds.x,
    y: bounds.y,
    frame: false,
    transparent: true,
    hasShadow: false,
    alwaysOnTop: true,
    show: false,
    focusable: false,
    resizable: false,
    movable: false,
    backgroundColor: '#00000000',
    webPreferences: {
      preload: preloadPath,
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false
    }
  });
  bubbleWindow.setIgnoreMouseEvents(true, { forward: true });
  return bubbleWindow;
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

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

function computeFittedAvatarWindowBounds({
  windowBounds,
  modelBounds,
  display,
  minWidth = 180,
  minHeight = 260,
  maxWidth = 900,
  maxHeight = 1400,
  paddingX = 18,
  paddingTop = 18,
  paddingBottom = 14,
  margin = 8
}) {
  if (!windowBounds || !modelBounds) {
    return null;
  }

  const workArea = display?.workArea;
  const desiredWidth = Math.round(modelBounds.width + paddingX * 2);
  const desiredHeight = Math.round(modelBounds.height + paddingTop + paddingBottom);
  const width = clamp(desiredWidth, minWidth, maxWidth);
  const height = clamp(desiredHeight, minHeight, maxHeight);

  let x = Math.round(windowBounds.x + modelBounds.x - paddingX - (width - desiredWidth) / 2);
  let y = Math.round(windowBounds.y + modelBounds.y - paddingTop - (height - desiredHeight) / 2);

  if (workArea && typeof workArea === 'object') {
    const maxAllowedWidth = Math.max(minWidth, workArea.width - margin * 2);
    const maxAllowedHeight = Math.max(minHeight, workArea.height - margin * 2);
    const safeWidth = Math.min(width, maxAllowedWidth);
    const safeHeight = Math.min(height, maxAllowedHeight);
    const minX = workArea.x + margin;
    const minY = workArea.y + margin;
    const maxX = workArea.x + workArea.width - safeWidth - margin;
    const maxY = workArea.y + workArea.height - safeHeight - margin;
    x = clamp(x, minX, maxX);
    y = clamp(y, minY, maxY);
    return { x: Math.round(x), y: Math.round(y), width: Math.round(safeWidth), height: Math.round(safeHeight) };
  }

  return { x: Math.round(x), y: Math.round(y), width: Math.round(width), height: Math.round(height) };
}

function computeChatWindowBounds({
  avatarBounds,
  chatWidth,
  chatHeight,
  display,
  gap = 12,
  margin = 16
}) {
  const workArea = display?.workArea;
  if (!workArea || !avatarBounds) {
    return { x: undefined, y: undefined, width: chatWidth, height: chatHeight };
  }

  const workLeft = workArea.x + margin;
  const workTop = workArea.y + margin;
  const workRight = workArea.x + workArea.width - margin;
  const workBottom = workArea.y + workArea.height - margin;

  let x = avatarBounds.x - chatWidth - gap;
  if (x < workLeft) {
    x = avatarBounds.x + avatarBounds.width + gap;
  }
  x = clamp(x, workLeft, workRight - chatWidth);

  const preferredY = avatarBounds.y + avatarBounds.height - chatHeight;
  const y = clamp(preferredY, workTop, workBottom - chatHeight);

  return {
    x: Math.round(x),
    y: Math.round(y),
    width: chatWidth,
    height: chatHeight
  };
}

function computeBubbleWindowBounds({
  avatarBounds,
  bubbleWidth,
  bubbleHeight,
  display,
  gap = 10,
  margin = 16
}) {
  const workArea = display?.workArea;
  if (!workArea || !avatarBounds) {
    return { x: undefined, y: undefined, width: bubbleWidth, height: bubbleHeight };
  }

  const workLeft = workArea.x + margin;
  const workTop = workArea.y + margin;
  const workRight = workArea.x + workArea.width - margin;
  const workBottom = workArea.y + workArea.height - margin;

  const avatarCenterX = avatarBounds.x + avatarBounds.width / 2;
  const preferredX = avatarCenterX - bubbleWidth / 2;
  let x = preferredX;
  x = clamp(x, workLeft, workRight - bubbleWidth);

  const preferredY = avatarBounds.y - bubbleHeight - gap;
  const y = clamp(preferredY, workTop, workBottom - bubbleHeight);

  return {
    x: Math.round(x),
    y: Math.round(y),
    width: bubbleWidth,
    height: bubbleHeight
  };
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
  resolveWindowMetrics,
  resolveWindowSizeForChatPanel,
  resizeWindowKeepingBottomRight,
  writeRuntimeSummary,
  normalizeChatInputPayload,
  normalizeWindowDragPayload,
  normalizeWindowControlPayload,
  normalizeChatPanelVisibilityPayload,
  normalizeChatPanelTogglePayload,
  normalizeModelBoundsPayload,
  normalizeBubbleMetricsPayload,
  createWindowDragListener,
  createWindowControlListener,
  createChatPanelVisibilityListener,
  createChatPanelToggleListener,
  createModelBoundsListener,
  createBubbleMetricsListener,
  createChatInputListener,
  handleDesktopRpcRequest,
  isNewSessionCommand,
  createChatWindow,
  createBubbleWindow,
  computeChatWindowBounds,
  computeBubbleWindowBounds,
  computeFittedAvatarWindowBounds
};
