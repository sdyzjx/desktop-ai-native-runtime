const fs = require('node:fs/promises');
const path = require('node:path');

const DEFAULT_SOP_PATH = path.resolve(process.cwd(), 'docs/memory_sop.md');

async function loadMemorySop({
  sopPath = process.env.MEMORY_SOP_PATH || DEFAULT_SOP_PATH,
  maxChars = 8000
} = {}) {
  try {
    const raw = await fs.readFile(sopPath, 'utf8');
    const text = raw.trim();
    if (!text) return '';
    return text.length > maxChars ? text.slice(0, maxChars) : text;
  } catch {
    return '';
  }
}

module.exports = { loadMemorySop, DEFAULT_SOP_PATH };
