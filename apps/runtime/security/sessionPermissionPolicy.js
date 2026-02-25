const { normalizeSessionPermissionLevel } = require('../session/sessionPermissions');

const LOW_SHELL_BINS = Object.freeze([
  'pwd',
  'ls',
  'cat',
  'head',
  'tail',
  'grep',
  'find',
  'wc',
  'stat',
  'mkdir',
  'touch',
  'cp',
  'mv',
  'rm'
]);

const MEDIUM_EXTRA_SHELL_BINS = Object.freeze([
  'echo',
  'curl',
  'neofetch',
  'uname',
  'whoami',
  'date',
  'env',
  'which'
]);

function getPermissionLevel(level) {
  return normalizeSessionPermissionLevel(level);
}

function canReadLongTermMemory(level) {
  return getPermissionLevel(level) !== 'low';
}

function canWriteLongTermMemory(level) {
  return getPermissionLevel(level) === 'high';
}

function isToolAllowedForPermission(toolName, level) {
  const permissionLevel = getPermissionLevel(level);

  if (toolName === 'persona.update_profile') {
    return true;
  }

  if (toolName === 'memory_write') {
    return permissionLevel === 'high';
  }

  if (toolName === 'memory_search') {
    return permissionLevel !== 'low';
  }

  return true;
}

function getShellPermissionProfile(level) {
  const permissionLevel = getPermissionLevel(level);
  if (permissionLevel === 'high') {
    return {
      level: permissionLevel,
      allowBins: null
    };
  }

  if (permissionLevel === 'medium') {
    return {
      level: permissionLevel,
      allowBins: new Set([...LOW_SHELL_BINS, ...MEDIUM_EXTRA_SHELL_BINS])
    };
  }

  return {
    level: permissionLevel,
    allowBins: new Set(LOW_SHELL_BINS)
  };
}

module.exports = {
  LOW_SHELL_BINS,
  MEDIUM_EXTRA_SHELL_BINS,
  canReadLongTermMemory,
  canWriteLongTermMemory,
  isToolAllowedForPermission,
  getShellPermissionProfile
};
