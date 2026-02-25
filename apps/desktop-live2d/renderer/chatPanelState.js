(function initChatPanelState(globalScope) {
  const ALLOWED_ROLES = new Set(['user', 'assistant', 'system', 'tool']);
  const DEFAULT_ROLE = 'assistant';
  const DEFAULT_MAX_MESSAGES = 200;

  function toPositiveInt(value, fallback) {
    const parsed = Number(value);
    if (!Number.isFinite(parsed) || parsed <= 0) {
      return fallback;
    }
    return Math.floor(parsed);
  }

  function normalizeRole(role, fallback = DEFAULT_ROLE) {
    const normalized = String(role || '').trim();
    if (ALLOWED_ROLES.has(normalized)) {
      return normalized;
    }
    return fallback;
  }

  function normalizeMessageInput(input, fallbackRole = DEFAULT_ROLE) {
    const text = String(input?.text || '').trim();
    if (!text) {
      return null;
    }

    const timestamp = Number(input?.timestamp);
    return {
      id: String(input?.requestId || ''),
      role: normalizeRole(input?.role, fallbackRole),
      text,
      timestamp: Number.isFinite(timestamp) ? timestamp : Date.now()
    };
  }

  function createInitialState(config) {
    return {
      visible: Boolean(config?.defaultVisible),
      maxMessages: toPositiveInt(config?.maxMessages, DEFAULT_MAX_MESSAGES),
      inputEnabled: Boolean(config?.inputEnabled),
      messages: []
    };
  }

  function appendMessage(state, input, fallbackRole = DEFAULT_ROLE) {
    const nextMessage = normalizeMessageInput(input, fallbackRole);
    if (!nextMessage) {
      return state;
    }

    const maxMessages = toPositiveInt(state?.maxMessages, DEFAULT_MAX_MESSAGES);
    const existing = Array.isArray(state?.messages) ? state.messages : [];
    const merged = existing.concat(nextMessage);
    const sliced = merged.length > maxMessages ? merged.slice(merged.length - maxMessages) : merged;

    return {
      ...state,
      messages: sliced
    };
  }

  function clearMessages(state) {
    return {
      ...state,
      messages: []
    };
  }

  function setPanelVisible(state, visible) {
    return {
      ...state,
      visible: Boolean(visible)
    };
  }

  const api = {
    createInitialState,
    normalizeRole,
    normalizeMessageInput,
    appendMessage,
    clearMessages,
    setPanelVisible
  };

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = api;
  }
  globalScope.ChatPanelState = api;
})(typeof globalThis !== 'undefined' ? globalThis : window);
