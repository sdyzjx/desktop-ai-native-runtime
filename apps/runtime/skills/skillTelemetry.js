const fs = require('fs');
const path = require('path');

class SkillTelemetry {
  constructor({ logsDir }) {
    this.logsDir = logsDir;
    fs.mkdirSync(this.logsDir, { recursive: true });
    this.logPath = path.join(this.logsDir, 'skills-telemetry.jsonl');
  }

  write(event) {
    const row = {
      ts: new Date().toISOString(),
      ...event
    };
    fs.appendFileSync(this.logPath, `${JSON.stringify(row)}\n`, 'utf8');
  }
}

module.exports = { SkillTelemetry };
