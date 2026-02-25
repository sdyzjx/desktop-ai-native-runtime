const test = require('node:test');
const assert = require('node:assert/strict');
const { EventEmitter } = require('node:events');

const { GatewaySupervisor } = require('../../apps/desktop-live2d/main/gatewaySupervisor');

test('GatewaySupervisor in external mode only waits for health', async () => {
  let waitCalls = 0;
  let spawnCalled = false;

  const supervisor = new GatewaySupervisor({
    projectRoot: '/tmp/project',
    gatewayUrl: 'http://127.0.0.1:3000',
    gatewayHost: '127.0.0.1',
    gatewayPort: 3000,
    external: true,
    waitForGatewayFn: async () => {
      waitCalls += 1;
    },
    spawnFn: () => {
      spawnCalled = true;
      throw new Error('should not spawn in external mode');
    }
  });

  const summary = await supervisor.start();
  assert.equal(summary.mode, 'external');
  assert.equal(waitCalls, 1);
  assert.equal(spawnCalled, false);
});

test('GatewaySupervisor in embedded mode spawns child and supports stop', async () => {
  const child = new EventEmitter();
  child.pid = 12345;
  child.kill = (signal) => {
    if (signal === 'SIGTERM') {
      setTimeout(() => child.emit('exit', 0, null), 10);
    }
  };

  let spawnCalls = 0;
  const supervisor = new GatewaySupervisor({
    projectRoot: '/tmp/project',
    gatewayUrl: 'http://127.0.0.1:3000',
    gatewayHost: '127.0.0.1',
    gatewayPort: 3000,
    external: false,
    waitForGatewayFn: async () => {},
    spawnFn: () => {
      spawnCalls += 1;
      return child;
    }
  });

  const summary = await supervisor.start();
  assert.equal(summary.mode, 'embedded');
  assert.equal(summary.pid, 12345);
  assert.equal(spawnCalls, 1);

  await supervisor.stop();
});
