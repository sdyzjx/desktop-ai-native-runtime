# Live2D Action Queue & Cooldown（Phase-4）

## 1. 目标

为动作类调用（`motion.play` / `expression.set`）提供运行时顺序保证与抖动控制：

- 同会话动作串行执行
- 可配置忙时策略（`enqueue` / `drop_if_busy`）
- 动作冷却（cooldown）

实现文件：`apps/runtime/tooling/adapters/live2d.js`

---

## 2. 核心机制

### 2.1 会话级动作队列

按 `session_id` 建立队列桶，动作方法统一入队：

- `live2d.motion.play`
- `live2d.expression.set`

参数类方法（`param.set` / `param.batch_set`）不走动作队列。

### 2.2 忙时策略

通过环境变量控制：

- `LIVE2D_ACTION_QUEUE_POLICY=enqueue`（默认）
  - 忙时排队，按顺序执行
- `LIVE2D_ACTION_QUEUE_POLICY=drop_if_busy`
  - 忙时直接拒绝，返回 `RUNTIME_ERROR`

### 2.3 冷却策略

通过环境变量控制：

- `LIVE2D_ACTION_COOLDOWN_MS`（默认 250ms）

同一 `session_id` 的动作调用会在上次动作后满足冷却时间再执行。

---

## 3. 使用方法

### 3.1 默认（推荐）

```bash
# 不配置时：enqueue + 250ms cooldown
```

### 3.2 低延迟测试模式

```bash
export LIVE2D_ACTION_COOLDOWN_MS=0
```

### 3.3 高压保护模式

```bash
export LIVE2D_ACTION_QUEUE_POLICY=drop_if_busy
```

---

## 4. 测试覆盖

文件：`test/runtime/live2dAdapter.test.js`

新增覆盖：

1. `createActionQueue drop_if_busy` 忙时拒绝
2. `createLive2dAdapters serializes action calls per session`
3. `createLive2dAdapters applies action cooldown`

确保 Phase-4 的队列与冷却行为可回归验证。
