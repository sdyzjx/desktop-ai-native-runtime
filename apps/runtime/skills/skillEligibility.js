const fs = require('fs');

function isTruthyConfigPath(config, pathExpr) {
  if (!pathExpr || typeof pathExpr !== 'string') return false;
  const parts = pathExpr.split('.').filter(Boolean);
  let cur = config;
  for (const part of parts) {
    if (!cur || typeof cur !== 'object' || !(part in cur)) return false;
    cur = cur[part];
  }
  return Boolean(cur);
}

function hasBin(binName) {
  const envPath = process.env.PATH || '';
  const paths = envPath.split(':').filter(Boolean);
  for (const p of paths) {
    try {
      const full = `${p}/${binName}`;
      if (fs.existsSync(full)) return true;
    } catch {
      // ignore
    }
  }
  return false;
}

function parseCsvList(v) {
  if (!v || typeof v !== 'string') return [];
  return v
    .split(',')
    .map((x) => x.trim())
    .filter(Boolean);
}

function resolveRequires(frontmatter) {
  // Minimal parser support:
  // requires_bins: git,node
  // requires_any_bins: python3,python
  // requires_env: OPENAI_API_KEY
  // requires_config: browser.enabled,tools.exec.enabled
  const bins = parseCsvList(frontmatter.requires_bins);
  const anyBins = parseCsvList(frontmatter.requires_any_bins);
  const env = parseCsvList(frontmatter.requires_env);
  const config = parseCsvList(frontmatter.requires_config);
  const os = parseCsvList(frontmatter.os);
  return { bins, anyBins, env, config, os };
}

function evaluateSkillEligibility({ skill, config, runtimeOs = process.platform }) {
  const entryCfg = config.entries?.[skill.name] || {};
  if (entryCfg.enabled === false) {
    return { include: false, reason: 'disabled_by_config' };
  }

  const req = resolveRequires(skill.frontmatter || {});

  if (req.os.length > 0 && !req.os.includes(runtimeOs)) {
    return { include: false, reason: 'os_mismatch' };
  }

  for (const bin of req.bins) {
    if (!hasBin(bin)) return { include: false, reason: `missing_bin:${bin}` };
  }

  if (req.anyBins.length > 0) {
    const hit = req.anyBins.some((bin) => hasBin(bin));
    if (!hit) return { include: false, reason: 'missing_any_bin' };
  }

  for (const envName of req.env) {
    const fromEntry = entryCfg.env?.[envName];
    if (!process.env[envName] && !fromEntry) {
      return { include: false, reason: `missing_env:${envName}` };
    }
  }

  for (const cfgPath of req.config) {
    if (!isTruthyConfigPath(config, cfgPath)) {
      return { include: false, reason: `missing_config:${cfgPath}` };
    }
  }

  return { include: true, reason: 'ok' };
}

function filterEligibleSkills({ skills, config, runtimeOs }) {
  const accepted = [];
  const dropped = [];

  for (const skill of skills || []) {
    const result = evaluateSkillEligibility({ skill, config, runtimeOs });
    if (result.include) accepted.push(skill);
    else dropped.push({ name: skill.name, reason: result.reason });
  }

  return { accepted, dropped };
}

module.exports = {
  isTruthyConfigPath,
  evaluateSkillEligibility,
  filterEligibleSkills
};
