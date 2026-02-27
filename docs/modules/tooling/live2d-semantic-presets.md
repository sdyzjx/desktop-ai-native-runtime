# Live2D 语义动作预设（Phase-5）

## 1. 目标

提供高层语义工具给模型使用，避免直接拼原子参数：

- `live2d.emote`
- `live2d.gesture`
- `live2d.react`

底层仍统一下沉到：

- `model.expression.set`
- `model.motion.play`
- `model.param.batchSet`

---

## 2. 预设配置文件

文件：`config/live2d-presets.yaml`

结构：

- `emote.<emotion>.<intensity>`
  - `expression`
  - `params[]`（批量参数）
- `gesture.<type>`
  - `expression`（可选）
  - `motion.group/index`
- `react.<intent>[]`
  - 步骤数组，支持：
    - `type: expression`
    - `type: motion`
    - `type: param_batch`
    - `type: wait`

---

## 3. 调用示例

### 3.1 Emote

```json
{ "name": "live2d.emote", "args": { "emotion": "happy", "intensity": "medium" } }
```

### 3.2 Gesture

```json
{ "name": "live2d.gesture", "args": { "type": "greet" } }
```

### 3.3 React

```json
{ "name": "live2d.react", "args": { "intent": "error" } }
```

---

## 4. 运行机制

语义工具在 adapter 内生成动作步骤计划，然后按 session 队列串行执行；动作步骤仍受 Phase-4 cooldown 与忙时策略控制。

---

## 5. 测试覆盖

文件：`test/runtime/live2dAdapter.test.js`

新增覆盖：

- 语义工具是否按预设映射到正确的 RPC 调用顺序
- 预设缺失时是否返回 `VALIDATION_ERROR`

---

## 6. 维护建议

1. 新增意图优先走配置，不要在代码里硬编码。
2. 预设更新后必须跑 `npm test`。
3. 若新增步骤类型，需同步更新：
   - `toActionStep` 解析
   - 文档
   - 单元测试
