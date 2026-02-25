const test = require('node:test');
const assert = require('node:assert/strict');
const http = require('node:http');

const { waitForGateway } = require('../../apps/desktop/waitForGateway');
const { getFreePort } = require('../helpers/net');

function listen(server, port) {
  return new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(port, '127.0.0.1', () => {
      server.removeListener('error', reject);
      resolve();
    });
  });
}

function close(server) {
  return new Promise((resolve, reject) => {
    server.close((err) => (err ? reject(err) : resolve()));
  });
}

test('waitForGateway resolves after health endpoint becomes ready', async () => {
  const port = await getFreePort();
  let hitCount = 0;
  const server = http.createServer((req, res) => {
    if (req.url !== '/health') {
      res.writeHead(404).end();
      return;
    }
    hitCount += 1;
    if (hitCount < 3) {
      res.writeHead(503).end();
      return;
    }
    res.writeHead(200).end();
  });

  await listen(server, port);

  try {
    await waitForGateway(`http://127.0.0.1:${port}`, {
      timeoutMs: 3000,
      pollIntervalMs: 80,
      requestTimeoutMs: 300
    });
    assert.ok(hitCount >= 3);
  } finally {
    await close(server);
  }
});

test('waitForGateway times out for unavailable gateway', async () => {
  const port = await getFreePort();
  await assert.rejects(
    () => waitForGateway(`http://127.0.0.1:${port}`, {
      timeoutMs: 450,
      pollIntervalMs: 80,
      requestTimeoutMs: 120
    }),
    /did not become healthy/i
  );
});

test('waitForGateway probes health path under baseUrl prefix', async () => {
  const port = await getFreePort();
  let prefixedHealthHitCount = 0;
  const server = http.createServer((req, res) => {
    if (req.url === '/foo/health') {
      prefixedHealthHitCount += 1;
      res.writeHead(200).end();
      return;
    }
    res.writeHead(404).end();
  });

  await listen(server, port);

  try {
    await waitForGateway(`http://127.0.0.1:${port}/foo/`, {
      timeoutMs: 2000,
      pollIntervalMs: 80,
      requestTimeoutMs: 300
    });
    assert.ok(prefixedHealthHitCount >= 1);
  } finally {
    await close(server);
  }
});

test('waitForGateway times out when gateway keeps returning non-2xx health status', async () => {
  const port = await getFreePort();
  let requestCount = 0;
  const server = http.createServer((req, res) => {
    if (req.url !== '/health') {
      res.writeHead(404).end();
      return;
    }
    requestCount += 1;
    res.writeHead(500).end();
  });

  await listen(server, port);

  try {
    await assert.rejects(
      () => waitForGateway(`http://127.0.0.1:${port}`, {
        timeoutMs: 450,
        pollIntervalMs: 80,
        requestTimeoutMs: 120
      }),
      /did not become healthy/i
    );
    assert.ok(requestCount >= 2);
  } finally {
    await close(server);
  }
});
