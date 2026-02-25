(function bootstrap() {
  const bridge = window.desktopLive2dBridge;
  const state = {
    modelLoaded: false,
    modelName: null,
    bubbleVisible: false,
    chatPanelVisible: false,
    chatHistorySize: 0,
    lastError: null,
    layout: null
  };

  let pixiApp = null;
  let live2dModel = null;
  let hideBubbleTimer = null;

  const stageContainer = document.getElementById('stage');
  const bubbleElement = document.getElementById('bubble');
  const chatPanelElement = document.getElementById('chat-panel');
  const chatPanelMessagesElement = document.getElementById('chat-panel-messages');
  const chatInputElement = document.getElementById('chat-input');
  const chatSendElement = document.getElementById('chat-send');
  const chatComposerElement = document.getElementById('chat-panel-composer');

  const chatStateApi = window.ChatPanelState;
  let runtimeUiConfig = null;
  let chatPanelState = null;
  let chatPanelEnabled = false;

  function createRpcError(code, message) {
    return { code, message };
  }

  function setBubbleVisible(visible) {
    state.bubbleVisible = visible;
    bubbleElement.classList.toggle('visible', visible);
  }

  function syncChatStateSummary() {
    state.chatPanelVisible = Boolean(chatPanelEnabled && chatPanelState?.visible);
    state.chatHistorySize = Array.isArray(chatPanelState?.messages) ? chatPanelState.messages.length : 0;
  }

  function assertChatPanelEnabled() {
    if (!chatPanelEnabled || !chatPanelState) {
      throw createRpcError(-32005, 'chat panel is disabled');
    }
  }

  function renderChatMessages() {
    if (!chatPanelMessagesElement || !chatPanelState) {
      return;
    }

    chatPanelMessagesElement.innerHTML = '';
    const fragment = document.createDocumentFragment();
    for (const message of chatPanelState.messages) {
      const node = document.createElement('div');
      node.className = `chat-message ${message.role}`;
      node.textContent = message.text;
      fragment.appendChild(node);
    }
    chatPanelMessagesElement.appendChild(fragment);
    chatPanelMessagesElement.scrollTop = chatPanelMessagesElement.scrollHeight;

    syncChatStateSummary();
  }

  function applyChatPanelVisibility() {
    const visible = Boolean(chatPanelEnabled && chatPanelState?.visible);
    chatPanelElement?.classList.toggle('visible', visible);
    syncChatStateSummary();
  }

  function setChatPanelVisible(visible) {
    assertChatPanelEnabled();
    chatPanelState = chatStateApi.setPanelVisible(chatPanelState, visible);
    applyChatPanelVisibility();
    return { ok: true, visible: chatPanelState.visible };
  }

  function appendChatMessage(params, fallbackRole = 'assistant') {
    assertChatPanelEnabled();
    chatPanelState = chatStateApi.appendMessage(chatPanelState, params, fallbackRole);
    renderChatMessages();
    return { ok: true, count: chatPanelState.messages.length };
  }

  function clearChatMessages() {
    assertChatPanelEnabled();
    chatPanelState = chatStateApi.clearMessages(chatPanelState);
    renderChatMessages();
    return { ok: true, count: 0 };
  }

  function showBubble(params) {
    const text = String(params?.text || '').trim();
    if (!text) {
      throw createRpcError(-32602, 'chat.show requires non-empty text');
    }

    const durationMs = Number.isFinite(Number(params?.durationMs))
      ? Math.max(500, Math.min(30000, Number(params.durationMs)))
      : 5000;

    bubbleElement.textContent = text;
    setBubbleVisible(true);

    if (hideBubbleTimer) {
      clearTimeout(hideBubbleTimer);
    }
    hideBubbleTimer = setTimeout(() => {
      setBubbleVisible(false);
      hideBubbleTimer = null;
    }, durationMs);

    if (runtimeUiConfig?.chat?.bubble?.mirrorToPanel && chatPanelEnabled) {
      appendChatMessage(
        {
          role: String(params?.role || 'assistant'),
          text,
          timestamp: Date.now(),
          requestId: params?.requestId
        },
        'assistant'
      );
    }

    return { ok: true, expiresAt: Date.now() + durationMs };
  }

  function setModelParam(params) {
    if (!live2dModel || !state.modelLoaded) {
      throw createRpcError(-32004, 'model not loaded');
    }

    const name = String(params?.name || '').trim();
    const value = Number(params?.value);
    if (!name || !Number.isFinite(value)) {
      throw createRpcError(-32602, 'param.set requires { name, value:number }');
    }

    const coreModel = live2dModel.internalModel?.coreModel;
    if (!coreModel || typeof coreModel.setParameterValueById !== 'function') {
      throw createRpcError(-32005, 'setParameterValueById is unavailable on this model runtime');
    }

    coreModel.setParameterValueById(name, value);
    return { ok: true };
  }

  function getState() {
    syncChatStateSummary();
    return {
      modelLoaded: state.modelLoaded,
      modelName: state.modelName,
      bubbleVisible: state.bubbleVisible,
      chatPanelVisible: state.chatPanelVisible,
      chatHistorySize: state.chatHistorySize,
      lastError: state.lastError,
      layout: state.layout
    };
  }

  function initChatPanel(config) {
    if (!chatStateApi) {
      throw new Error('ChatPanelState runtime is unavailable');
    }

    const panelConfig = config?.panel || {};
    chatPanelEnabled = Boolean(panelConfig.enabled);

    chatPanelState = chatStateApi.createInitialState({
      defaultVisible: panelConfig.defaultVisible,
      maxMessages: panelConfig.maxMessages,
      inputEnabled: panelConfig.inputEnabled
    });

    if (chatPanelElement) {
      const width = Number(panelConfig.width);
      const height = Number(panelConfig.height);
      if (Number.isFinite(width) && width > 0) {
        chatPanelElement.style.width = `${width}px`;
      }
      if (Number.isFinite(height) && height > 0) {
        chatPanelElement.style.height = `${height}px`;
      }
    }

    if (!chatPanelEnabled) {
      chatPanelElement?.remove();
      syncChatStateSummary();
      return;
    }

    if (chatComposerElement) {
      chatComposerElement.style.display = chatPanelState.inputEnabled ? 'flex' : 'none';
    }

    if (chatInputElement) {
      chatInputElement.disabled = !chatPanelState.inputEnabled;
    }
    if (chatSendElement) {
      chatSendElement.disabled = !chatPanelState.inputEnabled;
    }

    renderChatMessages();
    applyChatPanelVisibility();

    const submitInput = () => {
      if (!chatPanelState?.inputEnabled) {
        return;
      }
      const text = String(chatInputElement?.value || '').trim();
      if (!text) {
        return;
      }

      const payload = {
        role: 'user',
        text,
        timestamp: Date.now(),
        source: 'chat-panel'
      };

      appendChatMessage(payload, 'user');
      if (chatInputElement) {
        chatInputElement.value = '';
      }
      bridge.sendChatInput(payload);
    };

    chatSendElement?.addEventListener('click', submitInput);
    chatInputElement?.addEventListener('keydown', (event) => {
      if (event.key !== 'Enter') {
        return;
      }
      event.preventDefault();
      submitInput();
    });
  }

  async function initPixi() {
    const PIXI = window.PIXI;
    if (!PIXI) {
      throw new Error('PIXI global is not available');
    }

    const renderConfig = runtimeUiConfig?.render || {};
    const resolutionScale = Number(renderConfig.resolutionScale) || 1;
    const maxDevicePixelRatio = Number(renderConfig.maxDevicePixelRatio) || 2;
    const antialias = Boolean(renderConfig.antialias);
    const resolution = Math.max(1, Math.min(maxDevicePixelRatio, (Number(window.devicePixelRatio) || 1) * resolutionScale));
    const rendererOptions = {
      transparent: true,
      resizeTo: window,
      antialias,
      autoDensity: true,
      resolution,
      powerPreference: 'high-performance'
    };

    const supportsAsyncInit = typeof PIXI.Application?.prototype?.init === 'function';
    const app = supportsAsyncInit
      ? new PIXI.Application()
      : new PIXI.Application(rendererOptions);

    if (typeof app.init === 'function') {
      await app.init({
        ...rendererOptions,
        backgroundAlpha: 0
      });
    }

    const canvas = app.canvas || app.view;
    if (!canvas) {
      throw new Error('PIXI canvas/view is unavailable');
    }

    stageContainer.appendChild(canvas);
    pixiApp = app;
  }

  function resolveLive2dConstructor() {
    return window.PIXI?.live2d?.Live2DModel
      || window.Live2DModel
      || window.PIXI?.Live2DModel
      || null;
  }

  async function loadModel(modelRelativePath, modelName) {
    const Live2DModel = resolveLive2dConstructor();
    if (!Live2DModel || typeof Live2DModel.from !== 'function') {
      throw new Error('Live2DModel runtime is unavailable');
    }

    const modelUrl = new URL(modelRelativePath, window.location.href).toString();
    live2dModel = await Live2DModel.from(modelUrl);

    pixiApp.stage.addChild(live2dModel);
    applyAdaptiveLayout();
    window.addEventListener('resize', scheduleAdaptiveLayout, { passive: true });

    state.modelLoaded = true;
    state.modelName = modelName || null;
  }

  function getStageSize() {
    const rendererWidth = pixiApp?.renderer?.screen?.width;
    const rendererHeight = pixiApp?.renderer?.screen?.height;
    return {
      width: rendererWidth || window.innerWidth || 640,
      height: rendererHeight || window.innerHeight || 720
    };
  }

  function applyAdaptiveLayout() {
    if (!live2dModel || !window.Live2DLayout?.computeModelLayout) return;

    if (typeof live2dModel.scale?.set === 'function') {
      live2dModel.scale.set(1);
    }

    const bounds = live2dModel.getLocalBounds?.();
    if (!bounds || !Number.isFinite(bounds.width) || !Number.isFinite(bounds.height)) {
      return;
    }

    const stageSize = getStageSize();
    const layoutConfig = runtimeUiConfig?.layout || {};
    const layout = window.Live2DLayout.computeModelLayout({
      stageWidth: stageSize.width,
      stageHeight: stageSize.height,
      boundsX: bounds.x,
      boundsY: bounds.y,
      boundsWidth: bounds.width,
      boundsHeight: bounds.height,
      ...layoutConfig
    });

    if (typeof live2dModel.scale?.set === 'function') {
      live2dModel.scale.set(layout.scale);
    }
    if (typeof live2dModel.pivot?.set === 'function') {
      live2dModel.pivot.set(layout.pivotX, layout.pivotY);
    }
    if (typeof live2dModel.position?.set === 'function') {
      live2dModel.position.set(layout.positionX, layout.positionY);
    }

    state.layout = {
      scale: layout.scale,
      positionX: layout.positionX,
      positionY: layout.positionY,
      pivotX: layout.pivotX,
      pivotY: layout.pivotY,
      ...layout.debug
    };
  }

  function scheduleAdaptiveLayout() {
    window.requestAnimationFrame(() => {
      applyAdaptiveLayout();
    });
  }

  async function handleInvoke(payload) {
    const { requestId, method, params } = payload || {};

    try {
      let result;
      if (method === 'state.get') {
        result = getState();
      } else if (method === 'param.set') {
        result = setModelParam(params);
      } else if (method === 'chat.show' || method === 'chat.bubble.show') {
        result = showBubble(params);
      } else if (method === 'chat.panel.show') {
        result = setChatPanelVisible(true);
      } else if (method === 'chat.panel.hide') {
        result = setChatPanelVisible(false);
      } else if (method === 'chat.panel.append') {
        result = appendChatMessage(params, 'assistant');
      } else if (method === 'chat.panel.clear') {
        result = clearChatMessages();
      } else {
        throw createRpcError(-32601, `method not found: ${method}`);
      }

      bridge.sendResult({ requestId, result });
    } catch (err) {
      const error = err && typeof err.code === 'number'
        ? err
        : createRpcError(-32005, err?.message || String(err || 'unknown error'));

      bridge.sendResult({ requestId, error });
    }
  }

  async function main() {
    try {
      if (!bridge) {
        throw new Error('desktopLive2dBridge is unavailable');
      }

      const runtimeConfig = await bridge.getRuntimeConfig();
      runtimeUiConfig = runtimeConfig.uiConfig || null;
      initChatPanel(runtimeUiConfig?.chat || {});
      await initPixi();
      await loadModel(runtimeConfig.modelRelativePath, runtimeConfig.modelName);

      bridge.onInvoke((payload) => {
        void handleInvoke(payload);
      });

      bridge.notifyReady({ ok: true });
    } catch (err) {
      state.lastError = err?.message || String(err || 'renderer bootstrap failed');
      bridge?.notifyError({ message: state.lastError });
    }
  }

  void main();
})();
