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

  function renderMessages() {
    if (!messagesElement) {
      return;
    }
    messagesElement.innerHTML = '';
    const fragment = document.createDocumentFragment();
    for (const message of state.messages) {
      const node = document.createElement('div');
      node.className = `chat-message ${normalizeRole(message.role)}`;
      node.textContent = String(message.text || '');
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
