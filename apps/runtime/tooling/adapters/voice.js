const { execFile } = require('child_process');
const path = require('path');
const fs = require('fs');
const { ToolingError, ErrorCode } = require('../errors');

const SCRIPT_PATH = path.resolve(__dirname, '../../../../scripts/qwen_voice_reply.py');
const VALID_VOICE_TAGS = new Set(['jp', 'zh', 'en']);
const DEFAULT_TIMEOUT_MS = 60000;

/**
 * voice.synthesize adapter
 *
 * Calls scripts/qwen_voice_reply.py to generate an ogg audio file via Qwen3-TTS.
 * Returns a JSON result with the local audio path and metadata.
 *
 * Requires:
 *   - python3 in PATH
 *   - ffmpeg in PATH
 *   - DASHSCOPE_API_KEY environment variable
 */
async function synthesize({ text, voice_tag = 'zh', model, voice, out } = {}) {
  if (!text || typeof text !== 'string' || !text.trim()) {
    throw new ToolingError(ErrorCode.INVALID_ARGS, 'text is required');
  }
  if (!VALID_VOICE_TAGS.has(voice_tag)) {
    throw new ToolingError(ErrorCode.INVALID_ARGS, `voice_tag must be one of: ${[...VALID_VOICE_TAGS].join(', ')}`);
  }
  if (!process.env.DASHSCOPE_API_KEY) {
    throw new ToolingError(ErrorCode.PERMISSION_DENIED, 'DASHSCOPE_API_KEY environment variable is not set');
  }
  if (!fs.existsSync(SCRIPT_PATH)) {
    throw new ToolingError(ErrorCode.CONFIG_ERROR, `voice synthesis script not found: ${SCRIPT_PATH}`);
  }

  const args = [SCRIPT_PATH, text.trim(), '--voice-tag', voice_tag, '--emit-manifest'];
  if (model) args.push('--model', model);
  if (voice) args.push('--voice', voice);
  if (out) args.push('--out', out);

  return new Promise((resolve, reject) => {
    execFile('python3', args, { timeout: DEFAULT_TIMEOUT_MS, env: process.env }, (err, stdout, stderr) => {
      if (err) {
        const detail = stderr ? stderr.trim().slice(0, 400) : String(err.message || err);
        return reject(new ToolingError(ErrorCode.EXEC_ERROR, `voice synthesis failed: ${detail}`));
      }

      let manifest;
      try {
        manifest = JSON.parse(stdout.trim());
      } catch {
        return reject(new ToolingError(ErrorCode.EXEC_ERROR, `unexpected output from voice script: ${stdout.trim().slice(0, 200)}`));
      }

      if (!manifest.audio_path || !fs.existsSync(manifest.audio_path)) {
        return reject(new ToolingError(ErrorCode.EXEC_ERROR, `audio file not found at: ${manifest.audio_path}`));
      }

      resolve(JSON.stringify({
        ok: true,
        audio_path: manifest.audio_path,
        voice_tag: manifest.voice_tag,
        model: manifest.model,
        tts_input_text: manifest.tts_input_text,
      }));
    });
  });
}

module.exports = { 'voice.synthesize': synthesize };
