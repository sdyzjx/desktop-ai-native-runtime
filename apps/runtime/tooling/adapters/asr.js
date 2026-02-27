const { execFile } = require('node:child_process');
const path = require('node:path');

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

function makeToolError(code, message, details = {}) {
  const err = new Error(message);
  err.code = code;
  err.details = details;
  return err;
}

function resolveAsrCli() {
  return process.env.ASR_CLI || path.resolve(process.cwd(), 'scripts/asr-cli');
}

function isSupportedFormat(format) {
  return ['wav', 'mp3', 'ogg', 'webm', 'm4a'].includes(String(format || '').toLowerCase());
}

function parseAsrResult(raw) {
  const text = String(raw || '').trim();
  if (!text) {
    throw makeToolError('ASR_BAD_AUDIO', 'empty transcription result');
  }

  // Prefer JSON payload when CLI returns structured output.
  try {
    const maybe = JSON.parse(text);
    if (maybe && typeof maybe === 'object') {
      return {
        text: String(maybe.text || ''),
        confidence: Number.isFinite(Number(maybe.confidence)) ? Number(maybe.confidence) : 0.9,
        segments: Array.isArray(maybe.segments) ? maybe.segments : []
      };
    }
  } catch {
    // non-JSON plain text is accepted
  }

  return {
    text,
    confidence: 0.9,
    segments: []
  };
}

async function asrAliyun(args = {}, context = {}) {
  const audioRef = String(args.audioRef || '').trim();
  const format = String(args.format || '').toLowerCase();
  const lang = String(args.lang || 'auto').toLowerCase();
  const timeoutSec = Math.max(1, Number(args.timeoutSec || 45));

  if (!audioRef) {
    throw makeToolError('ASR_BAD_AUDIO', 'audioRef is required');
  }

  if (!isSupportedFormat(format)) {
    throw makeToolError('ASR_UNSUPPORTED_FORMAT', `unsupported format: ${format}`);
  }

  const cliPath = resolveAsrCli();
  const cliArgs = ['--audio-ref', audioRef, '--format', format, '--lang', lang];

  if (Array.isArray(args.hints) && args.hints.length > 0) {
    cliArgs.push('--hints', JSON.stringify(args.hints));
  }

  if (typeof context.publishEvent === 'function') {
    context.publishEvent('voice.job.started', {
      kind: 'asr',
      audio_ref: audioRef,
      format,
      lang
    });
  }

  try {
    const { stdout } = await execFileAsync(cliPath, cliArgs, { timeout: timeoutSec * 1000 });
    const parsed = parseAsrResult(stdout);

    if (!parsed.text) {
      throw makeToolError('ASR_BAD_AUDIO', 'empty text from asr provider');
    }

    if (typeof context.publishEvent === 'function') {
      context.publishEvent('voice.job.completed', {
        kind: 'asr',
        text_length: parsed.text.length,
        confidence: parsed.confidence
      });
    }

    return JSON.stringify({
      text: parsed.text,
      confidence: parsed.confidence,
      segments: parsed.segments,
      providerMeta: {
        provider: 'aliyun_dashscope',
        format,
        lang
      }
    });
  } catch (error) {
    const code = error.code || (String(error.message || '').includes('timeout') ? 'ASR_TIMEOUT' : 'ASR_PROVIDER_DOWN');
    if (typeof context.publishEvent === 'function') {
      context.publishEvent('voice.job.failed', {
        kind: 'asr',
        code,
        error: error.message || String(error)
      });
    }
    throw makeToolError(code, error.message || 'asr failed', error.details || {});
  }
}

module.exports = {
  'voice.asr_aliyun': asrAliyun,
  __internal: {
    asrAliyun,
    parseAsrResult,
    resolveAsrCli,
    isSupportedFormat
  }
};
