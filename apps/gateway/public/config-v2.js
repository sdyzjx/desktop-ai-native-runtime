// config-v2.js — Config v2 前端逻辑

const TABS = [
  { id: 'providers', label: 'providers', getUrl: '/api/config/providers/raw', putUrl: '/api/config/providers/raw', yamlKey: 'yaml' },
  { id: 'tools',     label: 'tools',     getUrl: '/api/config/tools/raw',     putUrl: '/api/config/tools/raw',     yamlKey: 'yaml' },
  { id: 'skills',    label: 'skills',    getUrl: '/api/config/skills/raw',    putUrl: '/api/config/skills/raw',    yamlKey: 'yaml' },
  { id: 'persona',   label: 'persona',   getUrl: '/api/config/persona/raw',   putUrl: '/api/config/persona/raw',   yamlKey: 'yaml' },
  { id: 'voice-policy', label: 'voice-policy', getUrl: '/api/config/voice-policy/raw', putUrl: '/api/config/voice-policy/raw', yamlKey: 'yaml' },
  { id: 'desktop-live2d', label: 'desktop-live2d', getUrl: '/api/config/desktop-live2d/raw', putUrl: null, yamlKey: 'json', readonly: true },
];

const THEME_KEY = 'yachiyo_theme_v1';
const AGENT_SESSION_ID = 'config-v2-agent';

const el = {
  tabBar: document.getElementById('tabBar'),
  editor: document.getElementById('editor'),
  loadBtn: document.getElementById('loadBtn'),
  saveBtn: document.getElementById('saveBtn'),
  statusText: document.getElementById('statusText'),
  agentMessages: document.getElementById('agentMessages'),
  agentInput: document.getElementById('agentInput'),
  agentSendBtn: document.getElementById('agentSendBtn'),
  themeSelect: document.getElementById('themeSelect'),
};

let activeTabId = TABS[0].id;
let ws = null;
let wsReady = false;
let pendingAgentChunks = '';
let agentMsgEl = null;

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
  el.themeSelect.onchange = () => {
    localStorage.setItem(THEME_KEY, el.themeSelect.value);
    applyTheme(el.themeSelect.value);
  };
  window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', () => {
    if ((localStorage.getItem(THEME_KEY) || 'auto') === 'auto') applyTheme('auto');
  });
}

// ── Status ─────────────────────────────────────────────────────────────────
function setStatus(text, isErr = false) {
  el.statusText.textContent = text;
  el.statusText.className = `status ${isErr ? 'err' : 'ok'}`;
}

// ── API helpers ────────────────────────────────────────────────────────────
async function fetchJson(url, opts = {}) {
  const res = await fetch(url, opts);
  const data = await res.json();
  if (!data.ok) throw new Error(data.error || `HTTP ${res.status}`);
  return data;
}

// ── Tabs ───────────────────────────────────────────────────────────────────
function buildTabs() {
  TABS.forEach(tab => {
    const btn = document.createElement('button');
    btn.className = 'tab' + (tab.id === activeTabId ? ' active' : '');
    btn.textContent = tab.label + (tab.readonly ? ' 🔒' : '');
    btn.onclick = () => switchTab(tab.id);
    btn.dataset.tabId = tab.id;
    el.tabBar.appendChild(btn);
  });
}

function switchTab(id) {
  activeTabId = id;
  el.tabBar.querySelectorAll('.tab').forEach(b => {
    b.classList.toggle('active', b.dataset.tabId === id);
  });
  const tab = TABS.find(t => t.id === id);
  el.saveBtn.disabled = !!tab.readonly;
  el.saveBtn.style.opacity = tab.readonly ? '0.4' : '1';
  loadTab();
}

async function loadTab() {
  const tab = TABS.find(t => t.id === activeTabId);
  setStatus('Loading...');
  try {
    const data = await fetchJson(tab.getUrl);
    el.editor.value = data[tab.yamlKey] || '';
    setStatus('Loaded');
  } catch (err) {
    setStatus(err.message, true);
  }
}

async function saveTab() {
  const tab = TABS.find(t => t.id === activeTabId);
  if (tab.readonly || !tab.putUrl) { setStatus('只读文件，不可保存', true); return; }
  setStatus('Saving...');
  try {
    await fetchJson(tab.putUrl, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ [tab.yamlKey]: el.editor.value }),
    });
    setStatus('Saved ✓');
  } catch (err) {
    setStatus(err.message, true);
  }
}

// ── Agent WebSocket ────────────────────────────────────────────────────────
function initWs() {
  const proto = location.protocol === 'https:' ? 'wss' : 'ws';
  ws = new WebSocket(`${proto}://${location.host}/ws`);

  ws.onopen = () => { wsReady = true; };

  ws.onmessage = (e) => {
    let msg;
    try { msg = JSON.parse(e.data); } catch { return; }

    // 流式 token
    if (msg.type === 'token' || msg.type === 'delta') {
      const chunk = msg.token || msg.delta || '';
      pendingAgentChunks += chunk;
      if (agentMsgEl) agentMsgEl.querySelector('.text').textContent = pendingAgentChunks;
      return;
    }

    // 完成
    if (msg.type === 'result' || (msg.result && msg.result.output)) {
      const output = msg.result?.output || msg.output || pendingAgentChunks;
      if (agentMsgEl) {
        agentMsgEl.querySelector('.text').textContent = output;
        // 检测代码块，加 Apply 按钮
        const codeMatch = output.match(/```(?:yaml|json)?\n([\s\S]*?)```/);
        if (codeMatch) {
          const applyBtn = document.createElement('button');
          applyBtn.className = 'apply-btn';
          applyBtn.textContent = '[Apply to editor]';
          applyBtn.onclick = () => { el.editor.value = codeMatch[1]; setStatus('Applied from agent'); };
          agentMsgEl.appendChild(applyBtn);
        }
      }
      pendingAgentChunks = '';
      agentMsgEl = null;
      return;
    }
  };

  ws.onerror = () => setStatus('Agent WS 连接失败', true);
  ws.onclose = () => { wsReady = false; };
}

function appendMsg(role, text) {
  const div = document.createElement('div');
  div.className = `msg ${role}`;
  const span = document.createElement('span');
  span.className = 'text';
  span.textContent = text;
  div.appendChild(span);
  el.agentMessages.appendChild(div);
  el.agentMessages.scrollTop = el.agentMessages.scrollHeight;
  return div;
}

function sendAgentMessage() {
  const userText = el.agentInput.value.trim();
  if (!userText) return;
  if (!wsReady) { setStatus('Agent 未连接', true); return; }

  el.agentInput.value = '';
  appendMsg('user', userText);

  // 把当前编辑器内容作为 context 注入
  const currentYaml = el.editor.value;
  const tab = TABS.find(t => t.id === activeTabId);
  const contextPrefix = `[当前编辑的 ${tab.label} 内容]\n\`\`\`\n${currentYaml}\n\`\`\`\n\n`;
  const fullInput = contextPrefix + userText;

  pendingAgentChunks = '';
  agentMsgEl = appendMsg('agent', '...');

  ws.send(JSON.stringify({
    type: 'run',
    session_id: AGENT_SESSION_ID,
    input: fullInput,
  }));
}

// ── Bootstrap ──────────────────────────────────────────────────────────────
function init() {
  initTheme();
  buildTabs();

  el.loadBtn.onclick = loadTab;
  el.saveBtn.onclick = saveTab;
  el.agentSendBtn.onclick = sendAgentMessage;
  el.agentInput.onkeydown = (e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendAgentMessage(); } };

  initWs();
  loadTab();
}

init();
