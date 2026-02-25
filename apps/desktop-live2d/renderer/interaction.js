(function initLive2dInteraction(globalScope) {
  function toPositiveMs(value, fallback) {
    const parsed = Number(value);
    if (!Number.isFinite(parsed) || parsed <= 0) {
      return fallback;
    }
    return Math.floor(parsed);
  }

  function createCooldownGate(config = {}) {
    const cooldownMs = toPositiveMs(config.cooldownMs, 220);
    const nowProvider = typeof config.now === 'function' ? config.now : () => Date.now();
    let blockedUntil = 0;

    return {
      tryEnter() {
        const now = Number(nowProvider());
        const nowSafe = Number.isFinite(now) ? now : Date.now();
        if (nowSafe < blockedUntil) {
          return false;
        }
        blockedUntil = nowSafe + cooldownMs;
        return true;
      },
      reset() {
        blockedUntil = 0;
      }
    };
  }

  function nearlyEqual(left, right, epsilon = 1e-4) {
    const leftValue = Number(left);
    const rightValue = Number(right);
    if (!Number.isFinite(leftValue) || !Number.isFinite(rightValue)) {
      return false;
    }
    return Math.abs(leftValue - rightValue) <= Math.max(0, Number(epsilon) || 0);
  }

  function shouldUpdate2D(currentX, currentY, nextX, nextY, epsilon = 1e-4) {
    return !(nearlyEqual(currentX, nextX, epsilon) && nearlyEqual(currentY, nextY, epsilon));
  }

  const api = {
    createCooldownGate,
    nearlyEqual,
    shouldUpdate2D
  };

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = api;
  }
  globalScope.Live2DInteraction = api;
})(typeof globalThis !== 'undefined' ? globalThis : window);
