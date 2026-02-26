# Voice ASR (Aliyun) Phase 2 模块说明

## 1. 模块目标

Phase 2 接入语音输入主链路：
- 新增 `voice.asr_aliyun` 工具。
- 将音频引用转写为文本（支持结构化结果）。
- 输出统一字段：`text/confidence/segments/providerMeta`。
- 发出可观测事件（started/completed/failed）。
- 在 `runtime.run` 支持 `params.input_audio`，并在无 `input` 时自动先转写再进入标准对话回路。

---

## 2. 代码位置

- Adapter：`apps/runtime/tooling/adapters/asr.js`
- 工具注册：`config/tools.yaml`
- 测试：`test/runtime/asrAdapter.test.js`

---

## 3. 工作原理

1. 校验输入：`audioRef` 必填，格式仅允许 `wav/mp3/ogg/webm/m4a`。
2. 调用 CLI：默认 `scripts/asr-cli`，可通过 `ASR_CLI` 覆盖。
3. 解析输出：
   - 若 CLI 输出 JSON，读取 `text/confidence/segments`
   - 若输出纯文本，则作为 `text`，默认 confidence=0.9
4. 返回标准化 JSON 字符串。

---

## 4. 事件模型

适配器会发出：
- `voice.job.started`（kind=asr）
- `voice.job.completed`（kind=asr）
- `voice.job.failed`（kind=asr）

---

## 5. 用法示例

### 5.1 直接工具调用

```json
{
  "name": "voice.asr_aliyun",
  "args": {
    "audioRef": "file:///tmp/input.mp3",
    "format": "mp3",
    "lang": "zh",
    "hints": ["OpenClaw", "Qwen3"]
  }
}
```

### 5.2 runtime.run 自动转写（推荐主链路）

```json
{
  "jsonrpc": "2.0",
  "id": "audio-1",
  "method": "runtime.run",
  "params": {
    "session_id": "s-audio",
    "input_audio": {
      "audio_ref": "file:///tmp/input.mp3",
      "format": "mp3",
      "lang": "zh",
      "hints": ["OpenClaw"]
    }
  }
}
```

当 `input` 为空且提供了 `input_audio` 时，worker 会先调用 ASR，再把转写文本作为用户输入送入标准 session 回路。

示例输出：

```json
{
  "text": "你好，继续开发下一阶段。",
  "confidence": 0.94,
  "segments": [],
  "providerMeta": {
    "provider": "aliyun_dashscope",
    "format": "mp3",
    "lang": "zh"
  }
}
```

---

## 6. 错误码

- `ASR_BAD_AUDIO`
- `ASR_UNSUPPORTED_FORMAT`
- `ASR_TIMEOUT`
- `ASR_PROVIDER_DOWN`

---

## 7. 测试覆盖

`test/runtime/asrAdapter.test.js` 覆盖：
- 格式校验
- JSON/纯文本解析
- CLI 执行与事件发射
- 非法格式拒绝
