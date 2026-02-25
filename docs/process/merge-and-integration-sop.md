# Merge & Integration SOP（详细版）

> 目标：在并行开发（tool-call + memory-system）下，稳定集成并降低冲突率。

## 1. 分支模型

- `main`：稳定主线，禁止直接提交
- `feature/tool-call`：工具调用能力开发
- `feature/memory-system`：记忆系统开发
- `integration/runtime-core`：集成联调分支

## 2. Feature 分支提交规范

每个 feature 分支合入 integration 前，必须完成：

1. `git fetch origin`
2. `git rebase origin/main`
3. `npm test` 全绿
4. 推送 feature 分支
5. 创建 feature -> main 的草稿 PR（可选，但建议）

## 3. Integration 分支操作顺序

```bash
git fetch origin
git checkout -B integration/runtime-core origin/main

git merge --no-ff feature/tool-call -m "merge: integrate feature/tool-call into integration/runtime-core"
git merge --no-ff feature/memory-system -m "merge: integrate feature/memory-system into integration/runtime-core"

npm test
git push -u origin integration/runtime-core
```

## 4. 冲突处理 SOP

### 4.1 冲突优先级

1. 安全相关（schema/policy/shell 约束）优先保留更严格版本
2. 协议相关（error code/event payload）优先保留向后兼容版本
3. 文档相关优先保留更详细版本

### 4.2 冲突解决后必做

- `npm test`
- 手动 smoke：
  - 单工具调用
  - 多工具调用
  - 记忆检索

## 5. PR 模板建议（integration -> main）

### 必填项

- 涉及模块列表
- 风险点
- 回滚方案
- 测试证明（命令 + 结果）

### 风险描述参考

- 运行时协议变化风险
- 安全策略回退风险
- 配置兼容性风险

## 6. 合并门槛（Go/No-Go）

必须全部满足：

- 自动化测试全绿
- 关键链路人工验收通过
- 无 blocker 级缺陷
- 文档完整（模块级 + 集成 SOP）

## 7. 回滚策略

如 integration 合并后出现严重问题：

1. 停止继续合并新 feature
2. 对 integration 执行 revert 指定 merge commit
3. 再次执行全量测试
4. 记录 root cause 与修复计划

## 8. 文档维护纪律

- 代码变更涉及模块时，必须同步更新对应 `docs/modules/*`
- 每个 PR 至少更新一个“改动说明 + 风险说明”文档条目
- 文档与实现不一致时，以实现为准并立即修订文档
