#!/usr/bin/env node
const fs = require('node:fs');
const path = require('node:path');
const WebSocket = require('ws');
const { getRuntimePaths } = require('../apps/runtime/skills/runtimePaths');

const DEFAULT_SUMMARY_PATH = path.join(getRuntimePaths().dataDir, 'desktop-live2d', 'runtime-summary.json');

function loadRuntimeSummary(summaryPath = DEFAULT_SUMMARY_PATH) {
  if (!fs.existsSync(summaryPath)) {
    throw new Error(`runtime summary not found: ${summaryPath}`);
  }
  const parsed = JSON.parse(fs.readFileSync(summaryPath, 'utf8'));
  if (!parsed.rpcUrl || !parsed.rpcToken) {
    throw new Error('runtime summary must include rpcUrl and rpcToken');
  }
  return parsed;
}

function buildRpcUrlWithToken(rpcUrl, token) {
  const url = new URL(rpcUrl);
  url.searchParams.set('token', token);
  return url.toString();
}

function waitForOpen(ws, timeoutMs) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`ws open timeout after ${timeoutMs}ms`)), timeoutMs);
    ws.once('open', () => {
      clearTimeout(timer);
      resolve();
    });
    ws.once('error', (err) => {
      clearTimeout(timer);
      reject(err);
    });
  });
}

function sendRpc(ws, { id, method, params }, timeoutMs) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`rpc timeout: ${method}`)), timeoutMs);

    const onMessage = (raw) => {
      let message;
      try {
        message = JSON.parse(String(raw));
      } catch {
        return;
      }

      if (message.id !== id) {
        return;
      }

      clearTimeout(timer);
      ws.off('message', onMessage);
      if (message.error) {
        reject(new Error(message.error.message || `rpc failed: ${method}`));
        return;
      }
      resolve(message.result);
    };

    ws.on('message', onMessage);
    ws.send(JSON.stringify({
      jsonrpc: '2.0',
      id,
      method,
      params: params || {}
    }));
  });
}

async function runSmoke({ summaryPath = DEFAULT_SUMMARY_PATH, timeoutMs = 5000, logger = console } = {}) {
  const summary = loadRuntimeSummary(summaryPath);
  const wsUrl = buildRpcUrlWithToken(summary.rpcUrl, summary.rpcToken);
  const ws = new WebSocket(wsUrl);

  await waitForOpen(ws, timeoutMs);
  const state = await sendRpc(ws, { id: 'smoke-state', method: 'state.get', params: {} }, timeoutMs);
  const tools = await sendRpc(ws, { id: 'smoke-tools', method: 'tool.list', params: {} }, timeoutMs);
  await sendRpc(ws, {
    id: 'smoke-panel-append',
    method: 'chat.panel.append',
    params: {
      role: 'system',
      text: '[desktop smoke] rpc channel healthy',
      timestamp: Date.now()
    }
  }, timeoutMs);

  ws.close();

  logger.info?.('[desktop-live2d-smoke] success', {
    rpcUrl: summary.rpcUrl,
    modelLoaded: state?.modelLoaded,
    toolsCount: Array.isArray(tools?.tools) ? tools.tools.length : 0
  });

  return {
    state,
    toolsCount: Array.isArray(tools?.tools) ? tools.tools.length : 0
  };
}

if (require.main === module) {
  runSmoke().then(() => {
    process.exit(0);
  }).catch((err) => {
    console.error('[desktop-live2d-smoke] failed:', err?.message || err);
    process.exit(1);
  });
}

module.exports = {
  DEFAULT_SUMMARY_PATH,
  loadRuntimeSummary,
  buildRpcUrlWithToken,
  runSmoke
};
