# Tool Executor & Middleware（细粒度设计）

## 1. 关键文件

- `apps/runtime/executor/toolExecutor.js`
- `apps/runtime/tooling/toolPipeline.js`
- `apps/runtime/tooling/middlewares/resolveTool.js`
- `apps/runtime/tooling/middlewares/validateSchema.js`
- `apps/runtime/tooling/middlewares/enforcePolicy.js`
- `apps/runtime/tooling/middlewares/auditLog.js`
- `apps/runtime/tooling/errors.js`

## 2. ToolExecutor 双模式

### A. Legacy 模式（兼容）

当构造参数为旧式对象（`{toolName: toolDef}`）时：

- 自动包装为兼容 registry
- policy 默认空
- exec 默认安全配置

### B. Registry 模式（推荐）

构造参数为 `ToolRegistry` 时：

- 使用外部注入的 policy/exec
- 全量走 pipeline

## 3. Pipeline 顺序（当前实现）

1. `auditLog`：记录开始时间与 latency
2. `resolveTool`：按名称查找工具
3. `validateSchema`：Ajv 校验参数
4. `enforcePolicy`：allow/deny/provider 覆盖
5. `execute`：执行 adapter

> 说明：`resolve -> validate -> policy -> execute` 可保证错误定位清晰。

## 4. 错误码体系

统一错误码（`ErrorCode`）：

- `TOOL_NOT_FOUND`
- `VALIDATION_ERROR`
- `PERMISSION_DENIED`
- `TIMEOUT`
- `RUNTIME_ERROR`
- `CONFIG_ERROR`

### 返回结构

```json
{
  "ok": false,
  "error": "invalid tool args",
  "code": "VALIDATION_ERROR",
  "details": [...],
  "metrics": { "latency_ms": 8 }
}
```

## 5. Schema 校验策略

- 使用 Ajv
- 按 `tool.name` 缓存编译后的 validator
- 默认建议 schema 显式声明 `additionalProperties: false`

## 6. Policy 计算

`enforcePolicy` 中 provider 覆盖策略为：

- 读取 `policy.byProvider[provider]`
- 若未命中，尝试 `providerPrefix/*`（例如 `openai/*`）
- 合并规则：
  - `deny` 累加，优先级最高
  - `allow` 累加

判定逻辑：

1. 命中 deny => 拒绝
2. allow 非空且未命中 => 拒绝
3. 其余 => 放行

## 7. 可观测性

`auditLog` 写入 `ctx.metrics.latency_ms`，最终由 `ToolExecutor.execute` 返回。

建议后续增加：

- trace_id / call_id
- retries
- adapter 执行耗时拆分

## 8. 合并稳定性建议

- 新中间件必须插入到固定位置并补测试
- 不允许在中间件里直接吞异常（统一抛 `ToolingError`）
- 变更 ErrorCode 时必须同步更新：
  - 运行时错误映射
  - API 文档
  - 测试断言
