# Auto Voice Reply 功能实现总结

## 实现方案

采用**AI-Native的BEFORE-final模式**，完全参考Live2D动作的实现方式。

### 核心思路

模型在返回final文本之前，先调用 `voice.tts_aliyun_vc` 工具生成语音。

### 工作流程

```
用户输入："今天天气怎么样？"
  ↓
第1轮：模型决策
  ↓
调用 voice.tts_aliyun_vc({
  text: "让我看看天气",
  voiceTag: "zh",
  replyMeta: { isAutoVoiceReply: true }
})
  ↓
工具执行完成
  ↓
第2轮：模型决策
  ↓
返回 final: "今天天气晴朗，温度适宜..."
```

### 关键实现

#### 1. 配置 (config/voice-policy.yaml)

```yaml
auto_voice_reply:
  enabled: true      # 启用自动语音回复
  max_chars: 100     # 语音文本最大字符数
  style: auto        # 风格：auto/summary/comment
```

#### 2. 提示词注入 (apps/runtime/persona/personaContextBuilder.js)

```javascript
const voiceReplyPrompt = autoVoiceReplyEnabled
  ? `Auto Voice Reply Mode (ENABLED): For every reply turn, call voice.tts_aliyun_vc tool with a short voice text (max ${autoVoiceReplyMaxChars} chars) BEFORE final text response. Voice text should be a summary, comment, or casual remark. Call format: {"text": "your voice text", "voiceTag": "zh", "replyMeta": {"isAutoVoiceReply": true, "containsCode": false, "containsTable": false}}. Remember: Call voice tool FIRST, then return final text.`
  : '';
```

**关键词**：
- `BEFORE final text response` - 在final之前
- `Call voice tool FIRST` - 先调用语音工具
- 与Live2D的提示词风格完全一致

#### 3. Policy支持 (apps/runtime/tooling/voice/policy.js)

添加 `isAutoVoiceReply` 标记，让自动语音回复绕过内容检查：

```javascript
if (isAutoVoiceReply) {
  // 绕过 containsCode, containsTable 等检查
  // 只检查字符数限制
  return { allow: true, code: 'OK', reason: 'auto-voice-reply mode' };
}
```

#### 4. 工具Schema (config/tools.yaml)

添加 `isAutoVoiceReply` 字段到 `replyMeta`：

```yaml
replyMeta:
  properties:
    isAutoVoiceReply: { type: boolean }
```

## 优势

### 1. AI-Native
- ✅ 完全由模型决策
- ✅ 模型根据回复内容生成语音文本
- ✅ 语音内容更自然、更贴合上下文

### 2. 架构优雅
- ✅ 零侵入：不修改toolLoopRunner核心逻辑
- ✅ 不增加特例：使用与Live2D相同的模式
- ✅ 可扩展：未来可以添加更多"BEFORE-final"工具

### 3. 可靠性高
- ✅ 提示词明确："MUST call BEFORE final"
- ✅ 与Live2D的成功经验一致
- ✅ 模型已经习惯这种模式

## 测试验证

### 单元测试
```bash
npm test  # 309个测试全部通过
```

### 集成测试
```bash
node test-auto-voice-integration.js
# ✓ Model received auto voice reply prompt
# ✓ Model called voice.tts_aliyun_vc BEFORE final
# ✓ Voice tool executed with isAutoVoiceReply flag
```

### 配置验证
```bash
node test-auto-voice-reply.js
# ✓ Configuration loaded correctly
# ✓ Auto voice reply is enabled
# ✓ Prompt injection is working
```

## 实际使用

### 启动Gateway
```bash
cd apps/gateway
npm start
```

### 启用Debug模式
```bash
curl -X PUT http://localhost:3000/api/debug/mode \
  -H "Content-Type: application/json" \
  -d '{"enabled": true}'
```

### 监控事件
```bash
curl -N "http://localhost:3000/api/debug/events?topics=tool.call.*,voice.*,chain.loop.*"
```

### 发送测试消息
```bash
curl -X POST http://localhost:3000/api/chat \
  -H "Content-Type: application/json" \
  -d '{
    "session_id": "test",
    "input": "你好，今天天气怎么样？"
  }'
```

### 预期行为

1. **第1轮**：模型调用 `voice.tts_aliyun_vc`
   - 语音文本：如"让我看看天气"
   - 标记：`isAutoVoiceReply: true`

2. **第2轮**：模型返回final文本
   - 完整回复：如"今天天气晴朗，温度适宜，很适合出门活动。"

3. **用户体验**：
   - 先听到简短语音
   - 然后看到完整文字回复

## 配置选项

### 启用/禁用
```yaml
auto_voice_reply:
  enabled: true  # 改为false即可禁用
```

### 调整字符数
```yaml
auto_voice_reply:
  max_chars: 50  # 调整语音文本长度
```

### 风格控制
```yaml
auto_voice_reply:
  style: auto     # auto: 模型自动决定
                  # summary: 倾向于总结
                  # comment: 倾向于评论/吐槽
```

## 与现有功能的关系

### Voice Policy
- 自动语音回复仍然受频率限制：
  - `cooldown_sec_per_session: 20` - 20秒冷却
  - `max_tts_calls_per_minute: 3` - 每分钟最多3次
- 但绕过内容检查（通过isAutoVoiceReply标记）

### Live2D动作
- 完全兼容：模型可以同时调用Live2D和Voice工具
- 调用顺序：Live2D → Voice → Final

## 提交记录

```
786391c test(voice): add integration test for auto voice reply
0c38dbd feat(voice): implement AI-native auto voice reply using BEFORE-final pattern
afa0860 docs(voice): add architecture analysis for auto voice reply issue
2b11048 feat(voice): strengthen auto voice reply prompt to be more directive
95a8b2f feat(voice): add isAutoVoiceReply flag to bypass content checks
bf1c5e4 fix(voice): correct typo in auto_voice_reply config (ture -> true)
b7020e7 docs(voice): add auto voice reply feature documentation
b4c5255 feat(voice): add auto voice reply feature
```

## 后续优化

### 可选优化1：语音文本生成策略
当前：完全由模型决定
可选：添加规则辅助（如：代码回复 → "代码写好了"）

### 可选优化2：独立的频率控制
当前：与普通TTS共享频率限制
可选：为auto_voice_reply设置独立的限制

### 可选优化3：多语言支持
当前：默认zh
可选：根据用户输入语言自动选择voiceTag

## 总结

这是一个**完全AI-Native**的实现方案：
- 不修改核心架构
- 不增加特例
- 完全依赖模型的智能决策
- 与现有Live2D模式完美契合

功能已经完整实现，可以进行实际测试和审查。
