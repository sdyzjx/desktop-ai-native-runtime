class ToolExecutor {
  constructor(registry) {
    this.registry = registry;
  }

  async execute(toolCall) {
    const tool = this.registry[toolCall.name];
    if (!tool) {
      return { ok: false, error: `tool not found: ${toolCall.name}` };
    }

    try {
      // P0: only local tools implemented
      const result = await tool.run(toolCall.args || {});
      return { ok: true, result: String(result) };
    } catch (e) {
      return { ok: false, error: e.message || String(e) };
    }
  }
}

module.exports = { ToolExecutor };
