function detectModeFromInput(input) {
  const text = String(input || '').toLowerCase();
  if (!text) return null;
  if (text.includes('理性模式') || text.includes('rational mode')) return 'rational';
  if (text.includes('偶像模式') || text.includes('idol mode')) return 'idol';
  if (text.includes('严格模式') || text.includes('strict mode')) return 'strict';
  if (text.includes('混合模式') || text.includes('hybrid mode')) return 'hybrid';
  return null;
}

function resolvePersonaMode({ input, sessionState, config }) {
  if (sessionState?.mode) {
    return { mode: sessionState.mode, source: 'session' };
  }

  const fromInput = detectModeFromInput(input);
  if (fromInput) {
    return { mode: fromInput, source: 'input' };
  }

  return { mode: config?.defaults?.mode || 'hybrid', source: 'default' };
}

module.exports = { detectModeFromInput, resolvePersonaMode };
