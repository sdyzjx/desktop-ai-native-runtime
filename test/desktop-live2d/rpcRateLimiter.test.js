const test = require('node:test');
const assert = require('node:assert/strict');

const { RpcRateLimiter } = require('../../apps/desktop-live2d/main/rpcRateLimiter');

test('RpcRateLimiter allows within configured quota', () => {
  const limiter = new RpcRateLimiter({ limitsPerSecond: { 'state.get': 2 } });

  const first = limiter.check({ clientId: 'a', method: 'state.get', nowMs: 1000 });
  const second = limiter.check({ clientId: 'a', method: 'state.get', nowMs: 1100 });

  assert.equal(first.ok, true);
  assert.equal(second.ok, true);
  assert.equal(second.remaining, 0);
});

test('RpcRateLimiter rejects calls exceeding quota and resets next window', () => {
  const limiter = new RpcRateLimiter({ limitsPerSecond: { 'chat.show': 1 } });

  const first = limiter.check({ clientId: 'u', method: 'chat.show', nowMs: 2000 });
  const second = limiter.check({ clientId: 'u', method: 'chat.show', nowMs: 2300 });
  const third = limiter.check({ clientId: 'u', method: 'chat.show', nowMs: 3105 });

  assert.equal(first.ok, true);
  assert.equal(second.ok, false);
  assert.ok(second.retryAfterMs > 0);
  assert.equal(third.ok, true);
});
