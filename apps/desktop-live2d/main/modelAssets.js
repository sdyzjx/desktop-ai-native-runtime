const fs = require('node:fs');
const path = require('node:path');

function ensureDirectory(dirPath) {
  fs.mkdirSync(dirPath, { recursive: true });
}

function toPortablePath(filePath) {
  return filePath.split(path.sep).join('/');
}

function listRelativeFiles(rootDir, currentDir = rootDir, acc = []) {
  const entries = fs.readdirSync(currentDir, { withFileTypes: true });
  for (const entry of entries) {
    const absolute = path.join(currentDir, entry.name);
    if (entry.isDirectory()) {
      listRelativeFiles(rootDir, absolute, acc);
      continue;
    }
    if (!entry.isFile()) {
      continue;
    }
    const relative = path.relative(rootDir, absolute);
    acc.push(relative);
  }
  return acc;
}

function timestampLabel(now = new Date()) {
  const YYYY = String(now.getFullYear());
  const MM = String(now.getMonth() + 1).padStart(2, '0');
  const DD = String(now.getDate()).padStart(2, '0');
  const hh = String(now.getHours()).padStart(2, '0');
  const mm = String(now.getMinutes()).padStart(2, '0');
  const ss = String(now.getSeconds()).padStart(2, '0');
  return `${YYYY}${MM}${DD}-${hh}${mm}${ss}`;
}

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, 'utf8'));
}

function assertFileExists(baseDir, relativePath, fieldName) {
  const absolute = path.resolve(baseDir, relativePath);
  const withinBase = absolute === baseDir || absolute.startsWith(`${baseDir}${path.sep}`);
  if (!withinBase) {
    throw new Error(`${fieldName} points outside model directory: ${relativePath}`);
  }
  if (!fs.existsSync(absolute)) {
    throw new Error(`${fieldName} file is missing: ${relativePath}`);
  }
  return absolute;
}

function validateModelAssetDirectory({ modelDir, modelJsonName }) {
  if (!fs.existsSync(modelDir) || !fs.statSync(modelDir).isDirectory()) {
    throw new Error(`model directory does not exist: ${modelDir}`);
  }

  const modelJsonPath = path.join(modelDir, modelJsonName);
  if (!fs.existsSync(modelJsonPath)) {
    throw new Error(`model json not found: ${modelJsonName}`);
  }

  const modelJson = readJson(modelJsonPath);
  const refs = modelJson.FileReferences || {};

  if (typeof refs.Moc !== 'string' || !refs.Moc.trim()) {
    throw new Error('model json missing FileReferences.Moc');
  }
  assertFileExists(modelDir, refs.Moc, 'FileReferences.Moc');

  if (!Array.isArray(refs.Textures) || refs.Textures.length === 0) {
    throw new Error('model json missing FileReferences.Textures');
  }
  for (const [index, textureRel] of refs.Textures.entries()) {
    if (typeof textureRel !== 'string' || !textureRel.trim()) {
      throw new Error(`FileReferences.Textures[${index}] must be a non-empty string`);
    }
    assertFileExists(modelDir, textureRel, `FileReferences.Textures[${index}]`);
  }

  if (refs.Physics != null) {
    if (typeof refs.Physics !== 'string' || !refs.Physics.trim()) {
      throw new Error('FileReferences.Physics must be a non-empty string when provided');
    }
    assertFileExists(modelDir, refs.Physics, 'FileReferences.Physics');
  }

  if (refs.DisplayInfo != null) {
    if (typeof refs.DisplayInfo !== 'string' || !refs.DisplayInfo.trim()) {
      throw new Error('FileReferences.DisplayInfo must be a non-empty string when provided');
    }
    assertFileExists(modelDir, refs.DisplayInfo, 'FileReferences.DisplayInfo');
  }

  if (refs.Expressions != null) {
    if (!Array.isArray(refs.Expressions) || refs.Expressions.length === 0) {
      throw new Error('FileReferences.Expressions must be a non-empty array when provided');
    }
    for (const [index, expression] of refs.Expressions.entries()) {
      if (!expression || typeof expression !== 'object') {
        throw new Error(`FileReferences.Expressions[${index}] must be an object`);
      }
      if (typeof expression.Name !== 'string' || !expression.Name.trim()) {
        throw new Error(`FileReferences.Expressions[${index}].Name must be a non-empty string`);
      }
      if (typeof expression.File !== 'string' || !expression.File.trim()) {
        throw new Error(`FileReferences.Expressions[${index}].File must be a non-empty string`);
      }
      assertFileExists(modelDir, expression.File, `FileReferences.Expressions[${index}].File`);
    }
  }

  if (refs.Motions != null) {
    if (!refs.Motions || typeof refs.Motions !== 'object' || Array.isArray(refs.Motions)) {
      throw new Error('FileReferences.Motions must be an object when provided');
    }

    for (const [groupName, motions] of Object.entries(refs.Motions)) {
      if (!Array.isArray(motions) || motions.length === 0) {
        throw new Error(`FileReferences.Motions.${groupName} must be a non-empty array`);
      }
      for (const [index, motion] of motions.entries()) {
        if (!motion || typeof motion !== 'object') {
          throw new Error(`FileReferences.Motions.${groupName}[${index}] must be an object`);
        }
        if (typeof motion.File !== 'string' || !motion.File.trim()) {
          throw new Error(`FileReferences.Motions.${groupName}[${index}].File must be a non-empty string`);
        }
        assertFileExists(modelDir, motion.File, `FileReferences.Motions.${groupName}[${index}].File`);
      }
    }
  }

  return {
    modelJsonPath,
    modelJson,
    modelName: path.basename(modelJsonName, path.extname(modelJsonName))
  };
}

function buildManifest({ sourceDir, targetDir, modelJsonName }) {
  const relativeFiles = listRelativeFiles(targetDir).sort((a, b) => a.localeCompare(b));
  const files = relativeFiles.map((relative) => {
    const absolute = path.join(targetDir, relative);
    const stat = fs.statSync(absolute);
    return {
      path: toPortablePath(relative),
      bytes: stat.size,
      mtimeMs: stat.mtimeMs
    };
  });

  return {
    generatedAt: new Date().toISOString(),
    sourceDir,
    modelJsonName,
    fileCount: files.length,
    files
  };
}

function backupTargetDirectory({ targetDir, backupRoot }) {
  ensureDirectory(backupRoot);
  const backupDir = path.join(backupRoot, timestampLabel());
  fs.cpSync(targetDir, backupDir, { recursive: true });
  return backupDir;
}

function importModelAssets({
  sourceDir,
  targetDir,
  modelJsonName,
  backupRoot,
  allowOverwrite = true
}) {
  if (!fs.existsSync(sourceDir) || !fs.statSync(sourceDir).isDirectory()) {
    throw new Error(`source directory does not exist: ${sourceDir}`);
  }

  let backupDir = null;
  if (fs.existsSync(targetDir)) {
    if (!allowOverwrite) {
      throw new Error(`target directory already exists and overwrite is disabled: ${targetDir}`);
    }
    backupDir = backupTargetDirectory({ targetDir, backupRoot });
    fs.rmSync(targetDir, { recursive: true, force: true });
  }

  ensureDirectory(path.dirname(targetDir));
  fs.cpSync(sourceDir, targetDir, { recursive: true });

  const validation = validateModelAssetDirectory({ modelDir: targetDir, modelJsonName });
  const manifest = buildManifest({ sourceDir, targetDir, modelJsonName });
  const manifestPath = path.join(targetDir, 'manifest.json');
  fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2), 'utf8');

  return {
    targetDir,
    backupDir,
    manifestPath,
    modelJsonPath: validation.modelJsonPath,
    fileCount: manifest.fileCount,
    modelName: validation.modelName
  };
}

module.exports = {
  validateModelAssetDirectory,
  importModelAssets,
  listRelativeFiles,
  buildManifest
};
