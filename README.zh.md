# open-yachiyo

![open-yachiyo cover](assets/readme-cover.jpg)

原生优先的桌面 AI 助手运行时 — 从零基于 [ReAct 循环](https://arxiv.org/abs/2210.03629) 构建，实现可预测、有界、可审计的 Agent 执行。不是 OpenClaw 或任何编排框架的封装：没有无上限的工具调用链，没有跨会话上下文污染，没有工作流不稳定问题。

🇺🇸 [English](./README.md)

---

## 项目简介

**open-yachiyo** 是一个原生优先的桌面 AI 助手运行时，支持 Live2D 桌面宠物、多模态输入、长期记忆和技能扩展。

## 快速开始

1. 安装依赖：

```bash
npm install
```

2. 配置模型提供商（`config/providers.yaml`）：

```bash
# 编辑 config/providers.yaml：
# - active_provider（当前使用的提供商）
# - providers.<name>.base_url
# - providers.<name>.model
# - providers.<name>.api_key 或 api_key_env
```

如使用 `api_key_env`，请先导出环境变量：

```bash
export OPENAI_API_KEY="<your_api_key>"
```

3. 启动服务：

```bash
npm run dev
```

4. 健康检查：

```bash
curl http://localhost:3000/health
```

5. Web 界面：
- 对话界面：`http://localhost:3000/`
- 提供商配置界面：`http://localhost:3000/config.html`

## 桌面 Live2D

```bash
# 导入模型资源
npm run live2d:import

# 启动桌面套件（网关 + Live2D 窗口 + RPC）
npm run desktop:up

# 启动后运行快速冒烟测试
npm run desktop:smoke
```

## 测试

```bash
npm test        # 完整测试套件
npm run test:ci # CI 等效命令
```

## 项目结构

- `apps/gateway`：WebSocket 网关 + RPC 队列入口
- `apps/runtime`：事件总线、RPC Worker、LLM 推理、工具循环
- `apps/desktop-live2d`：Electron + Live2D 桌面壳
- `docs/`：架构文档、模块参考、实现记录

## 为什么不用 OpenClaw？

OpenClaw 是一个功能完整的 Agent 编排层，但它的设计目标和本项目的需求存在根本性的错位。在实际使用中，基于 OpenClaw 运行 Agent 意味着接受以下代价：工具调用链条没有硬性上限、长会话下上下文窗口污染、以及一个为灵活性而非确定性优化的工作流模型。对于一个需要常驻桌面、响应迅速、行为可预期的 AI 助手来说，这是错误的取舍。

**open-yachiyo 的运行时从零基于 ReAct 循环构建**（Reason → Act → Observe，循环执行）。每一轮都是一个独立、可审计的周期：模型对当前状态进行推理，输出且仅输出一个动作（工具调用或最终响应），运行时执行该动作，结果作为观察值反馈回模型。循环有硬性步数上限。会话之间完全隔离。不存在跨会话泄漏的"环境记忆"——记忆是显式的、工具驱动的、可查询的。

最终得到的是一个真正可推理的运行时：可预测的轮次结构、有界的执行过程、从输入到输出清晰可查的执行链路。
