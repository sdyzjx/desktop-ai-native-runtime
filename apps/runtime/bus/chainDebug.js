function isDebugEnabled(bus) {
  if (!bus || typeof bus.publish !== 'function') return false;
  if (typeof bus.isDebugMode === 'function') {
    return Boolean(bus.isDebugMode());
  }
  return true;
}

function publishChainEvent(bus, step, payload = {}) {
  if (!isDebugEnabled(bus)) return;
  const topic = String(step || '').startsWith('chain.') ? String(step) : `chain.${step}`;
  bus.publish(topic, {
    ts: Date.now(),
    step: topic,
    ...(payload && typeof payload === 'object' ? payload : { payload })
  });
}

module.exports = {
  isDebugEnabled,
  publishChainEvent
};
