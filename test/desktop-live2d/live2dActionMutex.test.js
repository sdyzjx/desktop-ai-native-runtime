const test = require('node:test');
const assert = require('node:assert/strict');

const {
  createLive2dActionMutex
} = require('../../apps/desktop-live2d/renderer/live2dActionMutex');

test('Live2dActionMutex serializes concurrent runExclusive tasks', async () => {
  const mutex = createLive2dActionMutex();
  const markers = [];

  const p1 = mutex.runExclusive(async () => {
    markers.push('start-1');
    await new Promise((resolve) => setTimeout(resolve, 10));
    markers.push('end-1');
  });

  const p2 = mutex.runExclusive(async () => {
    markers.push('start-2');
    markers.push('end-2');
  });

  await Promise.all([p1, p2]);

  assert.deepEqual(markers, ['start-1', 'end-1', 'start-2', 'end-2']);
  assert.equal(mutex.snapshot().active, 0);
});
