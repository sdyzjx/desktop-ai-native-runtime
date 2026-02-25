const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');

const {
  TRAY_ICON_RELATIVE_PATH,
  resolveTrayIconPath,
  createTrayImage,
  createTrayController
} = require('../../apps/desktop-live2d/main/trayController');

test('resolveTrayIconPath resolves under project root', () => {
  const projectRoot = '/tmp/yachiyo-project';
  const result = resolveTrayIconPath({ projectRoot });
  assert.equal(result, path.resolve(projectRoot, TRAY_ICON_RELATIVE_PATH));
});

test('createTrayImage returns resized icon when source exists', () => {
  const resized = { type: 'resized' };
  const source = {
    isEmpty() {
      return false;
    },
    resize() {
      return resized;
    }
  };

  const result = createTrayImage({
    nativeImage: {
      createFromPath() {
        return source;
      }
    },
    iconPath: '/tmp/icon.png',
    size: 20
  });

  assert.equal(result, resized);
});

test('createTrayController wires click and menu actions', async () => {
  const clickHandlers = new Map();
  const contextMenus = [];
  let destroyed = false;
  let showCount = 0;
  let hideCount = 0;
  let quitCount = 0;
  const menuState = { template: null };

  class FakeTray {
    constructor(icon) {
      this.icon = icon;
    }

    setToolTip(text) {
      this.tooltip = text;
    }

    setContextMenu(menu) {
      contextMenus.push(menu);
    }

    on(name, handler) {
      clickHandlers.set(name, handler);
    }

    destroy() {
      destroyed = true;
    }
  }

  const Menu = {
    buildFromTemplate(template) {
      menuState.template = template;
      return { template };
    }
  };

  const nativeImage = {
    createFromPath() {
      return {
        isEmpty() {
          return false;
        },
        resize() {
          return { icon: 'ok' };
        }
      };
    },
    createEmpty() {
      return { empty: true };
    }
  };

  const controller = createTrayController({
    Tray: FakeTray,
    Menu,
    nativeImage,
    projectRoot: '/tmp/project',
    onShow: () => {
      showCount += 1;
    },
    onHide: () => {
      hideCount += 1;
    },
    onQuit: () => {
      quitCount += 1;
    }
  });

  assert.ok(controller);
  assert.equal(contextMenus.length, 1);
  assert.equal(typeof clickHandlers.get('click'), 'function');
  clickHandlers.get('click')();
  assert.equal(showCount, 1);

  const [showItem, hideItem, , quitItem] = menuState.template;
  showItem.click();
  hideItem.click();
  quitItem.click();
  assert.equal(showCount, 2);
  assert.equal(hideCount, 1);
  assert.equal(quitCount, 1);

  controller.destroy();
  assert.equal(destroyed, true);
});
