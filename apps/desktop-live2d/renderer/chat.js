(function chatWindowMain() {
  const bridge = window.desktopLive2dBridge;
  const messagesElement = document.getElementById('chat-panel-messages');
  const chatInputElement = document.getElementById('chat-input');
  const chatSendElement = document.getElementById('chat-send');
  const chatComposerElement = document.getElementById('chat-panel-composer');
  const chatHideElement = document.getElementById('chat-hide');
  const openWebUiElement = document.getElementById('open-webui');

  const state = {
    inputEnabled: true,
    messages: []
  };
  let chatInputComposing = false;
  const allowedRoles = new Set(['user', 'assistant', 'system', 'tool']);

  // Initialize Mermaid with dark theme
  if (typeof mermaid !== 'undefined') {
    mermaid.initialize({
      startOnLoad: false,
      theme: 'dark',
      themeVariables: {
        primaryColor: '#5d96ff',
        primaryTextColor: '#f4f8ff',
        primaryBorderColor: '#4a7acc',
        lineColor: '#8299cc',
        secondaryColor: '#8266ff',
        tertiaryColor: '#65debf',
        background: '#0a0e18',
        mainBkg: '#1a1e2e',
        secondBkg: '#252938',
        textColor: '#f4f8ff',
        fontSize: '12px',
        fontFamily: '"SF Pro Text", "PingFang SC", sans-serif'
      }
    });
  }

  // Configure marked for markdown rendering
  if (typeof marked !== 'undefined') {
    marked.setOptions({
      breaks: true,
      gfm: true,
      highlight: function(code, lang) {
        if (typeof hljs !== 'undefined' && lang && hljs.getLanguage(lang)) {
          try {
            return hljs.highlight(code, { language: lang }).value;
          } catch (err) {
            console.warn('Highlight error:', err);
          }
        }
        return code;
      }
    });
  }

  function normalizeRole(role) {
    const normalized = String(role || '').trim();
    return allowedRoles.has(normalized) ? normalized : 'assistant';
  }

  function renderMarkdown(text) {
    if (typeof marked === 'undefined') {
      return text;
    }
    try {
      return marked.parse(text);
    } catch (err) {
      console.warn('Markdown parse error:', err);
      return text;
    }
  }

  async function renderMermaidDiagrams(container) {
    if (typeof mermaid === 'undefined') {
      return;
    }
    const mermaidElements = container.querySelectorAll('.language-mermaid, code.mermaid');
    for (const element of mermaidElements) {
      try {
        const code = element.textContent;
        const { svg } = await mermaid.render(`mermaid-${Date.now()}-${Math.random()}`, code);
        const wrapper = document.createElement('div');
        wrapper.className = 'mermaid';
        wrapper.innerHTML = svg;
        element.parentElement.replaceWith(wrapper);
      } catch (err) {
        console.warn('Mermaid render error:', err);
      }
    }
  }

  async function renderMessages() {
    if (!messagesElement) {
      return;
    }
    messagesElement.innerHTML = '';
    const fragment = document.createDocumentFragment();

    for (const message of state.messages) {
      const node = document.createElement('div');
      node.className = `chat-message ${normalizeRole(message.role)}`;

      const contentWrapper = document.createElement('div');
      contentWrapper.className = 'chat-message-content';

      const text = String(message.text || '');

      // Render markdown for assistant messages, plain text for others
      if (message.role === 'assistant' && typeof marked !== 'undefined') {
        contentWrapper.innerHTML = renderMarkdown(text);
      } else {
        contentWrapper.textContent = text;
      }

      node.appendChild(contentWrapper);
      fragment.appendChild(node);
    }

    messagesElement.appendChild(fragment);

    // Render mermaid diagrams after DOM update
    await renderMermaidDiagrams(messagesElement);

    messagesElement.scrollTop = messagesElement.scrollHeight;
  }

  function applyChatState(payload) {
    const nextInputEnabled = payload?.inputEnabled !== false;
    state.inputEnabled = nextInputEnabled;
    state.messages = Array.isArray(payload?.messages) ? payload.messages : [];

    if (chatComposerElement) {
      chatComposerElement.style.display = nextInputEnabled ? 'flex' : 'none';
    }
    if (chatInputElement) {
      chatInputElement.disabled = !nextInputEnabled;
    }
    if (chatSendElement) {
      chatSendElement.disabled = !nextInputEnabled;
    }
    renderMessages();
  }

  function submitInput() {
    if (!state.inputEnabled) {
      return;
    }
    const text = String(chatInputElement?.value || '').trim();
    if (!text) {
      return;
    }
    bridge?.sendChatInput?.({
      role: 'user',
      text,
      timestamp: Date.now(),
      source: 'chat-panel-window'
    });
    if (chatInputElement) {
      chatInputElement.value = '';
      chatInputElement.focus();
    }
  }

  bridge?.onChatStateSync?.((payload) => {
    applyChatState(payload);
  });

  chatSendElement?.addEventListener('click', submitInput);
  chatInputElement?.addEventListener('compositionstart', () => {
    chatInputComposing = true;
  });
  chatInputElement?.addEventListener('compositionend', () => {
    chatInputComposing = false;
  });
  chatInputElement?.addEventListener('blur', () => {
    chatInputComposing = false;
  });
  chatInputElement?.addEventListener('keydown', (event) => {
    if (event.key !== 'Enter') {
      return;
    }
    if (event.isComposing || Number(event.keyCode) === 229 || chatInputComposing) {
      return;
    }
    event.preventDefault();
    submitInput();
  });

  chatHideElement?.addEventListener('click', () => {
    bridge?.sendWindowControl?.({ action: 'hide_chat' });
  });
  openWebUiElement?.addEventListener('click', () => {
    bridge?.sendWindowControl?.({ action: 'open_webui' });
  });
})();
