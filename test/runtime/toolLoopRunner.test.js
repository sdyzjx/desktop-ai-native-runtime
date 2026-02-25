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

test('ToolLoopRunner injects seedMessages into reasoner prompt', async () => {
  const bus = new RuntimeEventBus();
  const executor = new ToolExecutor(localTools);
  const dispatcher = new ToolCallDispatcher({ bus, executor });
  dispatcher.start();

  let seenMessages = [];
  const runner = new ToolLoopRunner({
    bus,
    getReasoner: () => ({
      async decide({ messages }) {
        seenMessages = messages;
        return { type: 'final', output: 'ok' };
      }
    }),
    listTools: () => executor.listTools(),
    maxStep: 2,
    toolResultTimeoutMs: 500
  });

  const result = await runner.run({
    sessionId: 's3',
    input: 'current question',
    seedMessages: [
      { role: 'system', content: 'memory summary: likes short output' },
      { role: 'user', content: 'old question' },
      { role: 'assistant', content: 'old answer' }
    ]
  });

  assert.equal(result.state, 'DONE');
  assert.equal(result.output, 'ok');
  assert.equal(seenMessages[1].content, 'memory summary: likes short output');
  assert.equal(seenMessages[2].content, 'old question');
  assert.equal(seenMessages[3].content, 'old answer');
  assert.equal(seenMessages[4].content, 'current question');

  dispatcher.stop();
});

test('ToolLoopRunner passes runtimeContext workspace and permission to tool execution', async () => {
  const bus = new RuntimeEventBus();
  const executor = new ToolExecutor({
    inspect_context: {
      type: 'local',
      description: 'Inspect runtime context',
      input_schema: { type: 'object', properties: {}, additionalProperties: false },
      run: async (_, context) => JSON.stringify({
        workspace_root: context.workspaceRoot,
        permission_level: context.permission_level
      })
    }
  });
  const dispatcher = new ToolCallDispatcher({ bus, executor });
  dispatcher.start();

  let decideCount = 0;
  const runner = new ToolLoopRunner({
    bus,
    getReasoner: () => ({
      async decide({ messages }) {
        decideCount += 1;
        if (decideCount === 1) {
          return {
            type: 'tool',
            tool: { call_id: 'ctx-1', name: 'inspect_context', args: {} }
          };
        }

        return {
          type: 'final',
          output: String(messages[messages.length - 1]?.content || '')
        };
      }
    }),
    listTools: () => executor.listTools(),
    maxStep: 3,
    toolResultTimeoutMs: 1000
  });

  const result = await runner.run({
    sessionId: 'ctx-session',
    input: 'inspect',
    runtimeContext: {
      workspace_root: '/tmp/fake-workspace-root',
      permission_level: 'high'
    }
  });

  assert.equal(result.state, 'DONE');
  assert.match(result.output, /"workspace_root":"\/tmp\/fake-workspace-root"/);
  assert.match(result.output, /"permission_level":"high"/);

  dispatcher.stop();
});

test('ToolLoopRunner injects skills system prompt when resolver is provided', async () => {
  const bus = new RuntimeEventBus();
  const executor = new ToolExecutor(localTools);
  const dispatcher = new ToolCallDispatcher({ bus, executor });
  dispatcher.start();

  let seenMessages = [];
  const runner = new ToolLoopRunner({
    bus,
    getReasoner: () => ({
      async decide({ messages }) {
        seenMessages = messages;
        return { type: 'final', output: 'ok-skills' };
      }
    }),
    listTools: () => executor.listTools(),
    resolveSkillsContext: async () => ({
      prompt: '<available_skills>\\n  <skill><name>shell</name></skill>\\n</available_skills>',
      selected: ['shell'],
      clippedBy: null
    }),
    maxStep: 1,
    toolResultTimeoutMs: 500
  });

  const result = await runner.run({ sessionId: 's4', input: 'do x' });
  assert.equal(result.state, 'DONE');
  assert.equal(result.output, 'ok-skills');
  assert.match(seenMessages[1].content, /available_skills/);

  dispatcher.stop();
});
