const { getDefaultLongTermMemoryStore } = require('../../session/longTermMemoryStore');
const { ToolingError, ErrorCode } = require('../errors');
const {
  canReadLongTermMemory,
  canWriteLongTermMemory
} = require('../../security/sessionPermissionPolicy');

const memoryStore = getDefaultLongTermMemoryStore();

async function memoryWrite(args = {}, context = {}) {
  if (
    typeof context.permission_level === 'string'
    && !canWriteLongTermMemory(context.permission_level)
  ) {
    throw new ToolingError(
      ErrorCode.PERMISSION_DENIED,
      `memory_write is not allowed for permission level ${context.permission_level}`
    );
  }

  const content = typeof args.content === 'string' ? args.content : '';
  const keywords = Array.isArray(args.keywords) ? args.keywords : [];

  const entry = await memoryStore.addEntry({
    content,
    keywords,
    source_session_id: context.session_id || null,
    source_trace_id: context.trace_id || null,
    metadata: {
      step_index: context.step_index ?? null,
      call_id: context.call_id || null
    }
  });

  return JSON.stringify({
    ok: true,
    id: entry.id,
    content: entry.content,
    keywords: entry.keywords
  });
}

async function memorySearch(args = {}, context = {}) {
  if (
    typeof context.permission_level === 'string'
    && !canReadLongTermMemory(context.permission_level)
  ) {
    throw new ToolingError(
      ErrorCode.PERMISSION_DENIED,
      `memory_search is not allowed for permission level ${context.permission_level}`
    );
  }

  const query = typeof args.query === 'string' ? args.query : '';
  const limit = Math.max(1, Math.min(Number(args.limit) || 5, 20));

  const result = await memoryStore.searchEntries({ query, limit });
  return JSON.stringify({
    ok: true,
    total: result.total,
    items: result.items.map((item) => ({
      id: item.id,
      content: item.content,
      keywords: item.keywords,
      updated_at: item.updated_at
    }))
  });
}

module.exports = {
  'memory.write': memoryWrite,
  'memory.search': memorySearch
};
