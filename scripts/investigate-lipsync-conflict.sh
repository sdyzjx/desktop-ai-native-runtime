#!/bin/bash

# 嘴形同步与表情动作冲突调查脚本
# 使用 SSE Debugger 观察系统行为

set -e

GATEWAY_URL="http://127.0.0.1:3000"

echo "🔍 嘴形同步与表情动作冲突调查工具"
echo "======================================"
echo ""

# 检查 Gateway 是否运行
echo "📡 检查 Gateway 状态..."
if ! curl -s "${GATEWAY_URL}/health" > /dev/null 2>&1; then
  echo "❌ Gateway 未运行"
  echo "   请先启动: npm run gateway:up"
  exit 1
fi

HEALTH=$(curl -s "${GATEWAY_URL}/health")
echo "✅ Gateway 正在运行"
echo ""

# 检查 Debug 模式
DEBUG_MODE=$(echo "$HEALTH" | jq -r '.debug_stream.debug_mode // false')
echo "🐛 Debug 模式: $DEBUG_MODE"

if [ "$DEBUG_MODE" != "true" ]; then
  echo "⚠️  Debug 模式未启用，正在启用..."
  curl -s -X PUT "${GATEWAY_URL}/api/debug/mode" \
    -H "content-type: application/json" \
    -d '{"debug":true}' | jq
  echo "✅ Debug 模式已启用"
fi

echo ""
echo "======================================"
echo "📋 调查步骤："
echo ""
echo "1. 在一个终端中运行以下命令订阅调试事件："
echo ""
echo "   curl -N \"${GATEWAY_URL}/api/debug/events\" | grep -E 'lipsync|live2d|voice|expression|motion'"
echo ""
echo "2. 在另一个终端中运行测试脚本："
echo ""
echo "   node scripts/test-lipsync-expression-conflict.js"
echo ""
echo "3. 观察调试事件流，重点关注："
echo "   - 嘴形同步的启动和停止"
echo "   - 表情动作的执行时机"
echo "   - 是否有参数冲突"
echo ""
echo "======================================"
echo ""

# 询问是否立即开始订阅
read -p "是否立即开始订阅调试事件？(y/n) " -n 1 -r
echo ""

if [[ $REPLY =~ ^[Yy]$ ]]; then
  echo "📡 开始订阅调试事件..."
  echo "   (按 Ctrl+C 停止)"
  echo ""

  # 订阅所有相关事件
  curl -N "${GATEWAY_URL}/api/debug/events" | \
    grep --line-buffered -E 'lipsync|live2d|voice|expression|motion|tool\.call' | \
    jq --unbuffered -r '
      .ts as $ts |
      .topic as $topic |
      .payload as $payload |
      "\($ts | strftime("%H:%M:%S")) [\($topic)] \($payload | tostring)"
    '
else
  echo "👋 调查工具已准备就绪"
  echo "   请按照上述步骤手动执行"
fi
