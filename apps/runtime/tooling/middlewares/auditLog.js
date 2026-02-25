async function auditLog(ctx, next) {
  const start = Date.now();
  try {
    await next();
    ctx.metrics = { ...(ctx.metrics || {}), latency_ms: Date.now() - start };
  } catch (err) {
    ctx.metrics = { ...(ctx.metrics || {}), latency_ms: Date.now() - start };
    throw err;
  }
}

module.exports = { auditLog };
