# Auto Voice Reply 架构问题分析与解决方案

## 问题诊断

经过代码审查和测试，发现了自动语音回复功能无法工作的根本原因：

### 根本原因
**模型无法在返回final后再调用工具**

在 `toolLoopRunner.js` 的工作流程中：
1. 模型每次决策只能选择：返回final文本 OR 调用工具
2. 一旦模型返回 `decision.type === 'final'`，循环立即结束（第256行 return）
3. 没有机会让模型"先返回文本，再调用TTS"

### 当前实现的问题
```javascript
// toolLoopRunner.js:243
if (decision.type === 'final') {
  // ... 处理final回复
  return { output: decision.output, traceId, state: sm.state };  // 立即返回，循环结束
}
```

这意味着：
- 模型必须在生成文本回复之前就决定是否调用TTS
- 但模型不知道自己即将生成什么内容
- 即使提示词说"必须调用"，模型也无法在final后执行

## 解决方案

### 方案A：Runtime层自动触发（推荐）

在 `toolLoopRunner.js` 的final处理中，检测auto_voice_reply配置，自动触发TTS调用：

```javascript
if (decision.type === 'final') {
  // 现有的final处理...

  // 检查是否启用auto_voice_reply
  const voicePolicy = loadVoicePolicy();
  if (voicePolicy.auto_voice_reply?.enabled) {
    // 自动生成简短语音文本（可以用简单规则或调用LLM生成）
    const voiceText = generateAutoVoiceText(decision.output);

    // 自动调用TTS
    await this.dispatchTool({
      name: 'voice.tts_aliyun_vc',
      args: {
        text: voiceText,
        voiceTag: 'zh',
        replyMeta: {
          isAutoVoiceReply: true,
          containsCode: false,
          containsTable: false
        }
      },
      sessionId,
      runtimeContext
    });
  }

  return { output: decision.output, traceId, state: sm.state };
}
```

**优点**：
- 不依赖模型决策
- 100%可靠触发
- 可以用规则或单独的LLM调用生成语音文本

**缺点**：
- 需要额外的逻辑生成语音文本
- 增加了runtime的复杂度

### 方案B：修改模型决策流程

允许模型在final中同时包含工具调用：

```javascript
if (decision.type === 'final') {
  // 先处理final文本
  const output = decision.output;

  // 检查是否有附加的工具调用
  if (decision.post_tools && decision.post_tools.length > 0) {
    // 执行post_tools（如auto voice reply）
    await executePostTools(decision.post_tools);
  }

  return { output, traceId, state: sm.state };
}
```

**优点**：
- 保持模型的灵活性
- 语音内容由模型生成，更自然

**缺点**：
- 需要修改reasoner接口
- 模型可能不支持这种模式

### 方案C：两阶段决策

在final后，如果启用auto_voice_reply，强制进行一轮额外的决策：

```javascript
if (decision.type === 'final') {
  const output = decision.output;

  // 检查auto_voice_reply
  const voicePolicy = loadVoicePolicy();
  if (voicePolicy.auto_voice_reply?.enabled && ctx.stepIndex < this.maxStep) {
    // 添加系统消息，强制模型生成语音
    ctx.messages.push({
      role: 'system',
      content: `现在必须调用 voice.tts_aliyun_vc 生成语音回复。回复内容是："${output.slice(0, 100)}..."`
    });

    // 继续循环，让模型调用TTS
    continue;  // 不return，继续下一轮
  }

  return { output, traceId, state: sm.state };
}
```

**优点**：
- 利用现有的工具调用机制
- 语音由模型生成

**缺点**：
- 增加一轮LLM调用（成本和延迟）
- 模型仍可能不调用

## 推荐实现

**方案A（Runtime层自动触发）** 是最可靠的方案。

实现步骤：
1. 在toolLoopRunner中检测final + auto_voice_reply
2. 使用简单规则生成语音文本（如：取前50字 + "..."）
3. 或者调用一个轻量级的LLM生成语音文本
4. 自动dispatch TTS工具调用

## 当前状态

- ✅ 配置加载正确
- ✅ 提示词注入正确
- ✅ 工具schema正确
- ✅ Policy支持isAutoVoiceReply
- ❌ 模型无法在final后调用工具（架构限制）

## 下一步

需要实现方案A，修改 `toolLoopRunner.js` 添加自动TTS触发逻辑。
