const { execFile } = require('child_process');
const path = require('path');
const { ToolingError, ErrorCode } = require('../errors');

function splitCommand(command) {
  // Minimal parser: supports quotes, no shell operators.
  const forbidden = /[;&|><`$()]/;
  if (forbidden.test(command)) {
    throw new ToolingError(ErrorCode.PERMISSION_DENIED, 'shell operators are not allowed');
  }

  const parts = command.match(/(?:"[^"]*"|'[^']*'|\S)+/g) || [];
  return parts.map((p) => p.replace(/^['"]|['"]$/g, ''));
}

function runExec(args, context = {}) {
  const command = String(args.command || '').trim();
  if (!command) throw new ToolingError(ErrorCode.VALIDATION_ERROR, 'command is empty');

  const [bin, ...argv] = splitCommand(command);
  if (!bin) throw new ToolingError(ErrorCode.VALIDATION_ERROR, 'command parse failed');

  const safeBins = context.safeBins || [];
  if (context.security === 'allowlist' && !safeBins.includes(bin)) {
    throw new ToolingError(ErrorCode.PERMISSION_DENIED, `command not allowed: ${bin}`);
  }

  const timeoutMs = Math.max(1000, Number(args.timeoutSec || context.timeoutSec || 20) * 1000);
  const cwd = context.workspaceOnly ? (context.workspaceRoot || process.cwd()) : (context.cwd || process.cwd());

  return new Promise((resolve, reject) => {
    execFile(bin, argv, { cwd: path.resolve(cwd), timeout: timeoutMs, maxBuffer: 1024 * 1024 }, (error, stdout, stderr) => {
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
