# 嘴形同步与表情动作冲突问题调查方案

版本：v1
日期：2026-03-01
分支：`integration/voice-lipsync`

## 1. 问题描述

**现象**：当 yachiyo 说完话后，可能由于嘴形和动作的冲突，yachiyo 不会响应其他表情动作（如笑、哭）。

**影响范围**：
- 语音播放结束后的表情动作
- 可能影响用户体验和交互流畅性

## 2. 问题分析

### 2.1 可能的根本原因

根据代码分析，发现以下潜在问题：

#### 问题 1：嘴形同步钩子未完全清理

**位置**：`apps/desktop-live2d/renderer/bootstrap.js:464-467`

```javascript
function stopLipSync() {
  stopLipSyncFrame();  // 停止RAF循环
  teardownLipSyncPlaybackListeners();  // 移除音频监听
  // ❌ 缺失：未移除 detachLipSyncTicker
  // ❌ 缺失：未移除 detachLipSyncModelHook
}
```

**影响**：
- `bindLipSyncTicker()` 绑定的 Pixi ticker 钩子未被移除
- `bindLipSyncModelHook()` 绑定的 `beforeModelUpdate` 钩子未被移除
- 即使语音播放结束，`applyLipSyncForCurrentFrame()` 仍在每帧执行

#### 问题 2：嘴形参数持续覆盖表情参数

**位置**：`apps/desktop-live2d/renderer/bootstrap.js:304-340`

```javascript
function applyLipSyncForCurrentFrame() {
  if (lipsyncCurrentMouthOpen <= 0 && Math.abs(lipsyncCurrentMouthForm) <= 1e-4) {
    return;  // 早期返回，但钩子仍然激活
  }

  const coreModel = getCoreModel();
  if (!coreModel) {
    return;
  }

  if (typeof coreModel.addParameterValueById === 'function') {
    // ⚠️ 持续在每帧更新嘴部参数
    coreModel.addParameterValueById(LIPSYNC_MOUTH_PARAM, lipsyncCurrentMouthOpen, 1);
    applyMouthFormToModel(lipsyncCurrentMouthForm);
    // ...
  }
}
```

**影响**：
- 即使 `lipsyncCurrentMouthOpen` 为 0，钩子仍在运行
- 在 `beforeModelUpdate` 事件中，嘴形参数更新可能在表情参数之后执行
- 使用 `addParameterValueById` 可能与表情的 `setParameterValueById` 产生冲突

#### 问题 3：参数更新时序问题

**调用链**：
```
表情动作执行 (setModelExpression)
  -> live2dModel.expression(name)
  -> 设置表情参数（包括嘴部参数）
  -> 模型更新循环
  -> beforeModelUpdate 事件触发
  -> applyLipSyncForCurrentFrame() 执行
  -> 嘴形参数覆盖表情参数 ❌
```

### 2.2 验证假设

需要验证的问题：
1. 语音播放结束后，`detachLipSyncTicker` 和 `detachLipSyncModelHook` 是否仍然存在？
2. `applyLipSyncForCurrentFrame()` 是否在表情动作执行时仍在运行？
3. 嘴形参数更新是否覆盖了表情设置的嘴部参数？

## 3. 调查方案

### 3.1 添加调试事件

在关键位置添加调试事件，使用 SSE debugger 观察：

#### 3.1.1 嘴形同步生命周期事件

在 `apps/desktop-live2d/renderer/bootstrap.js` 中添加：

```javascript
// 语音播放开始
async function handleVoicePlaybackRequest(payload = {}) {
  console.log('[debug] chain.lipsync.playback.start', {
    audioUrl,
    playbackKey,
    timestamp: Date.now()
  });
  // ... 现有代码
}

// 嘴形同步启动
async function startLipSyncWithAudio(audioEl) {
  console.log('[debug] chain.lipsync.sync.start', {
    hasAnalyser: !!graph.analyser,
    timestamp: Date.now()
  });
  // ... 现有代码
}

// 嘴形同步停止
function stopLipSync() {
  console.log('[debug] chain.lipsync.sync.stop', {
    hasTickerHook: !!detachLipSyncTicker,
    hasModelHook: !!detachLipSyncModelHook,
    currentMouthOpen: lipsyncCurrentMouthOpen,
    timestamp: Date.now()
  });
  // ... 现有代码
}

// 嘴形帧更新
function applyLipSyncForCurrentFrame() {
  // 添加采样日志（每秒最多1次）
  const now = Date.now();
  if (now - lastLipSyncDebugLogAt >= 1000) {
    console.log('[debug] chain.lipsync.frame.apply', {
      mouthOpen: lipsyncCurrentMouthOpen,
      mouthForm: lipsyncCurrentMouthForm,
      hasRaf: !!lipsyncRafId,
      timestamp: now
    });
  }
  // ... 现有代码
}
```

#### 3.1.2 表情动作执行事件

```javascript
async function setModelExpression(params) {
  console.log('[debug] chain.live2d.expression.start', {
    name: params?.name,
    hasLipsyncActive: lipsyncCurrentMouthOpen > 0 || !!lipsyncRafId,
    timestamp: Date.now()
  });

  const result = await runActionWithMutex(() => setModelExpressionRaw(params));

  console.log('[debug] chain.live2d.expression.completed', {
    name: params?.name,
    ok: result?.ok,
    timestamp: Date.now()
  });

  return result;
}

async function playModelMotion(params) {
  console.log('[debug] chain.live2d.motion.start', {
    group: params?.group,
    index: params?.index,
    hasLipsyncActive: lipsyncCurrentMouthOpen > 0 || !!lipsyncRafId,
    timestamp: Date.now()
  });

  const result = await runActionWithMutex(() => playModelMotionRaw(params));

  console.log('[debug] chain.live2d.motion.completed', {
    group: params?.group,
    ok: result?.ok,
    timestamp: Date.now()
  });

  return result;
}
```

### 3.2 创建测试脚本

创建一个测试脚本来重现问题：

**文件**：`scripts/test-lipsync-expression-conflict.js`

```javascript
const WebSocket = require('ws');
const fs = require('fs');
const path = require('path');

// 读取 runtime summary 获取 RPC 连接信息
const summaryPath = path.join(
  require('os').homedir(),
  'yachiyo/data/desktop-live2d/runtime-summary.json'
);
const summary = JSON.parse(fs.readFileSync(summaryPath, 'utf-8'));
const rpcUrl = summary.rpc.url;
const token = summary.rpc.token;

// 连接到桌宠 RPC
const ws = new WebSocket(rpcUrl, {
  headers: {
    Authorization: `Bearer ${token}`
  }
});

let requestId = 0;

function sendRpc(method, params) {
  return new Promise((resolve, reject) => {
    const id = `req-${++requestId}`;
    const payload = {
      jsonrpc: '2.0',
      id,
      method,
      params
    };

    const handler = (data) => {
      const msg = JSON.parse(data.toString());
      if (msg.id === id) {
        ws.off('message', handler);
        if (msg.error) {
          reject(new Error(msg.error.message));
        } else {
          resolve(msg.result);
        }
      }
    };

    ws.on('message', handler);
    ws.send(JSON.stringify(payload));
  });
}

async function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function runTest() {
  console.log('🔍 开始测试：嘴形同步与表情动作冲突');

  // 步骤 1：播放语音（触发嘴形同步）
  console.log('\n📢 步骤 1：播放测试语音');
  try {
    await sendRpc('voice.play.test', {
      audioRef: 'test-audio.wav',
      gatewayUrl: 'http://127.0.0.1:3000'
    });
    console.log('✅ 语音播放请求已发送');
  } catch (err) {
    console.log('⚠️  语音播放失败（可能没有测试音频）:', err.message);
  }

  // 等待语音播放（假设3秒）
  console.log('⏳ 等待语音播放...');
  await sleep(3000);

  // 步骤 2：语音播放结束后，立即尝试设置表情
  console.log('\n😊 步骤 2：设置表情（smile）');
  try {
    const result = await sendRpc('model.expression.set', {
      name: 'smile'
    });
    console.log('✅ 表情设置结果:', result);
  } catch (err) {
    console.error('❌ 表情设置失败:', err.message);
  }

  await sleep(2000);

  // 步骤 3：再次尝试设置不同的表情
  console.log('\n😢 步骤 3：设置表情（tear_drop）');
  try {
    const result = await sendRpc('model.expression.set', {
      name: 'tear_drop'
    });
    console.log('✅ 表情设置结果:', result);
  } catch (err) {
    console.error('❌ 表情设置失败:', err.message);
  }

  await sleep(2000);

  // 步骤 4：尝试播放动作
  console.log('\n🎭 步骤 4：播放动作（TapBody）');
  try {
    const result = await sendRpc('model.motion.play', {
      group: 'TapBody',
      index: 0
    });
    console.log('✅ 动作播放结果:', result);
  } catch (err) {
    console.error('❌ 动作播放失败:', err.message);
  }

  console.log('\n✅ 测试完成');
  ws.close();
}

ws.on('open', () => {
  console.log('🔗 已连接到桌宠 RPC');
  runTest().catch(err => {
    console.error('❌ 测试失败:', err);
    ws.close();
    process.exit(1);
  });
});

ws.on('error', (err) => {
  console.error('❌ WebSocket 错误:', err.message);
  process.exit(1);
});
```

### 3.3 使用 SSE Debugger 观察

#### 步骤 1：启动 Gateway 和 Desktop

```bash
# 终端 1：启动 gateway（如果还没启动）
npm run gateway:up

# 终端 2：启动 desktop
npm run desktop:up
```

#### 步骤 2：启用 Debug 模式

```bash
curl -s -X PUT http://127.0.0.1:3000/api/debug/mode \
  -H "content-type: application/json" \
  -d '{"debug":true}'
```

#### 步骤 3：订阅调试事件

```bash
# 终端 3：订阅 Live2D 和嘴形同步相关事件
curl -N "http://127.0.0.1:3000/api/debug/events?topics=chain.lipsync.*,chain.live2d.*,chain.voice.*,tool.call.*"
```

#### 步骤 4：运行测试脚本

```bash
# 终端 4：运行测试
node scripts/test-lipsync-expression-conflict.js
```

#### 步骤 5：观察事件流

在终端 3 中观察事件流，重点关注：

1. **嘴形同步生命周期**：
   - `chain.lipsync.playback.start` - 语音播放开始
   - `chain.lipsync.sync.start` - 嘴形同步启动
   - `chain.lipsync.frame.apply` - 嘴形帧更新（每秒采样）
   - `chain.lipsync.sync.stop` - 嘴形同步停止

2. **表情动作执行**：
   - `chain.live2d.expression.start` - 表情开始设置
   - `chain.live2d.expression.completed` - 表情设置完成
   - `chain.live2d.motion.start` - 动作开始播放
   - `chain.live2d.motion.completed` - 动作播放完成

3. **关键指标**：
   - 语音播放结束后，`chain.lipsync.sync.stop` 是否被调用？
   - `stopLipSync` 时，`hasTickerHook` 和 `hasModelHook` 的值
   - 表情设置时，`hasLipsyncActive` 的值
   - 嘴形帧更新是否在表情设置后仍在继续？

### 3.4 预期观察结果

#### 正常情况（无冲突）：

```
chain.lipsync.playback.start
chain.lipsync.sync.start
chain.lipsync.frame.apply (多次)
chain.lipsync.sync.stop (hasTickerHook: false, hasModelHook: false)
chain.live2d.expression.start (hasLipsyncActive: false)
chain.live2d.expression.completed (ok: true)
```

#### 异常情况（有冲突）：

```
chain.lipsync.playback.start
chain.lipsync.sync.start
chain.lipsync.frame.apply (多次)
chain.lipsync.sync.stop (hasTickerHook: true, hasModelHook: true) ❌
chain.live2d.expression.start (hasLipsyncActive: true) ❌
chain.lipsync.frame.apply (仍在继续) ❌
chain.live2d.expression.completed (ok: true, 但表情可能不可见)
```

## 4. 修复方案

根据调查结果，实施以下修复：

### 方案 A：完全清理嘴形同步钩子

```javascript
function stopLipSync() {
  stopLipSyncFrame();
  teardownLipSyncPlaybackListeners();

  // 新增：移除 ticker 钩子
  if (detachLipSyncTicker) {
    detachLipSyncTicker();
  }

  // 新增：移除模型更新钩子
  if (detachLipSyncModelHook) {
    detachLipSyncModelHook();
  }
}
```

### 方案 B：在 applyLipSyncForCurrentFrame 中添加激活检查

```javascript
function applyLipSyncForCurrentFrame() {
  // 新增：检查 RAF 是否激活
  if (!lipsyncRafId) {
    return;  // RAF 已停止，不应该继续更新参数
  }

  if (lipsyncCurrentMouthOpen <= 0 && Math.abs(lipsyncCurrentMouthForm) <= 1e-4) {
    return;
  }

  // ... 现有逻辑
}
```

### 方案 C：表情动作时暂停嘴形同步

```javascript
let lipsyncSuspended = false;

function applyLipSyncForCurrentFrame() {
  if (lipsyncSuspended) {
    return;
  }
  // ... 现有逻辑
}

async function setModelExpressionRaw(params) {
  // 临时暂停嘴形同步
  const wasActive = lipsyncCurrentMouthOpen > 0 || !!lipsyncRafId;
  if (wasActive) {
    lipsyncSuspended = true;
  }

  try {
    // ... 设置表情
    const result = /* ... */;

    // 延迟恢复嘴形同步
    if (wasActive) {
      setTimeout(() => {
        lipsyncSuspended = false;
      }, 500);
    }

    return result;
  } catch (err) {
    lipsyncSuspended = false;
    throw err;
  }
}
```

## 5. 验收标准

修复后，应满足以下条件：

1. ✅ 语音播放结束后，所有嘴形同步钩子被完全清理
2. ✅ 表情动作可以正常显示，不受嘴形参数干扰
3. ✅ 动作队列正常工作，表情和动作按顺序执行
4. ✅ 再次播放语音时，嘴形同步可以正常启动
5. ✅ 没有内存泄漏或钩子累积

## 6. 后续优化

1. 考虑将嘴形同步和表情动作的参数更新统一到一个优先级系统中
2. 添加参数冲突检测和警告
3. 优化嘴形同步的启动和停止逻辑，减少状态管理复杂度
4. 添加自动化测试覆盖这个场景
