const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');

const { resolveDesktopLive2dConfig } = require('../../apps/desktop-live2d/main/config');

test('resolveDesktopLive2dConfig applies defaults and model relative path', () => {
  const config = resolveDesktopLive2dConfig({ env: {} });

  assert.equal(config.rpcPort, 17373);
  assert.equal(config.modelJsonName, '八千代辉夜姬.model3.json');
  assert.ok(config.modelRelativePath.includes('assets/live2d/yachiyo-kaguya/八千代辉夜姬.model3.json'));
  assert.equal(config.gatewayExternal, false);
});

test('resolveDesktopLive2dConfig respects env overrides', () => {
  const config = resolveDesktopLive2dConfig({
    env: {
      PORT: '3100',
      DESKTOP_GATEWAY_URL: 'http://127.0.0.1:3200',
      DESKTOP_LIVE2D_RPC_PORT: '18080',
      DESKTOP_LIVE2D_RPC_TOKEN: 'fixed',
      DESKTOP_EXTERNAL_GATEWAY: '1'
    },
    projectRoot: '/tmp/project'
  });

  assert.equal(config.gatewayPort, 3100);
  assert.equal(config.gatewayUrl, 'http://127.0.0.1:3200');
  assert.equal(config.rpcPort, 18080);
  assert.equal(config.rpcToken, 'fixed');
  assert.equal(config.gatewayExternal, true);
  assert.equal(config.modelDir, path.join('/tmp/project', 'assets', 'live2d', 'yachiyo-kaguya'));
});
