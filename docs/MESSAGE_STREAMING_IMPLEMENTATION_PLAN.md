# 消息流式输出实施方案

版本：v1.0
日期：2026-03-02
分支：`codex/feature/message-streaming`

## 1. 目标

实现真正的 LLM 流式输出，让 WebUI 和 Desktop 气泡能够实时显示 AI 生成的文本，而不是等待完整响应后一次性显示。

## 2. 当前问题分析

### 2.1 现状

- ✅ Desktop UI 已实现流式状态管理（`desktopSuite.js:1343-1386`）
- ✅ Gateway 已支持 `message.delta` 事件映射（`gatewayRuntimeClient.js:31`）
- ⚠️ Runtime Worker 只发送一次伪 delta（`runtimeRpcWorker.js:266-273`）
- ❌ LLM Provider 未实现 SSE 流式调用（`openaiReasoner.js:64-158`）

### 2.2 根本原因

`openaiReasoner.js` 的 `decide()` 方法：
- 使用 `response.json()` 一次性获取完整响应
- 没有 `stream: true` 参数
- 没有 SSE 流式解析逻辑
- 只在 LLM 完全生成后才返回结果

当前的 `extractMessageDeltaFromRuntimeEvent()` 只提取 `decision.preview`（前 160 字符），这不是真正的流式输出。

## 3. 技术方案

### 3.1 架构设计

```
OpenAI API (SSE Stream)
  ↓ data: {"choices":[{"delta":{"content":"..."}}]}
OpenAIReasoner.decide()
  ↓ onStreamDelta(delta)
ToolLoopRunner
  ↓ emit('llm.delta', {delta})
RuntimeRpcWorker
  ↓ sendEvent('message.delta', {delta})
Gateway WebSocket
  ↓ JSON-RPC notification
Desktop/WebUI
  ↓ 累积并渲染
```

### 3.2 核心改动点

1. **OpenAIReasoner** - 实现 SSE 流式解析
2. **ToolLoopRunner** - 支持流式回调
3. **RuntimeRpcWorker** - 监听 `llm.delta` 事件
4. **WebUI** - 添加 `message.delta` 处理逻辑

## 4. 施工阶段

### Phase 1: OpenAIReasoner 流式支持

**文件**：`apps/runtime/llm/openaiReasoner.js`

**改动内容**：

1. 添加 `decideStream()` 方法支持流式调用
2. 实现 SSE 解析器（`parseSSEStream()`）
3. 保留原有 `decide()` 方法作为向后兼容

**核心逻辑**：

```javascript
async decideStream({ messages, tools, onStreamDelta }) {
  const payload = {
    model: this.model,
    temperature: 0.2,
    tool_choice: 'auto',
    stream: true,  // ← 启用流式
    messages,
    tools: [...]
  };

  const response = await fetch(`${this.baseUrl}/chat/completions`, {
    method: 'POST',
    headers: { ... },
    body: JSON.stringify(payload)
  });

  // SSE 流式解析
  let accumulatedContent = '';
  let toolCalls = [];

  for await (const chunk of parseSSEStream(response.body)) {
    const delta = chunk.choices[0]?.delta;

    if (delta?.content) {
      accumulatedContent += delta.content;
      onStreamDelta?.(delta.content);  // ← 实时回调
    }

    if (delta?.tool_calls) {
      // 累积 tool_calls
    }
  }

  // 返回最终决策
  return toolCalls.length > 0
    ? { type: 'tool', tools: toolCalls, ... }
    : { type: 'final', output: accumulatedContent, ... };
}
```

**验收标准**：
- ✅ 能够解析 OpenAI SSE 流
- ✅ 每个 token 触发 `onStreamDelta` 回调
- ✅ 正确累积完整响应
- ✅ 支持 tool_calls 流式解析
- ✅ 保持重试和超时逻辑

### Phase 2: ToolLoopRunner 流式集成

**文件**：`apps/runtime/loop/toolLoopRunner.js`

**改动内容**：

1. 修改 `decide()` 调用，传入 `onStreamDelta` 回调
2. 在回调中发射 `llm.delta` 事件
3. 保持现有 `llm.final` 事件逻辑

**核心逻辑**：

```javascript
const decision = await this.reasoner.decideStream({
  messages: ctx.messages,
  tools: this.listTools(),
  onStreamDelta: (delta) => {
    emit('llm.delta', {
      delta,
      session_id: sessionId,
      trace_id: traceId,
      step_index: ctx.stepIndex
    });
  }
});

// 保持原有 llm.final 逻辑
emit('llm.final', { decision: formatDecisionEvent(decision) });
```

**验收标准**：
- ✅ 流式期间持续发射 `llm.delta` 事件
- ✅ 最终仍发射 `llm.final` 事件
- ✅ 向后兼容非流式 reasoner

### Phase 3: RuntimeRpcWorker 事件转发

**文件**：`apps/runtime/rpc/runtimeRpcWorker.js`

**改动内容**：

1. 在 `onEvent` 回调中添加 `llm.delta` 分支
2. 移除 `extractMessageDeltaFromRuntimeEvent()` 的伪实现
3. 保持 `llm.final` 的处理逻辑

**核心逻辑**：

```javascript
onEvent: (event) => {
  this.bus.publish('runtime.event', event);
  context.sendEvent?.(toRpcEvent('runtime.event', event));

  // 处理流式 delta
  if (event.event === 'llm.delta') {
    const delta = String(event.payload?.delta || '');
    if (delta) {
      context.sendEvent?.(toRpcEvent('message.delta', {
        session_id: event.payload?.session_id || sessionId,
        trace_id: event.payload?.trace_id || null,
        step_index: event.payload?.step_index ?? null,
        delta
      }));
    }
  }
}
```

**验收标准**：
- ✅ 每个 `llm.delta` 事件转发为 `message.delta` 通知
- ✅ 保持会话和追踪 ID 的正确传递
- ✅ 向后兼容无流式的场景

### Phase 4: WebUI 流式渲染

**文件**：`apps/gateway/public/chat.js`

**改动内容**：

1. 在 `state` 对象添加流式状态管理
2. 在 `ws.onmessage` 添加 `message.delta` 分支
3. 实现增量文本更新和节流

**核心逻辑**：

```javascript
// 状态管理
const state = {
  ...existing,
  streamingState: {
    active: false,
    sessionId: null,
    accumulatedText: '',
    throttleTimer: null
  }
};

// WebSocket 消息处理
state.ws.onmessage = (event) => {
  const msg = JSON.parse(event.data);

  if (msg.method === 'message.delta') {
    const delta = msg.params?.delta || '';
    const sessionId = msg.params?.session_id;

    if (!state.pending || state.pending.sessionId !== sessionId) return;

    // 累积文本
    if (!state.streamingState.active) {
      state.streamingState.active = true;
      state.streamingState.sessionId = sessionId;
      state.streamingState.accumulatedText = '';
    }

    state.streamingState.accumulatedText += delta;

    // 节流更新 DOM (50ms)
    if (state.streamingState.throttleTimer) {
      clearTimeout(state.streamingState.throttleTimer);
    }

    state.streamingState.throttleTimer = setTimeout(() => {
      updateAssistantMessage(
        state.pending.assistantMsgId,
        state.streamingState.accumulatedText
      );
    }, 50);

    return;
  }

  if (msg.type === 'final') {
    // 清理流式状态
    if (state.streamingState.active) {
      clearTimeout(state.streamingState.throttleTimer);
      state.streamingState.active = false;
    }

    finishPendingResponse({ content: msg.output || '' });
  }
};
```

**验收标准**：
- ✅ 实时显示流式文本
- ✅ 节流机制生效（50ms）
- ✅ 流式结束后正确显示完整文本
- ✅ 向后兼容无 delta 的场景

### Phase 5: 测试和文档

**测试文件**：
- `test/runtime/openaiReasonerStreaming.test.js`
- `test/runtime/toolLoopRunnerStreaming.test.js`
- `test/integration/messageStreamingE2e.test.js`

**测试用例**：
1. SSE 流式解析正确性
2. Delta 事件累积和转发
3. 多会话隔离
4. 错误处理和重试
5. 向后兼容性

**文档更新**：
- 更新 `docs/ARCHITECTURE.md` 添加流式架构说明
- 更新 `README.md` 添加流式输出功能说明

## 5. 技术细节

### 5.1 SSE 解析器实现

```javascript
async function* parseSSEStream(readableStream) {
  const reader = readableStream.getReader();
  const decoder = new TextDecoder();
  let buffer = '';

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split('\n');
      buffer = lines.pop() || '';

      for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed || trimmed.startsWith(':')) continue;

        if (trimmed === 'data: [DONE]') {
          return;
        }

        if (trimmed.startsWith('data: ')) {
          const jsonStr = trimmed.slice(6);
          try {
            yield JSON.parse(jsonStr);
          } catch {
            // 忽略解析错误
          }
        }
      }
    }
  } finally {
    reader.releaseLock();
  }
}
```

### 5.2 向后兼容策略

1. **Reasoner 层**：保留原有 `decide()` 方法，新增 `decideStream()` 方法
2. **Runner 层**：检测 reasoner 是否支持 `decideStream`，不支持则回退到 `decide()`
3. **Worker 层**：同时监听 `llm.delta` 和 `llm.final`，兼容两种模式
4. **UI 层**：无 delta 时走原有逻辑，有 delta 时走流式逻辑

### 5.3 性能优化

1. **节流**：UI 层 50ms 节流，避免过于频繁的 DOM 更新
2. **批量累积**：Reasoner 层可选批量发送（如每 5 个 token 发送一次）
3. **背压控制**：如果 UI 消费速度慢，可以暂停 SSE 读取

## 6. 风险和缓解

### 6.1 SSE 解析错误

**风险**：OpenAI API 返回格式变化或网络中断导致解析失败

**缓解**：
- 使用 try-catch 包裹每个 chunk 的解析
- 解析失败时记录日志但不中断流
- 最终使用累积的内容作为结果

### 6.2 流式中断

**风险**：网络中断导致流式输出不完整

**缓解**：
- 保留重试逻辑，但流式模式下不重试（避免重复内容）
- 流式中断时，使用已累积的内容作为部分结果
- UI 显示"流式中断"提示

### 6.3 Tool Calls 流式解析复杂度

**风险**：Tool calls 的流式解析比纯文本复杂

**缓解**：
- Phase 1 先实现纯文本流式（`type: 'final'`）
- Phase 2 再实现 tool calls 流式（`type: 'tool'`）
- Tool calls 流式期间不发送 delta，只在完整后发送

### 6.4 向后兼容性

**风险**：新代码可能破坏现有功能

**缓解**：
- 保留所有原有方法和逻辑
- 新功能通过可选参数启用
- 充分的集成测试覆盖

## 7. 验收标准

### 7.1 功能验收

- ✅ WebUI 实时显示 LLM 生成的文本
- ✅ Desktop 气泡实时显示 LLM 生成的文本
- ✅ 流式期间 UI 不会闪烁或卡顿
- ✅ 流式结束后显示完整文本
- ✅ 无流式时仍然正常工作

### 7.2 性能验收

- ✅ 首字延迟 < 500ms（从发送到第一个 token 显示）
- ✅ Delta 更新频率 < 20 次/秒（节流生效）
- ✅ CPU 占用无明显增加
- ✅ 内存占用稳定

### 7.3 测试验收

- ✅ 单元测试覆盖率 > 80%
- ✅ 所有测试用例通过
- ✅ 手动测试通过（发送消息观察流式显示）

## 8. 施工顺序

1. **Phase 1**：OpenAIReasoner 流式支持（2 小时）→ Commit + Test
2. **Phase 2**：ToolLoopRunner 流式集成（1 小时）→ Commit + Test
3. **Phase 3**：RuntimeRpcWorker 事件转发（30 分钟）→ Commit + Test
4. **Phase 4**：WebUI 流式渲染（1.5 小时）→ Commit + Test
5. **Phase 5**：测试和文档（1 小时）→ Commit

**总计**：约 6 小时

## 9. 回滚计划

如果出现严重问题，可以通过以下方式回滚：

```bash
# 回滚到实施前的提交
git revert <commit-hash>

# 或者禁用流式输出（环境变量）
export ENABLE_STREAMING=false
```

## 10. 后续优化

- 支持 Markdown 实时渲染
- 支持代码块语法高亮
- 添加流式速度配置
- 支持暂停/恢复流式输出
- 支持流式输出的取消操作

## 11. Desktop Chat Markdown/Mermaid 渲染

### 11.1 需求

Desktop chat 需要支持：
- Markdown 格式渲染（粗体、斜体、列表、链接等）
- Mermaid 图表渲染（流程图、时序图等）
- 暗色调主题适配
- 代码块语法高亮

### 11.2 技术方案

使用 CDN 引入轻量级库：
- `marked.js` - Markdown 解析器
- `mermaid.js` - 图表渲染
- `highlight.js` - 代码高亮

### 11.3 实施步骤

1. 在 `chat.html` 引入 CDN 库
2. 修改 `chat.js` 的 `renderMessages()` 使用 markdown 渲染
3. 配置 mermaid 暗色主题
4. 添加代码块样式

### 11.4 Mermaid 暗色主题配置

```javascript
mermaid.initialize({
  startOnLoad: false,
  theme: 'dark',
  themeVariables: {
    primaryColor: '#5d96ff',
    primaryTextColor: '#f4f8ff',
    primaryBorderColor: '#4a7acc',
    lineColor: '#8299cc',
    secondaryColor: '#8266ff',
    tertiaryColor: '#65deb f',
    background: '#0a0e18',
    mainBkg: '#1a1e2e',
    secondBkg: '#252938',
    textColor: '#f4f8ff',
    fontSize: '12px'
  }
});
```
