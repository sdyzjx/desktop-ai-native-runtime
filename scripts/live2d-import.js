#!/usr/bin/env node
const path = require('node:path');

const {
  PROJECT_ROOT,
  DEFAULT_IMPORT_SOURCE_DIR,
  MODEL_ASSET_RELATIVE_DIR,
  MODEL_JSON_NAME
} = require('../apps/desktop-live2d/main/constants');
const { importModelAssets } = require('../apps/desktop-live2d/main/modelAssets');
const { getRuntimePaths } = require('../apps/runtime/skills/runtimePaths');

function main() {
  const runtimePaths = getRuntimePaths();
  const sourceDir = process.env.LIVE2D_IMPORT_SOURCE_DIR || DEFAULT_IMPORT_SOURCE_DIR;
  const targetDir = path.join(PROJECT_ROOT, MODEL_ASSET_RELATIVE_DIR);
  const backupRoot = process.env.DESKTOP_LIVE2D_BACKUP_ROOT || path.join(runtimePaths.dataDir, 'backups', 'live2d');
  const allowOverwrite = !process.argv.includes('--no-overwrite');

  const summary = importModelAssets({
    sourceDir,
    targetDir,
    modelJsonName: MODEL_JSON_NAME,
    backupRoot,
    allowOverwrite
  });

  console.log('[live2d:import] done');
  console.log(`source: ${sourceDir}`);
  console.log(`target: ${summary.targetDir}`);
  console.log(`model : ${summary.modelJsonPath}`);
  console.log(`files : ${summary.fileCount}`);
  if (summary.backupDir) {
    console.log(`backup: ${summary.backupDir}`);
  }
  console.log(`manifest: ${summary.manifestPath}`);
}

try {
  main();
} catch (err) {
  console.error('[live2d:import] failed:', err.message || err);
  process.exit(1);
}
