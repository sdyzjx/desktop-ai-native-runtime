# Voice Auto Reply Feature

## 概述

自动语音回复功能允许 yachiyo 在每次文本回复后自动生成一段简短的语音回复。这个功能通过注入系统提示词的方式实现，让模型自行决定语音内容和风格。

## 配置

在 `config/voice-policy.yaml` 中配置：

```yaml
voice_policy:
  # ... 其他配置 ...

  auto_voice_reply:
    enabled: false        # 是否启用自动语音回复
    max_chars: 50         # 语音文本最大字符数
    style: auto           # 风格：auto（自动）/summary（总结）/comment（评论）
```

## 工作原理

1. **配置加载**：`apps/runtime/tooling/voice/policy.js` 加载 `auto_voice_reply` 配置
2. **提示词注入**：当 `enabled: true` 时，`personaContextBuilder` 会在系统提示词中注入指令
3. **模型决策**：模型根据对话上下文自行决定：
   - 是否生成语音回复
   - 语音内容（总结或吐槽）
   - 语音风格（严肃或轻松）
4. **工具调用**：模型主动调用 `voice.tts_aliyun_vc` 工具生成语音

## 注入的提示词

当启用时，系统会注入以下提示词：

```
Voice Reply Mode: 在每次回复后，你应该主动调用 voice.tts_aliyun_vc 工具生成一段简短的语音回复（不超过50字）。这段语音可以是：
- 对你回复内容的精炼总结
- 对用户问题的轻松吐槽或评论
- 简短的互动性回应
根据对话氛围自行决定风格，保持自然和个性化。语音文本应该口语化、简洁有趣。
```

## 使用示例

### 启用功能

修改 `config/voice-policy.yaml`：

```yaml
auto_voice_reply:
  enabled: true
  max_chars: 50
  style: auto
```

### 预期行为

用户：你好，今天天气怎么样？

Yachiyo（文本回复）：今天天气不错，阳光明媚，温度适宜，很适合出门活动。

Yachiyo（自动语音）：天气好，出去玩吧！

## 与现有 voice_policy 的关系

- `auto_voice_reply` 是独立的功能，不受 `must_speak_if`、`may_speak_if` 等规则约束
- 自动语音回复由模型主动触发，不依赖于回复内容的复杂度判断
- 仍然受 `limits` 中的冷却时间和频率限制约束

## 注意事项

1. **字符限制**：建议 `max_chars` 设置在 30-60 之间，过长会影响体验
2. **频率控制**：自动语音回复会消耗 TTS 配额，注意 `max_tts_calls_per_minute` 限制
3. **模型自主性**：模型可能不是每次都生成语音，这是正常的设计
4. **性能影响**：每次回复都会额外调用一次 TTS，可能增加响应时间

## 测试

运行测试确保功能正常：

```bash
npm test
```

所有测试应该通过，包括：
- voice policy 加载测试
- persona context builder 测试
- voice adapter 测试

## 实现文件

- `config/voice-policy.yaml` - 配置文件
- `apps/runtime/tooling/voice/policy.js` - 策略加载
- `apps/runtime/persona/personaContextBuilder.js` - 提示词注入
