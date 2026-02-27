# Live2D 动作能力 Tool Call 暴露初步方案

## 1. 背景

- 需求来源：`REQ-20260226-010`（Live2D 模型动作控制能力 Tool 化）
- 关联 issue：`#20`
- 开发分支：`codex/feature/live2d-tool-call-interface`

当前 `desktop-live2d` 已具备 RPC 与基础工具映射能力，但主 runtime 的通用工具链尚未直接暴露 Live2D 动作能力，且模型资源侧存在动作/表情声明缺口。

## 2. 现状结论

1. 已有可用能力：
- `model.param.set` / `model.param.batchSet`
- `model.motion.play`
- `model.expression.set`
- `tool.list` / `tool.invoke`（桌宠 RPC 层）

2. 关键缺口：
- `config/tools.yaml` 尚未纳入 Live2D 工具定义（模型无法走 runtime 通用 tool pipeline 直接调用）
- 当前 `assets/live2d/yachiyo-kaguya/八千代辉夜姬.model3.json` 未声明 `Motions` / `Expressions`
- 模型目录无 `*.motion3.json`，仅存在 `*.exp3.json`

## 3. 目标与边界

## 3.1 目标

1. 让大模型可通过 runtime 标准 tool call 调用 Live2D 动作能力。
2. 同时提供：
- 底层工具：参数/动作/表情直控
- 高层工具：语义动作预设（更模型友好）
3. 保证失败路径可观测：统一错误码、日志、trace 关联。

## 3.2 非目标

1. 本阶段不做复杂动作编辑器或可视化动作编排 UI。
2. 本阶段不引入多模型驱动或跨角色动作共享协议。

## 4. 方案总览

采用“双层工具接口 + 一条执行链”：

1. 底层原子能力：
- `live2d.param.set`
- `live2d.param.batch_set`
- `live2d.motion.play`
- `live2d.expression.set`

2. 高层语义能力（推荐模型优先调用）：
- `live2d.emote`
- `live2d.gesture`
- `live2d.react`

3. 执行链：
- `ToolLoopRunner -> ToolCallDispatcher -> ToolExecutor -> live2d adapter -> desktop RPC(tool.invoke/或直调方法) -> renderer`

## 5. 接口设计（初稿）

## 5.1 底层工具

1. `live2d.motion.play`
- 入参：`group`(string, required), `index`(integer, optional)
- 作用：播放指定动作组/索引

2. `live2d.expression.set`
- 入参：`name`(string, required)
- 作用：切换表情

3. `live2d.param.set`
- 入参：`name`(string, required), `value`(number, required)
- 作用：设置单参数

4. `live2d.param.batch_set`
- 入参：`updates`(array<{name,value}>, required)
- 作用：批量参数更新

## 5.2 高层工具（语义到原子映射）

1. `live2d.emote`
- 入参：`emotion`(enum), `intensity`(low|medium|high)
- 输出：映射到 `expression + param.batch_set`

2. `live2d.gesture`
- 入参：`type`(enum: greet|agree|deny|think|shy...)
- 输出：映射到 `motion.play`（必要时叠加 expression）

3. `live2d.react`
- 入参：`intent`(enum: success|error|apology|confused|waiting...)
- 输出：调用预设动作模板（短序列）

说明：高层工具的映射表独立配置，避免写死在代码里，便于后续调优。

## 6. 配置与资源改造

1. 模型资源侧：
- 补齐/导入 `*.motion3.json`
- 在 `model3.json` 中声明 `Motions`
- 在 `model3.json` 中声明 `Expressions`（绑定现有 `*.exp3.json`）

2. runtime 工具配置侧：
- 在 `config/tools.yaml` 新增 Live2D 工具条目与 schema
- 将工具加入 policy allow（可按 provider 做粒度限制）

3. 桌宠映射侧：
- `apps/desktop-live2d/main/toolRegistry.js` 维护白名单与映射
- 新增高层动作映射模块（建议独立文件）

## 7. 安全与稳定性策略

1. 白名单：
- 只允许声明在 registry 的工具名
- 高层工具参数使用 enum + `additionalProperties: false`

2. 并发与节流：
- 同一会话动作调用串行执行
- 复用并细化 `rpcRateLimiter`（按 method/tool 细分）
- 增加动作冷却（避免抖动/连发）

3. 错误与审计：
- 统一错误码：`-32602` 参数错误、`-32006` 不允许、`-32005` 内部错误、`-32003` 超时
- 事件日志包含：`trace_id`、`session_id`、`call_id`、`tool_name`、`latency_ms`

## 8. 测试方案

1. 单元测试：
- `toolRegistry` 映射与拒绝路径
- 新增高层动作映射模块（覆盖所有 enum 分支）
- schema 校验与参数边界

2. 集成测试：
- runtime `tool.call.requested -> result` 全链路
- 桌宠 RPC `tool.invoke` 到 renderer 成功/失败路径
- 并发/限流场景（超额触发返回 rate limited）

3. 冒烟测试：
- `npm run desktop:smoke` 增加 Live2D 动作调用断言

## 9. 分阶段实施计划

1. Phase A（资源与底层能力打通）
- 补模型动作/表情声明
- 打通 runtime -> live2d 底层 4 个工具

2. Phase B（高层语义工具）
- 实现 `emote/gesture/react` 映射
- 配置化预设表与最小冷却策略

3. Phase C（收敛与验收）
- 完成测试矩阵
- 补齐模块文档与 `PROGRESS_TODO.md` 回填

## 10. 影响文件（预估）

- `config/tools.yaml`
- `apps/runtime/tooling/*`
- `apps/runtime/executor/*`
- `apps/desktop-live2d/main/*`
- `apps/desktop-live2d/renderer/*`（仅必要时）
- `assets/live2d/yachiyo-kaguya/*`
- `test/runtime/*`
- `test/desktop-live2d/*`

## 11. 回滚策略

1. 配置回滚优先：移除 `config/tools.yaml` 中新增 Live2D 工具暴露。
2. 保留底层 RPC 方法，但禁用高层语义工具入口。
3. 若动作触发异常，优先切回参数直控最小能力集合。

