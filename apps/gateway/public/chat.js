const STORAGE_KEY = 'yachiyo_sessions_v1';
const THEME_STORAGE_KEY = 'yachiyo_theme_v1';
const SESSION_PERMISSION_LEVELS = ['low', 'medium', 'high'];
const DEFAULT_SESSION_PERMISSION_LEVEL = 'medium';
const THEME_PREFERENCES = ['auto', 'light', 'dark'];
const DEFAULT_THEME_PREFERENCE = 'auto';

const elements = {
  sidebar: document.getElementById('sidebar'),
  menuBtn: document.getElementById('menuBtn'),
  newSessionBtn: document.getElementById('newSessionBtn'),
  sessionList: document.getElementById('sessionList'),
  activeSessionName: document.getElementById('activeSessionName'),
  runtimeStatus: document.getElementById('runtimeStatus'),
  sessionPermissionSelect: document.getElementById('sessionPermissionSelect'),
  themeSelect: document.getElementById('themeSelect'),
  messageList: document.getElementById('messageList'),
  chatInput: document.getElementById('chatInput'),
  sendBtn: document.getElementById('sendBtn')
};

const state = {
  sessions: [],
  activeSessionId: null,
  pending: null,
  ws: null,
  wsReady: false,
  isComposing: false,
  themePreference: DEFAULT_THEME_PREFERENCE
};

function updateComposerState() {
  const hasText = elements.chatInput.value.trim().length > 0;
  elements.sendBtn.disabled = state.pending !== null || !hasText;
}

function nowIso() {
  return new Date().toISOString();
}

function formatTime(iso) {
  const d = new Date(iso);
  return d.toLocaleString('zh-CN', { hour12: false, month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' });
}

function randomId(prefix = 'sess') {
  return `${prefix}-${Math.random().toString(36).slice(2, 9)}${Date.now().toString(36)}`;
}

function createSession() {
  const id = randomId('chat');
  const createdAt = nowIso();
  return {
    id,
    name: 'New chat',
    createdAt,
    updatedAt: createdAt,
    permissionLevel: DEFAULT_SESSION_PERMISSION_LEVEL,
    messages: []
  };
}

function normalizePermissionLevel(value) {
  if (typeof value === 'string' && SESSION_PERMISSION_LEVELS.includes(value)) {
    return value;
  }
  return DEFAULT_SESSION_PERMISSION_LEVEL;
}

function normalizeThemePreference(value) {
  if (typeof value === 'string' && THEME_PREFERENCES.includes(value)) {
    return value;
  }
  return DEFAULT_THEME_PREFERENCE;
}

function resolveTheme(preference) {
  if (preference === 'auto') {
    return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
  }
  return preference;
}

function applyTheme(preference) {
  const normalizedPreference = normalizeThemePreference(preference);
  const theme = resolveTheme(normalizedPreference);
  document.documentElement.setAttribute('data-theme', theme);
  state.themePreference = normalizedPreference;
  elements.themeSelect.value = normalizedPreference;
}

function loadThemePreference() {
  const raw = localStorage.getItem(THEME_STORAGE_KEY);
  applyTheme(raw);
}

function persistThemePreference(preference) {
  localStorage.setItem(THEME_STORAGE_KEY, normalizeThemePreference(preference));
}

function normalizeSessionShape(raw) {
  if (!raw || typeof raw !== 'object') return createSession();
  return {
    id: raw.id || randomId('chat'),
    name: typeof raw.name === 'string' ? raw.name : 'New chat',
    createdAt: typeof raw.createdAt === 'string' ? raw.createdAt : nowIso(),
    updatedAt: typeof raw.updatedAt === 'string' ? raw.updatedAt : nowIso(),
    permissionLevel: normalizePermissionLevel(raw.permissionLevel),
    messages: Array.isArray(raw.messages) ? raw.messages : []
  };
}

function loadSessions() {
  const raw = localStorage.getItem(STORAGE_KEY);
  if (!raw) {
    const initial = createSession();
    state.sessions = [initial];
    state.activeSessionId = initial.id;
    persist();
    return;
  }

  try {
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed) || parsed.length === 0) throw new Error('invalid');
    state.sessions = parsed.map((session) => normalizeSessionShape(session));
    state.activeSessionId = state.sessions[0].id;
    persist();
  } catch {
    const initial = createSession();
    state.sessions = [initial];
    state.activeSessionId = initial.id;
    persist();
  }
}

function persist() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state.sessions));
}

function getActiveSession() {
  return state.sessions.find((s) => s.id === state.activeSessionId) || null;
}

function getSessionById(sessionId) {
  return state.sessions.find((s) => s.id === sessionId) || null;
}

function sortSessions() {
  state.sessions.sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime());
}

function setStatus(text) {
  const statusText = String(text || '');
  elements.runtimeStatus.textContent = statusText;
  elements.runtimeStatus.classList.toggle('running', /^Running\b/.test(statusText));
}

function ensureSessionTitle(session) {
  if (!session || session.name !== 'New chat') return;
  const firstUser = session.messages.find((m) => m.role === 'user');
  if (!firstUser) return;
  const title = firstUser.content.trim().slice(0, 26);
  session.name = title || 'New chat';
}

function renderSessions() {
  sortSessions();
  elements.sessionList.innerHTML = '';

  state.sessions.forEach((session) => {
    const btn = document.createElement('button');
    btn.className = `session-item ${session.id === state.activeSessionId ? 'active' : ''}`;
    btn.innerHTML = `
      <div class="session-item-name">${escapeHtml(session.name)}</div>
      <div class="session-item-time">${formatTime(session.updatedAt)}</div>
    `;
    btn.onclick = () => {
      state.activeSessionId = session.id;
      render();
      if (window.matchMedia('(max-width: 920px)').matches) {
        elements.sidebar.classList.remove('open');
      }
    };
    elements.sessionList.appendChild(btn);
  });
}

function addMessage(session, role, content) {
  const message = { id: randomId('msg'), role, content: String(content || ''), createdAt: nowIso() };
  session.messages.push(message);
  session.updatedAt = message.createdAt;
  ensureSessionTitle(session);
  persist();
  return message;
}

function updateMessage(session, messageId, patch) {
  const msg = session.messages.find((m) => m.id === messageId);
  if (!msg) return;
  Object.assign(msg, patch);
  session.updatedAt = nowIso();
  persist();
}

function escapeHtml(text) {
  return String(text)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

function renderMessages() {
  const session = getActiveSession();
  elements.messageList.innerHTML = '';

  if (!session || session.messages.length === 0) {
    const hint = document.createElement('div');
    hint.className = 'empty-hint';
    hint.textContent = 'Start a new conversation.';
    elements.messageList.appendChild(hint);
    return;
  }

  session.messages.forEach((msg) => {
    const wrap = document.createElement('div');
    wrap.className = `message-wrap ${msg.role}`;

    const bubble = document.createElement('div');
    bubble.className = 'message-bubble';
    bubble.innerHTML = escapeHtml(msg.content);

    const meta = document.createElement('div');
    meta.className = 'message-meta';
    meta.textContent = `${msg.role === 'user' ? 'You' : 'Assistant'} · ${formatTime(msg.createdAt)}`;

    wrap.appendChild(bubble);
    wrap.appendChild(meta);
    elements.messageList.appendChild(wrap);
  });

  elements.messageList.scrollTop = elements.messageList.scrollHeight;
}

function renderHeader() {
  const session = getActiveSession();
  elements.activeSessionName.textContent = session?.name || 'New chat';
  elements.sessionPermissionSelect.value = normalizePermissionLevel(session?.permissionLevel);
}

function render() {
  renderSessions();
  renderHeader();
  renderMessages();
}

function resolvePendingSession() {
  if (!state.pending) return null;
  return getSessionById(state.pending.sessionId);
}

function finishPendingResponse({ content, statusText }) {
  const pendingSession = resolvePendingSession();
  if (pendingSession) {
    updateMessage(pendingSession, state.pending.assistantMsgId, { content: String(content || '') });
  }

  state.pending = null;
  setStatus(statusText);
  updateComposerState();
  render();
}

function connectWs() {
  if (state.ws && (state.ws.readyState === 0 || state.ws.readyState === 1)) return;

  state.ws = new WebSocket(`${location.protocol === 'https:' ? 'wss' : 'ws'}://${location.host}/ws`);

  state.ws.onopen = () => {
    state.wsReady = true;
    setStatus('Connected');
    updateComposerState();
  };

  state.ws.onclose = () => {
    state.wsReady = false;
    setStatus('Disconnected');
    if (state.pending) {
      finishPendingResponse({
        content: 'Error: websocket disconnected before tool finished.',
        statusText: 'Disconnected'
      });
    }
    setTimeout(connectWs, 600);
  };

  state.ws.onerror = () => {
    state.wsReady = false;
    setStatus('Connection error');
    if (state.pending) {
      finishPendingResponse({
        content: 'Error: websocket error before tool finished.',
        statusText: 'Connection error'
      });
    }
  };

  state.ws.onmessage = (event) => {
    let msg;
    try {
      msg = JSON.parse(event.data);
    } catch {
      return;
    }

    if (!state.pending) return;

    if (msg.type === 'event') {
      if (msg.data?.session_id && msg.data.session_id !== state.pending.sessionId) return;
      if (msg.data?.event === 'tool.call') {
        setStatus(`Running tool: ${msg.data.payload?.name || 'unknown'}`);
      }
      return;
    }

    if (msg.type === 'error') {
      finishPendingResponse({
        content: `Error: ${msg.message || 'Unknown error'}`,
        statusText: 'Error'
      });
      return;
    }

    if (msg.type === 'final') {
      if (msg.session_id && msg.session_id !== state.pending.sessionId) return;
      finishPendingResponse({
        content: msg.output || '',
        statusText: 'Idle'
      });
    }
  };
}

function autosizeInput() {
  elements.chatInput.style.height = '0px';
  const next = Math.min(elements.chatInput.scrollHeight, 220);
  elements.chatInput.style.height = `${next}px`;
}

function sendMessage() {
  const text = elements.chatInput.value.trim();
  if (!text || state.pending) return;

  const session = getActiveSession();
  if (!session) return;

  if (!state.wsReady) {
    setStatus('WebSocket connecting, retry in 1s.');
    connectWs();
    return;
  }

  const userMsg = addMessage(session, 'user', text);
  const assistantMsg = addMessage(session, 'assistant', 'Thinking...');
  state.pending = { sessionId: session.id, userMsgId: userMsg.id, assistantMsgId: assistantMsg.id };

  elements.chatInput.value = '';
  autosizeInput();
  updateComposerState();
  render();
  setStatus('Running');

  state.ws.send(JSON.stringify({
    type: 'run',
    session_id: session.id,
    input: text,
    permission_level: normalizePermissionLevel(session.permissionLevel)
  }));
}

function createNewSession() {
  const session = createSession();
  state.sessions.unshift(session);
  state.activeSessionId = session.id;
  persist();
  render();
}

async function persistSessionPermission(session) {
  try {
    await fetch(`/api/sessions/${encodeURIComponent(session.id)}/settings`, {
      method: 'PUT',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        settings: {
          permission_level: normalizePermissionLevel(session.permissionLevel)
        }
      })
    });
  } catch {
    // Keep UI responsive even when network is temporarily unavailable.
  }
}

function bindEvents() {
  elements.sendBtn.onclick = sendMessage;
  elements.newSessionBtn.onclick = createNewSession;

  elements.chatInput.addEventListener('input', autosizeInput);
  elements.chatInput.addEventListener('input', updateComposerState);
  elements.chatInput.addEventListener('compositionstart', () => {
    state.isComposing = true;
  });
  elements.chatInput.addEventListener('compositionend', () => {
    state.isComposing = false;
  });
  elements.chatInput.addEventListener('keydown', (event) => {
    if (event.key !== 'Enter' || event.shiftKey) return;
    if (event.isComposing || state.isComposing || event.keyCode === 229) return;
    event.preventDefault();
    sendMessage();
  });

  elements.menuBtn.onclick = () => {
    elements.sidebar.classList.toggle('open');
  };

  elements.sessionPermissionSelect.addEventListener('change', () => {
    const session = getActiveSession();
    if (!session) return;
    session.permissionLevel = normalizePermissionLevel(elements.sessionPermissionSelect.value);
    session.updatedAt = nowIso();
    persist();
    renderSessions();
    void persistSessionPermission(session);
  });

  elements.themeSelect.addEventListener('change', () => {
    const nextPreference = normalizeThemePreference(elements.themeSelect.value);
    persistThemePreference(nextPreference);
    applyTheme(nextPreference);
  });

  const themeMedia = window.matchMedia('(prefers-color-scheme: dark)');
  const handleThemeMediaChange = () => {
    if (state.themePreference !== 'auto') return;
    applyTheme('auto');
  };
  if (typeof themeMedia.addEventListener === 'function') {
    themeMedia.addEventListener('change', handleThemeMediaChange);
  } else if (typeof themeMedia.addListener === 'function') {
    themeMedia.addListener(handleThemeMediaChange);
  }
}

function bootstrap() {
  loadSessions();
  loadThemePreference();
  bindEvents();
  setStatus('Idle');
  connectWs();
  autosizeInput();
  updateComposerState();
  render();
}

bootstrap();
