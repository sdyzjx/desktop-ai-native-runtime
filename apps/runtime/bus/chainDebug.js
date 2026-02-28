const path = require('node:path');

function isDebugEnabled(bus) {
  if (!bus || typeof bus.publish !== 'function') return false;
  if (typeof bus.isDebugMode === 'function') {
    return Boolean(bus.isDebugMode());
  }
  return true;
}

function toPortablePath(filePath) {
  return String(filePath || '').split(path.sep).join('/');
}

function normalizeSourcePath(filePath) {
  const abs = String(filePath || '').trim();
  if (!abs) return null;
  const rel = path.relative(process.cwd(), abs);
  if (!rel || rel.startsWith('..')) {
    return toPortablePath(abs);
  }
  return toPortablePath(rel);
}

function resolveCallerLocation() {
  const holder = {};
  Error.captureStackTrace(holder, resolveCallerLocation);
  const lines = String(holder.stack || '').split('\n').slice(1);
  for (const line of lines) {
    const trimmed = String(line || '').trim();
    const matched = trimmed.match(/^at\s+(?:.+\s+\()?(.+):(\d+):(\d+)\)?$/);
    if (!matched) continue;
    const filePath = matched[1];
    if (!filePath || filePath.startsWith('node:') || filePath.startsWith('internal/')) continue;
    if (filePath.endsWith('/apps/runtime/bus/chainDebug.js')) continue;
    return {
      source_file: normalizeSourcePath(filePath),
      source_line: Number(matched[2]) || null,
      source_col: Number(matched[3]) || null
    };
  }
  return {
    source_file: null,
    source_line: null,
    source_col: null
  };
}

function publishChainEvent(bus, step, payload = {}) {
  if (!isDebugEnabled(bus)) return;
  const topic = String(step || '').startsWith('chain.') ? String(step) : `chain.${step}`;
  const caller = resolveCallerLocation();
  bus.publish(topic, {
    ts: Date.now(),
    step: topic,
    ...caller,
    ...(payload && typeof payload === 'object' ? payload : { payload })
  });
}

module.exports = {
  isDebugEnabled,
  publishChainEvent
};
