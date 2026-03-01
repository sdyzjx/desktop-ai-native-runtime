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
    const streaming = Boolean(payload?.streaming);

    if (!bubbleElement) {
      return;
    }
    if (!visible) {
      bubbleElement.classList.remove('visible', 'streaming');
      bubbleElement.textContent = '';
      return;
    }

    const text = String(payload?.text || '');

    // Render LaTeX and markdown for bubble (inline only, no complex structures)
    if (typeof marked !== 'undefined' && text) {
      try {
        // First render LaTeX formulas
        let processedText = text;
        if (typeof katex !== 'undefined') {
          // Inline math only for bubble
          processedText = text.replace(/\$([^\$\n]+?)\$/g, (match, formula) => {
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
        }

        const html = marked.parseInline(processedText);
        bubbleElement.innerHTML = html;
      } catch (err) {
        console.error('Bubble markdown parse error:', err);
        bubbleElement.textContent = text;
      }
    } else {
      bubbleElement.textContent = text;
    }

    bubbleElement.classList.add('visible');

    if (streaming) {
      bubbleElement.classList.add('streaming');
    } else {
      bubbleElement.classList.remove('streaming');
    }

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
