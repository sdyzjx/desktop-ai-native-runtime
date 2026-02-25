const { execFile } = require('node:child_process');

function getTime() {
  return new Date().toLocaleString('zh-CN', { hour12: false });
}

function add({ a, b }) {
  const x = Number(a);
  const y = Number(b);
  if (Number.isNaN(x) || Number.isNaN(y)) throw new Error('a/b must be number');
  return String(x + y);
}

function echo({ text }) {
  return `echo: ${text || ''}`;
}

function execFileAsync(cmd, args, options = {}) {
  return new Promise((resolve, reject) => {
    execFile(cmd, args, options, (err, stdout, stderr) => {
      if (err) {
        const message = stderr || stdout || err.message || String(err);
        reject(new Error(message.trim()));
        return;
      }
      resolve({ stdout: String(stdout || ''), stderr: String(stderr || '') });
    });
  });
}

async function personaUpdateViaCurl({ custom_name = '' }) {
  const baseUrl = process.env.PERSONA_API_BASE_URL || `http://127.0.0.1:${process.env.PORT || 3000}`;
  const payload = JSON.stringify({
    profile: {
      addressing: {
        custom_name: String(custom_name || '')
      }
    }
  });

  const { stdout } = await execFileAsync('curl', [
    '--silent',
    '--show-error',
    '--fail',
    '-X',
    'PUT',
    `${baseUrl}/api/persona/profile`,
    '-H',
    'content-type: application/json',
    '-d',
    payload
  ]);

  return stdout.trim() || '{"ok":true}';
}

module.exports = {
  'builtin.get_time': async () => getTime(),
  'builtin.add': async (args) => add(args),
  'builtin.echo': async (args) => echo(args),
  'builtin.persona_update_via_curl': async (args) => personaUpdateViaCurl(args || {})
};
