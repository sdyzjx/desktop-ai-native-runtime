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

  function normalizeRole(role) {
    const normalized = String(role || '').trim();
    return allowedRoles.has(normalized) ? normalized : 'assistant';
  }

  function renderLatex(text) {
    if (typeof katex === 'undefined') {
      return text;
    }

    try {
      // Replace display math: $$...$$
      text = text.replace(/\$\$([\s\S]+?)\$\$/g, (match, formula) => {
        try {
          return katex.renderToString(formula.trim(), {
            displayMode: true,
            throwOnError: false
          });
        } catch (err) {
          console.error('KaTeX display math error:', err);
          return match;
        }
      });

      // Replace inline math: $...$
      text = text.replace(/\$([^\$\n]+?)\$/g, (match, formula) => {
        try {
          return katex.renderToString(formula.trim(), {
            displayMode: false,
            throwOnError: false
          });
        } catch (err) {
          console.error('KaTeX inline math error:', err);
          return match;
        }
      });

      return text;
    } catch (err) {
      console.error('LaTeX render error:', err);
      return text;
    }
  }

  function renderMarkdown(text) {
    if (typeof marked === 'undefined') {
      return text;
    }
    try {
      // First render LaTeX formulas
      const textWithLatex = renderLatex(text);

      return marked.parse(textWithLatex, {
        breaks: true,
        gfm: true
      });
    } catch (err) {
      console.error('Markdown parse error:', err);
      return text;
    }
  }

  function renderToolCall(toolData) {
    if (!toolData || !toolData.name) {
      return '';
    }
    const name = String(toolData.name || '');
    const args = toolData.arguments ? JSON.stringify(toolData.arguments, null, 2) : '';
    return `<div class="tool-call">
      <div class="tool-call-name">🔧 ${name}</div>
      ${args ? `<div class="tool-call-args">${args}</div>` : ''}
    </div>`;
  }

  function renderMessages() {
    if (!messagesElement) {
      return;
    }
    messagesElement.innerHTML = '';
    const fragment = document.createDocumentFragment();
    for (const message of state.messages) {
      const node = document.createElement('div');
      node.className = `chat-message ${normalizeRole(message.role)}`;

      let content = String(message.text || '');

      // Render tool calls if present
      if (message.role === 'tool' && message.toolCall) {
        content = renderToolCall(message.toolCall) + (content ? `<div>${renderMarkdown(content)}</div>` : '');
        node.innerHTML = content;
      } else {
        // Render markdown for all other messages
        node.innerHTML = renderMarkdown(content);
      }

      fragment.appendChild(node);
    }
    messagesElement.appendChild(fragment);
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
