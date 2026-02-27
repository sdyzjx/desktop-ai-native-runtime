# Live2D Tooling 错误码归一与 Trace 透传（Phase-3）

## 1. 目标

为 runtime live2d adapter 提供一致的错误语义与可追踪性，避免“调用失败但定位困难”。

对应实现文件：`apps/runtime/tooling/adapters/live2d.js`

---

## 2. 错误码映射规则

adapter 将 desktop RPC 错误码映射到 runtime `ToolingError.code`：

- `-32602` -> `VALIDATION_ERROR`
- `-32006` -> `PERMISSION_DENIED`
- `-32003` -> `TIMEOUT`
- 其余 -> `RUNTIME_ERROR`

超时、连接失败、提前关闭也会分别映射为 `TIMEOUT` 或 `RUNTIME_ERROR`。

---

## 3. Trace 透传策略

### 3.1 request id

当上游 context 提供 `trace_id` 时，请求 id 形如：

`live2d-<trace_id>-<suffix>`

用于快速在日志中关联调用。

### 3.2 error details

所有 adapter 抛出的错误会携带 details：

- `request_id`
- `method`
- `trace_id`
- `rpcError`（若为远端返回错误）

---

## 4. 参数校验收紧

新增 `sanitizeRpcParams`：

1. 入参必须是 object（非数组）
2. 自动剔除 adapter 私有字段 `timeoutMs`

目的：避免将非 RPC 协议字段转发给 `rpcValidator` 触发 `additionalProperties` 错误。

---

## 5. 测试覆盖

文件：`test/runtime/live2dAdapter.test.js`

新增/覆盖：

- request id 含 trace 前缀
- rpc 错误码映射正确
- timeoutMs 不会进入转发 params
- 错误 details 包含 trace_id

---

## 6. 使用建议

1. 上游调用 live2d 工具时，建议保证 `trace_id` 贯穿 dispatcher/executor context。
2. 若 UI 层返回具体 RPC code，可直接据 mapping 快速定位：
   - 参数问题（`VALIDATION_ERROR`）
   - 权限问题（`PERMISSION_DENIED`）
   - 超时（`TIMEOUT`）
