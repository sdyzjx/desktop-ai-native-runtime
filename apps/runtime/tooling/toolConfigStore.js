const fs = require('fs');
const path = require('path');
const YAML = require('yaml');
const { ToolingError, ErrorCode } = require('./errors');

const REPO_CONFIG_PATH = path.resolve(__dirname, '..', '..', '..', 'config', 'tools.yaml');

function isObject(v) {
  return v && typeof v === 'object' && !Array.isArray(v);
}

function validateToolsConfig(cfg) {
  if (!isObject(cfg)) throw new ToolingError(ErrorCode.CONFIG_ERROR, 'tools.yaml root must be object');
  if (!Array.isArray(cfg.tools) || cfg.tools.length === 0) {
    throw new ToolingError(ErrorCode.CONFIG_ERROR, 'tools must be a non-empty array');
  }

  const names = new Set();
  for (const tool of cfg.tools) {
    if (!isObject(tool)) throw new ToolingError(ErrorCode.CONFIG_ERROR, 'tool entry must be object');
    if (!tool.name || typeof tool.name !== 'string') throw new ToolingError(ErrorCode.CONFIG_ERROR, 'tool.name required');
    if (names.has(tool.name)) throw new ToolingError(ErrorCode.CONFIG_ERROR, `duplicate tool name: ${tool.name}`);
    names.add(tool.name);
    if (!tool.adapter || typeof tool.adapter !== 'string') throw new ToolingError(ErrorCode.CONFIG_ERROR, `tool.adapter required for ${tool.name}`);
    if (!isObject(tool.input_schema)) throw new ToolingError(ErrorCode.CONFIG_ERROR, `tool.input_schema required for ${tool.name}`);
  }

  const policy = cfg.policy || {};
  if (policy.allow && !Array.isArray(policy.allow)) throw new ToolingError(ErrorCode.CONFIG_ERROR, 'policy.allow must be array');
  if (policy.deny && !Array.isArray(policy.deny)) throw new ToolingError(ErrorCode.CONFIG_ERROR, 'policy.deny must be array');
  if (policy.byProvider && !isObject(policy.byProvider)) throw new ToolingError(ErrorCode.CONFIG_ERROR, 'policy.byProvider must be object');

  return cfg;
}

class ToolConfigStore {
  constructor({ configPath } = {}) {
    // Tools are sourced from repository config by default to avoid
    // accidental drift from external runtime directories.
    this.configPath = configPath || REPO_CONFIG_PATH;
    this.ensureExists();
  }

  ensureExists() {
    if (fs.existsSync(this.configPath)) return;

    fs.mkdirSync(path.dirname(this.configPath), { recursive: true });

    if (fs.existsSync(REPO_CONFIG_PATH)) {
      fs.copyFileSync(REPO_CONFIG_PATH, this.configPath);
      return;
    }

    throw new ToolingError(
      ErrorCode.CONFIG_ERROR,
      `tools config template not found: ${REPO_CONFIG_PATH}`
    );
  }

  loadRawYaml() {
    this.ensureExists();
    return fs.readFileSync(this.configPath, 'utf8');
  }

  load() {
    const parsed = YAML.parse(this.loadRawYaml());
    return validateToolsConfig(parsed);
  }
}

module.exports = { ToolConfigStore, validateToolsConfig };
