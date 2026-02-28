// config-v2.js — Config v2 前端逻辑

const TABS = [
  { id: 'providers',      label: 'providers',      getUrl: '/api/config/providers/raw',    putUrl: '/api/config/providers/raw',    bodyKey: 'yaml' },
  { id: 'tools',          label: 'tools',          getUrl: '/api/config/tools/raw',        putUrl: '/api/config/tools/raw',        bodyKey: 'yaml' },
  { id: 'skills',         label: 'skills',         getUrl: '/api/config/skills/raw',       putUrl: '/api/config/skills/raw',       bodyKey: 'yaml' },
  { id: 'persona',        label: 'persona',        getUrl: '/api/config/persona/raw',      putUrl: '/api/config/persona/raw',      bodyKey: 'yaml' },
  { id: 'voice-policy',   label: 'voice-policy',   getUrl: '/api/config/voice-policy/raw', putUrl: '/api/config/voice-policy/raw', bodyKey: 'yaml' },
  { id: 'desktop-live2d', label: 'desktop-live2d', getUrl: '/api/config/desktop-live2d/raw', putUrl: null, bodyKey: 'json', readonly: true },
];

const THEME_KEY = 'yachiyo_theme_v1';
const AGENT_SESSION_ID = 'config-v2-agent';

const el = {
  tabBar:        document.querySelector('.cv2-tabbar'),
  editor:        document.getElementById('editor'),
  loadBtn:       document.getElementById('loadBtn'),
  saveBtn:       document.getElementById('saveBtn'),
  status:        document.getElementById('cv2-status'),
  fileLabel:     document.getElementById('cv2-file-label'),
  readonlyBadge: document.getElementById('cv2-readonly-badge'),
  agentMessages: document.getElementById('agentMessages'),
  agentInput:    document.getElementById('agentInput'),
  agentSendBtn:  document.getElementById('agentSendBtn'),
  themeSelect:   document.getElementById('themeSelect'),
};

let activeTabId = TABS[0].id;
let ws = null;
let wsReady = false;
let streamingEl = null;
let streamingText = '';

// ── Theme ──────────────────────────────────────────────────────────────────
function applyTheme(pref) {
  const resolved = pref === 'auto'
    ? (window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light')
    : pref;
  document.documentElement.setAttribute('data-theme', resolved);
  el.themeSelect.value = pref;
}

function initTheme() {
  const saved = localStorage.getItem(THEME_KEY) || 'auto';
  applyTheme(saved);
  el.themeSelect.addEventListener('change', () => {
    localStorage.setItem(THEME_KEY, el.themeSelect.value);
    applyTheme(el.themeSelect.value);
  });
  window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', () => {
    if ((localStorage.getItem(THEME_KEY) || 'auto') === 'auto') applyTheme('auto');
  });
}

// ── Status ─────────────────────────────────────────────────────────────────
function setStatus(text, isErr = false) {
  el.status.textContent = text;
  el.status.className = `status ${isErr ? 'err' : 'ok'}`;
}

// ── API ────────────────────────────────────────────────────────────────────
async function fetchJson(url, opts = {}) {
  const res = await fetch(url, opts);
  const data = await res.json();
  if (!data.ok) throw new Error(data.error || `HTTP ${res.status}`);
  return data;
}

// ── Tabs ───────────────────────────────────────────────────────────────────
function buildTabs() {
  TABS.forEach((tab, i) => {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'cv2-tab';
    btn.textContent = tab.label;
    btn.setAttribute('role', 'tab');
    btn.setAttribute('aria-selected', i === 0 ? 'true' : 'false');
    btn.setAttribute('aria-controls', 'cv2-tabpanel');
    btn.id = `cv2-tab-${tab.id}`;
    btn.dataset.tabId = tab.id;

    // Keyboard nav: arrow keys between tabs (WCAG 2.1 §4.1.2 / ARIA pattern)
    btn.addEventListener('keydown', (e) => {
      const tabs = [...el.tabBar.querySelectorAll('.cv2-tab')];
      const idx = tabs.indexOf(e.currentTarget);
      if (e.key === 'ArrowRight') { e.preventDefault(); tabs[(idx + 1) % tabs.length].focus(); }
      if (e.key === 'ArrowLeft')  { e.preventDefault(); tabs[(idx - 1 + tabs.length) % tabs.length].focus(); }
      if (e.key === 'Home')       { e.preventDefault(); tabs[0].focus(); }
      if (e.key === 'End')        { e.preventDefault(); tabs[tabs.length - 1].focus(); }
    });

    btn.addEventListener('click', () => switchTab(tab.id));
    el.tabBar.appendChild(btn);
  });
}

function switchTab(id) {
  activeTabId = id;
  const tab = TABS.find(t => t.id === id);

  el.tabBar.querySelectorAll('.cv2-tab').forEach(b => {
    const selected = b.dataset.tabId === id;
    b.setAttribute('aria-selected', selected ? 'true' : 'false');
  });

  el.fileLabel.textContent = `${tab.label}.${tab.bodyKey === 'json' ? 'json' : 'yaml'}`;

  if (tab.readonly) {
    el.readonlyBadge.hidden = false;
    el.saveBtn.disabled = true;
    el.saveBtn.setAttribute('aria-disabled', 'true');
    el.editor.readOnly = true;
    el.editor.setAttribute('aria-readonly', 'true');
  } else {
    el.readonlyBadge.hidden = true;
    el.saveBtn.disabled = false;
    el.saveBtn.removeAttribute('aria-disabled');
    el.editor.readOnly = false;
    el.editor.setAttribute('aria-readonly', 'false');
  }

  loadTab();
}

async function loadTab() {
  const tab = TABS.find(t => t.id === activeTabId);
  setStatus('加载中…');
  try {
    const data = await fetchJson(tab.getUrl);
    el.editor.value = data[tab.bodyKey] || '';
    setStatus('已加载');
  } catch (err) {
    setStatus(err.message, true);
  }
}

async function saveTab() {
  const tab = TABS.find(t => t.id === activeTabId);
  if (tab.readonly || !tab.putUrl) { setStatus('只读文件，无法保存', true); return; }
  setStatus('保存中…');
  try {
    await fetchJson(tab.putUrl, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ [tab.bodyKey]: el.editor.value }),
    });
    setStatus('已保存 ✓');
  } catch (err) {
    setStatus(err.message, true);
  }
}

// ── Agent WebSocket ────────────────────────────────────────────────────────
function initWs() {
  const proto = location.protocol === 'https:' ? 'wss' : 'ws';
  ws = new WebSocket(`${proto}://${location.host}/ws`);

  ws.addEventListener('open', () => { wsReady = true; });

  ws.addEventListener('message', (e) => {
    let msg;
    try { msg = JSON.parse(e.data); } catch { return; }

    // 流式 token
    if (msg.type === 'token' || msg.type === 'delta') {
      const chunk = msg.token || msg.delta || '';
      streamingText += chunk;
      if (streamingEl) {
        streamingEl.querySelector('.cv2-msg-text').textContent = streamingText;
        el.agentMessages.scrollTop = el.agentMessages.scrollHeight;
      }
      return;
    }

    // 完成
    if (msg.type === 'result' || msg.result) {
      const output = msg.result?.output || msg.output || streamingText;
      if (streamingEl) {
        streamingEl.classList.remove('is-streaming');
        const textEl = streamingEl.querySelector('.cv2-msg-text');
        textEl.textContent = output;

        // 检测代码块，注入 Apply 按钮
        const codeMatch = output.match(/```(?:yaml|json)?\n([\s\S]*?)```/);
        if (codeMatch) {
          const applyBtn = document.createElement('button');
          applyBtn.type = 'button';
          applyBtn.className = 'cv2-apply-btn';
          applyBtn.textContent = '应用到编辑器';
          applyBtn.setAttribute('aria-label', '将 agent 建议的代码应用到编辑器');
          const captured = codeMatch[1];
          applyBtn.addEventListener('click', () => {
            el.editor.value = captured;
            setStatus('已从 Agent 应用');
            el.editor.focus();
          });
          streamingEl.appendChild(applyBtn);
        }
      }
      streamingText = '';
      streamingEl = null;
      el.agentMessages.scrollTop = el.agentMessages.scrollHeight;
    }
  });

  ws.addEventListener('error', () => setStatus('Agent 连接失败', true));
  ws.addEventListener('close', () => { wsReady = false; });
}

function appendMsg(role, text) {
  const div = document.createElement('div');
  div.className = `cv2-msg cv2-msg--${role}`;

  const span = document.createElement('span');
  span.className = 'cv2-msg-text';
  span.textContent = text;
  div.appendChild(span);

  el.agentMessages.appendChild(div);
  el.agentMessages.scrollTop = el.agentMessages.scrollHeight;
  return div;
}

function sendAgentMessage() {
  const userText = el.agentInput.value.trim();
  if (!userText) return;
  if (!wsReady) { setStatus('Agent 未连接，请稍候', true); return; }

  el.agentInput.value = '';
  appendMsg('user', userText);

  const tab = TABS.find(t => t.id === activeTabId);
  const contextPrefix = `[当前编辑的 ${tab.label} 文件内容]\n\`\`\`\n${el.editor.value}\n\`\`\`\n\n`;

  streamingText = '';
  streamingEl = appendMsg('agent', '…');
  streamingEl.classList.add('is-streaming');

  ws.send(JSON.stringify({
    type: 'run',
    session_id: AGENT_SESSION_ID,
    input: contextPrefix + userText,
  }));
}

// ── Bootstrap ──────────────────────────────────────────────────────────────
function init() {
  initTheme();
  buildTabs();

  // 初始化第一个 tab 状态
  switchTab(TABS[0].id);

  el.loadBtn.addEventListener('click', loadTab);
  el.saveBtn.addEventListener('click', saveTab);
  el.agentSendBtn.addEventListener('click', sendAgentMessage);
  el.agentInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && !e.shiftKey && !e.isComposing) {
      e.preventDefault();
      sendAgentMessage();
    }
  });

  initWs();
}

init();
