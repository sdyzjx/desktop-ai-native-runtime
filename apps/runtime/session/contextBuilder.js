function normalizeMessage(role, content) {
  if (typeof content !== 'string') return null;
  const text = content.trim();
  if (!text) return null;
  if (role !== 'user' && role !== 'assistant') return null;
  return { role, content: text };
}

function buildRecentContextMessages(session, { maxMessages = 12, maxChars = 12000 } = {}) {
  if (!session || !Array.isArray(session.messages) || maxMessages <= 0 || maxChars <= 0) {
    return [];
  }

  const collected = [];
  let charCount = 0;

  for (let i = session.messages.length - 1; i >= 0; i -= 1) {
    if (collected.length >= maxMessages) break;

    const entry = session.messages[i];
    const normalized = normalizeMessage(entry?.role, entry?.content);
    if (!normalized) continue;

    const nextCount = charCount + normalized.content.length;
    if (nextCount > maxChars) break;

    collected.push(normalized);
    charCount = nextCount;
  }

  return collected.reverse();
}

module.exports = { buildRecentContextMessages };
