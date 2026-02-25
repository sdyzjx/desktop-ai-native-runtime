(function bootstrap() {
  const bridge = window.desktopLive2dBridge;
  const state = {
    modelLoaded: false,
    modelName: null,
    bubbleVisible: false,
    lastError: null
  };

  let pixiApp = null;
  let live2dModel = null;
  let hideBubbleTimer = null;

  const stageContainer = document.getElementById('stage');
  const bubbleElement = document.getElementById('bubble');

  function setBubbleVisible(visible) {
    state.bubbleVisible = visible;
    bubbleElement.classList.toggle('visible', visible);
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
    return {
      modelLoaded: state.modelLoaded,
      modelName: state.modelName,
      bubbleVisible: state.bubbleVisible,
      lastError: state.lastError
    };
  }

  function createRpcError(code, message) {
    return { code, message };
  }

  async function initPixi() {
    const PIXI = window.PIXI;
    if (!PIXI) {
      throw new Error('PIXI global is not available');
    }

    const supportsAsyncInit = typeof PIXI.Application?.prototype?.init === 'function';
    const app = supportsAsyncInit
      ? new PIXI.Application()
      : new PIXI.Application({
        transparent: true,
        resizeTo: window,
        antialias: true,
        autoDensity: true
      });

    if (typeof app.init === 'function') {
      await app.init({
        backgroundAlpha: 0,
        resizeTo: window,
        antialias: true,
        autoDensity: true
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

    if (typeof live2dModel.anchor?.set === 'function') {
      live2dModel.anchor.set(0.5, 0.5);
    }

    if (typeof live2dModel.scale?.set === 'function') {
      live2dModel.scale.set(0.28);
    }

    const canvas = pixiApp.canvas || pixiApp.view;
    const width = canvas?.width || window.innerWidth || 640;
    const height = canvas?.height || window.innerHeight || 720;

    if (typeof live2dModel.position?.set === 'function') {
      live2dModel.position.set(width / 2, height * 0.72);
    }

    pixiApp.stage.addChild(live2dModel);
    state.modelLoaded = true;
    state.modelName = modelName || null;
  }

  async function handleInvoke(payload) {
    const { requestId, method, params } = payload || {};

    try {
      let result;
      if (method === 'state.get') {
        result = getState();
      } else if (method === 'param.set') {
        result = setModelParam(params);
      } else if (method === 'chat.show') {
        result = showBubble(params);
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
