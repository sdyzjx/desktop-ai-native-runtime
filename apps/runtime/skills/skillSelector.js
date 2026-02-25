class SkillSelector {
  constructor({ now = () => Date.now() } = {}) {
    this.now = now;
    this.lastSelectedAt = new Map();
  }

  scoreSkill({ skill, input, trigger }) {
    let score = 0;
    const text = String(input || '').toLowerCase();
    const name = String(skill.name || '').toLowerCase();
    const desc = String(skill.description || '').toLowerCase();

    if (trigger?.explicitSkills?.includes(skill.name)) score += 100;
    if (text.includes(name)) score += 60;

    const keywords = trigger?.rules?.[skill.name]?.keywords || [];
    for (const kw of keywords) {
      if (text.includes(String(kw).toLowerCase())) score += 20;
    }

    if (desc && text && desc.split(/\s+/).some((w) => w && text.includes(w))) score += 5;

    const risk = trigger?.entries?.[skill.name]?.risk || 'safe';
    if (risk === 'danger') score -= 50;
    if (risk === 'review') score -= 10;

    return score;
  }

  select({ skills, input, triggerConfig }) {
    const cfg = triggerConfig || {};
    const threshold = Number(cfg.scoreThreshold ?? 45);
    const maxSelected = Number(cfg.maxSelectedPerTurn ?? 2);
    const cooldownMs = Number(cfg.cooldownMs ?? 15000);

    const scored = [];
    const dropped = [];
    const nowTs = this.now();

    for (const skill of skills || []) {
      const last = this.lastSelectedAt.get(skill.name);
      if (typeof last === 'number' && nowTs - last < cooldownMs) {
        dropped.push({ name: skill.name, reason: 'cooldown' });
        continue;
      }

      const score = this.scoreSkill({ skill, input, trigger: cfg });
      if (score < threshold) {
        dropped.push({ name: skill.name, reason: `below_threshold:${score}` });
        continue;
      }

      const risk = cfg.entries?.[skill.name]?.risk || 'safe';
      if (risk === 'danger') {
        dropped.push({ name: skill.name, reason: 'risk_blocked' });
        continue;
      }

      scored.push({ skill, score });
    }

    scored.sort((a, b) => b.score - a.score || a.skill.name.localeCompare(b.skill.name));
    const selected = scored.slice(0, Math.max(1, maxSelected)).map((v) => v.skill);

    for (const skill of selected) {
      this.lastSelectedAt.set(skill.name, nowTs);
    }

    return {
      selected,
      dropped,
      scored: scored.map((v) => ({ name: v.skill.name, score: v.score }))
    };
  }
}

module.exports = { SkillSelector };
