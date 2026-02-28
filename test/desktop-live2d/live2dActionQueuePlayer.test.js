const test = require('node:test');
const assert = require('node:assert/strict');

const {
  Live2dActionQueuePlayer
} = require('../../apps/desktop-live2d/renderer/live2dActionQueuePlayer');

function createExpressionAction({ id, durationSec = 0.01, queuePolicy = 'append', name = 'smile' } = {}) {
  return {
    action_id: id || '',
    action: {
      type: 'expression',
      name,
      args: {}
    },
    duration_sec: durationSec,
    queue_policy: queuePolicy
  };
}

test('Live2dActionQueuePlayer executes queued actions in FIFO order', async () => {
  const executed = [];
  const player = new Live2dActionQueuePlayer({
    executeAction: async (action) => {
      executed.push(`${action.type}:${action.name}`);
    },
    sleep: async () => {},
    tickMs: 10
  });

  player.enqueue(createExpressionAction({ id: 'a1', name: 'smile' }));
  player.enqueue(createExpressionAction({ id: 'a2', name: 'tear_drop' }));

  await player.waitForIdle(800);

  assert.deepEqual(executed, ['expression:smile', 'expression:tear_drop']);
  assert.equal(player.snapshot().queueSize, 0);
});

test('Live2dActionQueuePlayer applies duration wait chunks', async () => {
  const sleepCalls = [];
  const player = new Live2dActionQueuePlayer({
    executeAction: async () => {},
    sleep: async (ms) => {
      sleepCalls.push(ms);
    },
    tickMs: 40
  });

  player.enqueue(createExpressionAction({ id: 'a1', durationSec: 0.12 }));
  await player.waitForIdle(800);

  assert.deepEqual(sleepCalls, [40, 40, 40]);
});

test('Live2dActionQueuePlayer replace policy keeps only latest queued action', async () => {
  const executed = [];
  let firstStarted = false;
  let releaseFirst;
  const firstGate = new Promise((resolve) => {
    releaseFirst = resolve;
  });

  const player = new Live2dActionQueuePlayer({
    executeAction: async (action) => {
      executed.push(action.name);
      if (action.name === 'first') {
        firstStarted = true;
        await firstGate;
      }
    },
    sleep: async () => {},
    tickMs: 20
  });

  player.enqueue(createExpressionAction({ id: 'a1', name: 'first', durationSec: 0.01 }));
  while (!firstStarted) {
    await new Promise((resolve) => setTimeout(resolve, 1));
  }

  player.enqueue(createExpressionAction({ id: 'a2', name: 'second', durationSec: 0.01, queuePolicy: 'append' }));
  player.enqueue(createExpressionAction({ id: 'a3', name: 'third', durationSec: 0.01, queuePolicy: 'replace' }));

  releaseFirst();
  await player.waitForIdle(1000);

  assert.deepEqual(executed, ['first', 'third']);
});

test('Live2dActionQueuePlayer interrupt policy short-circuits current wait', async () => {
  const sleepCalls = [];
  const executed = [];
  const player = new Live2dActionQueuePlayer({
    executeAction: async (action) => {
      executed.push(action.name);
    },
    sleep: async (ms) => {
      sleepCalls.push(ms);
      await new Promise((resolve) => setTimeout(resolve, 0));
    },
    tickMs: 50
  });

  player.enqueue(createExpressionAction({ id: 'a1', name: 'first', durationSec: 0.5 }));

  await new Promise((resolve) => setTimeout(resolve, 0));
  player.enqueue(createExpressionAction({ id: 'a2', name: 'second', durationSec: 0.01, queuePolicy: 'interrupt' }));

  await player.waitForIdle(1200);

  assert.deepEqual(executed, ['first', 'second']);
  assert.ok(sleepCalls.length < 11);
});

test('Live2dActionQueuePlayer isolates execute errors and continues next action', async () => {
  const executed = [];
  const player = new Live2dActionQueuePlayer({
    executeAction: async (action) => {
      executed.push(action.name);
      if (action.name === 'bad-action') {
        throw new Error('mock action failure');
      }
    },
    sleep: async () => {},
    tickMs: 20
  });

  player.enqueue(createExpressionAction({ id: 'a1', name: 'bad-action', durationSec: 0.01 }));
  player.enqueue(createExpressionAction({ id: 'a2', name: 'good-action', durationSec: 0.01 }));

  await player.waitForIdle(800);

  assert.deepEqual(executed, ['bad-action', 'good-action']);
});

test('Live2dActionQueuePlayer honors maxQueueSize with drop_oldest overflow policy', async () => {
  const executed = [];
  let firstStarted = false;
  let releaseFirst;
  const firstGate = new Promise((resolve) => {
    releaseFirst = resolve;
  });

  const player = new Live2dActionQueuePlayer({
    executeAction: async (action) => {
      executed.push(action.name);
      if (action.name === 'first') {
        firstStarted = true;
        await firstGate;
      }
    },
    sleep: async () => {},
    tickMs: 20,
    maxQueueSize: 1,
    overflowPolicy: 'drop_oldest'
  });

  player.enqueue(createExpressionAction({ id: 'a1', name: 'first', durationSec: 0.01 }));
  while (!firstStarted) {
    await new Promise((resolve) => setTimeout(resolve, 1));
  }

  player.enqueue(createExpressionAction({ id: 'a2', name: 'second', durationSec: 0.01 }));
  player.enqueue(createExpressionAction({ id: 'a3', name: 'third', durationSec: 0.01 }));

  releaseFirst();
  await player.waitForIdle(1000);

  assert.deepEqual(executed, ['first', 'third']);
  assert.equal(player.snapshot().droppedCount, 1);
});

test('Live2dActionQueuePlayer can drop newest action on overflow', async () => {
  const executed = [];
  let firstStarted = false;
  let releaseFirst;
  const firstGate = new Promise((resolve) => {
    releaseFirst = resolve;
  });

  const player = new Live2dActionQueuePlayer({
    executeAction: async (action) => {
      executed.push(action.name);
      if (action.name === 'first') {
        firstStarted = true;
        await firstGate;
      }
    },
    sleep: async () => {},
    tickMs: 20,
    maxQueueSize: 1,
    overflowPolicy: 'drop_newest'
  });

  player.enqueue(createExpressionAction({ id: 'a1', name: 'first', durationSec: 0.01 }));
  while (!firstStarted) {
    await new Promise((resolve) => setTimeout(resolve, 1));
  }

  const keepSecond = player.enqueue(createExpressionAction({ id: 'a2', name: 'second', durationSec: 0.01 }));
  const dropThird = player.enqueue(createExpressionAction({ id: 'a3', name: 'third', durationSec: 0.01 }));

  releaseFirst();
  await player.waitForIdle(1000);

  assert.equal(keepSecond.ok, true);
  assert.equal(dropThird.ok, false);
  assert.equal(dropThird.reason, 'queue_overflow_drop_newest');
  assert.deepEqual(executed, ['first', 'second']);
});

test('Live2dActionQueuePlayer executes actions through provided mutex', async () => {
  const executed = [];
  const lockCalls = [];
  const mutex = {
    runExclusive: async (task) => {
      lockCalls.push('lock');
      return task();
    }
  };

  const player = new Live2dActionQueuePlayer({
    executeAction: async (action) => {
      executed.push(action.name);
    },
    sleep: async () => {},
    tickMs: 20,
    mutex
  });

  player.enqueue(createExpressionAction({ id: 'a1', name: 'smile', durationSec: 0.01 }));
  await player.waitForIdle(800);

  assert.deepEqual(executed, ['smile']);
  assert.equal(lockCalls.length, 1);
});

test('Live2dActionQueuePlayer emits enqueue/start/done/fail telemetry events', async () => {
  const telemetry = [];
  const player = new Live2dActionQueuePlayer({
    executeAction: async (action) => {
      if (action.name === 'bad') {
        throw new Error('boom');
      }
    },
    sleep: async () => {},
    tickMs: 20,
    onTelemetry: (event) => telemetry.push(event)
  });

  player.enqueue(createExpressionAction({ id: 'a1', name: 'good', durationSec: 0.01 }));
  player.enqueue(createExpressionAction({ id: 'a2', name: 'bad', durationSec: 0.01 }));
  await player.waitForIdle(800);

  const events = telemetry.map((item) => item.event);
  assert.ok(events.includes('enqueue'));
  assert.ok(events.includes('start'));
  assert.ok(events.includes('done'));
  assert.ok(events.includes('fail'));
  assert.ok(telemetry.every((item) => Number.isFinite(Number(item.timestamp))));
});
