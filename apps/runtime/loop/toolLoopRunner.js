const { v4: uuidv4 } = require('uuid');
const { RuntimeState, RuntimeStateMachine } = require('./stateMachine');

function formatDecisionEvent(decision) {
  if (decision.type === 'final') {
    return { type: 'final', preview: String(decision.output || '').slice(0, 160) };
  }

  const tools = Array.isArray(decision.tools) && decision.tools.length > 0
    ? decision.tools
    : (decision.tool ? [decision.tool] : []);

  return {
    type: 'tool',
    tools: tools.map((t) => ({ name: t?.name, args: t?.args || {} }))
  };
}

function normalizeToolCalls(decision) {
  const calls = Array.isArray(decision.tools) && decision.tools.length > 0
    ? decision.tools
    : (decision.tool ? [decision.tool] : []);

  return calls.map((call) => ({
    call_id: call.call_id || uuidv4(),
    name: call.name,
    args: call.args || {}
  }));
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
            'You are a runtime planner that can either return a final answer or call tools.',
            'If tools are needed, you may emit one or more tool calls and wait for results in the next turn.',
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

        const toolCalls = normalizeToolCalls(decision);
        if (toolCalls.length === 0) {
          sm.transition(RuntimeState.ERROR);
          emit('tool.error', { error: '模型返回了 tool 类型但没有可执行的工具调用。' });
          return { output: '运行错误：模型未返回可执行的工具调用。', traceId, state: sm.state };
        }

        const assistantMessage = decision.assistantMessage || {
          role: 'assistant',
          content: null,
          tool_calls: toolCalls.map((call) => ({
            id: call.call_id,
            type: 'function',
            function: {
              name: call.name,
              arguments: JSON.stringify(call.args || {})
            }
          }))
        };

        if (!decision.assistantMessage) {
          ctx.messages.push(assistantMessage);
        } else {
          // keep model's original message for traceability
          ctx.messages.push(decision.assistantMessage);
        }

        for (const call of toolCalls) {
          const toolCallPayload = {
            trace_id: traceId,
            session_id: sessionId,
            step_index: ctx.stepIndex,
            call_id: call.call_id,
            tool: {
              name: call.name,
              args: call.args || {}
            }
          };

          emit('tool.call', {
            call_id: call.call_id,
            name: call.name,
            args: call.args || {}
          });

          this.bus.publish('tool.call.requested', toolCallPayload);

          const toolResult = await this.bus.waitFor(
            'tool.call.result',
            (payload) => payload.trace_id === traceId && payload.call_id === call.call_id,
            this.toolResultTimeoutMs
          );

          if (!toolResult.ok) {
            sm.transition(RuntimeState.ERROR);
            emit('tool.error', { call_id: call.call_id, error: toolResult.error, name: call.name, code: toolResult.code });
            return { output: `工具执行失败：${toolResult.error}`, traceId, state: sm.state };
          }

          ctx.messages.push({
            role: 'tool',
            tool_call_id: call.call_id,
            name: call.name,
            content: String(toolResult.result)
          });

          ctx.observations.push({
            call_id: call.call_id,
            name: call.name,
            result: toolResult.result
          });

          emit('tool.result', {
            call_id: call.call_id,
            name: call.name,
            result: toolResult.result
          });
        }
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
