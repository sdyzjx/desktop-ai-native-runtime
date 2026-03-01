const { app, BrowserWindow, ipcMain, screen, shell, Tray, Menu, nativeImage } = require('electron');

const { startDesktopSuite } = require('./desktopSuite');
const { createTrayController } = require('./trayController');

let suite = null;
let trayController = null;
let shuttingDown = false;
let bootstrapPromise = null;

async function bootstrap() {
  if (bootstrapPromise) {
    return bootstrapPromise;
  }

  bootstrapPromise = (async () => {
    if (suite?.window && !suite.window.isDestroyed()) {
      return suite;
    }

    suite = await startDesktopSuite({
      app,
      BrowserWindow,
      ipcMain,
      screen,
      shell,
      onResizeModeChange: (enabled) => {
        trayController?.setResizeModeEnabled(enabled);
      },
      logger: console
    });
    if (!trayController) {
      trayController = createTrayController({
        Tray,
        Menu,
        nativeImage,
        projectRoot: process.cwd(),
        onShow: () => {
          showPetWindow();
        },
        onHide: () => {
          hidePetWindow();
        },
        onToggleResizeMode: (enabled) => {
          const nextEnabled = suite?.setResizeModeEnabled
            ? suite.setResizeModeEnabled(enabled)
            : Boolean(enabled);
          trayController?.setResizeModeEnabled(nextEnabled);
        },
        isResizeModeEnabled: () => suite?.isResizeModeEnabled?.() || false,
        onQuit: () => {
          app.quit();
        }
      });
    } else if (suite?.isResizeModeEnabled) {
      trayController.setResizeModeEnabled(suite.isResizeModeEnabled());
    }

    console.log('[desktop-live2d] up', {
      rpcUrl: suite.summary.rpcUrl,
      gatewayUrl: suite.summary.gatewayUrl
    });

    return suite;
  })();

  try {
    await bootstrapPromise;
  } finally {
    bootstrapPromise = null;
  }
}

function hidePetWindow() {
  if (suite?.hidePetWindows) {
    suite.hidePetWindows();
    return;
  }
  if (suite?.window && !suite.window.isDestroyed()) {
    suite.window.hide();
  }
}

function showPetWindow() {
  if (suite?.showPetWindows) {
    suite.showPetWindows();
    return;
  }
  if (suite?.window && !suite.window.isDestroyed()) {
    suite.window.show();
    suite.window.focus();
    return;
  }
  void bootstrap().catch((err) => {
    console.error('[desktop-live2d] tray show failed', err);
  });
}

async function teardown() {
  if (shuttingDown) return;
  shuttingDown = true;
  if (trayController) {
    trayController.destroy();
    trayController = null;
  }
  if (suite) {
    await suite.stop();
    suite = null;
  }
}

app.whenReady().then(bootstrap).catch(async (err) => {
  console.error('[desktop-live2d] bootstrap failed', err);
  await teardown();
  app.quit();
});

app.on('before-quit', async () => {
  await teardown();
});

app.on('window-all-closed', () => {
  // Keep gateway/runtime alive when pet window is intentionally hidden or closed.
});

app.on('activate', async () => {
  if (BrowserWindow.getAllWindows().length === 0) {
    showPetWindow();
  }
});
