const test = require('node:test');
const assert = require('node:assert/strict');
const { WebSocketServer } = require('ws');

const live2dAdapters = require('../../apps/runtime/tooling/adapters/live2d');

const {
  invokeLive2dRpc,
  normalizeRpcUrl,
  mapRpcCodeToToolingCode,
  sanitizeRpcParams,
  buildRequestId,
  createLive2dAdapters,
  createActionQueue
} = live2dAdapters.__internal;

async function createWsServer() {
  const wss = new WebSocketServer({ port: 0, host: '127.0.0.1' });
  await new Promise((resolve, reject) => {
    wss.once('listening', resolve);
    wss.once('error', reject);
  });
  const port = wss.address().port;
  return { wss, port };
}

test('normalizeRpcUrl builds ws url with token', () => {
  const url = normalizeRpcUrl({ host: '127.0.0.1', port: 17373, token: 'abc' });
  assert.equal(url, 'ws://127.0.0.1:17373/?token=abc');
});

test('buildRequestId embeds trace id prefix when provided', () => {
  const id = buildRequestId('trace-123');
  assert.match(id, /^live2d-trace-123-/);
});

test('mapRpcCodeToToolingCode maps known rpc errors', () => {
  assert.equal(mapRpcCodeToToolingCode(-32602), 'VALIDATION_ERROR');
  assert.equal(mapRpcCodeToToolingCode(-32006), 'PERMISSION_DENIED');
  assert.equal(mapRpcCodeToToolingCode(-32003), 'TIMEOUT');
  assert.equal(mapRpcCodeToToolingCode(-32005), 'RUNTIME_ERROR');
});

test('sanitizeRpcParams strips timeoutMs and validates object', () => {
  const out = sanitizeRpcParams({ group: 'Idle', timeoutMs: 1234 });
  assert.equal(out.group, 'Idle');
  assert.equal(Object.hasOwn(out, 'timeoutMs'), false);
  assert.throws(() => sanitizeRpcParams([]), /must be an object/i);
});

test('createActionQueue drop_if_busy rejects when pending exists', async () => {
  const queue = createActionQueue();
  let release;
  const blocker = new Promise((resolve) => {
    release = resolve;
  });

  const first = queue.run('s1', () => blocker, 'enqueue');
  await assert.rejects(
    queue.run('s1', async () => 'x', 'drop_if_busy'),
    /queue busy/i
  );

  release();
  await first;
});

test('invokeLive2dRpc returns rpc result', async (t) => {
  const token = 'token-1';
  const { wss, port } = await createWsServer();
  t.after(async () => {
    await new Promise((resolve) => wss.close(resolve));
  });

  wss.on('connection', (ws, request) => {
    const url = new URL(request.url || '/', 'ws://localhost');
    if (url.searchParams.get('token') !== token) {
      ws.close(1008, 'unauthorized');
      return;
    }

    ws.on('message', (raw) => {
      const req = JSON.parse(String(raw));
      ws.send(JSON.stringify({
        jsonrpc: '2.0',
        id: req.id,
        result: { ok: true, echoedMethod: req.method, echoedParams: req.params }
      }));
    });
  });

  const result = await invokeLive2dRpc({
    method: 'model.param.set',
    params: { name: 'ParamAngleX', value: 10 },
    env: {
      DESKTOP_LIVE2D_RPC_HOST: '127.0.0.1',
      DESKTOP_LIVE2D_RPC_PORT: String(port),
      DESKTOP_LIVE2D_RPC_TOKEN: token
    },
    traceId: 'trace-live2d'
  });

  assert.equal(result.ok, true);
  assert.equal(result.echoedMethod, 'model.param.set');
  assert.equal(result.echoedParams.name, 'ParamAngleX');
});

test('invokeLive2dRpc maps rpc error to tooling error code', async (t) => {
  const token = 'token-rpc-error';
  const { wss, port } = await createWsServer();
  t.after(async () => {
    await new Promise((resolve) => wss.close(resolve));
  });

  wss.on('connection', (ws, request) => {
    const url = new URL(request.url || '/', 'ws://localhost');
    if (url.searchParams.get('token') !== token) {
      ws.close(1008, 'unauthorized');
      return;
    }

    ws.on('message', (raw) => {
      const req = JSON.parse(String(raw));
      ws.send(JSON.stringify({
        jsonrpc: '2.0',
        id: req.id,
        error: { code: -32602, message: 'invalid params' }
      }));
    });
  });

  await assert.rejects(
    invokeLive2dRpc({
      method: 'model.motion.play',
      params: { group: '' },
      env: {
        DESKTOP_LIVE2D_RPC_HOST: '127.0.0.1',
        DESKTOP_LIVE2D_RPC_PORT: String(port),
        DESKTOP_LIVE2D_RPC_TOKEN: token
      },
      traceId: 'trace-rpc'
    }),
    (err) => {
      assert.equal(err.code, 'VALIDATION_ERROR');
      assert.equal(err.details.trace_id, 'trace-rpc');
      return true;
    }
  );
});

test('createLive2dAdapters serializes action calls per session', async () => {
  const starts = [];
  const ends = [];
  const adapter = createLive2dAdapters({
    invokeRpc: async ({ method }) => {
      starts.push({ method, at: Date.now() });
      await new Promise((resolve) => setTimeout(resolve, 20));
      ends.push({ method, at: Date.now() });
      return { ok: true };
    },
    actionCooldownMs: 0
  });

  const p1 = adapter['live2d.motion.play']({ group: 'Idle' }, { session_id: 's1' });
  const p2 = adapter['live2d.expression.set']({ name: 'smile' }, { session_id: 's1' });
  await Promise.all([p1, p2]);

  assert.equal(starts.length, 2);
  assert.equal(ends.length, 2);
  assert.ok(starts[1].at >= ends[0].at);
});

test('createLive2dAdapters applies action cooldown', async () => {
  const adapter = createLive2dAdapters({
    invokeRpc: async () => ({ ok: true }),
    actionCooldownMs: 40
  });

  const t0 = Date.now();
  await adapter['live2d.motion.play']({ group: 'Idle' }, { session_id: 's-cool' });
  await adapter['live2d.motion.play']({ group: 'Idle' }, { session_id: 's-cool' });
  const elapsed = Date.now() - t0;

  assert.ok(elapsed >= 35);
});

test('createLive2dAdapters publishes ui.live2d.action when publishEvent is available', async () => {
  const rpcCalls = [];
  const events = [];
  const adapter = createLive2dAdapters({
    invokeRpc: async ({ method, params }) => {
      rpcCalls.push({ method, params });
      return { ok: true };
    },
    actionCooldownMs: 0
  });

  const payload = await adapter['live2d.motion.play']({
    group: 'Greet',
    index: 0,
    action_id: 'act-test-1',
    duration_sec: 2.2,
    queue_policy: 'replace'
  }, {
    session_id: 's-event-1',
    trace_id: 'trace-event-1',
    publishEvent: (topic, eventPayload) => {
      events.push({ topic, eventPayload });
    }
  });

  const parsed = JSON.parse(payload);
  assert.equal(parsed.ok, true);
  assert.equal(parsed.mode, 'event');
  assert.equal(parsed.topic, 'ui.live2d.action');
  assert.equal(parsed.action_id, 'act-test-1');

  assert.equal(events.length, 1);
  assert.equal(events[0].topic, 'ui.live2d.action');
  assert.deepEqual(events[0].eventPayload, {
    action_id: 'act-test-1',
    action: {
      type: 'motion',
      name: 'Greet',
      args: { group: 'Greet', index: 0 }
    },
    duration_sec: 2.2,
    queue_policy: 'replace'
  });

  assert.equal(rpcCalls.length, 0);
});

test('createLive2dAdapters validates action event payload fields', async () => {
  const adapter = createLive2dAdapters({
    invokeRpc: async () => ({ ok: true }),
    actionCooldownMs: 0
  });

  await assert.rejects(
    adapter['live2d.expression.set']({
      name: 'smile',
      duration_sec: 0
    }, {
      session_id: 's-event-2',
      trace_id: 'trace-event-2',
      publishEvent: () => {}
    }),
    (err) => err.code === 'VALIDATION_ERROR'
  );
});

test('semantic tools map presets to rpc calls in order', async () => {
  const calls = [];
  const adapter = createLive2dAdapters({
    invokeRpc: async ({ method, params }) => {
      calls.push({ method, params });
      return { ok: true };
    },
    actionCooldownMs: 0,
    presetConfig: {
      version: 1,
      emote: {
        happy: {
          medium: {
            expression: 'smile',
            params: [{ name: 'ParamMouthForm', value: 0.6 }]
          }
        }
      },
      gesture: {
        greet: {
          expression: 'smile',
          motion: { group: 'Greet', index: 0 }
        }
      },
      react: {
        error: [
          { type: 'expression', name: 'tears' },
          { type: 'motion', group: 'ReactError', index: 0 }
        ]
      }
    }
  });

  await adapter['live2d.emote']({ emotion: 'happy', intensity: 'medium' }, { session_id: 's2' });
  await adapter['live2d.gesture']({ type: 'greet' }, { session_id: 's2' });
  await adapter['live2d.react']({ intent: 'error' }, { session_id: 's2' });

  const methods = calls.map((c) => c.method);
  assert.deepEqual(methods, [
    'model.expression.set',
    'model.param.batchSet',
    'model.expression.set',
    'model.motion.play',
    'model.expression.set',
    'model.motion.play'
  ]);
});

test('semantic tool throws validation error when preset missing', async () => {
  const adapter = createLive2dAdapters({
    invokeRpc: async () => ({ ok: true }),
    actionCooldownMs: 0,
    presetConfig: { version: 1, emote: {}, gesture: {}, react: {} }
  });

  await assert.rejects(
    adapter['live2d.react']({ intent: 'unknown' }, { session_id: 's3' }),
    (err) => err.code === 'VALIDATION_ERROR'
  );
});

test('live2d.motion.play adapter maps to model.motion.play and strips timeoutMs param', async (t) => {
  const token = 'token-2';
  const { wss, port } = await createWsServer();
  t.after(async () => {
    await new Promise((resolve) => wss.close(resolve));
  });

  wss.on('connection', (ws, request) => {
    const url = new URL(request.url || '/', 'ws://localhost');
    if (url.searchParams.get('token') !== token) {
      ws.close(1008, 'unauthorized');
      return;
    }

    ws.on('message', (raw) => {
      const req = JSON.parse(String(raw));
      ws.send(JSON.stringify({
        jsonrpc: '2.0',
        id: req.id,
        result: { method: req.method, params: req.params }
      }));
    });
  });

  const previousEnv = {
    DESKTOP_LIVE2D_RPC_HOST: process.env.DESKTOP_LIVE2D_RPC_HOST,
    DESKTOP_LIVE2D_RPC_PORT: process.env.DESKTOP_LIVE2D_RPC_PORT,
    DESKTOP_LIVE2D_RPC_TOKEN: process.env.DESKTOP_LIVE2D_RPC_TOKEN
  };

  process.env.DESKTOP_LIVE2D_RPC_HOST = '127.0.0.1';
  process.env.DESKTOP_LIVE2D_RPC_PORT = String(port);
  process.env.DESKTOP_LIVE2D_RPC_TOKEN = token;

  try {
    const payload = await live2dAdapters['live2d.motion.play']({ group: 'Idle', index: 1, timeoutMs: 1234 }, { trace_id: 'trace-xyz' });
    const parsed = JSON.parse(payload);
    assert.equal(parsed.ok, true);
    assert.equal(parsed.method, 'model.motion.play');
    assert.equal(parsed.result.method, 'model.motion.play');
    assert.equal(parsed.result.params.group, 'Idle');
    assert.equal(Object.hasOwn(parsed.result.params, 'timeoutMs'), false);
  } finally {
    if (previousEnv.DESKTOP_LIVE2D_RPC_HOST == null) delete process.env.DESKTOP_LIVE2D_RPC_HOST;
    else process.env.DESKTOP_LIVE2D_RPC_HOST = previousEnv.DESKTOP_LIVE2D_RPC_HOST;

    if (previousEnv.DESKTOP_LIVE2D_RPC_PORT == null) delete process.env.DESKTOP_LIVE2D_RPC_PORT;
    else process.env.DESKTOP_LIVE2D_RPC_PORT = previousEnv.DESKTOP_LIVE2D_RPC_PORT;

    if (previousEnv.DESKTOP_LIVE2D_RPC_TOKEN == null) delete process.env.DESKTOP_LIVE2D_RPC_TOKEN;
    else process.env.DESKTOP_LIVE2D_RPC_TOKEN = previousEnv.DESKTOP_LIVE2D_RPC_TOKEN;
  }
});
