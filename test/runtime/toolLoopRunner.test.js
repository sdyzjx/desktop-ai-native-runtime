const test = require('node:test');
const assert = require('node:assert/strict');

const { RuntimeEventBus } = require('../../apps/runtime/bus/eventBus');
const { ToolExecutor } = require('../../apps/runtime/executor/toolExecutor');
const localTools = require('../../apps/runtime/executor/localTools');
const { ToolCallDispatcher } = require('../../apps/runtime/orchestrator/toolCallDispatcher');
const { ToolLoopRunner } = require('../../apps/runtime/loop/toolLoopRunner');

test('ToolLoopRunner performs tool call through event bus and completes', async () => {
  const bus = new RuntimeEventBus();
  const executor = new ToolExecutor(localTools);
  const dispatcher = new ToolCallDispatcher({ bus, executor });
  dispatcher.start();

  let decideCount = 0;
  const reasoner = {
    async decide() {
      decideCount += 1;
      if (decideCount === 1) {
        return {
          type: 'tool',
          tool: { call_id: 'call-1', name: 'add', args: { a: 20, b: 22 } }
        };
      }

      return {
        type: 'final',
        output: 'done from test reasoner'
      };
    }
  };

  const runner = new ToolLoopRunner({
    bus,
    getReasoner: () => reasoner,
    listTools: () => executor.listTools(),
    maxStep: 4,
    toolResultTimeoutMs: 2000
  });

  const events = [];
  const result = await runner.run({
    sessionId: 's1',
    input: 'add numbers',
    onEvent: (event) => events.push(event.event)
  });

  assert.equal(result.state, 'DONE');
  assert.equal(result.output, 'done from test reasoner');
  assert.ok(events.includes('tool.call'));
  assert.ok(events.includes('tool.result'));
  assert.ok(events.includes('done'));

  dispatcher.stop();
});



test('ToolLoopRunner executes multiple tool calls in one step serially', async () => {
  const bus = new RuntimeEventBus();
  const executor = new ToolExecutor(localTools);
  const dispatcher = new ToolCallDispatcher({ bus, executor });
  dispatcher.start();

  let decideCount = 0;
  const reasoner = {
    async decide() {
      decideCount += 1;
      if (decideCount === 1) {
        return {
          type: 'tool',
          tools: [
            { call_id: 'call-a', name: 'add', args: { a: 1, b: 2 } },
            { call_id: 'call-b', name: 'echo', args: { text: 'hello' } }
          ]
        };
      }

      return { type: 'final', output: 'done-multi' };
    }
  };

  const runner = new ToolLoopRunner({
    bus,
    getReasoner: () => reasoner,
    listTools: () => executor.listTools(),
    maxStep: 4,
    toolResultTimeoutMs: 2000
  });

  const events = [];
  const result = await runner.run({
    sessionId: 's-multi',
    input: 'do two calls',
    onEvent: (event) => events.push(event)
  });

  assert.equal(result.state, 'DONE');
  assert.equal(result.output, 'done-multi');
  const toolCalls = events.filter((e) => e.event === 'tool.call');
  const toolResults = events.filter((e) => e.event === 'tool.result');
  assert.equal(toolCalls.length, 2);
  assert.equal(toolResults.length, 2);
  assert.equal(toolCalls[0].payload.name, 'add');
  assert.equal(toolCalls[1].payload.name, 'echo');

  dispatcher.stop();
});
test('ToolLoopRunner returns error when tool dispatch fails', async () => {
  const bus = new RuntimeEventBus();
  const executor = new ToolExecutor(localTools);
  const dispatcher = new ToolCallDispatcher({ bus, executor });
  dispatcher.start();

  const runner = new ToolLoopRunner({
    bus,
    getReasoner: () => ({
      async decide() {
        return {
          type: 'tool',
          tool: { call_id: 'missing-1', name: 'missing_tool', args: {} }
        };
      }
    }),
    listTools: () => executor.listTools(),
    maxStep: 1,
    toolResultTimeoutMs: 2000
  });

  const result = await runner.run({ sessionId: 's2', input: 'x' });
  assert.equal(result.state, 'ERROR');
  assert.match(result.output, /工具执行失败/);

  dispatcher.stop();
});
