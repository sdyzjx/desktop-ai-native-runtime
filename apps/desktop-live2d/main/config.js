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
    gatewayExternal: env.DESKTOP_EXTERNAL_GATEWAY === '1',
    gatewayHost: env.HOST || '127.0.0.1',
    gatewayPort,
    gatewayUrl
  };
}

function toPortablePath(filePath) {
  return filePath.split(path.sep).join('/');
}

module.exports = {
  resolveDesktopLive2dConfig,
  toPositiveInt
};
