(function initLive2dActionExecutor(globalScope) {
  function createDefaultError(code, message) {
    const error = new Error(String(message || 'unknown error'));
    error.code = Number(code);
    return error;
  }

  function createLive2dActionExecutor({
    setExpression,
    playMotion,
    createError = createDefaultError
  } = {}) {
    if (typeof setExpression !== 'function') {
      throw new Error('createLive2dActionExecutor requires setExpression function');
    }
    if (typeof playMotion !== 'function') {
      throw new Error('createLive2dActionExecutor requires playMotion function');
    }

    return (action) => {
      if (!action || typeof action !== 'object' || Array.isArray(action)) {
        throw createError(-32602, 'live2d action must be an object');
      }

      if (action.type === 'expression') {
        return setExpression({
          name: action.name || action.args?.name
        });
      }

      if (action.type === 'motion') {
        return playMotion({
          group: action.args?.group || action.name,
          index: action.args?.index
        });
      }

      throw createError(-32602, `unsupported live2d action type: ${action.type}`);
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
