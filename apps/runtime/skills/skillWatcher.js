const fs = require('fs');
const path = require('path');

class SkillWatcher {
  constructor({ roots, debounceMs = 250, onChange }) {
    this.roots = roots || [];
    this.debounceMs = debounceMs;
    this.onChange = onChange;
    this.watchers = [];
    this.timer = null;
    this.pendingPath = null;
  }

  start() {
    this.stop();

    for (const root of this.roots) {
      if (!root || !fs.existsSync(root)) continue;
      try {
        const watcher = fs.watch(root, { recursive: true }, (_, filename) => {
          const changed = filename ? path.join(root, filename.toString()) : root;
          if (!changed.endsWith('SKILL.md')) return;
          this.schedule(changed);
        });
        this.watchers.push(watcher);
      } catch {
        // ignore unsupported watcher paths
      }
    }
  }

  schedule(changedPath) {
    this.pendingPath = changedPath;
    if (this.timer) clearTimeout(this.timer);
    this.timer = setTimeout(() => {
      const p = this.pendingPath;
      this.pendingPath = null;
      this.timer = null;
      this.onChange?.({ changedPath: p, reason: 'watch' });
    }, this.debounceMs);
  }

  stop() {
    for (const w of this.watchers) {
      try { w.close(); } catch {}
    }
    this.watchers = [];
    if (this.timer) {
      clearTimeout(this.timer);
      this.timer = null;
    }
  }
}

module.exports = { SkillWatcher };
