# Auto Voice Reply 优雅架构方案

## 问题分析

直接修改 `toolLoopRunner.js` 存在以下问题：
1. **增加特例**：为auto_voice_reply硬编码逻辑
2. **耦合度高**：toolLoopRunner需要知道voice policy的存在
3. **不可扩展**：未来如果有类似需求（如自动记录、自动分析），需要继续修改toolLoopRunner
4. **违反单一职责**：toolLoopRunner应该只负责工具循环，不应该关心后处理逻辑

## 优雅方案：Event-Driven Post-Processor

### 核心思想
**利用现有的EventBus，通过事件驱动的方式实现后处理逻辑**

### 架构设计

```
┌─────────────────┐
│ ToolLoopRunner  │
│                 │
│  1. 执行循环    │
│  2. 返回final   │
│  3. 发布事件 ───┼──→ EventBus ──→ runtime.event (done)
└─────────────────┘                      │
                                         │ subscribe
                                         ↓
                              ┌──────────────────────┐
                              │ AutoVoiceReplyHandler│
                              │                      │
                              │ 1. 监听done事件      │
                              │ 2. 检查配置          │
                              │ 3. 生成语音文本      │
                              │ 4. 调用TTS工具       │
                              └──────────────────────┘
```

### 实现方案

#### 1. 创建独立的Handler模块

`apps/runtime/handlers/autoVoiceReplyHandler.js`

```javascript
const { loadVoicePolicy } = require('../tooling/voice/policy');

class AutoVoiceReplyHandler {
  constructor({ bus, dispatchTool }) {
    this.bus = bus;
    this.dispatchTool = dispatchTool;
    this.enabled = false;
  }

  start() {
    // 监听runtime.event中的done事件
    this.unsubscribe = this.bus.subscribe('runtime.event', async (envelope) => {
      if (envelope.event !== 'done') return;

      await this.handleFinalReply(envelope);
    });
    this.enabled = true;
  }

  stop() {
    if (this.unsubscribe) {
      this.unsubscribe();
      this.unsubscribe = null;
    }
    this.enabled = false;
  }

  async handleFinalReply(envelope) {
    try {
      // 检查配置
      const policy = loadVoicePolicy();
      if (!policy.auto_voice_reply?.enabled) return;

      const { session_id, payload } = envelope;
      const output = payload?.output;
      if (!output || typeof output !== 'string') return;

      // 生成简短语音文本
      const voiceText = this.generateVoiceText(output, policy.auto_voice_reply.max_chars);

      // 调用TTS工具
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
        sessionId: session_id
      });
    } catch (err) {
      console.error('[AutoVoiceReplyHandler] Error:', err.message);
    }
  }

  generateVoiceText(output, maxChars) {
    // 简单规则：取前N字，去除特殊字符
    const cleaned = output
      .replace(/```[\s\S]*?```/g, '') // 移除代码块
      .replace(/\|.*\|/g, '')          // 移除表格
      .replace(/https?:\/\/\S+/g, '') // 移除链接
      .trim();

    if (cleaned.length <= maxChars) {
      return cleaned;
    }

    // 截取并添加省略号
    return cleaned.slice(0, maxChars - 3) + '...';
  }
}

module.exports = { AutoVoiceReplyHandler };
```

#### 2. 在Gateway启动时注册Handler

`apps/gateway/server.js` (或runtime初始化的地方)

```javascript
const { AutoVoiceReplyHandler } = require('../runtime/handlers/autoVoiceReplyHandler');

// 创建handler
const autoVoiceReplyHandler = new AutoVoiceReplyHandler({
  bus: runtimeBus,
  dispatchTool: async ({ name, args, sessionId }) => {
    // 调用工具执行器
    return await toolExecutor.execute(name, args, {
      session_id: sessionId,
      // ... 其他context
    });
  }
});

// 启动handler
autoVoiceReplyHandler.start();
```

### 优势

1. **零侵入**：toolLoopRunner完全不需要修改
2. **解耦**：auto_voice_reply是独立模块，可以随时启用/禁用
3. **可扩展**：未来可以添加更多handler：
   - `AutoMemoryHandler`：自动记录重要对话
   - `AutoAnalyticsHandler`：自动分析用户意图
   - `AutoNotificationHandler`：自动发送通知
4. **可测试**：handler可以独立测试
5. **可配置**：通过配置文件控制是否启用

### 扩展性示例

未来添加新的后处理功能：

```javascript
// apps/runtime/handlers/autoMemoryHandler.js
class AutoMemoryHandler {
  constructor({ bus, memoryStore }) {
    this.bus = bus;
    this.memoryStore = memoryStore;
  }

  start() {
    this.unsubscribe = this.bus.subscribe('runtime.event', async (envelope) => {
      if (envelope.event !== 'done') return;

      // 自动记录重要对话
      await this.saveImportantConversation(envelope);
    });
  }

  // ...
}
```

### 配置管理

可以在配置文件中统一管理所有handlers：

```yaml
# config/runtime-handlers.yaml
handlers:
  auto_voice_reply:
    enabled: true
    priority: 10

  auto_memory:
    enabled: false
    priority: 20

  auto_analytics:
    enabled: true
    priority: 30
```

## 对比

| 方案 | 侵入性 | 可扩展性 | 可维护性 | 性能 |
|------|--------|----------|----------|------|
| 修改toolLoopRunner | 高 | 低 | 低 | 好 |
| Event-Driven Handler | 零 | 高 | 高 | 好 |

## 结论

**Event-Driven Handler方案是最优雅的解决方案**，它：
- 不修改核心逻辑
- 完全解耦
- 易于扩展
- 符合开闭原则（对扩展开放，对修改关闭）

这是一个通用的架构模式，可以用于所有"在某个事件后自动执行某些操作"的需求。
