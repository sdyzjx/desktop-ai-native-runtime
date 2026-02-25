const test = require('node:test');
const assert = require('node:assert/strict');

const { RuntimeEventBus } = require('../../apps/runtime/bus/eventBus');

test('RuntimeEventBus publish/subscribe works and unsubscribe stops callbacks', () => {
  const bus = new RuntimeEventBus();
  const seen = [];

  const off = bus.subscribe('topic.a', (payload) => seen.push(payload));
  bus.publish('topic.a', { n: 1 });
  off();
  bus.publish('topic.a', { n: 2 });

  assert.deepEqual(seen, [{ n: 1 }]);
});

test('RuntimeEventBus waitFor resolves matching payload', async () => {
  const bus = new RuntimeEventBus();

  const wait = bus.waitFor('topic.b', (payload) => payload.id === 'ok', 1000);
  bus.publish('topic.b', { id: 'skip' });
  bus.publish('topic.b', { id: 'ok', value: 42 });

  const result = await wait;
  assert.equal(result.value, 42);
});
