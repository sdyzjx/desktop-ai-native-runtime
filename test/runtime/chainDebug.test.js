const test = require('node:test');
const assert = require('node:assert/strict');

const { publishChainEvent } = require('../../apps/runtime/bus/chainDebug');

test('publishChainEvent annotates source location', () => {
  const seen = [];
  const bus = {
    isDebugMode: () => true,
    publish: (topic, payload) => seen.push({ topic, payload })
  };

  publishChainEvent(bus, 'worker.envelope.start', { request_id: 'r-1' });

  assert.equal(seen.length, 1);
  assert.equal(seen[0].topic, 'chain.worker.envelope.start');
  assert.equal(seen[0].payload.request_id, 'r-1');
  assert.equal(typeof seen[0].payload.source_file, 'string');
  assert.equal(seen[0].payload.source_file.includes('test/runtime/chainDebug.test.js'), true);
  assert.equal(Number.isFinite(seen[0].payload.source_line), true);
});

test('publishChainEvent allows manual source override', () => {
  const seen = [];
  const bus = {
    isDebugMode: () => true,
    publish: (topic, payload) => seen.push({ topic, payload })
  };

  publishChainEvent(bus, 'worker.envelope.start', {
    request_id: 'r-2',
    source_file: 'custom/source.js',
    source_line: 88
  });

  assert.equal(seen.length, 1);
  assert.equal(seen[0].payload.source_file, 'custom/source.js');
  assert.equal(seen[0].payload.source_line, 88);
});

test('publishChainEvent is no-op when debug mode is disabled', () => {
  const seen = [];
  const bus = {
    isDebugMode: () => false,
    publish: (topic, payload) => seen.push({ topic, payload })
  };

  publishChainEvent(bus, 'worker.envelope.start', { request_id: 'r-3' });
  assert.equal(seen.length, 0);
});
