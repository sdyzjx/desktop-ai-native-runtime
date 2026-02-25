class ToolCallDispatcher {
  constructor({ bus, executor }) {
    this.bus = bus;
    this.executor = executor;
    this.unsubscribe = null;
  }

  start() {
    if (this.unsubscribe) return;
    this.unsubscribe = this.bus.subscribe('tool.call.requested', async (payload) => {
      const { trace_id: traceId, session_id: sessionId, step_index: stepIndex, call_id: callId, tool } = payload;

      const base = {
        trace_id: traceId,
        session_id: sessionId,
        step_index: stepIndex,
        call_id: callId,
        name: tool.name
      };

      this.bus.publish('tool.call.dispatched', { ...base, args: tool.args });

      const result = await this.executor.execute(tool);
      if (!result.ok) {
        this.bus.publish('tool.call.result', { ...base, ok: false, error: result.error });
        return;
      }

      this.bus.publish('tool.call.result', { ...base, ok: true, result: result.result });
    });
  }

  stop() {
    this.unsubscribe?.();
    this.unsubscribe = null;
  }
}

module.exports = { ToolCallDispatcher };
