const fs = require('fs');
const path = require('path');

function readFileSafe(filePath) {
  try {
    return fs.readFileSync(filePath, 'utf8');
  } catch {
    return '';
  }
}

function buildPersonaFiles({ workspaceDir }) {
  const root = workspaceDir || process.cwd();
  return {
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

  load() {
    const files = buildPersonaFiles({ workspaceDir: this.workspaceDir });
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

module.exports = { PersonaLoader, buildPersonaFiles };
