# Live2D 动作消息链路与播放器阶段计划（Planner）

## 1. 目标范围

本计划覆盖以下两个目标：

1. 改造动作消息链路，使消息包含 `动作定义 + 持续秒数`。
2. Electron 端解析动作消息并入队，新增动作播放器按队列消费并执行 Live2D 响应。

---

## 2. 统一规则（执行约束）

### 2.1 提交规则

- 每实现一个“可独立验证”的功能点，必须立即提交一次 commit。
- 每个 commit 必须对应至少一个测试变更（新增测试或增强断言）。
- commit message 建议格式：
  - `feat(live2d-action): <功能点>`
  - `test(live2d-action): <测试点>`（如测试与功能分开提交）

### 2.2 测试规则

- 每阶段至少包含：
  - 单元测试（逻辑/状态机/校验）
  - 集成测试（主进程到渲染进程、或 gateway 到 desktop）
- 每新增功能点必须新增“测试节点”并在本文件留痕。

### 2.3 验收门槛

- 阶段完成前必须通过：
  - `npm test`
  - 该阶段新增测试用例
- 手工验证需包含：
  - Desktop 可见动作行为
  - 队列按预期消费
  - duration 生效

---

## 3. 动作消息草案（V1）

```json
{
  "action_id": "act-uuid",
  "action": {
    "type": "expression",
    "name": "tear_drop",
    "args": {}
  },
  "duration_sec": 2.5,
  "queue_policy": "append"
}
```

字段说明：

- `action_id`: 幂等追踪 ID。
- `action.type`: `expression|motion|gesture|emote|react`（V1 先落地 expression/motion）。
- `duration_sec`: 本动作保持时间。
- `queue_policy`: `append|replace|interrupt`。

---

## 4. 分阶段计划

## Phase A：消息协议与链路打通（最小闭环）

### 功能点

- [x] A1. 定义动作消息 schema（含 `action + duration_sec`）。
- [x] A2. Gateway/runtime 侧发布标准动作事件（建议统一为 `ui.live2d.action`）。
- [x] A3. Electron main 识别该事件并转发给 renderer（新增专用通道）。

### 测试节点

- [x] A-T1. schema 校验单测：合法/非法消息。
- [x] A-T2. gateway -> desktop 通知映射集成测试。
- [x] A-T3. desktop main -> renderer 转发测试（含 payload 完整性断言）。

### 提交节点

- [x] A-C1. `feat(live2d-action): add action event schema and validator`
- [x] A-C2. `feat(live2d-action): forward ui.live2d.action from main to renderer`
- [x] A-C3. `test(live2d-action): cover action event schema and forwarding`

---

## Phase B：Renderer 队列与动作播放器（expression/motion）

### 功能点

- [x] B1. 新增 `ActionQueuePlayer`（enqueue/dequeue/start/stop/clear）。
- [x] B2. 实现 `duration_sec` 播放时长控制。
- [x] B3. 执行映射：
  - `expression` -> `model.expression.set`
  - `motion` -> `model.motion.play`
- [x] B4. 队列空闲自动消费，错误隔离不中断后续动作。

### 测试节点

- [x] B-T1. 队列顺序消费单测（FIFO）。
- [x] B-T2. duration 定时行为单测（fake timer）。
- [x] B-T3. expression/motion 调用映射单测。
- [x] B-T4. 异常动作不中断后续动作测试。

### 提交节点

- [x] B-C1. `feat(live2d-action): add renderer action queue player`
- [x] B-C2. `feat(live2d-action): support expression and motion action playback`
- [x] B-C3. `test(live2d-action): cover queue order duration and error isolation`

---

## Phase C：队列策略与并发控制

### 功能点

- [ ] C1. 支持 `queue_policy=append|replace|interrupt`。
- [ ] C2. 增加播放器互斥锁，避免与现有 RPC 动作调用竞争。
- [ ] C3. 增加队列长度上限与丢弃策略（防积压）。

### 测试节点

- [ ] C-T1. `append` 追加策略测试。
- [ ] C-T2. `replace` 清队列策略测试。
- [ ] C-T3. `interrupt` 中断当前动作测试。
- [ ] C-T4. 队列上限与降级策略测试。

### 提交节点

- [ ] C-C1. `feat(live2d-action): add queue policies append replace interrupt`
- [ ] C-C2. `feat(live2d-action): add player mutex and queue capacity control`
- [ ] C-C3. `test(live2d-action): cover queue policies and capacity`

---

## Phase D：语义动作扩展（gesture/emote/react）

### 功能点

- [ ] D1. 在播放器层支持 `gesture/emote/react`。
- [ ] D2. 语义动作降解为原子动作序列（必要时复用现有 preset 配置）。
- [ ] D3. 为语义动作配置默认 `duration_sec` 与覆盖规则。

### 测试节点

- [ ] D-T1. 语义动作到原子动作映射测试。
- [ ] D-T2. 不存在 preset 的错误处理测试。
- [ ] D-T3. duration 覆盖优先级测试（消息值 > 默认值）。

### 提交节点

- [ ] D-C1. `feat(live2d-action): support semantic action types in queue player`
- [ ] D-C2. `test(live2d-action): cover semantic mapping and preset fallback`

---

## Phase E：观测、调试与回归

### 功能点

- [ ] E1. 增加动作队列日志（enqueue/start/done/fail）。
- [ ] E2. 可选上报动作 ACK/DONE 事件到调试流。
- [ ] E3. 文档补全（调用样例、故障排查、回滚项）。

### 测试节点

- [ ] E-T1. 日志字段完整性测试。
- [ ] E-T2. ACK/DONE 事件上报测试。
- [ ] E-T3. 端到端回归测试（动作链路 + 队列消费 + UI 可见性）。

### 提交节点

- [ ] E-C1. `feat(live2d-action): add action playback telemetry events`
- [ ] E-C2. `test(live2d-action): add e2e regression for action queue pipeline`
- [ ] E-C3. `docs(live2d-action): add operation and rollback guide`

---

## 5. 测试文件建议落点

- `test/runtime/live2dActionEventSchema.test.js`
- `test/desktop-live2d/actionEventForwarding.test.js`
- `test/desktop-live2d/actionQueuePlayer.test.js`
- `test/desktop-live2d/actionQueuePolicy.test.js`
- `test/integration/live2dActionPipeline.e2e.test.js`

---

## 6. 实施留档（提交记录）

> 每次 commit 后在此追加 hash，形成追踪链。

- [x] `1c0cae7` Phase A / A1
- [x] `b82a185` Phase A / A2
- [x] `1c0cae7` Phase A / A3
- [x] `45222ed` Phase B / B1
- [x] `45222ed` Phase B / B2
- [x] `63e454c` Phase B / B3
- [x] `63e454c` Phase B / B4
- [ ] `<hash>` Phase C / C1
- [ ] `<hash>` Phase C / C2
- [ ] `<hash>` Phase D / D1
- [ ] `<hash>` Phase D / D2
- [ ] `<hash>` Phase E / E1
