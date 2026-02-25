const { ToolingError, ErrorCode } = require('../errors');

function toSet(values) {
  return new Set(Array.isArray(values) ? values : []);
}

function mergePolicy(basePolicy, provider) {
  if (!provider) return basePolicy;
  const byProvider = basePolicy.byProvider || {};
  const override = byProvider[provider] || byProvider[`${provider.split('/')[0]}/*`];
  if (!override) return basePolicy;

  return {
    ...basePolicy,
    allow: [...(basePolicy.allow || []), ...(override.allow || [])],
    deny: [...(basePolicy.deny || []), ...(override.deny || [])]
  };
}

async function enforcePolicy(ctx, next) {
  const effective = mergePolicy(ctx.policy, ctx.meta?.provider);
  const allow = toSet(effective.allow);
  const deny = toSet(effective.deny);

  if (deny.has(ctx.tool.name)) {
    throw new ToolingError(ErrorCode.PERMISSION_DENIED, `tool denied: ${ctx.tool.name}`);
  }

  if (allow.size > 0 && !allow.has(ctx.tool.name)) {
    throw new ToolingError(ErrorCode.PERMISSION_DENIED, `tool not allowed: ${ctx.tool.name}`);
  }

  await next();
}

module.exports = { enforcePolicy };
