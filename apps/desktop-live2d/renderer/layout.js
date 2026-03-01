(function initLayout(globalScope) {
  const sharedDefaults = (
    globalScope.DesktopLive2dDefaults
    || ((typeof module !== 'undefined' && module.exports)
      ? require('../shared/defaultUiConfig')
      : null)
  );
  const DEFAULT_LAYOUT_CONFIG = sharedDefaults?.DEFAULT_LAYOUT_CONFIG || {
    targetWidthRatio: 0.94,
    targetHeightRatio: 0.985,
    anchorXRatio: 0.5,
    anchorYRatio: 1,
    offsetX: 0,
    offsetY: 0,
    marginX: 2,
    marginY: 0,
    minVisibleRatioX: 0.2,
    minVisibleRatioY: 0.2,
    pivotXRatio: 0.5,
    pivotYRatio: 1,
    scaleMultiplier: 1.16,
    minScale: 0.04,
    maxScale: 2,
    lockScaleOnResize: true,
    lockPositionOnResize: true
  };

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

  function computeVisibleClampRange({
    stageSize,
    marginStart,
    marginEnd,
    scaledOffset,
    scaledSize,
    minVisibleRatio
  }) {
    const fullVisibleMin = marginStart - scaledOffset;
    const fullVisibleMax = stageSize - marginEnd - (scaledOffset + scaledSize);
    if (fullVisibleMin <= fullVisibleMax) {
      return {
        min: fullVisibleMin,
        max: fullVisibleMax
      };
    }

    const availableSize = Math.max(1, stageSize - marginStart - marginEnd);
    const requiredVisibleSize = clamp(
      scaledSize * clamp(toFiniteNumber(minVisibleRatio, 0.2), 0.05, 1),
      1,
      availableSize
    );

    return {
      min: marginStart + requiredVisibleSize - (scaledOffset + scaledSize),
      max: stageSize - marginEnd - requiredVisibleSize - scaledOffset
    };
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
    const minVisibleRatioX = clamp(toFiniteNumber(input?.minVisibleRatioX, DEFAULT_LAYOUT_CONFIG.minVisibleRatioX), 0.05, 1);
    const minVisibleRatioY = clamp(toFiniteNumber(input?.minVisibleRatioY, DEFAULT_LAYOUT_CONFIG.minVisibleRatioY), 0.05, 1);

    const scaledLeftOffset = (boundsX - pivotX) * scale;
    const scaledTopOffset = (boundsY - pivotY) * scale;
    const scaledWidth = boundsWidth * scale;
    const scaledHeight = boundsHeight * scale;

    const xRange = computeVisibleClampRange({
      stageSize: stageWidth,
      marginStart: marginLeft,
      marginEnd: marginRight,
      scaledOffset: scaledLeftOffset,
      scaledSize: scaledWidth,
      minVisibleRatio: minVisibleRatioX
    });
    const yRange = computeVisibleClampRange({
      stageSize: stageHeight,
      marginStart: marginTop,
      marginEnd: marginBottom,
      scaledOffset: scaledTopOffset,
      scaledSize: scaledHeight,
      minVisibleRatio: minVisibleRatioY
    });

    const minPositionX = xRange.min;
    const maxPositionX = xRange.max;
    const minPositionY = yRange.min;
    const maxPositionY = yRange.max;

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

    const targetWidthRatio = clamp(toFiniteNumber(input?.targetWidthRatio, DEFAULT_LAYOUT_CONFIG.targetWidthRatio), 0.1, 1);
    const targetHeightRatio = clamp(toFiniteNumber(input?.targetHeightRatio, DEFAULT_LAYOUT_CONFIG.targetHeightRatio), 0.1, 1);
    const anchorXRatio = clamp(toFiniteNumber(input?.anchorXRatio, DEFAULT_LAYOUT_CONFIG.anchorXRatio), 0, 1);
    const anchorYRatio = clamp(toFiniteNumber(input?.anchorYRatio, DEFAULT_LAYOUT_CONFIG.anchorYRatio), 0, 1);
    const offsetX = toFiniteNumber(input?.offsetX, DEFAULT_LAYOUT_CONFIG.offsetX);
    const offsetY = toFiniteNumber(input?.offsetY, DEFAULT_LAYOUT_CONFIG.offsetY);
    const marginX = Math.max(0, toFiniteNumber(input?.marginX, DEFAULT_LAYOUT_CONFIG.marginX));
    const marginY = Math.max(0, toFiniteNumber(input?.marginY, DEFAULT_LAYOUT_CONFIG.marginY));
    const minVisibleRatioX = clamp(toFiniteNumber(input?.minVisibleRatioX, DEFAULT_LAYOUT_CONFIG.minVisibleRatioX), 0.05, 1);
    const minVisibleRatioY = clamp(toFiniteNumber(input?.minVisibleRatioY, DEFAULT_LAYOUT_CONFIG.minVisibleRatioY), 0.05, 1);
    const visibleMarginLeft = Math.max(0, toFiniteNumber(input?.visibleMarginLeft, marginX));
    const visibleMarginRight = Math.max(0, toFiniteNumber(input?.visibleMarginRight, marginX));
    const visibleMarginTop = Math.max(0, toFiniteNumber(input?.visibleMarginTop, marginY));
    const visibleMarginBottom = Math.max(0, toFiniteNumber(input?.visibleMarginBottom, marginY));
    const pivotXRatio = clamp(toFiniteNumber(input?.pivotXRatio, DEFAULT_LAYOUT_CONFIG.pivotXRatio), 0, 1);
    const pivotYRatio = clamp(toFiniteNumber(input?.pivotYRatio, DEFAULT_LAYOUT_CONFIG.pivotYRatio), 0, 1);
    const scaleMultiplier = clamp(toFiniteNumber(input?.scaleMultiplier, DEFAULT_LAYOUT_CONFIG.scaleMultiplier), 0.2, 2.5);

    const minScale = Math.max(0.001, toFiniteNumber(input?.minScale, DEFAULT_LAYOUT_CONFIG.minScale));
    const maxScale = Math.max(minScale, toFiniteNumber(input?.maxScale, DEFAULT_LAYOUT_CONFIG.maxScale));

    const targetWidth = stageWidth * targetWidthRatio;
    const targetHeight = stageHeight * targetHeightRatio;
    const fitScale = Math.min(targetWidth / safeBoundsWidth, targetHeight / safeBoundsHeight);
    const scaledFit = fitScale * scaleMultiplier;
    const scale = clamp(scaledFit, minScale, maxScale);

    const pivotX = boundsX + safeBoundsWidth * pivotXRatio;
    const pivotY = boundsY + safeBoundsHeight * pivotYRatio;
    const clampedPosition = clampModelPositionToViewport({
      stageWidth,
      stageHeight,
      positionX: stageWidth * anchorXRatio + offsetX,
      positionY: stageHeight * anchorYRatio + offsetY,
      scale,
      boundsX,
      boundsY,
      boundsWidth: safeBoundsWidth,
      boundsHeight: safeBoundsHeight,
      pivotX,
      pivotY,
      minVisibleRatioX,
      minVisibleRatioY,
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
