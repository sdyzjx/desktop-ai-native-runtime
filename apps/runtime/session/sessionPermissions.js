const SESSION_PERMISSION_LEVELS = Object.freeze(['low', 'medium', 'high']);
const DEFAULT_SESSION_PERMISSION_LEVEL = 'medium';

function isSessionPermissionLevel(value) {
  return typeof value === 'string' && SESSION_PERMISSION_LEVELS.includes(value);
}

function normalizeSessionPermissionLevel(value, { fallback = DEFAULT_SESSION_PERMISSION_LEVEL } = {}) {
  if (isSessionPermissionLevel(value)) return value;
  return fallback;
}

function buildDefaultSessionSettings() {
  return {
    permission_level: DEFAULT_SESSION_PERMISSION_LEVEL
  };
}

function normalizeSessionSettings(settings = {}) {
  return {
    permission_level: normalizeSessionPermissionLevel(settings.permission_level)
  };
}

function mergeSessionSettings(currentSettings = {}, patch = {}) {
  const current = normalizeSessionSettings(currentSettings);
  const next = {
    ...current
  };

  if (Object.prototype.hasOwnProperty.call(patch, 'permission_level')) {
    next.permission_level = normalizeSessionPermissionLevel(patch.permission_level, { fallback: current.permission_level });
  }

  return next;
}

module.exports = {
  SESSION_PERMISSION_LEVELS,
  DEFAULT_SESSION_PERMISSION_LEVEL,
  isSessionPermissionLevel,
  normalizeSessionPermissionLevel,
  buildDefaultSessionSettings,
  normalizeSessionSettings,
  mergeSessionSettings
};
