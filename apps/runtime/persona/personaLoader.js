const fs = require('fs');
const os = require('os');
const path = require('path');

function readFileSafe(filePath) {
  try {
    return fs.readFileSync(filePath, 'utf8');
  } catch {
    return '';
  }
}

function expandHome(inputPath) {
  if (!inputPath || typeof inputPath !== 'string') return inputPath;
  if (inputPath === '~') return os.homedir();
  if (inputPath.startsWith('~/')) return path.join(os.homedir(), inputPath.slice(2));
  return inputPath;
}

function resolvePersonaRoot({ workspaceDir, config }) {
  const preferredRoot = expandHome(config?.source?.preferredRoot || '~/.openclaw/workspace');
  if (config?.source?.allowWorkspaceOverride === true && workspaceDir) {
    return workspaceDir;
  }
  return preferredRoot || workspaceDir || process.cwd();
}

function buildPersonaFiles({ workspaceDir, config }) {
  const root = resolvePersonaRoot({ workspaceDir, config });
  return {
    root,
    soulPath: path.join(root, 'SOUL.md'),
    identityPath: path.join(root, 'IDENTITY.md'),
    userPath: path.join(root, 'USER.md')
  };
}

class PersonaLoader {
  constructor({ workspaceDir } = {}) {
    this.workspaceDir = workspaceDir || process.cwd();
    this.cache = new Map();
  }

  load(config) {
    const files = buildPersonaFiles({ workspaceDir: this.workspaceDir, config });
    const out = {};

    for (const [key, filePath] of Object.entries(files)) {
      const stat = fs.existsSync(filePath) ? fs.statSync(filePath) : null;
      const cacheKey = `${key}:${filePath}`;
      const hit = this.cache.get(cacheKey);
      if (stat && hit && hit.mtimeMs === stat.mtimeMs) {
        out[key] = hit.content;
        continue;
      }

      const content = readFileSafe(filePath);
      this.cache.set(cacheKey, { mtimeMs: stat?.mtimeMs || 0, content });
      out[key] = content;
    }

    return {
      soul: out.soulPath || '',
      identity: out.identityPath || '',
      user: out.userPath || '',
      paths: files
    };
  }
}

module.exports = { PersonaLoader, buildPersonaFiles, resolvePersonaRoot, expandHome };
