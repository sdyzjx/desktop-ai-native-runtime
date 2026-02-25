# Branch 协作规范（Branch Collaboration Spec）

版本：v1.0  
适用范围：`open-yachiyo` 全仓库

---

## 1. 目标

本规范用于保证并行开发（如 tool-calling、memory-system、runtime UI）时：

- 主线 `main` 始终稳定可运行
- 分支职责清晰，减少冲突
- 集成、回归、发布流程可重复

---

## 2. 分支模型

### 2.1 主分支

- `main`：稳定主线，**禁止直接开发提交**（仅允许通过 PR 合并）

### 2.2 功能分支

- `feature/<domain>-<topic>`
- 示例：
  - `feature/tool-call`
  - `feature/memory-system`

### 2.3 集成分支（可选）

- `integration/<scope>`
- 用于多 feature 联调，不直接替代 main
- 示例：`integration/runtime-core`

### 2.4 修复分支

- `fix/<scope>-<issue>`
- 示例：`fix/memory-init-race`

---

## 3. 基本规则

1. **所有 feature 分支必须从最新 `origin/main` 拉起**。
2. **功能开发期间，feature 分支定期 rebase main**（建议每天至少一次）。
3. **禁止 feature 拉 feature 作为基础分支**。
4. **main 仅接受通过 CI 的 PR**。
5. **提交粒度小而清晰**：一个 commit 尽量只做一件事。

---

## 4. 开发与同步 SOP

### 4.1 新建功能分支

```bash
git fetch origin
git checkout main
git pull --ff-only origin main
git checkout -b feature/<domain>-<topic>
```

### 4.2 分支日常同步

```bash
git fetch origin
git rebase origin/main
```

如果 rebase 冲突：

```bash
# 解决冲突后
git add .
git rebase --continue
```

### 4.3 提交前检查

- `npm test` 必须通过
- 必要文档更新（涉及模块变更时同步 docs）
- 关键配置变更须说明回滚方式

---

## 5. PR 规范

### 5.1 PR 标题

建议格式：

- `feat(runtime): ...`
- `fix(memory): ...`
- `docs(process): ...`

### 5.2 PR 描述必填

1. 变更范围（模块/文件）
2. 行为变化（before/after）
3. 风险点
4. 验证方式（命令 + 结果）
5. 回滚方案

### 5.3 合并策略

- 默认：`Squash and merge`
- 例外：集成分支保留轨迹时可使用 merge commit

---

## 6. 集成分支流程（多功能并行时）

当多个 feature 同步联调时：

1. 从最新 main 创建 `integration/<scope>`
2. 按顺序 merge 功能分支（`--no-ff`）
3. 跑全量测试与宏观联调
4. 通过后再发 `integration -> main` PR

参考命令：

```bash
git fetch origin
git checkout -B integration/runtime-core origin/main
git merge --no-ff feature/tool-call -m "merge: integrate feature/tool-call"
git merge --no-ff feature/memory-system -m "merge: integrate feature/memory-system"
npm test
git push -u origin integration/runtime-core
```

---

## 7. 冲突处理优先级

冲突时按以下优先级决策：

1. 安全策略（schema/policy/sandbox）优先保留更严格实现
2. 运行时协议（event payload/error code）优先保留兼容实现
3. 文档优先保留信息更完整版本

---

## 8. 质量门槛（合并 main 前）

必须全部满足：

- [ ] CI 全绿
- [ ] 本地 `npm test` 全绿
- [ ] 核心链路人工验收通过（tool loop + memory）
- [ ] 文档同步完成
- [ ] 无 blocker 级缺陷

---

## 9. 回滚策略

如主线合并后出现严重问题：

1. 立即暂停后续合并
2. 使用 revert 回退对应 PR commit
3. 重新执行全量测试
4. 在 PR/Issue 中记录 root cause 与修复计划

---

## 10. 执行纪律

- 任何人修改 runtime 核心（loop/executor/session/tooling）必须同步更新文档。
- 涉及 `config/*.yaml` 结构调整必须附迁移说明。
- 未通过测试禁止推动到 main。

---

维护人：Runtime Team  
最后更新：2026-02-25
