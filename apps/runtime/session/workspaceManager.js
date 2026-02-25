const fs = require('node:fs/promises');
const path = require('node:path');

function toWorkspaceName(sessionId) {
  return encodeURIComponent(String(sessionId || 'session'));
}

class SessionWorkspaceManager {
  constructor({ rootDir } = {}) {
    this.rootDir = rootDir
      || process.env.SESSION_WORKSPACES_DIR
      || path.resolve(process.cwd(), 'data/session-workspaces');
    this._readyPromise = this.ensureReady();
  }

  async ensureReady() {
    await fs.mkdir(this.rootDir, { recursive: true });
  }

  async ready() {
    await this._readyPromise;
  }

  workspacePath(sessionId) {
    return path.join(this.rootDir, toWorkspaceName(sessionId));
  }

  async ensureSessionWorkspace(sessionId) {
    await this.ready();
    const workspaceRoot = this.workspacePath(sessionId);
    await fs.mkdir(workspaceRoot, { recursive: true });
    return workspaceRoot;
  }

  async getWorkspaceInfo(sessionId) {
    const workspaceRoot = await this.ensureSessionWorkspace(sessionId);
    return {
      mode: 'session',
      root_dir: workspaceRoot
    };
  }
}

let defaultWorkspaceManager = null;

function getDefaultSessionWorkspaceManager() {
  if (!defaultWorkspaceManager) {
    defaultWorkspaceManager = new SessionWorkspaceManager();
  }
  return defaultWorkspaceManager;
}

module.exports = {
  SessionWorkspaceManager,
  getDefaultSessionWorkspaceManager
};
