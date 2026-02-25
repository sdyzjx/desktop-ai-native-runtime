const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const {
  validateModelAssetDirectory,
  importModelAssets
} = require('../../apps/desktop-live2d/main/modelAssets');

function createSourceModelDir(rootDir, { missingTexture = false } = {}) {
  fs.mkdirSync(rootDir, { recursive: true });
  fs.mkdirSync(path.join(rootDir, '八千代辉夜姬.8192'), { recursive: true });

  fs.writeFileSync(path.join(rootDir, '八千代辉夜姬.moc3'), 'moc');
  fs.writeFileSync(path.join(rootDir, '八千代辉夜姬.physics3.json'), '{}');
  fs.writeFileSync(path.join(rootDir, '八千代辉夜姬.cdi3.json'), '{}');

  fs.writeFileSync(path.join(rootDir, '八千代辉夜姬.8192', 'texture_00.png'), 'png-0');
  if (!missingTexture) {
    fs.writeFileSync(path.join(rootDir, '八千代辉夜姬.8192', 'texture_01.png'), 'png-1');
  }

  fs.writeFileSync(
    path.join(rootDir, '八千代辉夜姬.model3.json'),
    JSON.stringify({
      Version: 3,
      FileReferences: {
        Moc: '八千代辉夜姬.moc3',
        Textures: [
          '八千代辉夜姬.8192/texture_00.png',
          '八千代辉夜姬.8192/texture_01.png'
        ],
        Physics: '八千代辉夜姬.physics3.json',
        DisplayInfo: '八千代辉夜姬.cdi3.json'
      }
    })
  );
}

test('validateModelAssetDirectory validates minimal model bundle', () => {
  const sourceDir = fs.mkdtempSync(path.join(os.tmpdir(), 'live2d-model-'));
  createSourceModelDir(sourceDir);

  const result = validateModelAssetDirectory({
    modelDir: sourceDir,
    modelJsonName: '八千代辉夜姬.model3.json'
  });

  assert.ok(result.modelJsonPath.endsWith('八千代辉夜姬.model3.json'));
  assert.equal(result.modelName, '八千代辉夜姬.model3');
});

test('importModelAssets copies source, creates backup and writes manifest', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'live2d-import-'));
  const sourceDir = path.join(root, 'source');
  const targetDir = path.join(root, 'assets', 'live2d', 'yachiyo-kaguya');
  const backupRoot = path.join(root, 'backup');

  createSourceModelDir(sourceDir);

  fs.mkdirSync(targetDir, { recursive: true });
  fs.writeFileSync(path.join(targetDir, 'stale.txt'), 'old');

  const summary = importModelAssets({
    sourceDir,
    targetDir,
    modelJsonName: '八千代辉夜姬.model3.json',
    backupRoot,
    allowOverwrite: true
  });

  assert.ok(summary.backupDir);
  assert.ok(fs.existsSync(path.join(summary.backupDir, 'stale.txt')));
  assert.ok(fs.existsSync(summary.manifestPath));

  const manifest = JSON.parse(fs.readFileSync(summary.manifestPath, 'utf8'));
  assert.ok(manifest.fileCount >= 6);
  assert.ok(manifest.files.some((file) => file.path === '八千代辉夜姬.model3.json'));
});

test('importModelAssets throws when model texture reference is missing', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'live2d-import-fail-'));
  const sourceDir = path.join(root, 'source');
  const targetDir = path.join(root, 'target');

  createSourceModelDir(sourceDir, { missingTexture: true });

  assert.throws(
    () => importModelAssets({
      sourceDir,
      targetDir,
      modelJsonName: '八千代辉夜姬.model3.json',
      backupRoot: path.join(root, 'backup'),
      allowOverwrite: true
    }),
    /Textures\[1\] file is missing/i
  );
});
