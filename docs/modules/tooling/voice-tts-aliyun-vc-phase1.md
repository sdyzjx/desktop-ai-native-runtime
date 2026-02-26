# Voice TTS (Aliyun Qwen3-TTS-VC) Phase 1 模块说明

## 1. 模块目标

Phase 1 提供可用的语音输出 MVP：
- 在工具总线中新增 `voice.tts_aliyun_vc`。
- 对 TTS 请求执行策略判定（内容类型、长度）。
- 对同 session 执行冷却与每分钟频率限制。
- 调用本地 `voice-reply` CLI（接 DashScope）并返回音频引用。

> 失败时仅影响语音，不影响文本主回复。

---

## 2. 代码位置

- Adapter：`apps/runtime/tooling/adapters/voice.js`
- Policy：`apps/runtime/tooling/voice/policy.js`
- Cooldown Store：`apps/runtime/tooling/voice/cooldownStore.js`
- Tool 注册：`config/tools.yaml` + `apps/runtime/tooling/toolRegistry.js`
- 配置：`config/voice-policy.yaml`

---

## 3. 工作原理

## 3.1 请求入口

模型触发工具：`voice.tts_aliyun_vc`

核心输入：
- `text`
- `voiceId`
- `model`
- `voiceTag`（zh/jp/en）
- `replyMeta`（内容复杂度信息）

## 3.2 策略判定

`evaluateVoicePolicy` 会拒绝以下情况：
- 空文本
- 代码/表格/大量链接/排障内容
- 文本长度超过 `max_chars`
- 句子过多（复杂回复）

## 3.3 频控判定

`enforceRateLimit` 对 session 做两层限制：
- `cooldown_sec_per_session`
- `max_tts_calls_per_minute`

## 3.4 幂等去重（阶段新增）

支持可选参数：
- `idempotencyKey`
- `turnId`

当同一 `session_id + idempotencyKey` 重复请求时，直接返回第一次生成结果，避免重复 TTS/重复播报。

会发出 `voice.job.deduplicated` 事件。

## 3.5 新请求抢占旧请求（阶段新增）

同一 session 内，如果较新的 TTS 请求先成为 active job，较早请求即使后返回，也会被标记为 `TTS_CANCELLED` 并丢弃结果，避免旧语音覆盖新语音。

会发出 `voice.job.cancelled` 事件（`reason=superseded_by_newer_request`）。

## 3.6 模型-音色一致性判定

若 runtime 提供 `voiceRegistry`，会验证：
- `voiceId.targetModel === model`

不一致则返回 `TTS_MODEL_VOICE_MISMATCH`。

## 3.5 事件观测

本阶段会通过运行时 event bus 发出：
- `voice.policy.checked`
- `voice.job.started`
- `voice.job.completed`
- `voice.job.failed`

用于后续仪表盘和审计追踪。

## 3.6 执行与结果

通过 `VOICE_REPLY_CLI`（默认 `skills/yachiyo-qwen-voice-reply/bin/voice-reply`）调用合成脚本，读取 stdout 最后一行为音频路径，返回：

```json
{
  "audioRef": "file:///tmp/xxx.ogg",
  "format": "ogg",
  "voiceTag": "zh",
  "model": "qwen3-tts-vc-2026-01-22",
  "voiceId": "qwen-tts-vc-xxx"
}
```

---

## 4. 用法示例

### 4.1 工具调用参数

```json
{
  "name": "voice.tts_aliyun_vc",
  "args": {
    "text": "好的，我现在开始第一阶段开发。",
    "voiceId": "qwen-tts-vc-xxx",
    "model": "qwen3-tts-vc-2026-01-22",
    "voiceTag": "zh",
    "replyMeta": {
      "inputType": "audio",
      "sentenceCount": 1,
      "containsCode": false,
      "containsTable": false,
      "containsManyLinks": false,
      "isTroubleshooting": false
    }
  }
}
```

### 4.2 环境变量

- `VOICE_REPLY_CLI`：覆盖默认 CLI 路径
- `VOICE_POLICY_PATH`：覆盖 voice policy 配置路径

---

## 5. 错误码

- `TTS_POLICY_REJECTED`
- `TTS_TEXT_TOO_LONG`
- `TTS_MODEL_VOICE_MISMATCH`
- `TTS_RATE_LIMITED`
- `TTS_TIMEOUT`
- `TTS_PROVIDER_DOWN`
- `TTS_CANCELLED`

补充语义：
- Provider 失败会自动重试 1 次（仅 `TTS_PROVIDER_DOWN` 可重试）。
- 超时直接归类为 `TTS_TIMEOUT`，不重试。
---

## 6. 可观测性（阶段新增）

新增工具：`voice.stats`
- 返回当前进程内的语音指标快照（JSON）
- Gateway `/health` 也会返回同一份 `voice` 指标快照，便于外部巡检
- 指标示例：
  - `tts_total` / `tts_success` / `tts_failed`
  - `tts_cancelled` / `tts_deduplicated`
  - `tts_retry_total` / `tts_timeout` / `tts_provider_down`
  - `policy_denied`

## 7. 测试覆盖

新增测试：
- `test/runtime/voicePolicy.test.js`
- `test/runtime/voiceAdapter.test.js`

覆盖点：
- 策略允许/拒绝
- 长文本拒绝
- 模型-音色不匹配拒绝
- cooldown/rate-limit 生效
- 幂等去重与抢占取消
- 重试与超时分类
- 指标聚合输出（voice.stats）
