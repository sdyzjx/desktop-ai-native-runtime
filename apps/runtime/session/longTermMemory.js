function nowIso() {
  return new Date().toISOString();
}

function normalizeMessage(role, content) {
  if (typeof content !== 'string') return null;
  const text = content.trim();
  if (!text) return null;
  if (role !== 'user' && role !== 'assistant') return null;
  return { role, content: text };
}

function tokenize(text) {
  if (typeof text !== 'string' || !text.trim()) return [];
  const tokens = text.toLowerCase().match(/[\p{L}\p{N}_-]+/gu) || [];
  return Array.from(new Set(tokens));
}

function clip(text, maxChars) {
  if (!text) return '';
  if (text.length <= maxChars) return text;
  return `${text.slice(0, Math.max(1, maxChars - 1))}…`;
}

function listDialogMessages(session) {
  if (!session || !Array.isArray(session.messages)) return [];
  const result = [];

  for (const message of session.messages) {
    const normalized = normalizeMessage(message?.role, message?.content);
    if (!normalized) continue;

    result.push({
      id: message?.id || null,
      role: normalized.role,
      content: normalized.content,
      created_at: message?.created_at || null
    });
  }

  return result;
}

function buildSummary(messages, { summaryMaxChars = 1400 } = {}) {
  if (!Array.isArray(messages) || messages.length === 0 || summaryMaxChars <= 0) return '';

  const lines = [];
  let charCount = 0;

  for (const message of messages) {
    const line = `${message.role === 'user' ? 'User' : 'Assistant'}: ${clip(message.content, 220)}`;
    const nextCount = charCount + line.length + 1;
    if (nextCount > summaryMaxChars) break;
    lines.push(line);
    charCount = nextCount;
  }

  return lines.join('\n');
}

function buildMemoryEntries(messages, { maxEntries = 300, entryMaxChars = 360 } = {}) {
  if (!Array.isArray(messages) || messages.length === 0 || maxEntries <= 0) return [];

  const entries = messages
    .map((message, index) => ({
      id: message.id || `m-${index}`,
      role: message.role,
      content: clip(message.content, entryMaxChars),
      created_at: message.created_at || null
    }))
    .filter((entry) => entry.content);

  if (entries.length <= maxEntries) return entries;
  return entries.slice(entries.length - maxEntries);
}

function buildSessionLongTermMemory(session, {
  recentWindowMessages = 12,
  summaryMaxChars = 1400,
  maxEntries = 300
} = {}) {
  const dialogMessages = listDialogMessages(session);
  const safeWindow = Math.max(0, Number(recentWindowMessages) || 0);
  const archiveEnd = Math.max(0, dialogMessages.length - safeWindow);
  const archived = dialogMessages.slice(0, archiveEnd);

  return {
    version: 1,
    updated_at: nowIso(),
    archived_message_count: archived.length,
    recent_window_messages: safeWindow,
    summary: buildSummary(archived, { summaryMaxChars }),
    entries: buildMemoryEntries(archived, { maxEntries })
  };
}

function scoreEntry(entry, queryTokens) {
  if (!entry || !entry.content || !queryTokens.length) return 0;
  const entryTokens = tokenize(entry.content);
  if (!entryTokens.length) return 0;

  const tokenSet = new Set(entryTokens);
  let overlap = 0;
  for (const token of queryTokens) {
    if (tokenSet.has(token)) overlap += 1;
  }
  return overlap;
}

function retrieveMemoryEntries(memory, query, {
  topK = 4,
  minScore = 1,
  maxChars = 900
} = {}) {
  if (!memory || !Array.isArray(memory.entries) || !memory.entries.length) return [];
  const queryTokens = tokenize(query);
  if (!queryTokens.length) return [];

  const ranked = memory.entries
    .map((entry) => ({ entry, score: scoreEntry(entry, queryTokens) }))
    .filter((item) => item.score >= minScore)
    .sort((a, b) => {
      if (b.score !== a.score) return b.score - a.score;
      return String(b.entry.created_at || '').localeCompare(String(a.entry.created_at || ''));
    });

  const selected = [];
  let charCount = 0;
  for (const item of ranked) {
    if (selected.length >= topK) break;
    const nextCount = charCount + item.entry.content.length;
    if (nextCount > maxChars) break;
    selected.push(item.entry);
    charCount = nextCount;
  }
  return selected;
}

function buildLongTermMemoryPromptMessages(session, {
  input = '',
  recentWindowMessages = 12,
  summaryMaxChars = 1400,
  maxEntries = 300,
  retrieveTopK = 4,
  retrieveMinScore = 1,
  retrieveMaxChars = 900
} = {}) {
  const memory = (
    session?.memory
    && typeof session.memory === 'object'
    && Array.isArray(session.memory.entries)
  )
    ? session.memory
    : buildSessionLongTermMemory(session, {
        recentWindowMessages,
        summaryMaxChars,
        maxEntries
      });

  const messages = [];

  if (memory.summary) {
    messages.push({
      role: 'system',
      content: [
        'Conversation long-term summary from earlier turns.',
        'Use this only as supporting context and prioritize latest user instruction.',
        '',
        memory.summary
      ].join('\n')
    });
  }

  const recalled = retrieveMemoryEntries(memory, String(input || ''), {
    topK: retrieveTopK,
    minScore: retrieveMinScore,
    maxChars: retrieveMaxChars
  });

  if (recalled.length) {
    const lines = recalled.map((entry, index) => (
      `${index + 1}. ${entry.role === 'user' ? 'User' : 'Assistant'}: ${entry.content}`
    ));
    messages.push({
      role: 'system',
      content: [
        'Relevant long-term memory snippets for current request.',
        ...lines
      ].join('\n')
    });
  }

  return messages;
}

module.exports = {
  buildSessionLongTermMemory,
  buildLongTermMemoryPromptMessages,
  retrieveMemoryEntries,
  tokenize
};
