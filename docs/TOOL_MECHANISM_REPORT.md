# Open-Yachiyo 工具调用与配置机制分析报告

本报告基于 `open-yachiyo` 项目的核心文档与代码（如 `config/tools.yaml`、`apps/runtime/tooling/toolRegistry.js` 等），对系统中的 Tool (工具) 配置与调用机制进行详细拆解。

## 1. 核心架构概述

该项目采取了**配置驱动 (Configuration-driven)** 与 **中间件拦截 (Middleware-based)** 相结合的设计。这种设计旨在将工具的定义、鉴权与具体执行逻辑解耦，从而保证系统在扩展工具能力时的安全性和规范性。

整体架构主要由以下三个层次构成：
1. **配置层**：通过统一的 YAML 文件声明式地管理工具字典和权限策略。
2. **注册层**：在系统启动或运行时，将文本配置解析并绑定到具体的本地执行函数。
3. **执行层**：通过洋葱模型般的中间件管道，对每次调用进行严格的校验、鉴权和日志记录。

## 2. 工具配置：`config/tools.yaml`

所有的工具注册并非在代码中硬编码，而是统一由 `config/tools.yaml` 接管。这使得工具的维护和权限控制变得非常直观。该文件主要分为三个部分：

### 2.1 访问控制策略 (`policy`)
定义了全局的权限名单：
- **`allow`**: 允许调用的工具列表（例如 `shell.exec`，`workspace.write_file`，`voice.tts_aliyun_vc` 等）。如果在允许列表中，系统才予以执行。
- **`deny`**: 拒绝列表，优先级通常高于允许列表。
- **`byProvider`**: 可选的按提供商配置的精细化策略。

### 2.2 安全沙箱配置 (`exec`)
针对敏感操作（特别是 Shell 脚本执行），定义了严格的安全围栏：
- **`security`**: 目前设为 `allowlist`（白名单机制）。
- **`safeBins`**: 允许执行的具体基础命令（如 `echo`, `pwd`, `ls`, `cat`, `grep`），从根本上防止恶意命令植入。
- **`timeoutSec` & `maxOutputChars`**: 限制最长执行时间和最大输出限制（如 8000 字符），防止阻塞系统或产生消耗超载。
- **`workspaceOnly`**: 强制高危命令仅在指定的 workspace 目录下运行。

### 2.3 工具字典 (`tools`)
定义了各个工具的具体结构，每个工具节点包含：
- **`name`** 和 **`description`**：工具标识和给大模型（LLM）阅读的设计意图说明。
- **`input_schema`**：遵循 JSON Schema 规范的参数定义结构。系统要求必须是严格匹配的（通常设置 `additionalProperties: false`），这对拦截 LLM 的“幻觉”参数至关重要。
- **`adapter`**：路由键（如 `builtin.get_time` 或 `shell.exec`），它是代码层解析具体执行逻辑的纽带。

## 3. 工具注册与绑定：`ToolRegistry`

在 `apps/runtime/tooling/toolRegistry.js` 中，系统将静态的 YAML 映射到了动态的代码环境中。

- **适配器 (Adapters)**：在 `apps/runtime/tooling/adapters/` 目录下，分类实现了不同的具体逻辑（如 `builtin.js`, `fs.js`, `shell.js`, `voice.js` 等）。这些实现被聚合并暴露出类似 `builtin.get_time` 的键值对。
- **绑定过程**：`ToolRegistry` 在初始化时，会遍历 `tools.yaml` 中的 `tools` 数组，通过读取每个项的 `adapter` 字段，去 Adapters 集合中寻找真正的 JavaScript 执行函数（`run` 方法）。
- **暴露接口**：注册完成后，形成一个 `Map`。Registry 通过 `.list()` 方法可以将不含实际代码逻辑、仅包含元数据的格式（即 Tool Contract）暴露给外部或 LLM，掩盖了具体的底层实现细节。

## 4. 工具的执行生命周期 (Middleware Pipeline)

为了最大化安全性，工具的调用链路通过了多层中间件拦截。一个标准的调用请求（通常来自大模型通过 Tool Calling API 下发），需要通过以下链路：

1. **解析检查 (`resolveTool`)**：根据传来的工具名称，在 Registry 中寻找是否已注册该工具。
2. **Schema 校验 (`validateSchema`)**：引入诸如 `Ajv` 一类的校验库，对大模型传来的 JSON 对象进行严格校验，确保字段属性类型和必须项与 YAML 中配置的一致。校验失败会直接抛出错误，阻止运行。
3. **策略检查 (`enforcePolicy`)**：对比 YAML 中的 `policy` 节点，检查该工具当前是否被赋予了执行权限。
4. **底层执行 (`executeTool`)**：只有当上述验证全部绿灯通过后，才会调用 Adapter 中绑定的真正 `run()` 方法来执行业务逻辑。
5. **审计追踪 (`auditLog`)**：调用结束后，无论是成功或抛出异常，都会被内部事件总线或日志系统记录，用于安全审计和错误跟踪。

## 5. 总结

`open-yachiyo` 的工具机制体现了**极高的工程规范与安全性考量**。
- **对于 AI (LLM)**：它只能看到标准的工具名称、描述和严格的 JSON 参数声明，它不具备跨越边界直接执行代码的能力。
- **对于开发者**：增加新工具只需两步：（1）在 `config/tools.yaml` 加入定义和 Schema；（2）在 `adapters/` 中编写对应键值的 JS 函数。
- **对于系统运维**：高度收敛的 Policy 与 Exec 白名单，以及完整的中间件卡点，确保了即便大模型生成了越界请求，也能被系统沙箱阻挡。
