const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const { SkillTelemetry } = require('../../../apps/runtime/skills/skillTelemetry');

test('SkillTelemetry appends jsonl logs', () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'skills-telemetry-'));
  const telemetry = new SkillTelemetry({ logsDir: tmp });
  telemetry.write({ event: 'skills.turn', selected: ['a'] });

  const logPath = path.join(tmp, 'skills-telemetry.jsonl');
  const text = fs.readFileSync(logPath, 'utf8').trim();
  assert.ok(text.length > 0);
  const row = JSON.parse(text);
  assert.equal(row.event, 'skills.turn');
});
