const fs = require('node:fs');
const path = require('node:path');
const { randomUUID } = require('node:crypto');
const { getRuntimePaths } = require('../../runtime/skills/runtimePaths');

const {
  PROJECT_ROOT,
  MODEL_ASSET_RELATIVE_DIR,
  MODEL_JSON_NAME,
  DEFAULT_RPC_PORT,
  DEFAULT_RENDERER_TIMEOUT_MS
} = require('./constants');

const DEFAULT_UI_CONFIG = Object.freeze({
  window: {
    width: 320,
    height: 500,
    minWidth: 180,
    minHeight: 260,
    compactWhenChatHidden: false,
    compactWidth: 260,
    compactHeight: 500,
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
    maxScale: 2,
    lockScaleOnResize: true,
    lockPositionOnResize: true
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
  },
  actionQueue: {
    maxQueueSize: 120,
    overflowPolicy: 'drop_oldest',
    idleFallbackEnabled: true,
    idleAction: {
      type: 'motion',
      name: 'Idle',
      args: {
        group: 'Idle',
        index: 0
      }
    }
  }
});

function toPositiveInt(value, fallback) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed <= 0) return fallback;
  return Math.floor(parsed);
}

function resolveDesktopLive2dConfig({ env = process.env, projectRoot = PROJECT_ROOT } = {}) {
  const runtimePaths = getRuntimePaths({ env });
  const gatewayPort = toPositiveInt(env.PORT, 3000);
  const gatewayUrl = env.DESKTOP_GATEWAY_URL || `http://127.0.0.1:${gatewayPort}`;
  const rpcPort = toPositiveInt(env.DESKTOP_LIVE2D_RPC_PORT, DEFAULT_RPC_PORT);
  const hasRpcToken = typeof env.DESKTOP_LIVE2D_RPC_TOKEN === 'string' && env.DESKTOP_LIVE2D_RPC_TOKEN.trim().length > 0;
  const rpcToken = hasRpcToken ? env.DESKTOP_LIVE2D_RPC_TOKEN : randomUUID();
  if (!hasRpcToken && env === process.env) {
    // Keep runtime live2d adapter and desktop rpc server on the same token when token is auto-generated.
    process.env.DESKTOP_LIVE2D_RPC_TOKEN = rpcToken;
  }
  const rendererTimeoutMs = toPositiveInt(env.DESKTOP_LIVE2D_RENDERER_TIMEOUT_MS, DEFAULT_RENDERER_TIMEOUT_MS);
  const uiConfigPath = path.resolve(
    env.DESKTOP_LIVE2D_CONFIG_PATH || path.join(runtimePaths.configDir, 'desktop-live2d.json')
  );
  const uiConfig = loadDesktopLive2dUiConfig(uiConfigPath, {
    templatePath: path.resolve(projectRoot, 'config', 'desktop-live2d.json')
  });

  return {
    projectRoot,
    modelDir: path.join(projectRoot, MODEL_ASSET_RELATIVE_DIR),
    modelJsonName: MODEL_JSON_NAME,
    modelRelativePath: toPortablePath(path.join('..', '..', '..', MODEL_ASSET_RELATIVE_DIR, MODEL_JSON_NAME)),
    runtimeSummaryPath: path.resolve(
      env.DESKTOP_LIVE2D_RUNTIME_SUMMARY_PATH || path.join(runtimePaths.dataDir, 'desktop-live2d', 'runtime-summary.json')
    ),
    importBackupRoot: path.resolve(
      env.DESKTOP_LIVE2D_BACKUP_ROOT || path.join(runtimePaths.dataDir, 'backups', 'live2d')
    ),
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

function loadDesktopLive2dUiConfig(configPath, { templatePath } = {}) {
  if (!fs.existsSync(configPath)) {
    fs.mkdirSync(path.dirname(configPath), { recursive: true });
    if (templatePath && fs.existsSync(templatePath)) {
      fs.copyFileSync(templatePath, configPath);
    }
  }

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
    },
    actionQueue: {
      ...DEFAULT_UI_CONFIG.actionQueue,
      ...(raw?.actionQueue || {}),
      idleAction: {
        ...DEFAULT_UI_CONFIG.actionQueue.idleAction,
        ...(raw?.actionQueue?.idleAction || {}),
        args: {
          ...DEFAULT_UI_CONFIG.actionQueue.idleAction.args,
          ...(raw?.actionQueue?.idleAction?.args || {})
        }
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
    if (key === 'lockScaleOnResize' || key === 'lockPositionOnResize') {
      merged.layout[key] = merged.layout[key] !== false;
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

  merged.actionQueue.maxQueueSize = toPositiveInt(
    merged.actionQueue.maxQueueSize,
    DEFAULT_UI_CONFIG.actionQueue.maxQueueSize
  );
  const overflowPolicy = String(merged.actionQueue.overflowPolicy || '').trim().toLowerCase();
  merged.actionQueue.overflowPolicy = ['drop_oldest', 'drop_newest', 'reject'].includes(overflowPolicy)
    ? overflowPolicy
    : DEFAULT_UI_CONFIG.actionQueue.overflowPolicy;
  merged.actionQueue.idleFallbackEnabled = merged.actionQueue.idleFallbackEnabled !== false;
  merged.actionQueue.idleAction.type = String(merged.actionQueue.idleAction.type || 'motion').trim().toLowerCase() || 'motion';
  merged.actionQueue.idleAction.name = String(merged.actionQueue.idleAction.name || '').trim()
    || DEFAULT_UI_CONFIG.actionQueue.idleAction.name;
  merged.actionQueue.idleAction.args = (
    merged.actionQueue.idleAction.args && typeof merged.actionQueue.idleAction.args === 'object' && !Array.isArray(merged.actionQueue.idleAction.args)
      ? merged.actionQueue.idleAction.args
      : {}
  );
  if (merged.actionQueue.idleAction.type === 'motion') {
    merged.actionQueue.idleAction.args.group = String(
      merged.actionQueue.idleAction.args.group || merged.actionQueue.idleAction.name || 'Idle'
    ).trim() || 'Idle';
    if (Object.prototype.hasOwnProperty.call(merged.actionQueue.idleAction.args, 'index')) {
      const parsed = Number(merged.actionQueue.idleAction.args.index);
      if (Number.isInteger(parsed) && parsed >= 0) {
        merged.actionQueue.idleAction.args.index = parsed;
      } else {
        delete merged.actionQueue.idleAction.args.index;
      }
    }
  } else if (merged.actionQueue.idleAction.type === 'expression') {
    merged.actionQueue.idleAction.args = {};
  }

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
