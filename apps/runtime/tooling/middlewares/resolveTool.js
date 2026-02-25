const { ToolingError, ErrorCode } = require('../errors');

async function resolveTool(ctx, next) {
  const tool = ctx.registry.get(ctx.request.name);
  if (!tool) {
    throw new ToolingError(ErrorCode.TOOL_NOT_FOUND, `tool not found: ${ctx.request.name}`);
  }
  ctx.tool = tool;
  await next();
}

module.exports = { resolveTool };
