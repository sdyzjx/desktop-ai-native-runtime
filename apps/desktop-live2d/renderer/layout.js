(function initLayout(globalScope) {
  function clamp(value, min, max) {
    return Math.min(max, Math.max(min, value));
  }

  function toFiniteNumber(value, fallback) {
    const num = Number(value);
    return Number.isFinite(num) ? num : fallback;
  }

  function clampRange(value, min, max) {
    if (!Number.isFinite(min) || !Number.isFinite(max)) {
      return value;
    }
    if (min <= max) {
      return clamp(value, min, max);
    }
    return (min + max) / 2;
  }

  function computeVisibleModelBounds(input) {
    const positionX = toFiniteNumber(input?.positionX, 0);
    const positionY = toFiniteNumber(input?.positionY, 0);
    const scale = Math.max(0.0001, toFiniteNumber(input?.scale, 1));
    const boundsX = toFiniteNumber(input?.boundsX, 0);
    const boundsY = toFiniteNumber(input?.boundsY, 0);
    const boundsWidth = Math.max(1, Math.abs(toFiniteNumber(input?.boundsWidth, 1)));
    const boundsHeight = Math.max(1, Math.abs(toFiniteNumber(input?.boundsHeight, 1)));
    const pivotX = toFiniteNumber(input?.pivotX, boundsX + boundsWidth * 0.5);
    const pivotY = toFiniteNumber(input?.pivotY, boundsY + boundsHeight * 0.5);

    const left = positionX + (boundsX - pivotX) * scale;
    const top = positionY + (boundsY - pivotY) * scale;
    const width = boundsWidth * scale;
    const height = boundsHeight * scale;

    return {
      left,
      top,
      right: left + width,
      bottom: top + height,
      width,
      height
    };
  }

  function clampModelPositionToViewport(input) {
    const stageWidth = Math.max(1, toFiniteNumber(input?.stageWidth, 640));
    const stageHeight = Math.max(1, toFiniteNumber(input?.stageHeight, 720));
    const positionX = toFiniteNumber(input?.positionX, stageWidth * 0.5);
    const positionY = toFiniteNumber(input?.positionY, stageHeight * 0.5);
    const scale = Math.max(0.0001, toFiniteNumber(input?.scale, 1));
    const boundsX = toFiniteNumber(input?.boundsX, 0);
    const boundsY = toFiniteNumber(input?.boundsY, 0);
    const boundsWidth = Math.max(1, Math.abs(toFiniteNumber(input?.boundsWidth, 1)));
    const boundsHeight = Math.max(1, Math.abs(toFiniteNumber(input?.boundsHeight, 1)));
    const pivotX = toFiniteNumber(input?.pivotX, boundsX + boundsWidth * 0.5);
    const pivotY = toFiniteNumber(input?.pivotY, boundsY + boundsHeight * 0.5);
    const marginLeft = Math.max(0, toFiniteNumber(input?.visibleMarginLeft, 0));
    const marginRight = Math.max(0, toFiniteNumber(input?.visibleMarginRight, 0));
    const marginTop = Math.max(0, toFiniteNumber(input?.visibleMarginTop, 0));
    const marginBottom = Math.max(0, toFiniteNumber(input?.visibleMarginBottom, 0));

    const scaledLeftOffset = (boundsX - pivotX) * scale;
    const scaledTopOffset = (boundsY - pivotY) * scale;
    const scaledWidth = boundsWidth * scale;
    const scaledHeight = boundsHeight * scale;

    const minPositionX = marginLeft - scaledLeftOffset;
    const maxPositionX = stageWidth - marginRight - (scaledLeftOffset + scaledWidth);
    const minPositionY = marginTop - scaledTopOffset;
    const maxPositionY = stageHeight - marginBottom - (scaledTopOffset + scaledHeight);

    const nextPositionX = clampRange(positionX, minPositionX, maxPositionX);
    const nextPositionY = clampRange(positionY, minPositionY, maxPositionY);

    return {
      positionX: nextPositionX,
      positionY: nextPositionY,
      minPositionX,
      maxPositionX,
      minPositionY,
      maxPositionY,
      visibleBounds: computeVisibleModelBounds({
        positionX: nextPositionX,
        positionY: nextPositionY,
        scale,
        boundsX,
        boundsY,
        boundsWidth,
        boundsHeight,
        pivotX,
        pivotY
      })
    };
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
    const visibleMarginLeft = Math.max(0, toFiniteNumber(input?.visibleMarginLeft, marginX));
    const visibleMarginRight = Math.max(0, toFiniteNumber(input?.visibleMarginRight, marginX));
    const visibleMarginTop = Math.max(0, toFiniteNumber(input?.visibleMarginTop, marginY));
    const visibleMarginBottom = Math.max(0, toFiniteNumber(input?.visibleMarginBottom, marginY));
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

    const pivotX = boundsX + safeBoundsWidth * pivotXRatio;
    const pivotY = boundsY + safeBoundsHeight * pivotYRatio;
    const clampedPosition = clampModelPositionToViewport({
      stageWidth,
      stageHeight,
      positionX,
      positionY: stageHeight * bottomOffsetRatio - marginY,
      scale,
      boundsX,
      boundsY,
      boundsWidth: safeBoundsWidth,
      boundsHeight: safeBoundsHeight,
      pivotX,
      pivotY,
      visibleMarginLeft,
      visibleMarginRight,
      visibleMarginTop,
      visibleMarginBottom
    });

    return {
      scale,
      positionX: clampedPosition.positionX,
      positionY: clampedPosition.positionY,
      pivotX,
      pivotY,
      debug: {
        stageWidth,
        stageHeight,
        boundsWidth: safeBoundsWidth,
        boundsHeight: safeBoundsHeight,
        fitScale,
        scaleMultiplier,
        visibleBounds: clampedPosition.visibleBounds
      }
    };
  }

  const api = { computeModelLayout, clampModelPositionToViewport, computeVisibleModelBounds };
  if (typeof module !== 'undefined' && module.exports) {
    module.exports = api;
  }
  globalScope.Live2DLayout = api;
})(typeof globalThis !== 'undefined' ? globalThis : window);
