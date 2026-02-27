# Live2D RPC Adapter（runtime tooling）

## 1. 模块目的

`apps/runtime/tooling/adapters/live2d.js` 提供 runtime 侧到 `desktop-live2d` RPC 的桥接能力，让 LLM 的标准 tool call 可以直接驱动桌宠模型动作。

当前覆盖的原子工具：

- `live2d.param.set` -> `model.param.set`
- `live2d.param.batch_set` -> `model.param.batchSet`
- `live2d.motion.play` -> `model.motion.play`
- `live2d.expression.set` -> `model.expression.set`

---

## 2. 架构位置

执行链：

`ToolLoopRunner -> ToolCallDispatcher -> ToolExecutor -> ToolRegistry(adapter=live2d.*) -> Live2D RPC Adapter -> desktop-live2d rpcServer`

适配器仅负责“**方法映射 + RPC 传输 + 错误归一**”，不负责业务级语义映射（`emote/gesture/react` 将在上层模块实现）。

---

## 3. 实现方法

### 3.1 入口与导出

文件：`apps/runtime/tooling/adapters/live2d.js`

导出：

- `live2d.param.set`
- `live2d.param.batch_set`
- `live2d.motion.play`
- `live2d.expression.set`

每个导出由 `withLive2dMethod(method)` 生成，统一调用 `invokeLive2dRpc(...)`。

### 3.2 连接参数

通过环境变量读取 RPC 目标：

- `DESKTOP_LIVE2D_RPC_HOST`（默认 `127.0.0.1`）
- `DESKTOP_LIVE2D_RPC_PORT`（默认 `17373`）
- `DESKTOP_LIVE2D_RPC_TOKEN`（可选，若桌宠开启鉴权则必填）

URL 形态：

`ws://<host>:<port>/?token=<token>`

### 3.3 请求协议

请求 JSON-RPC 2.0：

```json
{
  "jsonrpc": "2.0",
  "id": "live2d-<uuid>",
  "method": "model.motion.play",
  "params": {"group": "Idle", "index": 0}
}
```

响应成功时，adapter 返回字符串化 JSON：

```json
{"ok":true,"method":"model.motion.play","result":{...}}
```

### 3.4 错误处理

- 超时：`TIMEOUT`
- 链接失败 / 提前关闭：`RUNTIME_ERROR`
- 远端 RPC 错误：`RUNTIME_ERROR`（保留 `rpcError` 到 `details`）

---

## 4. 使用方法

### 4.1 配置工具声明

在 `config/tools.yaml` 中声明 4 个 `live2d.*` 工具，并在 `policy.allow` 中放行。

### 4.2 运行前要求

- `desktop-live2d` 进程已启动
- RPC 服务端口可达
- token 一致（若启用）

### 4.3 最小调用示例

```json
{
  "name": "live2d.motion.play",
  "args": {
    "group": "Idle",
    "index": 0
  }
}
```

---

## 5. 测试覆盖

新增测试文件：`test/runtime/live2dAdapter.test.js`

覆盖点：

1. URL 生成（含 token）
2. RPC 成功响应回传
3. 工具名到 RPC 方法映射（`live2d.motion.play -> model.motion.play`）

同时在 `test/runtime/tooling.test.js` 增加配置加载断言，确保 `tools.yaml` 已包含 `live2d.motion.play`。

---

## 6. 后续扩展建议

1. 支持 capability 探测（`tool.list`/`state.get` 联动）
2. 增加会话级动作队列与冷却配置
3. 将语义工具（`emote/gesture/react`）落地到独立配置文件
4. 对 RPC 错误码做更细粒度映射（保留远端 code）
