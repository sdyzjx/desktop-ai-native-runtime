const test = require('node:test');
const assert = require('node:assert/strict');
const { EventEmitter } = require('node:events');

const { DebugEventStream } = require('../../apps/gateway/debugEventStream');
const { RuntimeEventBus } = require('../../apps/runtime/bus/eventBus');

function createMockReq({ query = {}, headers = {} } = {}) {
  const req = new EventEmitter();
  req.query = query;
  req.headers = headers;
  return req;
}

function createMockRes() {
  return {
    headers: {},
    chunks: [],
    statusCode: 200,
    jsonPayload: null,
    setHeader(name, value) {
      this.headers[name] = value;
    },
    flushHeaders() {},
    write(chunk) {
      this.chunks.push(String(chunk));
    },
    status(code) {
      this.statusCode = code;
      return this;
    },
    json(payload) {
      this.jsonPayload = payload;
      return this;
    }
  };
}

test('DebugEventStream streams events by topic filter', () => {
  const stream = new DebugEventStream({ heartbeatMs: 60000 });
  const req = createMockReq({ query: { topics: 'agent.runtime' } });
  const res = createMockRes();

  stream.handleStream(req, res);
  stream.pushEvent({ topic: 'agent.runtime', event: 'log', msg: 'ok' });
  stream.pushEvent({ topic: 'agent.error', event: 'log', msg: 'skip' });

  const payload = res.chunks.join('');
  assert.match(payload, /agent\.runtime/);
  assert.doesNotMatch(payload, /agent\.error/);

  req.emit('close');
  stream.dispose();
});

test('DebugEventStream supports prefix wildcard topics', () => {
  const stream = new DebugEventStream({ heartbeatMs: 60000 });
  const req = createMockReq({ query: { topics: 'chain.gateway.*' } });
  const res = createMockRes();

  stream.handleStream(req, res);
  stream.pushEvent({ topic: 'chain.gateway.ws.inbound', event: 'log', msg: 'match' });
  stream.pushEvent({ topic: 'chain.worker.runner.start', event: 'log', msg: 'skip' });

  const payload = res.chunks.join('');
  assert.match(payload, /chain\.gateway\.ws\.inbound/);
  assert.doesNotMatch(payload, /chain\.worker\.runner\.start/);

  req.emit('close');
  stream.dispose();
});

test('DebugEventStream replays events by Last-Event-ID', () => {
  const stream = new DebugEventStream({ heartbeatMs: 60000 });
  stream.pushEvent({ topic: 'agent.runtime', msg: 'first' });
  const second = stream.pushEvent({ topic: 'agent.runtime', msg: 'second' });

  const req = createMockReq({
    query: { topics: 'agent.runtime' },
    headers: { 'last-event-id': '1' }
  });
  const res = createMockRes();
  stream.handleStream(req, res);

  const payload = res.chunks.join('');
  assert.match(payload, new RegExp(`id: ${second.id}`));
  assert.match(payload, /"msg":"second"/);

  req.emit('close');
  stream.dispose();
});

test('DebugEventStream enforces bearer auth when token is configured', () => {
  const stream = new DebugEventStream({ authToken: 'secret-token' });
  const req = createMockReq({ query: { topics: 'agent.runtime' } });
  const res = createMockRes();

  stream.handleStream(req, res);

  assert.equal(res.statusCode, 401);
  assert.equal(res.jsonPayload.ok, false);
  stream.dispose();
});

test('DebugEventStream accepts token query for EventSource browser mode', () => {
  const stream = new DebugEventStream({ authToken: 'secret-token', heartbeatMs: 60000 });
  const req = createMockReq({ query: { topics: 'agent.runtime', token: 'secret-token' } });
  const res = createMockRes();

  stream.handleStream(req, res);
  assert.equal(res.statusCode, 200);
  assert.equal(String(res.headers['Content-Type'] || '').includes('text/event-stream'), true);

  req.emit('close');
  stream.dispose();
});

test('DebugEventStream receives RuntimeEventBus publish through subscribeAll', () => {
  const bus = new RuntimeEventBus();
  const stream = new DebugEventStream({ bus, heartbeatMs: 60000 });
  const req = createMockReq({ query: { topics: 'runtime.event' } });
  const res = createMockRes();
  stream.handleStream(req, res);

  bus.publish('runtime.event', { event: 'plan', payload: { a: 1 } });
  const payload = res.chunks.join('');
  assert.match(payload, /runtime\.event/);
  assert.match(payload, /"event":"plan"/);

  req.emit('close');
  stream.dispose();
});

test('DebugEventStream handleEmit preserves metadata payload', () => {
  const stream = new DebugEventStream({ heartbeatMs: 60000 });
  const req = createMockReq({ query: { topics: 'chain.webui.ws.sent' } });
  const res = createMockRes();
  stream.handleStream(req, res);

  const emitReq = createMockReq();
  emitReq.body = {
    topic: 'chain.webui.ws.sent',
    msg: 'sent',
    event: 'log',
    session_id: 's1',
    request_id: 'r1'
  };
  const emitRes = createMockRes();
  stream.handleEmit(emitReq, emitRes);

  assert.equal(emitRes.statusCode, 200);
  const payload = res.chunks.join('');
  assert.match(payload, /"session_id":"s1"/);
  assert.match(payload, /"request_id":"r1"/);
  assert.match(payload, /"msg":"sent"/);

  req.emit('close');
  stream.dispose();
});
