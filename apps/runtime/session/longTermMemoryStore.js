const fs = require('node:fs/promises');
const path = require('node:path');
const { v4: uuidv4 } = require('uuid');
const { tokenize } = require('./longTermMemory');

const STORE_FILE = 'memory.json';

function nowIso() {
  return new Date().toISOString();
}

function normalizeContent(content) {
  if (typeof content !== 'string') return '';
  return content.trim();
}

function normalizeKeywords(keywords = []) {
  if (!Array.isArray(keywords)) return [];
  return Array.from(new Set(
    keywords
      .map((item) => (typeof item === 'string' ? item.trim().toLowerCase() : ''))
      .filter(Boolean)
  ));
}

function defaultStore() {
  return {
    version: 1,
    updated_at: nowIso(),
    entries: []
  };
}

class LongTermMemoryStore {
  constructor({ rootDir, maxContentChars = 800 } = {}) {
    this.rootDir = rootDir || process.env.LONG_TERM_MEMORY_DIR || path.resolve(process.cwd(), 'data/long-term-memory');
    this.filePath = path.join(this.rootDir, STORE_FILE);
    this.maxContentChars = Math.max(64, Number(maxContentChars) || 800);
    this._readyPromise = this.ensureReady();
    this._lock = Promise.resolve();
  }

  async ensureReady() {
    await fs.mkdir(this.rootDir, { recursive: true });
    try {
      await fs.access(this.filePath);
    } catch {
      await this.writeStore(defaultStore());
    }
  }

  async ready() {
    await this._readyPromise;
  }

  async withLock(fn) {
    const prev = this._lock;
    const next = prev.then(fn, fn);
    this._lock = next;
    return next;
  }

  async readStore() {
    await this.ready();
    const raw = await fs.readFile(this.filePath, 'utf8');
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object') return defaultStore();
    if (!Array.isArray(parsed.entries)) parsed.entries = [];
    if (!parsed.updated_at) parsed.updated_at = nowIso();
    return parsed;
  }

  async writeStore(store) {
    const tempPath = `${this.filePath}.tmp-${process.pid}-${Date.now()}`;
    await fs.writeFile(tempPath, JSON.stringify(store, null, 2), 'utf8');
    await fs.rename(tempPath, this.filePath);
  }

  async listEntries({ limit = 50, offset = 0 } = {}) {
    const store = await this.readStore();
    const items = [...store.entries]
      .sort((a, b) => String(b.updated_at || '').localeCompare(String(a.updated_at || '')));
    return {
      total: items.length,
      items: items.slice(offset, offset + limit)
    };
  }

  async addEntry({
    content,
    keywords = [],
    source_session_id = null,
    source_trace_id = null,
    metadata = {}
  }) {
    const text = normalizeContent(content);
    if (!text) {
      throw new Error('content must be a non-empty string');
    }

    const clipped = text.length > this.maxContentChars ? text.slice(0, this.maxContentChars) : text;
    const normalizedKeywords = normalizeKeywords(keywords);

    return this.withLock(async () => {
      const store = await this.readStore();
      const now = nowIso();
      const contentKey = clipped.toLowerCase();
      const existing = store.entries.find((entry) => String(entry.content || '').toLowerCase() === contentKey);

      if (existing) {
        existing.keywords = Array.from(new Set([...(existing.keywords || []), ...normalizedKeywords]));
        existing.updated_at = now;
        existing.source_session_id = source_session_id || existing.source_session_id || null;
        existing.source_trace_id = source_trace_id || existing.source_trace_id || null;
        existing.metadata = { ...(existing.metadata || {}), ...(metadata || {}) };
        store.updated_at = now;
        await this.writeStore(store);
        return existing;
      }

      const entry = {
        id: `mem-${uuidv4()}`,
        content: clipped,
        keywords: normalizedKeywords,
        source_session_id,
        source_trace_id,
        metadata,
        created_at: now,
        updated_at: now
      };

      store.entries.push(entry);
      store.updated_at = now;
      await this.writeStore(store);
      return entry;
    });
  }

  scoreEntry(entry, queryTokens) {
    if (!entry || !queryTokens.length) return 0;
    const contentTokens = tokenize(String(entry.content || ''));
    const keywordTokens = Array.isArray(entry.keywords)
      ? entry.keywords.flatMap((keyword) => tokenize(String(keyword || '')))
      : [];
    const tokenSet = new Set([...contentTokens, ...keywordTokens]);

    let score = 0;
    for (const token of queryTokens) {
      if (tokenSet.has(token)) score += 1;
    }
    return score;
  }

  async searchEntries({ query, limit = 5, minScore = 1, maxChars = 1200 } = {}) {
    const queryTokens = tokenize(String(query || ''));
    if (!queryTokens.length) {
      return { total: 0, items: [] };
    }

    const store = await this.readStore();
    const ranked = store.entries
      .map((entry) => ({ entry, score: this.scoreEntry(entry, queryTokens) }))
      .filter((item) => item.score >= minScore)
      .sort((a, b) => {
        if (b.score !== a.score) return b.score - a.score;
        return String(b.entry.updated_at || '').localeCompare(String(a.entry.updated_at || ''));
      });

    const items = [];
    let charCount = 0;
    for (const item of ranked) {
      if (items.length >= limit) break;
      const nextCount = charCount + String(item.entry.content || '').length;
      if (nextCount > maxChars) break;
      items.push(item.entry);
      charCount = nextCount;
    }
    return { total: ranked.length, items };
  }

  async getBootstrapEntries({ limit = 10, maxChars = 2400 } = {}) {
    const listed = await this.listEntries({ limit: Math.max(1, limit), offset: 0 });
    const items = [];
    let charCount = 0;
    for (const entry of listed.items) {
      const nextCount = charCount + String(entry.content || '').length;
      if (nextCount > maxChars) break;
      items.push(entry);
      charCount = nextCount;
    }
    return items;
  }
}

module.exports = { LongTermMemoryStore };
