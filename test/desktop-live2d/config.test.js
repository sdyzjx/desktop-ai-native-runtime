const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const { resolveDesktopLive2dConfig } = require('../../apps/desktop-live2d/main/config');

test('resolveDesktopLive2dConfig applies defaults and model relative path', () => {
  const config = resolveDesktopLive2dConfig({ env: {} });

  assert.equal(config.rpcPort, 17373);
  assert.equal(config.modelJsonName, '八千代辉夜姬.model3.json');
  assert.ok(config.modelRelativePath.includes('assets/live2d/yachiyo-kaguya/八千代辉夜姬.model3.json'));
  assert.equal(config.gatewayExternal, false);
  assert.equal(config.uiConfig.chat.panel.enabled, true);
  assert.equal(config.uiConfig.chat.panel.defaultVisible, false);
  assert.equal(config.uiConfig.layout.lockScaleOnResize, true);
  assert.equal(config.uiConfig.layout.lockPositionOnResize, true);
  assert.equal(config.uiConfig.window.compactWhenChatHidden, true);
  assert.equal(config.uiConfig.window.compactWidth, 300);
  assert.equal(config.uiConfig.window.compactHeight, 560);
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

test('resolveDesktopLive2dConfig loads overrides from config/desktop-live2d.json', () => {
  const projectRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'live2d-config-'));
  fs.mkdirSync(path.join(projectRoot, 'config'), { recursive: true });
  fs.writeFileSync(
    path.join(projectRoot, 'config', 'desktop-live2d.json'),
    JSON.stringify({
      window: {
        width: 520,
        compactWidth: 280,
        placement: {
          anchor: 'top-left',
          marginTop: 30
        }
      },
      render: {
        resolutionScale: 1.2
      },
      layout: {
        scaleMultiplier: 0.95,
        lockScaleOnResize: false,
        lockPositionOnResize: false
      },
      chat: {
        panel: {
          defaultVisible: false,
          maxMessages: 88
        }
      }
    }),
    'utf8'
  );

  const config = resolveDesktopLive2dConfig({ env: {}, projectRoot });
  assert.equal(config.uiConfig.window.width, 520);
  assert.equal(config.uiConfig.window.compactWidth, 280);
  assert.equal(config.uiConfig.window.placement.anchor, 'top-left');
  assert.equal(config.uiConfig.window.placement.marginTop, 30);
  assert.equal(config.uiConfig.render.resolutionScale, 1.2);
  assert.equal(config.uiConfig.layout.scaleMultiplier, 0.95);
  assert.equal(config.uiConfig.layout.lockScaleOnResize, false);
  assert.equal(config.uiConfig.layout.lockPositionOnResize, false);
  assert.equal(config.uiConfig.chat.panel.defaultVisible, false);
  assert.equal(config.uiConfig.chat.panel.maxMessages, 88);
});
