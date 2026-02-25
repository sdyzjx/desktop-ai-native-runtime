const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const { loadSkills } = require('../../../apps/runtime/skills/skillLoader');

function writeSkill(root, name, desc) {
  const dir = path.join(root, name);
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(
    path.join(dir, 'SKILL.md'),
    `---\nname: ${name}\ndescription: ${desc}\n---\n\n# ${name}\n`,
    'utf8'
  );
}

test('loadSkills loads from workspace and yachiyo roots', () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'skills-loader-'));
  const workspace = path.join(tmp, 'workspace');
  const yhome = path.join(tmp, 'yachiyo');
  const yskills = path.join(yhome, 'skills');

  fs.mkdirSync(path.join(workspace, 'skills'), { recursive: true });
  fs.mkdirSync(yskills, { recursive: true });

  writeSkill(yskills, 'global_skill', 'global one');
  writeSkill(path.join(workspace, 'skills'), 'workspace_skill', 'workspace one');

  const old = process.env.YACHIYO_HOME;
  process.env.YACHIYO_HOME = yhome;
  try {
    const config = {
      home: { envKey: 'YACHIYO_HOME', defaultPath: '~/yachiyo' },
      load: { workspace: true, global: true, extraDirs: [] }
    };
    const skills = loadSkills({ workspaceDir: workspace, config });
    const names = skills.map((s) => s.name);
    assert.ok(names.includes('global_skill'));
    assert.ok(names.includes('workspace_skill'));
  } finally {
    if (old === undefined) delete process.env.YACHIYO_HOME;
    else process.env.YACHIYO_HOME = old;
  }
});

test('loadSkills precedence is workspace > yachiyo-global > extra', () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'skills-loader-'));
  const workspace = path.join(tmp, 'workspace');
  const yhome = path.join(tmp, 'yachiyo');
  const yskills = path.join(yhome, 'skills');
  const extra = path.join(tmp, 'extra-skills');

  fs.mkdirSync(path.join(workspace, 'skills'), { recursive: true });
  fs.mkdirSync(yskills, { recursive: true });
  fs.mkdirSync(extra, { recursive: true });

  writeSkill(extra, 'dup_skill', 'from extra');
  writeSkill(yskills, 'dup_skill', 'from yachiyo');
  writeSkill(path.join(workspace, 'skills'), 'dup_skill', 'from workspace');

  const old = process.env.YACHIYO_HOME;
  process.env.YACHIYO_HOME = yhome;

  try {
    const config = {
      home: { envKey: 'YACHIYO_HOME', defaultPath: '~/yachiyo' },
      load: { workspace: true, global: true, extraDirs: [extra] }
    };

    const skills = loadSkills({ workspaceDir: workspace, config });
    const dup = skills.find((s) => s.name === 'dup_skill');
    assert.ok(dup);
    assert.equal(dup.source, 'workspace');
    assert.match(dup.description, /from workspace/);
  } finally {
    if (old === undefined) delete process.env.YACHIYO_HOME;
    else process.env.YACHIYO_HOME = old;
  }
});
