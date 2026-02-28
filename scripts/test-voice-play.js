#!/usr/bin/env node
/**
 * 手动测试脚本：voice.play.test RPC → IPC → 实际播放 wav
 *
 * 用法：
 *   node scripts/test-voice-play.js [wav路径]
 *
 * 没有 Electron 时，用 afplay 模拟 renderer 的 Audio.play()
 */

const { WebSocket } = require('ws');
const { spawn } = require('node:child_process');
const path = require('node:path');

const { Live2dRpcServer } = require('../apps/desktop-live2d/main/rpcServer');
const { handleDesktopRpcRequest } = require('../apps/desktop-live2d/main/desktopSuite');

const wavPath = process.argv[2] || '/tmp/test-tone.wav';
const audioRef = wavPath.startsWith('file://') ? wavPath : `file://${wavPath}`;

// Fake webContents: 收到 IPC 后用 afplay 实际播放
const webContents = {
  isDestroyed: () => false,
  send(channel, payload) {
    console.log(`[IPC] channel=${channel}`);
    console.log(`[IPC] payload=${JSON.stringify(payload)}`);

    if (channel === 'desktop:voice:play') {
      const src = String(payload?.audioRef || '').replace(/^file:\/\//, '');
      console.log(`[renderer] Audio.play() → afplay ${src}`);
      const proc = spawn('afplay', [src], { stdio: 'inherit' });
      proc.on('close', (code) => {
        console.log(`[renderer] afplay exited code=${code}`);
        process.exit(code === 0 ? 0 : 1);
      });
    }
  }
};

const bridge = { invoke() { throw new Error('not expected'); } };
const token = 'test-manual';

async function main() {
  const server = new Live2dRpcServer({
    host: '127.0.0.1',
    port: 0,
    token,
    requestHandler: (request) => handleDesktopRpcRequest({
      request, bridge, webContents, rendererTimeoutMs: 3000
    }),
    logger: console
  });

  await server.start();
  const port = server.wss.address().port;
  const url = `ws://127.0.0.1:${port}?token=${token}`;
  console.log(`[rpc] server up at ${url}`);
  console.log(`[rpc] sending voice.play.test audioRef=${audioRef}`);

  const ws = new WebSocket(url);
  await new Promise((resolve, reject) => {
    ws.once('open', resolve);
    ws.once('error', reject);
  });

  ws.once('message', async (data) => {
    const resp = JSON.parse(String(data));
    console.log(`[rpc] response: ${JSON.stringify(resp)}`);
    ws.close();
    await server.stop();
    if (!resp.result?.ok) {
      console.error('[rpc] FAILED', resp.error);
      process.exit(1);
    }
  });

  ws.send(JSON.stringify({
    jsonrpc: '2.0',
    id: 1,
    method: 'voice.play.test',
    params: { audioRef, format: 'wav', voiceTag: 'zh' }
  }));
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
