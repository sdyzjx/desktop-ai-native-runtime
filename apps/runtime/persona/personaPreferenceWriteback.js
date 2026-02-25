function detectExplicitPreferenceSignal(input) {
  const text = String(input || '');
  if (!text.trim()) return null;

  const patterns = [
    /以后.*(这样|这个风格|这种风格|这么回复)/,
    /(记住|记一下).*(回复|风格|语气|模式)/,
    /(always|from now on).*(reply|style|mode)/i
  ];

  for (const p of patterns) {
    if (p.test(text)) return text;
  }
  return null;
}

async function maybePersistPersonaPreference({
  input,
  mode,
  memoryStore,
  sessionId,
  traceId,
  config
}) {
  if (!memoryStore?.addEntry) return { persisted: false, reason: 'no_memory_store' };
  if (!config?.writeback?.enabled) return { persisted: false, reason: 'writeback_disabled' };

  const signal = detectExplicitPreferenceSignal(input);
  if (!signal) return { persisted: false, reason: 'no_explicit_signal' };

  const content = `Persona preference: preferred mode=${mode}; signal=${signal}`;
  const entry = await memoryStore.addEntry({
    content,
    keywords: ['persona', 'preference', 'style', mode],
    source_session_id: sessionId || null,
    source_trace_id: traceId || null,
    metadata: {
      type: 'persona_preference',
      mode,
      explicit: true
    }
  });

  return { persisted: true, entryId: entry.id };
}

module.exports = { detectExplicitPreferenceSignal, maybePersistPersonaPreference };
