const { v4: uuidv4 } = require('uuid');
const { RuntimeState, RuntimeStateMachine } = require('./stateMachine');

class ToolLoopRunner {
  constructor({ executor, maxStep = 6 }) {
    this.executor = executor;
    this.maxStep = maxStep;
    this.sm = new RuntimeStateMachine();
  }

  async run({ sessionId, input, onEvent }) {
    const traceId = uuidv4();
    const ctx = { sessionId, traceId, stepIndex: 0, input, observations: [] };

    const emit = (event, payload = {}) => {
      onEvent?.({
        trace_id: traceId,
        session_id: sessionId,
        task_id: null,
        step_index: ctx.stepIndex,
        event,
        source: 'runtime',
        latency_budget_ms: 1200,
        payload
      });
    };

    this.sm.transition(RuntimeState.RUNNING);
    emit('plan', { input });

    try {
      while (ctx.stepIndex < this.maxStep) {
        ctx.stepIndex += 1;
        const decision = this.reasonActObserveDecision(ctx);

        emit('llm.final', { decision });

        if (decision.type === 'final') {
          this.sm.transition(RuntimeState.DONE);
          emit('done', { output: decision.output, state: this.sm.state });
          return { output: decision.output, traceId };
        }

        emit('tool.call', {
          name: decision.tool.name,
          args: decision.tool.args
        });

        const toolResult = await this.executor.execute(decision.tool);
        if (!toolResult.ok) {
          emit('tool.error', { error: toolResult.error, name: decision.tool.name });
          this.sm.transition(RuntimeState.ERROR);
          return { output: `工具执行失败：${toolResult.error}`, traceId };
        }

        ctx.observations.push({ name: decision.tool.name, result: toolResult.result });
        emit('tool.result', {
          name: decision.tool.name,
          result: toolResult.result
        });
      }

      this.sm.transition(RuntimeState.DONE);
      const fallback = '达到 max_step，已停止工具调用并收束。';
      emit('done', { output: fallback, state: this.sm.state });
      return { output: fallback, traceId };
    } catch (err) {
      this.sm.transition(RuntimeState.ERROR);
      emit('tool.error', { error: err.message || String(err) });
      return { output: `运行错误：${err.message || String(err)}`, traceId };
    }
  }

  // P0 mock reasoner to demonstrate ReAct loop without external LLM provider
  reasonActObserveDecision(ctx) {
    const text = (ctx.input || '').trim();

    // If have observation, finalize using latest observation
    if (ctx.observations.length > 0) {
      const last = ctx.observations[ctx.observations.length - 1];
      return {
        type: 'final',
        output: `我已调用工具 ${last.name}，结果是：${last.result}`
      };
    }

    if (/几点|时间|time/i.test(text)) {
      return { type: 'tool', tool: { name: 'get_time', args: {} } };
    }

    const addMatch = text.match(/(\d+(?:\.\d+)?)\s*[+＋]\s*(\d+(?:\.\d+)?)/);
    if (addMatch) {
      return {
        type: 'tool',
        tool: { name: 'add', args: { a: Number(addMatch[1]), b: Number(addMatch[2]) } }
      };
    }

    return {
      type: 'tool',
      tool: { name: 'echo', args: { text } }
    };
  }
}

module.exports = { ToolLoopRunner };
