const { SkillConfigStore } = require('./skillConfigStore');
const { loadSkills, resolveSkillRoots } = require('./skillLoader');
const { filterEligibleSkills } = require('./skillEligibility');
const { SkillSelector } = require('./skillSelector');
const { clipSkillsForPrompt } = require('./skillPromptBudgeter');
const { getRuntimePaths } = require('./runtimePaths');
const { SkillWatcher } = require('./skillWatcher');
const { SkillSnapshotStore } = require('./skillSnapshotStore');
const { SkillTelemetry } = require('./skillTelemetry');

class SkillRuntimeManager {
  constructor({ workspaceDir, configStore, selector, snapshotStore, telemetry } = {}) {
    this.workspaceDir = workspaceDir || process.cwd();
    this.configStore = configStore || new SkillConfigStore();
    this.selector = selector || new SkillSelector();
    this.snapshotStore = snapshotStore || new SkillSnapshotStore();

    const cfg = this.configStore.load();
    const runtimePaths = getRuntimePaths({
      envKey: cfg.home.envKey,
      defaultPath: cfg.home.defaultPath
    });

    this.telemetry = telemetry || new SkillTelemetry({ logsDir: runtimePaths.logsDir });
    this.watcher = null;

    if (cfg.load.watch) {
      const roots = resolveSkillRoots({ workspaceDir: this.workspaceDir, config: cfg }).map((r) => r.dir);
      this.watcher = new SkillWatcher({
        roots,
        debounceMs: cfg.load.watchDebounceMs,
        onChange: ({ changedPath, reason }) => {
          const bumped = this.snapshotStore.bump(reason);
          this.telemetry.write({ event: 'skills.bump', changedPath, ...bumped });
        }
      });
      this.watcher.start();
    }
  }

  stop() {
    this.watcher?.stop();
  }

  buildTurnContext({ sessionId = 'default', input }) {
    const config = this.configStore.load();
    const cached = this.snapshotStore.get(sessionId);
    if (cached && cached.version === this.snapshotStore.getVersion() && cached.input === input) {
      return cached;
    }

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

    const context = {
      prompt: promptResult.prompt,
      selected: selectedResult.selected.map((s) => s.name),
      dropped: [...dropped, ...selectedResult.dropped],
      clippedBy: promptResult.clippedBy,
      input
    };

    this.snapshotStore.set(sessionId, context);
    this.telemetry.write({
      event: 'skills.turn',
      sessionId,
      selected: context.selected,
      droppedCount: context.dropped.length,
      clippedBy: context.clippedBy
    });

    return context;
  }
}

module.exports = { SkillRuntimeManager };
