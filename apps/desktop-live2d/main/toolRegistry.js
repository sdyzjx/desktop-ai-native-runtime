const { buildRpcError } = require('./rpcValidator');

const DESKTOP_TOOL_DEFINITIONS = Object.freeze([
  {
    name: 'desktop_chat_show',
    method: 'chat.bubble.show',
    description: 'Show transient bubble text above the desktop model.',
    input_schema: {
      type: 'object',
      required: ['text'],
      properties: {
        text: { type: 'string' },
        durationMs: { type: 'integer' },
        mood: { type: 'string' }
      }
    }
  },
  {
    name: 'desktop_chat_panel_append',
    method: 'chat.panel.append',
    description: 'Append one message item into desktop chat panel history.',
    input_schema: {
      type: 'object',
      required: ['text'],
      properties: {
        role: { type: 'string' },
        text: { type: 'string' },
        timestamp: { type: 'integer' },
        requestId: { type: 'string' }
      }
    }
  },
  {
    name: 'desktop_model_set_param',
    method: 'model.param.set',
    description: 'Set one Live2D parameter value.',
    input_schema: {
      type: 'object',
      required: ['name', 'value'],
      properties: {
        name: { type: 'string' },
        value: { type: 'number' }
      }
    }
  },
  {
    name: 'desktop_model_batch_set',
    method: 'model.param.batchSet',
    description: 'Set multiple Live2D parameter values in one call.',
    input_schema: {
      type: 'object',
      required: ['updates'],
      properties: {
        updates: {
          type: 'array',
          items: {
            type: 'object',
            required: ['name', 'value'],
            properties: {
              name: { type: 'string' },
              value: { type: 'number' }
            }
          }
        }
      }
    }
  },
  {
    name: 'desktop_model_play_motion',
    method: 'model.motion.play',
    description: 'Play one Live2D motion group/index.',
    input_schema: {
      type: 'object',
      required: ['group'],
      properties: {
        group: { type: 'string' },
        index: { type: 'integer' }
      }
    }
  },
  {
    name: 'desktop_model_set_expression',
    method: 'model.expression.set',
    description: 'Set one Live2D expression by name.',
    input_schema: {
      type: 'object',
      required: ['name'],
      properties: {
        name: { type: 'string' }
      }
    }
  }
]);

const TOOL_NAME_TO_METHOD = new Map(DESKTOP_TOOL_DEFINITIONS.map((item) => [item.name, item.method]));

function listDesktopTools() {
  return DESKTOP_TOOL_DEFINITIONS.map((item) => ({ ...item }));
}

function resolveToolInvoke({ name, args } = {}) {
  const normalizedName = String(name || '').trim();
  if (!normalizedName) {
    throw buildRpcError(-32602, 'tool.invoke requires non-empty name');
  }

  const method = TOOL_NAME_TO_METHOD.get(normalizedName);
  if (!method) {
    throw buildRpcError(-32006, `tool is not allowed: ${normalizedName}`);
  }

  const params = args && typeof args === 'object' && !Array.isArray(args) ? args : {};
  return {
    toolName: normalizedName,
    method,
    params
  };
}

module.exports = {
  DESKTOP_TOOL_DEFINITIONS,
  listDesktopTools,
  resolveToolInvoke
};
