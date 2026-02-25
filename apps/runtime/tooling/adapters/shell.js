const { execFile } = require('child_process');
const path = require('path');
const { ToolingError, ErrorCode } = require('../errors');
const { getShellPermissionProfile } = require('../../security/sessionPermissionPolicy');

function splitCommand(command) {
  // Minimal parser: supports quotes, no shell operators.
  const forbidden = /[;&|><`$()]/;
  if (forbidden.test(command)) {
    throw new ToolingError(ErrorCode.PERMISSION_DENIED, 'shell operators are not allowed');
  }

  const parts = command.match(/(?:"[^"]*"|'[^']*'|\S)+/g) || [];
  return parts.map((p) => p.replace(/^['"]|['"]$/g, ''));
}

function isInsideWorkspace(workspaceRoot, absolutePath) {
  const root = path.resolve(workspaceRoot);
  const target = path.resolve(absolutePath);
  return target === root || target.startsWith(`${root}${path.sep}`);
}

function resolvePathToken(cwd, token) {
  if (!token || token === '-') return null;
  if (/^[a-z][a-z0-9+.-]*:\/\//i.test(token)) return null;
  return path.resolve(cwd, token);
}

function nonOptionArgs(argv) {
  return argv.filter((item) => item && !item.startsWith('-'));
}

function collectPathIntent(bin, argv, cwd) {
  const readPaths = [];
  const writePaths = [];

  if (['ls', 'cat', 'head', 'tail', 'wc', 'stat'].includes(bin)) {
    for (const arg of nonOptionArgs(argv)) {
      const resolved = resolvePathToken(cwd, arg);
      if (resolved) readPaths.push(resolved);
    }
    return { readPaths, writePaths };
  }

  if (bin === 'grep') {
    const args = nonOptionArgs(argv);
    for (const arg of args.slice(1)) {
      const resolved = resolvePathToken(cwd, arg);
      if (resolved) readPaths.push(resolved);
    }
    return { readPaths, writePaths };
  }

  if (bin === 'find') {
    const args = nonOptionArgs(argv);
    const scanPaths = args.length > 0 ? [args[0]] : [];
    for (const p of scanPaths) {
      const resolved = resolvePathToken(cwd, p);
      if (resolved) readPaths.push(resolved);
    }
    return { readPaths, writePaths };
  }

  if (['mkdir', 'touch', 'rm'].includes(bin)) {
    for (const arg of nonOptionArgs(argv)) {
      const resolved = resolvePathToken(cwd, arg);
      if (resolved) writePaths.push(resolved);
    }
    return { readPaths, writePaths };
  }

  if (bin === 'cp') {
    const args = nonOptionArgs(argv);
    if (args.length < 2) {
      throw new ToolingError(ErrorCode.VALIDATION_ERROR, 'cp requires source and destination');
    }
    const sources = args.slice(0, -1);
    const destination = args[args.length - 1];
    for (const source of sources) {
      const resolved = resolvePathToken(cwd, source);
      if (resolved) readPaths.push(resolved);
    }
    const resolvedDest = resolvePathToken(cwd, destination);
    if (resolvedDest) writePaths.push(resolvedDest);
    return { readPaths, writePaths };
  }

  if (bin === 'mv') {
    const args = nonOptionArgs(argv);
    if (args.length < 2) {
      throw new ToolingError(ErrorCode.VALIDATION_ERROR, 'mv requires source and destination');
    }
    for (const arg of args) {
      const resolved = resolvePathToken(cwd, arg);
      if (resolved) writePaths.push(resolved);
    }
    return { readPaths, writePaths };
  }

  if (bin === 'curl') {
    for (let i = 0; i < argv.length; i += 1) {
      const arg = argv[i];
      const next = argv[i + 1];
      if ((arg === '-o' || arg === '--output') && next) {
        const resolved = resolvePathToken(cwd, next);
        if (resolved) writePaths.push(resolved);
      }
      if ((arg === '-K' || arg === '--config') && next) {
        const resolved = resolvePathToken(cwd, next);
        if (resolved) readPaths.push(resolved);
      }
    }
    return { readPaths, writePaths };
  }

  return { readPaths, writePaths };
}

function enforceWorkspaceBoundary(paths, workspaceRoot, violationMessage) {
  for (const p of paths) {
    if (!isInsideWorkspace(workspaceRoot, p)) {
      throw new ToolingError(ErrorCode.PERMISSION_DENIED, violationMessage);
    }
  }
}

function enforcePermissionPathPolicy({ level, workspaceRoot, bin, readPaths, writePaths }) {
  if (level === 'high') {
    if (bin === 'cp') {
      enforceWorkspaceBoundary(writePaths, workspaceRoot, 'cp destination must stay inside workspace');
      return;
    }

    enforceWorkspaceBoundary(writePaths, workspaceRoot, 'write path escapes workspace');
    return;
  }

  enforceWorkspaceBoundary(
    [...readPaths, ...writePaths],
    workspaceRoot,
    'path escapes workspace under current permission level'
  );
}

function runExec(args, context = {}) {
  const command = String(args.command || '').trim();
  if (!command) throw new ToolingError(ErrorCode.VALIDATION_ERROR, 'command is empty');

  const [bin, ...argv] = splitCommand(command);
  if (!bin) throw new ToolingError(ErrorCode.VALIDATION_ERROR, 'command parse failed');

  const permissionLevel = typeof context.permission_level === 'string'
    ? context.permission_level
    : null;
  const workspaceRoot = path.resolve(context.workspaceRoot || process.cwd());
  const cwd = workspaceRoot;

  if (permissionLevel) {
    const profile = getShellPermissionProfile(permissionLevel);
    if (profile.allowBins && !profile.allowBins.has(bin)) {
      throw new ToolingError(
        ErrorCode.PERMISSION_DENIED,
        `command not allowed for permission level ${profile.level}: ${bin}`
      );
    }

    const { readPaths, writePaths } = collectPathIntent(bin, argv, cwd);
    enforcePermissionPathPolicy({
      level: profile.level,
      workspaceRoot,
      bin,
      readPaths,
      writePaths
    });
  } else {
    const safeBins = context.safeBins || [];
    if (context.security === 'allowlist' && !safeBins.includes(bin)) {
      throw new ToolingError(ErrorCode.PERMISSION_DENIED, `command not allowed: ${bin}`);
    }
  }

  const timeoutMs = Math.max(1000, Number(args.timeoutSec || context.timeoutSec || 20) * 1000);

  return new Promise((resolve, reject) => {
    execFile(bin, argv, { cwd, timeout: timeoutMs, maxBuffer: 1024 * 1024 }, (error, stdout, stderr) => {
      if (error) {
        if (error.killed || error.signal === 'SIGTERM') {
          reject(new ToolingError(ErrorCode.TIMEOUT, `command timeout after ${timeoutMs}ms`));
          return;
        }
        reject(new ToolingError(ErrorCode.RUNTIME_ERROR, error.message));
        return;
      }

      const maxChars = Number(context.maxOutputChars || 8000);
      const out = `${stdout || ''}${stderr ? `\n[stderr]\n${stderr}` : ''}`.slice(0, maxChars);
      resolve(out || '(no output)');
    });
  });
}

module.exports = {
  'shell.exec': runExec
};
