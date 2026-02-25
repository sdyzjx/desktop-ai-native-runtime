const fs = require('fs');
const path = require('path');
const { getRuntimePaths } = require('./runtimePaths');
const { parseFrontmatter } = require('./frontmatter');

function listSkillDirs(rootDir) {
  if (!rootDir || !fs.existsSync(rootDir)) return [];
  const entries = fs.readdirSync(rootDir, { withFileTypes: true });
  return entries
    .filter((e) => e.isDirectory() && !e.name.startsWith('.'))
    .map((e) => path.join(rootDir, e.name));
}

function readSkillFromDir(dirPath, source) {
  const skillPath = path.join(dirPath, 'SKILL.md');
  if (!fs.existsSync(skillPath)) return null;

  const raw = fs.readFileSync(skillPath, 'utf8');
  const fm = parseFrontmatter(raw);
  const name = String(fm.name || path.basename(dirPath)).trim();
  const description = String(fm.description || '').trim();

  return {
    name,
    description,
    source,
    filePath: skillPath,
    baseDir: dirPath,
    frontmatter: fm
  };
}

function resolveSkillRoots({ workspaceDir, config }) {
  const roots = [];
  const runtimePaths = getRuntimePaths({
    envKey: config.home.envKey,
    defaultPath: config.home.defaultPath
  });

  for (const extra of config.load.extraDirs || []) {
    roots.push({ dir: path.resolve(extra), source: 'extra' });
  }

  if (config.load.global) {
    roots.push({ dir: runtimePaths.skillsDir, source: 'yachiyo-global' });
  }

  if (config.load.workspace !== false && workspaceDir) {
    roots.push({ dir: path.resolve(workspaceDir, 'skills'), source: 'workspace' });
  }

  return roots;
}

function loadSkills({ workspaceDir, config }) {
  const roots = resolveSkillRoots({ workspaceDir, config });

  const merged = new Map();
  for (const root of roots) {
    const dirs = listSkillDirs(root.dir);
    for (const dirPath of dirs) {
      try {
        const skill = readSkillFromDir(dirPath, root.source);
        if (!skill) continue;
        merged.set(skill.name, skill);
      } catch {
        // skip malformed skills
      }
    }
  }

  return Array.from(merged.values()).sort((a, b) => a.name.localeCompare(b.name));
}

module.exports = {
  parseFrontmatter,
  listSkillDirs,
  readSkillFromDir,
  resolveSkillRoots,
  loadSkills
};
