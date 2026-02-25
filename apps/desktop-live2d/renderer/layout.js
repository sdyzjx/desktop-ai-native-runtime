(function initLayout(globalScope) {
  function clamp(value, min, max) {
    return Math.min(max, Math.max(min, value));
  }

  function toFiniteNumber(value, fallback) {
    const num = Number(value);
    return Number.isFinite(num) ? num : fallback;
  }

  function computeModelLayout(input) {
    const stageWidth = Math.max(1, toFiniteNumber(input?.stageWidth, 640));
    const stageHeight = Math.max(1, toFiniteNumber(input?.stageHeight, 720));

    const boundsX = toFiniteNumber(input?.boundsX, 0);
    const boundsY = toFiniteNumber(input?.boundsY, 0);
    const boundsWidth = Math.abs(toFiniteNumber(input?.boundsWidth, 1));
    const boundsHeight = Math.abs(toFiniteNumber(input?.boundsHeight, 1));

    const safeBoundsWidth = Math.max(1, boundsWidth);
    const safeBoundsHeight = Math.max(1, boundsHeight);

    const targetWidthRatio = clamp(toFiniteNumber(input?.targetWidthRatio, 0.72), 0.1, 1);
    const targetHeightRatio = clamp(toFiniteNumber(input?.targetHeightRatio, 0.86), 0.1, 1);
    const bottomOffsetRatio = clamp(toFiniteNumber(input?.bottomOffsetRatio, 0.97), 0.1, 1);
    const rightOffsetRatio = clamp(toFiniteNumber(input?.rightOffsetRatio, 0.97), 0.1, 1);
    const leftOffsetRatio = clamp(toFiniteNumber(input?.leftOffsetRatio, 0.03), 0, 0.9);
    const horizontalAlign = String(input?.horizontalAlign || 'center');
    const marginX = Math.max(0, toFiniteNumber(input?.marginX, 0));
    const marginY = Math.max(0, toFiniteNumber(input?.marginY, 0));
    const pivotXRatio = clamp(toFiniteNumber(input?.pivotXRatio, 0.5), 0, 1);
    const pivotYRatio = clamp(toFiniteNumber(input?.pivotYRatio, 0.94), 0, 1);
    const scaleMultiplier = clamp(toFiniteNumber(input?.scaleMultiplier, 1), 0.2, 2.5);

    const minScale = Math.max(0.001, toFiniteNumber(input?.minScale, 0.05));
    const maxScale = Math.max(minScale, toFiniteNumber(input?.maxScale, 2));

    const targetWidth = stageWidth * targetWidthRatio;
    const targetHeight = stageHeight * targetHeightRatio;
    const fitScale = Math.min(targetWidth / safeBoundsWidth, targetHeight / safeBoundsHeight);
    const scaledFit = fitScale * scaleMultiplier;
    const scale = clamp(scaledFit, minScale, maxScale);

    let positionX = stageWidth * 0.5;
    if (horizontalAlign === 'right') {
      positionX = stageWidth * rightOffsetRatio - marginX;
    } else if (horizontalAlign === 'left') {
      positionX = stageWidth * leftOffsetRatio + marginX;
    }

    return {
      scale,
      positionX,
      positionY: stageHeight * bottomOffsetRatio - marginY,
      pivotX: boundsX + safeBoundsWidth * pivotXRatio,
      pivotY: boundsY + safeBoundsHeight * pivotYRatio,
      debug: {
        stageWidth,
        stageHeight,
        boundsWidth: safeBoundsWidth,
        boundsHeight: safeBoundsHeight,
        fitScale,
        scaleMultiplier
      }
    };
  }

  const api = { computeModelLayout };
  if (typeof module !== 'undefined' && module.exports) {
    module.exports = api;
  }
  globalScope.Live2DLayout = api;
})(typeof globalThis !== 'undefined' ? globalThis : window);
