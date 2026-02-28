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
  gitLog:        document.getElementById('cv2-git-log'),
  dirtyBadge:    document.getElementById('cv2-dirty-badge'),
  gitRefreshBtn: document.getElementById('gitRefreshBtn'),
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
  loadGitLog();
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
    loadGitLog(); // 保存后刷新版本历史
  } catch (err) {
    setStatus(err.message, true);
  }
}

// ── Git log ────────────────────────────────────────────────────────────────
function formatDate(iso) {
  const d = new Date(iso);
  const pad = n => String(n).padStart(2, '0');
  return `${d.getMonth() + 1}/${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

async function loadGitLog() {
  const tab = TABS.find(t => t.id === activeTabId);
  // desktop-live2d 是 json，文件名不同
  const fileName = tab.id === 'desktop-live2d' ? 'desktop-live2d.json' : `${tab.id}.yaml`;

  try {
    const data = await fetchJson(`/api/config/git/log?file=${encodeURIComponent(fileName)}&limit=12`);

    // 未提交标记
    el.dirtyBadge.hidden = !data.dirty;

    el.gitLog.innerHTML = '';

    if (!data.commits || data.commits.length === 0) {
      const empty = document.createElement('li');
      empty.className = 'cv2-git-empty';
      empty.textContent = '暂无提交记录';
      el.gitLog.appendChild(empty);
      return;
    }

    data.commits.forEach((commit, idx) => {
      const li = document.createElement('li');
      li.className = 'cv2-git-entry';

      // 绿点
      const dot = document.createElement('span');
      dot.className = 'cv2-git-dot';
      dot.setAttribute('aria-hidden', 'true');

      // short hash
      const shortEl = document.createElement('span');
      shortEl.className = 'cv2-git-short';
      shortEl.textContent = commit.short;

      // subject
      const subjectEl = document.createElement('span');
      subjectEl.className = 'cv2-git-subject';
      subjectEl.textContent = commit.subject;
      subjectEl.title = commit.subject;

      // date
      const dateEl = document.createElement('span');
      dateEl.className = 'cv2-git-date';
      dateEl.textContent = formatDate(commit.date);

      // actions
      const actions = document.createElement('div');
      actions.className = 'cv2-git-actions';

      // 预览按钮
      const previewBtn = document.createElement('button');
      previewBtn.type = 'button';
      previewBtn.className = 'cv2-git-btn';
      previewBtn.textContent = '预览';
      previewBtn.setAttribute('aria-label', `预览 ${commit.short} 版本的 ${fileName}`);
      previewBtn.addEventListener('click', async () => {
        try {
          const d = await fetchJson(`/api/config/git/show?hash=${commit.hash}&file=${encodeURIComponent(fileName)}`);
          el.editor.value = d.content;
          setStatus(`预览 ${commit.short} — 未保存`);
        } catch (e) {
          setStatus(e.message, true);
        }
      });

      // 恢复按钮（最新 commit 不显示）
      if (idx > 0) {
        const restoreBtn = document.createElement('button');
        restoreBtn.type = 'button';
        restoreBtn.className = 'cv2-git-btn cv2-git-btn--restore';
        restoreBtn.textContent = '恢复';
        restoreBtn.setAttribute('aria-label', `恢复 ${fileName} 到 ${commit.short} 版本`);
        restoreBtn.addEventListener('click', async () => {
          if (!confirm(`确认将 ${fileName} 恢复到 ${commit.short}？\n${commit.subject}`)) return;
          try {
            await fetchJson('/api/config/git/restore', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ hash: commit.hash, file: fileName }),
            });
            setStatus(`已恢复到 ${commit.short} ✓`);
            loadTab();
            loadGitLog();
          } catch (e) {
            setStatus(e.message, true);
          }
        });
        actions.appendChild(restoreBtn);
      }

      actions.appendChild(previewBtn);
      li.append(dot, shortEl, subjectEl, dateEl, actions);
      el.gitLog.appendChild(li);
    });
  } catch (err) {
    el.gitLog.innerHTML = `<li class="cv2-git-empty">加载失败: ${err.message}</li>`;
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

    // 只处理属于 config-v2-agent session 的消息
    const msgSessionId = msg.session_id || msg.data?.session_id || msg.params?.session_id;
    if (msgSessionId && msgSessionId !== AGENT_SESSION_ID) return;

    // 运行中状态提示（legacy: type='start'）
    if (msg.type === 'start') {
      if (streamingEl) {
        streamingEl.querySelector('.cv2-msg-text').textContent = '思考中…';
      }
      return;
    }

    // 工具调用中间事件（legacy: type='event'）
    if (msg.type === 'event') {
      if (streamingEl && msg.data?.event === 'tool.call') {
        streamingEl.querySelector('.cv2-msg-text').textContent =
          `调用工具: ${msg.data.payload?.name || '…'}`;
      }
      return;
    }

    // 完成（legacy: type='final'，含 output 字段）
    if (msg.type === 'final') {
      const output = msg.output || streamingText || '（无回复）';
      finishAgentMessage(output);
      return;
    }

    // 错误
    if (msg.type === 'error') {
      finishAgentMessage(`错误：${msg.message || 'unknown error'}`, true);
      return;
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

function finishAgentMessage(output, isErr = false) {
  if (streamingEl) {
    streamingEl.classList.remove('is-streaming');
    const textEl = streamingEl.querySelector('.cv2-msg-text');
    textEl.textContent = output;

    if (!isErr) {
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
  }
  streamingText = '';
  streamingEl = null;
  el.agentMessages.scrollTop = el.agentMessages.scrollHeight;
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
  el.gitRefreshBtn.addEventListener('click', loadGitLog);
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
