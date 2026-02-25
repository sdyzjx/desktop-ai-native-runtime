# Builtin / FS / Shell Adapters（细粒度设计）

## 1. 关键文件

- `apps/runtime/tooling/adapters/builtin.js`
- `apps/runtime/tooling/adapters/fs.js`
- `apps/runtime/tooling/adapters/shell.js`

## 2. Builtin Adapter

### 工具

- `builtin.get_time`
- `builtin.add`
- `builtin.echo`

### 说明

用于保持最小运行能力与测试稳定性；适合 smoke 与 demo。

## 3. FS Adapter（`fs.write_file`）

### 参数

- `path`（相对 workspace 路径）
- `content`
- `mode`（`overwrite|append`，默认 overwrite）

### 安全边界

通过 `resolveWorkspacePath(workspaceRoot, targetPath)` 强制路径在 workspace 内：

- 使用 `path.resolve` 规整路径
- 检查前缀是否属于 workspace
- 逃逸路径抛出：`PERMISSION_DENIED`

### 输出

返回 JSON 字符串：

```json
{"path":"/abs/path","mode":"overwrite","bytes":123}
```

## 4. Shell Adapter（`shell.exec`）

### 参数

- `command`
- `timeoutSec`（可覆盖默认）

### 限制策略

1. 禁止危险 shell 运算符：`; & | > < \` $ ( )`
2. 命令先 split，提取主命令 `bin`
3. `security=allowlist` 时必须命中 `safeBins`
4. 默认 timeout + maxBuffer
5. 输出按 `maxOutputChars` 截断

### 错误映射

- 命令被拒绝：`PERMISSION_DENIED`
- 命令为空/解析失败：`VALIDATION_ERROR`
- 超时：`TIMEOUT`
- 其他执行异常：`RUNTIME_ERROR`

## 5. 已知边界与改进

### 当前边界

- split parser 是简化实现，不支持复杂 shell 语法
- stderr 合并到输出字符串，尚无结构化分离字段

### 后续建议

- 增加 argv 白名单或参数级规则（如仅允许 `ls -la`）
- 增加逐工具的独立超时配置
- 输出结构化：`stdout/stderr/exitCode`
