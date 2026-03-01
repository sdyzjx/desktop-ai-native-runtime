# 为什么需要在主系统提示词中添加Voice指令

## 问题

用户测试发现，模型没有自动调用 `voice.tts_aliyun_vc` 工具，即使配置已启用。

从debug日志可以看到：
```
[03:10:03] 第1轮：模型调用 live2d.gesture ✓
[03:10:05] 第2轮：模型直接返回final ✗ (没有调用voice)
```

## 根本原因

**提示词的位置和优先级问题**

### 之前的实现

```javascript
// 主系统提示词（高优先级）
{
  role: 'system',
  content: [
    'For every reply turn, decide one Live2D action...',
    'When live2d tools are available, call exactly one live2d.* tool before final...',
    // ❌ 没有voice的指令
  ]
}

// Persona提示词（较低优先级）
{
  role: 'system',
  content: 'Auto Voice Reply Mode (ENABLED): For every reply turn, call voice.tts_aliyun_vc...'
}
```

### 问题分析

1. **Live2D指令在主系统提示词中**，优先级最高
2. **Voice指令只在persona提示词中**，优先级较低
3. 模型看到Live2D的强制指令后，认为已经满足了"before final"的要求
4. Persona提示词中的voice指令被忽略或优先级不够

## 解决方案

**将voice指令提升到主系统提示词中，与Live2D同等地位**

### 修改后的实现

```javascript
// 主系统提示词（高优先级）
{
  role: 'system',
  content: [
    'For every reply turn, decide one Live2D action...',
    'When live2d tools are available, call exactly one live2d.* tool before final...',
    'When auto voice reply is enabled, call voice.tts_aliyun_vc with a short voice text before final...', // ✓ 新增
  ]
}

// Persona提示词（详细说明）
{
  role: 'system',
  content: 'Auto Voice Reply Mode (ENABLED): [详细的调用格式和示例]'
}
```

### 优势

1. **同等优先级**：Voice和Live2D指令在同一层级
2. **明确顺序**：模型知道需要调用两个工具（Live2D + Voice）
3. **双重提示**：主提示词 + persona提示词，确保模型看到
4. **条件检测**：通过检测personaContext判断是否启用

## 实现细节

### 1. 检测auto_voice_reply是否启用

```javascript
const autoVoiceReplyEnabled = personaContext?.prompt?.includes('Auto Voice Reply Mode');
```

### 2. 生成voiceToolHint

```javascript
const voiceToolHint = autoVoiceReplyEnabled
  ? 'When auto voice reply is enabled, call voice.tts_aliyun_vc with a short voice text before final text response.'
  : null;
```

### 3. 注入到messages

```javascript
...(voiceToolHint ? [{ role: 'system', content: voiceToolHint }] : []),
```

## 预期行为

修改后，模型应该：

```
用户输入："晚上好"
  ↓
第1轮：调用 live2d.gesture({type: "greet"})
  ↓
第2轮：调用 voice.tts_aliyun_vc({text: "晚上好呀"})
  ↓
第3轮：返回 final: "晚上好，sdy。月读的夜色正温柔..."
```

## 对比

| 方案 | Live2D指令位置 | Voice指令位置 | 结果 |
|------|---------------|--------------|------|
| 之前 | 主系统提示词 | Persona提示词 | ❌ Voice被忽略 |
| 现在 | 主系统提示词 | 主系统提示词 + Persona提示词 | ✓ 两者都调用 |

## 测试验证

重启gateway后测试：
```bash
# 1. 重启gateway
cd apps/gateway && npm start

# 2. 发送测试消息
# 观察debug日志，应该看到：
# - 第1轮：live2d.gesture
# - 第2轮：voice.tts_aliyun_vc
# - 第3轮：final text
```

## 总结

这个修改确保了voice指令与Live2D指令具有**同等的优先级和可见性**，让模型能够正确识别并执行自动语音回复的要求。
