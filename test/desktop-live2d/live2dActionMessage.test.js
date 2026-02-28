const test = require('node:test');
const assert = require('node:assert/strict');

const {
  ACTION_EVENT_NAME,
  ACTION_ENQUEUE_METHOD,
  normalizeLive2dActionMessage
} = require('../../apps/desktop-live2d/shared/live2dActionMessage');

test('live2d action constants are stable', () => {
  assert.equal(ACTION_EVENT_NAME, 'ui.live2d.action');
  assert.equal(ACTION_ENQUEUE_METHOD, 'live2d.action.enqueue');
});

test('normalizeLive2dActionMessage accepts expression action payload', () => {
  const parsed = normalizeLive2dActionMessage({
    action_id: 'a-1',
    action: {
      type: 'expression',
      name: 'tear_drop'
    },
    duration_sec: 2.5,
    queue_policy: 'append'
  });

  assert.equal(parsed.ok, true);
  assert.equal(parsed.value.action.type, 'expression');
  assert.equal(parsed.value.action.name, 'tear_drop');
  assert.equal(parsed.value.duration_sec, 2.5);
  assert.equal(parsed.value.queue_policy, 'append');
});

test('normalizeLive2dActionMessage accepts motion action payload with index', () => {
  const parsed = normalizeLive2dActionMessage({
    action: {
      type: 'motion',
      args: {
        group: 'Greet',
        index: 0
      }
    },
    duration_sec: 1.2,
    queue_policy: 'replace'
  });

  assert.equal(parsed.ok, true);
  assert.equal(parsed.value.action.type, 'motion');
  assert.equal(parsed.value.action.name, 'Greet');
  assert.deepEqual(parsed.value.action.args, { group: 'Greet', index: 0 });
  assert.equal(parsed.value.queue_policy, 'replace');
});

test('normalizeLive2dActionMessage rejects invalid duration_sec', () => {
  const parsed = normalizeLive2dActionMessage({
    action: {
      type: 'expression',
      name: 'smile'
    },
    duration_sec: 0
  });

  assert.equal(parsed.ok, false);
  assert.match(parsed.error, /duration_sec/i);
});

test('normalizeLive2dActionMessage rejects invalid queue policy', () => {
  const parsed = normalizeLive2dActionMessage({
    action: {
      type: 'expression',
      name: 'smile'
    },
    duration_sec: 1.5,
    queue_policy: 'drop'
  });

  assert.equal(parsed.ok, false);
  assert.match(parsed.error, /queue_policy/i);
});

test('normalizeLive2dActionMessage rejects invalid motion index', () => {
  const parsed = normalizeLive2dActionMessage({
    action: {
      type: 'motion',
      args: {
        group: 'Idle',
        index: -1
      }
    },
    duration_sec: 1
  });

  assert.equal(parsed.ok, false);
  assert.match(parsed.error, /index/i);
});

