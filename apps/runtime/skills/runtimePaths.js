const fs = require('fs');
const os = require('os');
const path = require('path');

const DEFAULT_HOME_ENV_KEY = 'YACHIYO_HOME';
const DEFAULT_HOME_FALLBACK = '~/yachiyo';

function expandHome(inputPath) {
  if (!inputPath || typeof inputPath !== 'string') return inputPath;
  if (inputPath === '~') return os.homedir();
  if (inputPath.startsWith('~/')) return path.join(os.homedir(), inputPath.slice(2));
  return inputPath;
}

function ensureDir(dirPath) {
  fs.mkdirSync(dirPath, { recursive: true });
  return dirPath;
}

function resolveYachiyoHome({ env = process.env, envKey = DEFAULT_HOME_ENV_KEY, defaultPath = DEFAULT_HOME_FALLBACK } = {}) {
  const fromEnv = env[envKey];
  const resolved = path.resolve(expandHome((fromEnv && fromEnv.trim()) || defaultPath));
  return resolved;
}

function getRuntimePaths(options = {}) {
  const home = resolveYachiyoHome(options);
  const skillsDir = path.join(home, 'skills');
  const dataDir = path.join(home, 'data');
  const configDir = path.join(home, 'config');
  const personaDir = path.join(home, 'persona');
  const logsDir = path.join(home, 'logs');
  const tmpDir = path.join(home, 'tmp');

  ensureDir(home);
  ensureDir(skillsDir);
  ensureDir(dataDir);
  ensureDir(configDir);
  ensureDir(personaDir);
  ensureDir(logsDir);
  ensureDir(tmpDir);

  return {
    home,
    skillsDir,
    dataDir,
    configDir,
    personaDir,
    logsDir,
    tmpDir
  };
}

module.exports = {
  DEFAULT_HOME_ENV_KEY,
  DEFAULT_HOME_FALLBACK,
  expandHome,
  resolveYachiyoHome,
  getRuntimePaths
};
