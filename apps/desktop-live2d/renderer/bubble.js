(function bubbleWindowMain() {
  const bridge = window.desktopLive2dBridge;
  const bubbleElement = document.getElementById('bubble');

  function applyBubbleState(payload) {
    const visible = Boolean(payload?.visible);
    if (!bubbleElement) {
      return;
    }
    if (!visible) {
      bubbleElement.classList.remove('visible');
      return;
    }
    bubbleElement.textContent = String(payload?.text || '');
    bubbleElement.classList.add('visible');
  }

  bridge?.onBubbleStateSync?.((payload) => {
    applyBubbleState(payload);
  });
})();
