# Persona/Soul 系统执行步骤（实施中）

## Step 1 — 基础人格上下文接入（完成）
- [x] 新增 `config/persona.yaml`
- [x] 新增 persona 基础模块：
  - `personaConfigStore`
  - `personaLoader`
  - `personaModeResolver`
  - `personaStateStore`
  - `personaContextBuilder`
- [x] ToolLoopRunner 支持 `resolvePersonaContext`
- [x] Gateway 注入 `PersonaContextBuilder`
- [x] 基础测试通过

## Step 2 — 记忆整合（偏好读取+受控写回）（完成）
- [x] PersonaContextBuilder 读取 long-term memory 提示
- [x] 新增 `personaPreferenceWriteback`（显式信号触发）
- [x] 仅在 `writeback.enabled` 且命中显式偏好语句时写回
- [x] 写回条目 metadata: `type=persona_preference`
- [x] 单元测试覆盖

## Step 3 — 文档与可观测（完成）
- [x] 施工方案文档 `PERSONA_MEMORY_INTEGRATION_PLAN.md`
- [x] 执行步骤文档（本文件）
- [x] 在 plan 事件中暴露 persona mode（运行可观测）

## Step 4 — 后续增强（待做）
- [ ] session 持久化 persona_state（当前为内存态）
- [ ] 增加 `/mode` 或 API 控制入口
- [ ] 增加 persona telemetry 文件化（当前复用 runtime event）
- [ ] 增加 UI debug 面板展示 persona source/writeback
