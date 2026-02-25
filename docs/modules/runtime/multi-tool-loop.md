# Multi-Tool Loop（运行时细粒度文档）

## 1. 关键文件

- `apps/runtime/llm/openaiReasoner.js`
- `apps/runtime/loop/toolLoopRunner.js`
- `apps/runtime/orchestrator/toolCallDispatcher.js`

## 2. Reasoner 行为

`OpenAIReasoner.decide()` 现在支持解析完整 `message.tool_calls[]`：

- 兼容字段：
  - `decision.tool`：首个工具调用（向后兼容）
  - `decision.tools`：完整工具调用数组（新）

参数解析规则：

- `arguments` 是 JSON 字符串时尝试 `JSON.parse`
- 解析失败时回退 `{ raw }`

## 3. LoopRunner 执行策略

### 每步逻辑

1. 调用 reasoner 获取 decision
2. 若 `final`：直接结束
3. 若 `tool`：
   - `normalizeToolCalls(decision)` 得到工具列表
   - 同步写入 assistant message（含 tool_calls）
   - 对每个 call **串行执行**：
     - publish `tool.call.requested`
     - wait `tool.call.result`
     - 成功则写入 tool message
     - 失败则终止并返回 ERROR

### 串行原因

- 减少并发竞态
- 便于追踪 call_id 顺序
- 与当前 event bus 等待模型兼容

## 4. EventBus 事件

### 运行时事件

- `plan`
- `llm.final`
- `tool.call`
- `tool.result`
- `tool.error`
- `done`

### 工具调度事件

- publish: `tool.call.requested`
- consume: `tool.call.result`

## 5. Dispatcher 职责

`ToolCallDispatcher` 订阅 `tool.call.requested`，执行后写回 `tool.call.result`。

返回字段：

- 成功：`ok=true, result, metrics`
- 失败：`ok=false, error, code, details, metrics`

## 6. 故障处理

- waitFor 超时 => loop 捕获错误并返回 ERROR
- tool 执行失败 => loop 终止，输出 `工具执行失败：...`
- decision 为 tool 但无可执行 call => 立即 ERROR

## 7. 扩展路线

1. 串行 -> 有序并行（先保序收敛再提交结果）
2. 支持 tool call retries（幂等工具优先）
3. 增加 per-call budget（token/time）
