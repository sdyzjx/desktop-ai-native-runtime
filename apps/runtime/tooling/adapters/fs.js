const fs = require('fs/promises');
const path = require('path');
const { ToolingError, ErrorCode } = require('../errors');

function resolveWorkspacePath(workspaceRoot, targetPath) {
  const absolute = path.resolve(workspaceRoot, targetPath);
  const normalizedRoot = path.resolve(workspaceRoot) + path.sep;
  if (!absolute.startsWith(normalizedRoot) && absolute !== path.resolve(workspaceRoot)) {
    throw new ToolingError(ErrorCode.PERMISSION_DENIED, 'path escapes workspace');
  }
  return absolute;
}

async function writeFile(args, context = {}) {
  const workspaceRoot = context.workspaceRoot || process.cwd();
  const mode = args.mode || 'overwrite';
  const abs = resolveWorkspacePath(workspaceRoot, args.path);
  await fs.mkdir(path.dirname(abs), { recursive: true });

  if (mode === 'append') {
    await fs.appendFile(abs, args.content, 'utf8');
  } else {
    await fs.writeFile(abs, args.content, 'utf8');
  }

  return JSON.stringify({ path: abs, mode, bytes: Buffer.byteLength(args.content, 'utf8') });
}

module.exports = {
  'fs.write_file': writeFile
};
