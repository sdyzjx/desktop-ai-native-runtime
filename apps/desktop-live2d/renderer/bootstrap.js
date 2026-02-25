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
  let dragPointerState = null;
  let suppressModelTapUntil = 0;
  let stableModelScale = null;

  const stageContainer = document.getElementById('stage');
  const bubbleElement = document.getElementById('bubble');
  const chatPanelElement = document.getElementById('chat-panel');
  const chatPanelMessagesElement = document.getElementById('chat-panel-messages');
  const chatInputElement = document.getElementById('chat-input');
  const chatSendElement = document.getElementById('chat-send');
  const chatComposerElement = document.getElementById('chat-panel-composer');
  const petHideElement = document.getElementById('pet-hide');
  const petCloseElement = document.getElementById('pet-close');

  const chatStateApi = window.ChatPanelState;
  let runtimeUiConfig = null;
  let chatPanelState = null;
  let chatPanelEnabled = false;
  let lastReportedPanelVisible = null;
  let chatPanelTransitionToken = 0;
  let chatPanelHideResizeTimer = null;
  const CHAT_PANEL_HIDE_RESIZE_DELAY_MS = 170;

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
    const token = ++chatPanelTransitionToken;

    if (chatPanelHideResizeTimer) {
      clearTimeout(chatPanelHideResizeTimer);
      chatPanelHideResizeTimer = null;
    }

    if (visible) {
      if (typeof bridge?.sendChatPanelVisibility === 'function' && lastReportedPanelVisible !== true) {
        bridge.sendChatPanelVisibility({ visible: true });
        lastReportedPanelVisible = true;
      }
      // Expand window first, then fade-in panel to avoid flashing during transparent resize.
      window.requestAnimationFrame(() => {
        window.requestAnimationFrame(() => {
          if (token !== chatPanelTransitionToken) {
            return;
          }
          chatPanelElement?.classList.add('visible');
        });
      });
    } else {
      chatPanelElement?.classList.remove('visible');
      // Wait panel fade-out before shrinking the host window to keep transition smooth.
      chatPanelHideResizeTimer = setTimeout(() => {
        if (token !== chatPanelTransitionToken) {
          return;
        }
        if (typeof bridge?.sendChatPanelVisibility === 'function' && lastReportedPanelVisible !== false) {
          bridge.sendChatPanelVisibility({ visible: false });
          lastReportedPanelVisible = false;
        }
        chatPanelHideResizeTimer = null;
      }, CHAT_PANEL_HIDE_RESIZE_DELAY_MS);
    }
    syncChatStateSummary();
  }

  function setChatPanelVisible(visible) {
    assertChatPanelEnabled();
    const nextVisible = Boolean(visible);
    if (Boolean(chatPanelState?.visible) === nextVisible) {
      return { ok: true, visible: nextVisible };
    }
    chatPanelState = chatStateApi.setPanelVisible(chatPanelState, visible);
    applyChatPanelVisibility();
    return { ok: true, visible: chatPanelState.visible };
  }

  function toggleChatPanelVisible() {
    if (!chatPanelEnabled || !chatPanelState) {
      return { ok: false, visible: false };
    }
    return setChatPanelVisible(!chatPanelState.visible);
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

  function setModelParamsBatch(params) {
    const updates = Array.isArray(params?.updates) ? params.updates : [];
    if (updates.length === 0) {
      throw createRpcError(-32602, 'model.param.batchSet requires non-empty updates array');
    }

    for (const update of updates) {
      setModelParam(update);
    }
    return {
      ok: true,
      applied: updates.length
    };
  }

  function playModelMotion(params) {
    if (!live2dModel || !state.modelLoaded) {
      throw createRpcError(-32004, 'model not loaded');
    }

    const group = String(params?.group || '').trim();
    if (!group) {
      throw createRpcError(-32602, 'model.motion.play requires non-empty group');
    }

    const hasIndex = params && Object.prototype.hasOwnProperty.call(params, 'index');
    const index = Number(params?.index);
    if (hasIndex && !Number.isInteger(index)) {
      throw createRpcError(-32602, 'model.motion.play index must be integer');
    }

    if (typeof live2dModel.motion !== 'function') {
      throw createRpcError(-32005, 'motion() is unavailable on this model runtime');
    }

    if (hasIndex) {
      live2dModel.motion(group, index);
    } else {
      live2dModel.motion(group);
    }

    return {
      ok: true,
      group,
      index: hasIndex ? index : null
    };
  }

  function setModelExpression(params) {
    if (!live2dModel || !state.modelLoaded) {
      throw createRpcError(-32004, 'model not loaded');
    }

    const name = String(params?.name || '').trim();
    if (!name) {
      throw createRpcError(-32602, 'model.expression.set requires non-empty name');
    }

    if (typeof live2dModel.expression === 'function') {
      live2dModel.expression(name);
      return { ok: true, name };
    }

    const expressionManager = live2dModel.internalModel?.motionManager?.expressionManager;
    if (expressionManager && typeof expressionManager.setExpression === 'function') {
      expressionManager.setExpression(name);
      return { ok: true, name };
    }

    throw createRpcError(-32005, 'expression() is unavailable on this model runtime');
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
    petHideElement?.addEventListener('click', () => {
      bridge?.sendWindowControl?.({ action: 'hide' });
    });
    petCloseElement?.addEventListener('click', () => {
      bridge?.sendWindowControl?.({ action: 'close_pet' });
    });

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
      bridge?.sendChatInput?.(payload);
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
    bindWindowDragGesture(canvas);
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
    stableModelScale = null;
    bindModelInteraction();

    pixiApp.stage.addChild(live2dModel);
    applyAdaptiveLayout();
    window.addEventListener('resize', scheduleAdaptiveLayout, { passive: true });

    state.modelLoaded = true;
    state.modelName = modelName || null;
  }

  function bindModelInteraction() {
    if (!live2dModel || typeof live2dModel.on !== 'function') {
      return;
    }

    if ('eventMode' in live2dModel) {
      live2dModel.eventMode = 'static';
    }
    if ('interactive' in live2dModel) {
      live2dModel.interactive = true;
    }
    live2dModel.on('pointertap', () => {
      if (Date.now() < suppressModelTapUntil) {
        return;
      }
      toggleChatPanelVisible();
    });
  }

  function bindWindowDragGesture(targetElement) {
    if (!targetElement || typeof bridge?.sendWindowDrag !== 'function') {
      return;
    }

    const moveThresholdPx = 6;
    const resetDragState = () => {
      dragPointerState = null;
    };

    targetElement.addEventListener('pointerdown', (event) => {
      if (event.button !== 0) {
        return;
      }
      dragPointerState = {
        pointerId: event.pointerId,
        startClientX: event.clientX,
        startClientY: event.clientY,
        dragging: false
      };
      if (typeof targetElement.setPointerCapture === 'function') {
        targetElement.setPointerCapture(event.pointerId);
      }
      bridge.sendWindowDrag({
        action: 'start',
        screenX: event.screenX,
        screenY: event.screenY
      });
    });

    targetElement.addEventListener('pointermove', (event) => {
      if (!dragPointerState || event.pointerId !== dragPointerState.pointerId) {
        return;
      }
      const deltaX = event.clientX - dragPointerState.startClientX;
      const deltaY = event.clientY - dragPointerState.startClientY;
      const moved = Math.hypot(deltaX, deltaY);
      if (!dragPointerState.dragging && moved >= moveThresholdPx) {
        dragPointerState.dragging = true;
      }
      if (!dragPointerState.dragging) {
        return;
      }
      bridge.sendWindowDrag({
        action: 'move',
        screenX: event.screenX,
        screenY: event.screenY
      });
      event.preventDefault();
    });

    const completeDrag = (event) => {
      if (!dragPointerState || event.pointerId !== dragPointerState.pointerId) {
        return;
      }
      bridge.sendWindowDrag({
        action: 'end',
        screenX: event.screenX,
        screenY: event.screenY
      });
      if (dragPointerState.dragging) {
        suppressModelTapUntil = Date.now() + 220;
      }
      if (typeof targetElement.releasePointerCapture === 'function') {
        try {
          targetElement.releasePointerCapture(event.pointerId);
        } catch {
          // ignore pointer capture release errors on fast close/cancel
        }
      }
      resetDragState();
    };

    targetElement.addEventListener('pointerup', completeDrag);
    targetElement.addEventListener('pointercancel', completeDrag);
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
    const lockScaleOnResize = layoutConfig.lockScaleOnResize !== false;
    const layout = window.Live2DLayout.computeModelLayout({
      stageWidth: stageSize.width,
      stageHeight: stageSize.height,
      boundsX: bounds.x,
      boundsY: bounds.y,
      boundsWidth: bounds.width,
      boundsHeight: bounds.height,
      ...layoutConfig
    });

    if (stableModelScale === null || !Number.isFinite(stableModelScale)) {
      stableModelScale = layout.scale;
    }
    const nextScale = lockScaleOnResize ? stableModelScale : layout.scale;
    if (!lockScaleOnResize) {
      stableModelScale = layout.scale;
    }

    if (typeof live2dModel.scale?.set === 'function') {
      live2dModel.scale.set(nextScale);
    }
    if (typeof live2dModel.pivot?.set === 'function') {
      live2dModel.pivot.set(layout.pivotX, layout.pivotY);
    }
    if (typeof live2dModel.position?.set === 'function') {
      live2dModel.position.set(layout.positionX, layout.positionY);
    }

    state.layout = {
      scale: nextScale,
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
      } else if (method === 'param.set' || method === 'model.param.set') {
        result = setModelParam(params);
      } else if (method === 'model.param.batchSet') {
        result = setModelParamsBatch(params);
      } else if (method === 'model.motion.play') {
        result = playModelMotion(params);
      } else if (method === 'model.expression.set') {
        result = setModelExpression(params);
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
