const http = require('node:http');
const https = require('node:https');

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function toHealthUrl(baseUrl) {
  const normalized = baseUrl.endsWith('/') ? baseUrl : `${baseUrl}/`;
  return new URL('health', normalized);
}

async function probeGatewayHealth(healthUrl, requestTimeoutMs) {
  const client = healthUrl.protocol === 'https:' ? https : http;
  return new Promise((resolve) => {
    const req = client.request(
      healthUrl,
      { method: 'GET', timeout: requestTimeoutMs },
      (res) => {
        res.resume();
        resolve(res.statusCode >= 200 && res.statusCode < 300);
      }
    );

    req.on('timeout', () => {
      req.destroy();
      resolve(false);
    });

    req.on('error', () => resolve(false));
    req.end();
  });
}

async function waitForGateway(
  baseUrl,
  { timeoutMs = 15000, pollIntervalMs = 300, requestTimeoutMs = 1000 } = {}
) {
  const healthUrl = toHealthUrl(baseUrl);
  const deadline = Date.now() + timeoutMs;

  while (Date.now() < deadline) {
    const healthy = await probeGatewayHealth(healthUrl, requestTimeoutMs);
    if (healthy) return;
    await sleep(pollIntervalMs);
  }

  throw new Error(`Gateway did not become healthy in ${timeoutMs}ms (${healthUrl.href})`);
}

module.exports = { waitForGateway, probeGatewayHealth };
