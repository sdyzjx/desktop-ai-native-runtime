const { v4: uuidv4 } = require('uuid');
const { RuntimeState, RuntimeStateMachine } = require('./stateMachine');

function formatDecisionEvent(decision) {
  if (decision.type === 'final') {
    return { type: 'final', preview: String(decision.output || '').slice(0, 160) };
  }

  return {
    type: 'tool',
    tool: {
      name: decision.tool?.name,
      args: decision.tool?.args || {}
    }
  };
}

class ToolLoopRunner {
  constructor({ bus, getReasoner, listTools, maxStep = 8, toolResultTimeoutMs = 10000 }) {
    this.bus = bus;
    this.getReasoner = getReasoner;
    this.listTools = listTools;
    this.maxStep = maxStep;
    this.toolResultTimeoutMs = toolResultTimeoutMs;
  }

  async run({ sessionId, input, onEvent }) {
    const sm = new RuntimeStateMachine();
    const traceId = uuidv4();

    const ctx = {
      sessionId,
      traceId,
      stepIndex: 0,
      input,
      observations: [],
      messages: [
        {
          role: 'system',
          content: [
            'You are a runtime planner that can either return a final answer or call exactly one tool.',
            'If a tool is needed, emit one tool call and wait for its result in the next turn.',
            'Keep answers concise.'
          ].join(' ')
        },
        { role: 'user', content: input }
      ]
    };

    const emit = (event, payload = {}) => {
      const envelope = {
        trace_id: traceId,
        session_id: sessionId,
        task_id: null,
        step_index: ctx.stepIndex,
        event,
        source: 'runtime',
        latency_budget_ms: 1200,
        payload
      };
      this.bus.publish('runtime.event', envelope);
      onEvent?.(envelope);
    };

    sm.transition(RuntimeState.RUNNING);
    emit('plan', { input, max_step: this.maxStep });

    try {
      const reasoner = this.getReasoner();

      while (ctx.stepIndex < this.maxStep) {
        ctx.stepIndex += 1;

        const decision = await reasoner.decide({
          messages: ctx.messages,
          tools: this.listTools()
        });

        emit('llm.final', { decision: formatDecisionEvent(decision) });

        if (decision.type === 'final') {
          if (decision.assistantMessage) {
            ctx.messages.push(decision.assistantMessage);
          }

          sm.transition(RuntimeState.DONE);
          emit('done', { output: decision.output, state: sm.state });
          return { output: decision.output, traceId, state: sm.state };
        }

        const callId = decision.tool.call_id || uuidv4();
        const toolCallPayload = {
          trace_id: traceId,
          session_id: sessionId,
          step_index: ctx.stepIndex,
          call_id: callId,
          tool: {
            name: decision.tool.name,
            args: decision.tool.args || {}
          }
        };

        const assistantMessage = decision.assistantMessage || {
          role: 'assistant',
          content: null,
          tool_calls: [
            {
              id: callId,
              type: 'function',
              function: {
                name: decision.tool.name,
                arguments: JSON.stringify(decision.tool.args || {})
              }
            }
          ]
        };

        emit('tool.call', {
          call_id: callId,
          name: decision.tool.name,
          args: decision.tool.args || {}
        });

        this.bus.publish('tool.call.requested', toolCallPayload);

        const toolResult = await this.bus.waitFor(
          'tool.call.result',
          (payload) => payload.trace_id === traceId && payload.call_id === callId,
          this.toolResultTimeoutMs
        );

        if (!toolResult.ok) {
          sm.transition(RuntimeState.ERROR);
          emit('tool.error', { call_id: callId, error: toolResult.error, name: decision.tool.name });
          return { output: `工具执行失败：${toolResult.error}`, traceId, state: sm.state };
        }

        ctx.messages.push(assistantMessage);
        ctx.messages.push({
          role: 'tool',
          tool_call_id: callId,
          name: decision.tool.name,
          content: String(toolResult.result)
        });

        ctx.observations.push({
          call_id: callId,
          name: decision.tool.name,
          result: toolResult.result
        });

        emit('tool.result', {
          call_id: callId,
          name: decision.tool.name,
          result: toolResult.result
        });
      }

      sm.transition(RuntimeState.DONE);
      const fallback = '达到 max_step，已停止工具调用并收束。';
      emit('done', { output: fallback, state: sm.state });
      return { output: fallback, traceId, state: sm.state };
    } catch (err) {
      sm.transition(RuntimeState.ERROR);
      emit('tool.error', { error: err.message || String(err) });
      return { output: `运行错误：${err.message || String(err)}`, traceId, state: sm.state };
    }
  }
}

module.exports = { ToolLoopRunner };
