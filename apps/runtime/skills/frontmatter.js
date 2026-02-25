function parseFrontmatter(raw) {
  if (typeof raw !== 'string' || !raw.startsWith('---')) return {};

  const lines = raw.split(/\r?\n/);
  if (lines[0].trim() !== '---') return {};

  let end = -1;
  for (let i = 1; i < lines.length; i += 1) {
    if (lines[i].trim() === '---') {
      end = i;
      break;
    }
  }
  if (end === -1) return {};

  const meta = {};
  for (let i = 1; i < end; i += 1) {
    const line = lines[i];
    const idx = line.indexOf(':');
    if (idx <= 0) continue;
    const key = line.slice(0, idx).trim();
    const value = line.slice(idx + 1).trim().replace(/^['"]|['"]$/g, '');
    if (key) meta[key] = value;
  }
  return meta;
}

module.exports = { parseFrontmatter };
