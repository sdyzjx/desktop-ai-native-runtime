const Ajv = require('ajv');
const { ToolingError, ErrorCode } = require('../errors');

const ajv = new Ajv({ allErrors: true, strict: false });
const cache = new Map();

function compile(tool) {
  if (cache.has(tool.name)) return cache.get(tool.name);
  const validate = ajv.compile(tool.input_schema || { type: 'object', properties: {}, additionalProperties: true });
  cache.set(tool.name, validate);
  return validate;
}

async function validateSchema(ctx, next) {
  const validate = compile(ctx.tool);
  const ok = validate(ctx.request.args || {});
  if (!ok) {
    throw new ToolingError(ErrorCode.VALIDATION_ERROR, 'invalid tool args', validate.errors || []);
  }
  await next();
}

module.exports = { validateSchema };
