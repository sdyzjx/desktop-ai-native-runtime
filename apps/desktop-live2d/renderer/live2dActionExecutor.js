(function initLive2dActionExecutor(globalScope) {
  function sleepMs(ms) {
    return new Promise((resolve) => {
      setTimeout(resolve, Math.max(0, Number(ms) || 0));
    });
  }

  function isObject(value) {
    return value && typeof value === 'object' && !Array.isArray(value);
  }

  function normalizePresetConfig(rawConfig = {}) {
    return {
      version: Number(rawConfig.version || 1),
      emote: isObject(rawConfig.emote) ? rawConfig.emote : {},
      gesture: isObject(rawConfig.gesture) ? rawConfig.gesture : {},
      react: isObject(rawConfig.react) ? rawConfig.react : {}
    };
  }

  function createDefaultError(code, message) {
    const error = new Error(String(message || 'unknown error'));
    error.code = Number(code);
    return error;
  }

  function createLive2dActionExecutor({
    setExpression,
    playMotion,
    setParamBatch = null,
    sleep = sleepMs,
    presetConfig = {},
    createError = createDefaultError
  } = {}) {
    if (typeof setExpression !== 'function') {
      throw new Error('createLive2dActionExecutor requires setExpression function');
    }
    if (typeof playMotion !== 'function') {
      throw new Error('createLive2dActionExecutor requires playMotion function');
    }

    const normalizedPresetConfig = normalizePresetConfig(presetConfig);

    function resolveEmoteSteps(action) {
      const emotion = String(action.name || action.args?.emotion || '').trim();
      const intensity = String(action.args?.intensity || 'medium').trim();
      if (!emotion) {
        throw createError(-32602, 'emote action requires non-empty emotion');
      }
      const emotionDef = normalizedPresetConfig.emote?.[emotion];
      const picked = emotionDef?.[intensity] || emotionDef?.medium || null;
      if (!picked) {
        throw createError(-32602, `emote preset not found: ${emotion}/${intensity}`);
      }

      const steps = [];
      if (picked.expression) {
        steps.push({
          type: 'expression',
          name: String(picked.expression)
        });
      }
      if (Array.isArray(picked.params) && picked.params.length > 0) {
        steps.push({
          type: 'param_batch',
          updates: picked.params
        });
      }
      return steps;
    }

    function resolveGestureSteps(action) {
      const gestureType = String(action.name || action.args?.type || '').trim();
      if (!gestureType) {
        throw createError(-32602, 'gesture action requires non-empty type');
      }
      const def = normalizedPresetConfig.gesture?.[gestureType];
      if (!def) {
        throw createError(-32602, `gesture preset not found: ${gestureType}`);
      }

      const steps = [];
      if (def.expression) {
        steps.push({
          type: 'expression',
          name: String(def.expression)
        });
      }
      if (def.motion?.group) {
        steps.push({
          type: 'motion',
          group: String(def.motion.group),
          index: def.motion.index
        });
      }
      return steps;
    }

    function resolveReactSteps(action) {
      const intent = String(action.name || action.args?.intent || '').trim();
      if (!intent) {
        throw createError(-32602, 'react action requires non-empty intent');
      }
      const defs = normalizedPresetConfig.react?.[intent];
      if (!Array.isArray(defs) || defs.length === 0) {
        throw createError(-32602, `react preset not found: ${intent}`);
      }

      return defs.map((step) => {
        if (!isObject(step)) {
          throw createError(-32602, 'react step must be an object');
        }
        if (step.type === 'wait') {
          return {
            type: 'wait',
            ms: Math.max(0, Number(step.ms) || 0)
          };
        }
        if (step.type === 'expression') {
          return {
            type: 'expression',
            name: String(step.name || '')
          };
        }
        if (step.type === 'motion') {
          return {
            type: 'motion',
            group: String(step.group || ''),
            index: step.index
          };
        }
        if (step.type === 'param_batch') {
          return {
            type: 'param_batch',
            updates: Array.isArray(step.updates) ? step.updates : []
          };
        }
        throw createError(-32602, `unsupported react step type: ${step.type}`);
      });
    }

    function resolveSteps(action) {
      if (!action || typeof action !== 'object' || Array.isArray(action)) {
        throw createError(-32602, 'live2d action must be an object');
      }

      if (action.type === 'expression') {
        return [{
          type: 'expression',
          name: action.name || action.args?.name
        }];
      }

      if (action.type === 'motion') {
        return [{
          type: 'motion',
          group: action.args?.group || action.name,
          index: action.args?.index
        }];
      }

      if (action.type === 'emote') {
        return resolveEmoteSteps(action);
      }
      if (action.type === 'gesture') {
        return resolveGestureSteps(action);
      }
      if (action.type === 'react') {
        return resolveReactSteps(action);
      }

      throw createError(-32602, `unsupported live2d action type: ${action.type}`);
    }

    async function executeStep(step) {
      if (step.type === 'expression') {
        return setExpression({ name: step.name });
      }
      if (step.type === 'motion') {
        return playMotion({
          group: step.group,
          index: step.index
        });
      }
      if (step.type === 'param_batch') {
        if (typeof setParamBatch !== 'function') {
          throw createError(-32005, 'setParamBatch is unavailable on this model runtime');
        }
        return setParamBatch({
          updates: step.updates
        });
      }
      if (step.type === 'wait') {
        await sleep(step.ms);
        return { ok: true, waitedMs: step.ms };
      }
      throw createError(-32602, `unsupported action step type: ${step.type}`);
    }

    return async (action) => {
      const steps = resolveSteps(action);
      for (const step of steps) {
        await executeStep(step);
      }
      return {
        ok: true,
        steps: steps.length
      };
    };
  }

  const api = {
    createLive2dActionExecutor
  };

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = api;
  }
  globalScope.Live2DActionExecutor = api;
})(typeof globalThis !== 'undefined' ? globalThis : window);
