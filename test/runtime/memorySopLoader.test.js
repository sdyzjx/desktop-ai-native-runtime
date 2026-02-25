const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const { loadMemorySop } = require('../../apps/runtime/session/memorySopLoader');

test('loadMemorySop loads markdown text with max char clipping', async () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'memory-sop-loader-'));
  const sopPath = path.join(tmpDir, 'memory.md');
  fs.writeFileSync(sopPath, 'line1\nline2\nline3');

  const full = await loadMemorySop({ sopPath, maxChars: 100 });
  assert.match(full, /line1/);
  assert.match(full, /line3/);

  const clipped = await loadMemorySop({ sopPath, maxChars: 5 });
  assert.equal(clipped.length, 5);
});
