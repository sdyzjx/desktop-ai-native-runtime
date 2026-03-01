const test = require('node:test');
const assert = require('node:assert/strict');

const {
  computeModelLayout,
  clampModelPositionToViewport,
  computeVisibleModelBounds
} = require('../../apps/desktop-live2d/renderer/layout');

test('computeModelLayout scales large model to fit viewport', () => {
  const layout = computeModelLayout({
    stageWidth: 640,
    stageHeight: 720,
    boundsX: -1200,
    boundsY: -2500,
    boundsWidth: 2400,
    boundsHeight: 5000
  });

  assert.ok(layout.scale > 0);
  assert.ok(layout.scale < 0.2);
  assert.equal(layout.positionX, 320);
  assert.ok(layout.positionY > 650);
});

test('computeModelLayout clamps scale when model bounds are tiny', () => {
  const layout = computeModelLayout({
    stageWidth: 640,
    stageHeight: 720,
    boundsX: 0,
    boundsY: 0,
    boundsWidth: 10,
    boundsHeight: 10,
    maxScale: 1.25
  });

  assert.equal(layout.scale, 1.25);
});

test('computeModelLayout supports right-bottom alignment with margins', () => {
  const layout = computeModelLayout({
    stageWidth: 500,
    stageHeight: 700,
    boundsX: -1000,
    boundsY: -2000,
    boundsWidth: 2200,
    boundsHeight: 4000,
    horizontalAlign: 'right',
    rightOffsetRatio: 1,
    bottomOffsetRatio: 1,
    marginX: 18,
    marginY: 22,
    pivotXRatio: 0.72,
    pivotYRatio: 0.97,
    scaleMultiplier: 0.8
  });

  const visible = computeVisibleModelBounds({
    positionX: layout.positionX,
    positionY: layout.positionY,
    scale: layout.scale,
    boundsX: -1000,
    boundsY: -2000,
    boundsWidth: 2200,
    boundsHeight: 4000,
    pivotX: layout.pivotX,
    pivotY: layout.pivotY
  });

  assert.ok(visible.left >= 17);
  assert.ok(visible.right <= 483);
  assert.ok(visible.bottom <= 679);
  assert.ok(layout.pivotX > 500);
  assert.ok(layout.pivotY > 1500);
  assert.ok(layout.scale > 0);
});

test('computeModelLayout tolerates invalid numeric inputs', () => {
  const layout = computeModelLayout({
    stageWidth: 'bad',
    stageHeight: null,
    boundsWidth: 0,
    boundsHeight: NaN
  });

  assert.ok(Number.isFinite(layout.scale));
  assert.ok(layout.scale >= 0.05);
  assert.ok(Number.isFinite(layout.positionX));
  assert.ok(Number.isFinite(layout.pivotY));
});

test('computeModelLayout keeps model visible inside stage margins', () => {
  const layout = computeModelLayout({
    stageWidth: 320,
    stageHeight: 520,
    boundsX: -1000,
    boundsY: -2000,
    boundsWidth: 2200,
    boundsHeight: 4000,
    horizontalAlign: 'right',
    rightOffsetRatio: 1,
    bottomOffsetRatio: 1,
    marginX: 18,
    marginY: 22,
    pivotXRatio: 0.72,
    pivotYRatio: 0.97,
    scaleMultiplier: 0.85
  });

  const visible = computeVisibleModelBounds({
    positionX: layout.positionX,
    positionY: layout.positionY,
    scale: layout.scale,
    boundsX: -1000,
    boundsY: -2000,
    boundsWidth: 2200,
    boundsHeight: 4000,
    pivotX: layout.pivotX,
    pivotY: layout.pivotY
  });

  assert.ok(visible.left >= 17);
  assert.ok(visible.right <= 303);
  assert.ok(visible.top >= 21);
  assert.ok(visible.bottom <= 499);
});

test('clampModelPositionToViewport recenters oversized transforms when clamp range flips', () => {
  const clamped = clampModelPositionToViewport({
    stageWidth: 220,
    stageHeight: 260,
    positionX: 500,
    positionY: 500,
    scale: 1.5,
    boundsX: 0,
    boundsY: 0,
    boundsWidth: 240,
    boundsHeight: 300,
    pivotX: 120,
    pivotY: 150,
    visibleMarginLeft: 16,
    visibleMarginRight: 16,
    visibleMarginTop: 16,
    visibleMarginBottom: 16
  });

  assert.ok(Number.isFinite(clamped.positionX));
  assert.ok(Number.isFinite(clamped.positionY));
  assert.ok(clamped.visibleBounds.width > 0);
  assert.ok(clamped.visibleBounds.height > 0);
});
