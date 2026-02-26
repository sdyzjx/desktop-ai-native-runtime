(function bubbleWindowMain() {
  const bridge = window.desktopLive2dBridge;
  const bubbleElement = document.getElementById('bubble');
  let measureRaf = 0;
  let delayedMeasureTimer = null;

  function scheduleBubbleMetricsSync() {
    if (!bubbleElement || typeof bridge?.sendBubbleMetrics !== 'function') {
      return;
    }
    if (!bubbleElement.classList.contains('visible')) {
      return;
    }
    if (measureRaf) {
      cancelAnimationFrame(measureRaf);
    }
    measureRaf = requestAnimationFrame(() => {
      measureRaf = 0;
      const rect = bubbleElement.getBoundingClientRect();
      const width = Math.max(80, Math.ceil(rect.width));
      const height = Math.max(36, Math.ceil(rect.height));
      bridge.sendBubbleMetrics({ width, height });
    });
  }

  function scheduleDelayedBubbleMetricsSync() {
    if (delayedMeasureTimer) {
      clearTimeout(delayedMeasureTimer);
    }
    delayedMeasureTimer = setTimeout(() => {
      delayedMeasureTimer = null;
      scheduleBubbleMetricsSync();
    }, 60);
  }

  function applyBubbleState(payload) {
    const visible = Boolean(payload?.visible);
    if (!bubbleElement) {
      return;
    }
    if (!visible) {
      bubbleElement.classList.remove('visible');
      bubbleElement.textContent = '';
      return;
    }
    bubbleElement.textContent = String(payload?.text || '');
    bubbleElement.classList.add('visible');
    scheduleBubbleMetricsSync();
    scheduleDelayedBubbleMetricsSync();
  }

  if (bubbleElement && typeof ResizeObserver === 'function') {
    const resizeObserver = new ResizeObserver(() => {
      scheduleBubbleMetricsSync();
    });
    resizeObserver.observe(bubbleElement);
    window.addEventListener('beforeunload', () => {
      resizeObserver.disconnect();
      if (delayedMeasureTimer) {
        clearTimeout(delayedMeasureTimer);
        delayedMeasureTimer = null;
      }
    });
  }

  bridge?.onBubbleStateSync?.((payload) => {
    applyBubbleState(payload);
  });
})();
