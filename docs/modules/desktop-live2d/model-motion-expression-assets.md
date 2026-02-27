# Live2D 模型 Motion/Expression 资产补全（Phase-2）

## 1. 目的

本模块文档描述 `desktop-live2d` 在 Phase-2 对模型资源的补全与校验方式，确保 `live2d.motion.play` 与 `live2d.expression.set` 有可用资产基础。

---

## 2. 八千代模型当前资产结构

目录：`assets/live2d/yachiyo-kaguya`

新增/确认：

- Expression 文件（已挂载）：
  - `泪珠.exp3.json`
  - `眯眯眼.exp3.json`
  - `眼泪.exp3.json`
  - `笑咪咪.exp3.json`

- Motion 文件（最小联调集）：
  - `motions/yachiyo_idle.motion3.json`
  - `motions/yachiyo_greet.motion3.json`
  - `motions/yachiyo_react_error.motion3.json`

- `八千代辉夜姬.model3.json` 中 `FileReferences` 已补：
  - `Expressions`
  - `Motions`

---

## 3. model3.json 声明约定

### 3.1 Expressions

采用数组结构：

```json
"Expressions": [
  { "Name": "smile", "File": "笑咪咪.exp3.json" }
]
```

### 3.2 Motions

采用对象分组结构：

```json
"Motions": {
  "Idle": [
    { "File": "motions/yachiyo_idle.motion3.json", "FadeInTime": 0.5, "FadeOutTime": 0.5 }
  ]
}
```

建议动作组命名语义化（如 `Idle/Greet/ReactError`），便于后续 `gesture/react` 映射。

---

## 4. 校验机制实现

文件：`apps/desktop-live2d/main/modelAssets.js`

`validateModelAssetDirectory` 现已支持：

1. 基础资源校验：`Moc/Textures/Physics/DisplayInfo`
2. Expressions 校验（若声明）：
   - 必须为非空数组
   - 每项必须包含非空 `Name` 与 `File`
   - `File` 必须存在
3. Motions 校验（若声明）：
   - 必须为对象
   - 每个组必须为非空数组
   - 每个动作项必须包含非空 `File`
   - `File` 必须存在

---

## 5. 使用方法

1. 将 motion/exp 文件放入模型目录
2. 在 `.model3.json` 更新 `FileReferences.Expressions/Motions`
3. 运行测试：

```bash
node --test test/desktop-live2d/modelAssets.test.js
```

4. 再跑全量：

```bash
npm test
```

---

## 6. 测试覆盖

文件：`test/desktop-live2d/modelAssets.test.js`

新增覆盖：

- `validateModelAssetDirectory validates expression and motion references when provided`
- `validateModelAssetDirectory throws when declared motion file is missing`

确保声明存在时，缺文件会在导入/校验阶段即失败，避免运行时才暴露问题。

---

## 7. 注意事项

1. 当前 3 个 motion 为“联调最小集”，后续建议替换为八千代模型原工程导出的动作资产。
2. 跨模型复用 motion 可能存在参数 ID 不匹配风险，仅建议用于链路验证。
3. 若后续新增动作组，请同步更新高层语义映射配置（Phase-5）。
