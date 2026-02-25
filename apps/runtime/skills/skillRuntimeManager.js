const { SkillConfigStore } = require('./skillConfigStore');
const { loadSkills } = require('./skillLoader');
const { filterEligibleSkills } = require('./skillEligibility');
const { SkillSelector } = require('./skillSelector');
const { clipSkillsForPrompt } = require('./skillPromptBudgeter');

class SkillRuntimeManager {
  constructor({ workspaceDir, configStore, selector } = {}) {
    this.workspaceDir = workspaceDir || process.cwd();
    this.configStore = configStore || new SkillConfigStore();
    this.selector = selector || new SkillSelector();
  }

  buildTurnContext({ input }) {
    const config = this.configStore.load();
    const loaded = loadSkills({ workspaceDir: this.workspaceDir, config });
    const { accepted, dropped } = filterEligibleSkills({ skills: loaded, config });
    const selectedResult = this.selector.select({
      skills: accepted,
      input,
      triggerConfig: {
        ...config.trigger,
        entries: config.entries,
        rules: config.trigger?.rules || {},
        explicitSkills: []
      }
    });

    const promptResult = clipSkillsForPrompt(selectedResult.selected, config.limits || {});

    return {
      prompt: promptResult.prompt,
      selected: selectedResult.selected.map((s) => s.name),
      dropped: [...dropped, ...selectedResult.dropped],
      clippedBy: promptResult.clippedBy
    };
  }
}

module.exports = { SkillRuntimeManager };
