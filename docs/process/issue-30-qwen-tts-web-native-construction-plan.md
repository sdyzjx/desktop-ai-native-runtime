# Issue #30 施工方案：Qwen TTS Web-Native（非流式，复用当前音色）

- 适用分支：`feature/REQ-20260301-streaming-voice-native`
- 关联需求：`feat(voice): 基于 qwen3-tts-realtime 的 Node 原生语音链路`（本方案先落地非流式 MVP）
- 目标：在不改动用户调用习惯的前提下，先把 TTS 主链从 `runtime + python + ffmpeg + file` 迁移到 `electron direct + memory playback`。

---

## 0. 范围声明（本次做 / 不做）

### 本次做（MVP）

1. 保留现有 voice tool 入口（或最小新增别名），不改上层 prompt/tool 使用方式。
2. runtime 侧由“合成执行者”改为“语音请求发布者”。
3. gateway 按现有事件总线透传 `voice.*` 事件。
4. electron main 直接请求 Qwen TTS **非流式** API。
5. renderer 支持内存音频播放（不落磁盘）。
6. 保留 feature flag，可回退 legacy（python+ffmpeg）。

### 本次不做

1. 不做 qwen3-tts realtime 真流式 chunk 播放。
2. 不做复杂并发打断队列（仅保留基础互斥/最后一次覆盖策略）。
3. 不做跨设备同步播放。

---

## 1. 总体交付物

交付完成后应具备：

- [ ] `voice.requested -> electron synth -> renderer play` 全链路可跑通。
- [ ] 不依赖本地音频文件与 ffmpeg 即可播放。
- [ ] 音色继续复用现有 `providers.yaml` 中 `tts_model/tts_voice`。
- [ ] 异常有统一错误码与日志埋点。
- [ ] 可通过配置回退旧链路。

---

## 2. 分阶段计划（Phase Plan）

## Phase 1：协议与开关（0.5 天）

**目标**：先把“怎么切链路、怎么传事件”定下来，保证可灰度。

### 任务

1. 新增语音链路开关（建议放 `config/desktop-live2d.json` 或 `voice-policy.yaml`）：
   - `voice_path: electron_native | runtime_legacy`
2. 定义 voice 事件契约（非流式）
   - `voice.requested`
   - `voice.synthesis.started|completed|failed`
   - `voice.playback.started|ended|failed`
3. 文档补齐事件字段约束（requestId/sessionId/turnId/textLen/voiceTag/model）

### 验收

- [ ] 在 debug event stream 中能看到完整事件骨架（即使还未接真实 TTS）。

---

## Phase 2：runtime 侧最小改造（1 天）

**目标**：voice tool 不再执行 python/ffmpeg，改为事件发布。

### 主要改动文件

- `apps/runtime/tooling/adapters/voice.js`
- `apps/runtime/tooling/toolRegistry.js`（如需新增工具名映射）
- `docs/modules/tooling/README.md`（工具行为变化）

### 任务

1. 抽离 legacy 执行路径（保留但不默认）。
2. 在 `electron_native` 模式下：
   - 参数校验 + policy 校验
   - 发布 `voice.requested`
   - 立即返回 `accepted`（不等待播放结束）
3. 兼容 idempotencyKey 与限流逻辑。

### 验收

- [ ] 调用工具后，runtime 立刻返回成功受理。
- [ ] gateway 收到并广播 `voice.requested`。

---

## Phase 3：electron main 接入 Qwen 非流式（1.5 天）

**目标**：electron main 成为 TTS 执行核心。

### 主要改动文件

- `apps/desktop-live2d/main/desktopSuite.js`
- `apps/desktop-live2d/main/gatewayRuntimeClient.js`（如需通知增强）
- 新增：`apps/desktop-live2d/main/voice/qwenTtsClient.js`
- 新增：`apps/desktop-live2d/main/voice/voiceOrchestrator.js`

### 任务

1. 在 `desktopSuite` 的 gateway 通知分发中监听 `voice.requested`。
2. main 侧读取 provider 配置（仅 main 可见 api key）：
   - `base_url`
   - `api_key`
   - `tts_model`
   - `tts_voice`
3. 调用 Qwen TTS 非流式接口，拿到 `audio_url`。
4. 下载音频二进制到内存（Buffer）。
5. 发布 `voice.synthesis.*` 事件用于观测。

### 关键约束

- 不在日志中打印完整 API Key/audio_url。
- 对文本长度做上限控制（防止超大请求）。
- 设置单次请求超时（如 15~30s，可配置）。

### 验收

- [ ] 在无 python/ffmpeg 条件下可稳定拿到音频 Buffer。
- [ ] 失败时输出标准错误码并可观测。

---

## Phase 4：renderer 内存播放改造（1 天）

**目标**：播放层不依赖 `file://` 路径。

### 主要改动文件

- `apps/desktop-live2d/renderer/bootstrap.js`
- `apps/desktop-live2d/main/preload.js`（若需新增 IPC 通道）
- `apps/desktop-live2d/main/desktopSuite.js`

### 任务

1. 新增 IPC 播放通道：
   - `desktop:voice:play-memory`
2. 传输方式二选一（建议优先 Blob）：
   - `ArrayBuffer + mimeType`
   - 或 base64 data URL（实现快，性能稍差）
3. renderer 使用 `Audio` 播放内存资源，播放后释放 URL。
4. 播放成功/失败上报 `voice.playback.*`。

### 验收

- [ ] 不生成本地音频文件也能播放。
- [ ] 连续 20 次播放无明显内存泄漏（基础观察）。

---

## Phase 5：回退、测试与文档（1 天）

**目标**：可上线、可回滚、可排障。

### 任务

1. 打通 feature flag：
   - `electron_native`（新）
   - `runtime_legacy`（旧）
2. 补充测试：
   - 单元：参数校验/错误码映射
   - 集成：tool -> gateway -> electron -> renderer
   - 手工：异常网络、鉴权失败、超时
3. 补文档：
   - 调用时序图
   - 错误码表
   - 回滚 SOP

### 验收

- [ ] 新旧链路可一键切换。
- [ ] 测试记录完整，可复现。

---

## 3. 里程碑与时间预估

- M1（Phase1-2 完成）：T+1.5 天
- M2（Phase3 完成）：T+3 天
- M3（Phase4-5 完成并可提 PR）：T+5 天

> 说明：按单人连续开发估算；若并行开发可缩短。

---

## 4. 风险清单与缓解

1. **Qwen 非流式响应慢，影响“即时感”**
   - 缓解：文本分句（后续流式阶段再优化），先保证稳定性。
2. **electron 侧直连外网失败（代理/证书/网络策略）**
   - 缓解：保留 runtime_legacy 回退；增加健康探针。
3. **内存播放格式兼容问题（ogg/mp3 容器）**
   - 缓解：请求固定返回可播放格式；不行则 main 侧做最小转封装（仍不落盘）。
4. **配置不一致导致音色漂移**
   - 缓解：统一从 provider store 读取，禁止 renderer 自定义 voice。

---

## 5. 任务拆分（可直接建子任务）

1. `task-30-01`：voice 事件协议与 feature flag
2. `task-30-02`：runtime adapter 改发布模式
3. `task-30-03`：electron qwen tts client（非流式）
4. `task-30-04`：renderer 内存播放通道
5. `task-30-05`：回退链路与测试文档

---

## 6. PR 提交建议

### PR-1（基础设施）
- 协议、开关、runtime 发布模式

### PR-2（核心能力）
- electron 调 Qwen + renderer 内存播放

### PR-3（收尾）
- 测试、文档、回滚 SOP

> 每个 PR 遵守仓库协作规范：变更范围 / before-after / 风险点 / 验证方式 / 回滚方案。

---

## 7. Done 定义（DoD）

满足以下全部条目视为本次施工完成：

- [ ] 非流式 web-native TTS 链路默认可用。
- [ ] 当前音色配置可复用且行为一致。
- [ ] 无本地音频文件依赖。
- [ ] 错误与日志可观测。
- [ ] 旧链路可回退。
- [ ] 文档已更新并可指导后续流式升级。
