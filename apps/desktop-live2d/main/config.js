const fs = require('node:fs');
const path = require('node:path');
const { randomUUID } = require('node:crypto');

const {
  PROJECT_ROOT,
  MODEL_ASSET_RELATIVE_DIR,
  MODEL_JSON_NAME,
  RUNTIME_SUMMARY_RELATIVE_PATH,
  BACKUP_ROOT_RELATIVE_PATH,
  DEFAULT_RPC_PORT,
  DEFAULT_RENDERER_TIMEOUT_MS
} = require('./constants');

const DEFAULT_UI_CONFIG = Object.freeze({
  window: {
    width: 460,
    height: 620,
    minWidth: 360,
    minHeight: 480,
    compactWhenChatHidden: true,
    compactWidth: 300,
    compactHeight: 560,
    placement: {
      anchor: 'bottom-right',
      marginRight: 18,
      marginBottom: 18
    }
  },
  render: {
    resolutionScale: 1,
    maxDevicePixelRatio: 2,
    antialias: false
  },
  layout: {
    targetWidthRatio: 0.68,
    targetHeightRatio: 0.8,
    horizontalAlign: 'right',
    rightOffsetRatio: 0.97,
    bottomOffsetRatio: 0.97,
    marginX: 22,
    marginY: 12,
    pivotXRatio: 0.72,
    pivotYRatio: 0.97,
    scaleMultiplier: 0.9,
    minScale: 0.04,
    maxScale: 2
  },
  chat: {
    panel: {
      enabled: true,
      defaultVisible: false,
      width: 320,
      height: 220,
      maxMessages: 200,
      inputEnabled: true
    },
    bubble: {
      mirrorToPanel: false
    }
  }
});

function toPositiveInt(value, fallback) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed <= 0) return fallback;
  return Math.floor(parsed);
}

function resolveDesktopLive2dConfig({ env = process.env, projectRoot = PROJECT_ROOT } = {}) {
  const gatewayPort = toPositiveInt(env.PORT, 3000);
  const gatewayUrl = env.DESKTOP_GATEWAY_URL || `http://127.0.0.1:${gatewayPort}`;
  const rpcPort = toPositiveInt(env.DESKTOP_LIVE2D_RPC_PORT, DEFAULT_RPC_PORT);
  const rpcToken = env.DESKTOP_LIVE2D_RPC_TOKEN || randomUUID();
  const rendererTimeoutMs = toPositiveInt(env.DESKTOP_LIVE2D_RENDERER_TIMEOUT_MS, DEFAULT_RENDERER_TIMEOUT_MS);
  const uiConfigPath = path.resolve(projectRoot, env.DESKTOP_LIVE2D_CONFIG_PATH || path.join('config', 'desktop-live2d.json'));
  const uiConfig = loadDesktopLive2dUiConfig(uiConfigPath);

  return {
    projectRoot,
    modelDir: path.join(projectRoot, MODEL_ASSET_RELATIVE_DIR),
    modelJsonName: MODEL_JSON_NAME,
    modelRelativePath: toPortablePath(path.join('..', '..', '..', MODEL_ASSET_RELATIVE_DIR, MODEL_JSON_NAME)),
    runtimeSummaryPath: path.join(projectRoot, RUNTIME_SUMMARY_RELATIVE_PATH),
    importBackupRoot: path.join(projectRoot, BACKUP_ROOT_RELATIVE_PATH),
    rpcHost: '127.0.0.1',
    rpcPort,
    rpcToken,
    rendererTimeoutMs,
    uiConfigPath,
    uiConfig,
    gatewayExternal: env.DESKTOP_EXTERNAL_GATEWAY === '1',
    gatewayHost: env.HOST || '127.0.0.1',
    gatewayPort,
    gatewayUrl
  };
}

function loadDesktopLive2dUiConfig(configPath) {
  if (!fs.existsSync(configPath)) {
    return JSON.parse(JSON.stringify(DEFAULT_UI_CONFIG));
  }

  const raw = JSON.parse(fs.readFileSync(configPath, 'utf8'));
  return normalizeUiConfig(raw);
}

function normalizeUiConfig(raw) {
  const merged = {
    window: {
      ...DEFAULT_UI_CONFIG.window,
      ...(raw?.window || {}),
      placement: {
        ...DEFAULT_UI_CONFIG.window.placement,
        ...(raw?.window?.placement || {})
      }
    },
    render: {
      ...DEFAULT_UI_CONFIG.render,
      ...(raw?.render || {})
    },
    layout: {
      ...DEFAULT_UI_CONFIG.layout,
      ...(raw?.layout || {})
    },
    chat: {
      panel: {
        ...DEFAULT_UI_CONFIG.chat.panel,
        ...(raw?.chat?.panel || {})
      },
      bubble: {
        ...DEFAULT_UI_CONFIG.chat.bubble,
        ...(raw?.chat?.bubble || {})
      }
    }
  };

  merged.window.width = toPositiveInt(merged.window.width, DEFAULT_UI_CONFIG.window.width);
  merged.window.height = toPositiveInt(merged.window.height, DEFAULT_UI_CONFIG.window.height);
  merged.window.minWidth = toPositiveInt(merged.window.minWidth, DEFAULT_UI_CONFIG.window.minWidth);
  merged.window.minHeight = toPositiveInt(merged.window.minHeight, DEFAULT_UI_CONFIG.window.minHeight);
  merged.window.compactWhenChatHidden = merged.window.compactWhenChatHidden !== false;
  merged.window.compactWidth = toPositiveInt(merged.window.compactWidth, DEFAULT_UI_CONFIG.window.compactWidth);
  merged.window.compactHeight = toPositiveInt(merged.window.compactHeight, DEFAULT_UI_CONFIG.window.compactHeight);
  merged.window.placement.anchor = String(merged.window.placement.anchor || 'bottom-right');
  merged.window.placement.marginRight = toPositiveInt(merged.window.placement.marginRight, DEFAULT_UI_CONFIG.window.placement.marginRight);
  merged.window.placement.marginBottom = toPositiveInt(merged.window.placement.marginBottom, DEFAULT_UI_CONFIG.window.placement.marginBottom);

  merged.render.resolutionScale = toFiniteNumber(merged.render.resolutionScale, DEFAULT_UI_CONFIG.render.resolutionScale);
  merged.render.maxDevicePixelRatio = toFiniteNumber(merged.render.maxDevicePixelRatio, DEFAULT_UI_CONFIG.render.maxDevicePixelRatio);
  merged.render.antialias = Boolean(merged.render.antialias);

  const layoutDefaults = DEFAULT_UI_CONFIG.layout;
  for (const key of Object.keys(layoutDefaults)) {
    if (key === 'horizontalAlign') {
      merged.layout[key] = String(merged.layout[key] || layoutDefaults[key]);
      continue;
    }
    merged.layout[key] = toFiniteNumber(merged.layout[key], layoutDefaults[key]);
  }

  merged.chat.panel.enabled = Boolean(merged.chat.panel.enabled);
  merged.chat.panel.defaultVisible = Boolean(merged.chat.panel.defaultVisible);
  merged.chat.panel.width = toPositiveInt(merged.chat.panel.width, DEFAULT_UI_CONFIG.chat.panel.width);
  merged.chat.panel.height = toPositiveInt(merged.chat.panel.height, DEFAULT_UI_CONFIG.chat.panel.height);
  merged.chat.panel.maxMessages = toPositiveInt(merged.chat.panel.maxMessages, DEFAULT_UI_CONFIG.chat.panel.maxMessages);
  merged.chat.panel.inputEnabled = Boolean(merged.chat.panel.inputEnabled);
  merged.chat.bubble.mirrorToPanel = Boolean(merged.chat.bubble.mirrorToPanel);

  return merged;
}

function toFiniteNumber(value, fallback) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function toPortablePath(filePath) {
  return filePath.split(path.sep).join('/');
}

module.exports = {
  resolveDesktopLive2dConfig,
  loadDesktopLive2dUiConfig,
  normalizeUiConfig,
  toPositiveInt,
  DEFAULT_UI_CONFIG
};
