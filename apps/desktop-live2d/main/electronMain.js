const { app, BrowserWindow, ipcMain } = require('electron');

const { startDesktopSuite } = require('./desktopSuite');

let suite = null;
let shuttingDown = false;

async function bootstrap() {
  suite = await startDesktopSuite({ app, BrowserWindow, ipcMain, logger: console });
  console.log('[desktop-live2d] up', {
    rpcUrl: suite.summary.rpcUrl,
    gatewayUrl: suite.summary.gatewayUrl
  });
}

async function teardown() {
  if (shuttingDown) return;
  shuttingDown = true;
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
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

app.on('activate', async () => {
  if (BrowserWindow.getAllWindows().length === 0 && !suite) {
    try {
      await bootstrap();
    } catch (err) {
      console.error('[desktop-live2d] activate failed', err);
      app.quit();
    }
  }
});
