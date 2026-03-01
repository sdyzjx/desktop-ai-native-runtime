const WebSocket = require('ws');
const fs = require('fs');
const path = require('path');

// 读取 runtime summary 获取 RPC 连接信息
const summaryPath = path.join(
  require('os').homedir(),
  'yachiyo/data/desktop-live2d/runtime-summary.json'
);

if (!fs.existsSync(summaryPath)) {
  console.error('❌ 找不到 runtime summary 文件');
  console.error('   请先启动 desktop: npm run desktop:up');
  process.exit(1);
}

const summary = JSON.parse(fs.readFileSync(summaryPath, 'utf-8'));
const rpcUrl = summary.rpc.url;
const token = summary.rpc.token;

console.log('📋 RPC 连接信息:');
console.log('   URL:', rpcUrl);
console.log('   Token:', token ? '***' : '(无)');

// 连接到桌宠 RPC
const ws = new WebSocket(rpcUrl, {
  headers: token ? {
    Authorization: `Bearer ${token}`
  } : {}
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

    const timeout = setTimeout(() => {
      ws.off('message', handler);
      reject(new Error('RPC 请求超时'));
    }, 10000);

    const handler = (data) => {
      const msg = JSON.parse(data.toString());
      if (msg.id === id) {
        clearTimeout(timeout);
        ws.off('message', handler);
        if (msg.error) {
          reject(new Error(`${msg.error.message} (code: ${msg.error.code})`));
        } else {
          resolve(msg.result);
        }
      }
    };

    ws.on('message', handler);
    ws.send(JSON.stringify(payload));
    console.log(`   → 发送: ${method}`, params);
  });
}

async function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function runTest() {
  console.log('\n🔍 开始测试：嘴形同步与表情动作冲突\n');
  console.log('=' .repeat(60));

  // 步骤 0：获取当前状态
  console.log('\n📊 步骤 0：获取当前模型状态');
  try {
    const state = await sendRpc('state.get', {});
    console.log('   ✅ 当前状态:', JSON.stringify(state, null, 2));
  } catch (err) {
    console.log('   ⚠️  获取状态失败:', err.message);
  }

  // 步骤 1：播放语音（触发嘴形同步）
  console.log('\n📢 步骤 1：播放测试语音');
  console.log('   提示：如果没有测试音频，这一步会失败，但不影响后续测试');
  try {
    const result = await sendRpc('voice.play.test', {
      audioRef: 'test-audio.wav',
      gatewayUrl: 'http://127.0.0.1:3000'
    });
    console.log('   ✅ 语音播放结果:', result);
  } catch (err) {
    console.log('   ⚠️  语音播放失败:', err.message);
    console.log('   继续测试...');
  }

  // 等待语音播放（假设3秒）
  console.log('\n⏳ 等待 3 秒（模拟语音播放）...');
  await sleep(3000);

  // 步骤 2：语音播放结束后，立即尝试设置表情
  console.log('\n😊 步骤 2：设置表情（smile）');
  try {
    const result = await sendRpc('model.expression.set', {
      name: 'smile'
    });
    console.log('   ✅ 表情设置结果:', result);
  } catch (err) {
    console.error('   ❌ 表情设置失败:', err.message);
  }

  await sleep(2000);

  // 步骤 3：再次尝试设置不同的表情
  console.log('\n😢 步骤 3：设置表情（tear_drop）');
  try {
    const result = await sendRpc('model.expression.set', {
      name: 'tear_drop'
    });
    console.log('   ✅ 表情设置结果:', result);
  } catch (err) {
    console.error('   ❌ 表情设置失败:', err.message);
  }

  await sleep(2000);

  // 步骤 4：尝试播放动作
  console.log('\n🎭 步骤 4：播放动作（TapBody）');
  try {
    const result = await sendRpc('model.motion.play', {
      group: 'TapBody',
      index: 0
    });
    console.log('   ✅ 动作播放结果:', result);
  } catch (err) {
    console.error('   ❌ 动作播放失败:', err.message);
  }

  await sleep(2000);

  // 步骤 5：再次设置表情，验证是否恢复正常
  console.log('\n😄 步骤 5：再次设置表情（smile）验证恢复');
  try {
    const result = await sendRpc('model.expression.set', {
      name: 'smile'
    });
    console.log('   ✅ 表情设置结果:', result);
  } catch (err) {
    console.error('   ❌ 表情设置失败:', err.message);
  }

  console.log('\n' + '='.repeat(60));
  console.log('✅ 测试完成\n');
  console.log('📝 请检查：');
  console.log('   1. 表情是否正常显示？');
  console.log('   2. 动作是否正常播放？');
  console.log('   3. 如果启用了 SSE debugger，请查看事件流');
  console.log('');

  ws.close();
}

ws.on('open', () => {
  console.log('🔗 已连接到桌宠 RPC:', rpcUrl);
  runTest().catch(err => {
    console.error('\n❌ 测试失败:', err);
    ws.close();
    process.exit(1);
  });
});

ws.on('error', (err) => {
  console.error('❌ WebSocket 错误:', err.message);
  process.exit(1);
});

ws.on('close', () => {
  console.log('🔌 WebSocket 连接已关闭');
});
