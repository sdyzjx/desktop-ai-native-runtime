const { test } = require('node:test');
const assert = require('node:assert');

test('streaming state initializes correctly', () => {
  const streamingState = {
    active: false,
    sessionId: null,
    traceId: null,
    accumulatedText: '',
    lastUpdateTime: 0
  };

  assert.equal(streamingState.active, false);
  assert.equal(streamingState.sessionId, null);
  assert.equal(streamingState.traceId, null);
  assert.equal(streamingState.accumulatedText, '');
  assert.equal(streamingState.lastUpdateTime, 0);
});

test('streaming state accumulates delta text', () => {
  const streamingState = {
    active: false,
    sessionId: 'test-session',
    traceId: 'test-trace',
    accumulatedText: '',
    lastUpdateTime: 0
  };

  // Simulate delta updates
  streamingState.active = true;
  streamingState.accumulatedText += 'Hello';
  streamingState.lastUpdateTime = Date.now();

  assert.equal(streamingState.active, true);
  assert.equal(streamingState.accumulatedText, 'Hello');

  streamingState.accumulatedText += ' ';
  streamingState.accumulatedText += 'World';

  assert.equal(streamingState.accumulatedText, 'Hello World');
});

test('streaming state resets on session change', () => {
  const streamingState = {
    active: true,
    sessionId: 'session-1',
    traceId: 'trace-1',
    accumulatedText: 'Previous text',
    lastUpdateTime: Date.now()
  };

  // Simulate session change
  const newSessionId = 'session-2';
  const newTraceId = 'trace-2';

  if (streamingState.sessionId !== newSessionId ||
      streamingState.traceId !== newTraceId) {
    streamingState.active = false;
    streamingState.accumulatedText = '';
  }

  streamingState.sessionId = newSessionId;
  streamingState.traceId = newTraceId;

  assert.equal(streamingState.active, false);
  assert.equal(streamingState.accumulatedText, '');
  assert.equal(streamingState.sessionId, 'session-2');
  assert.equal(streamingState.traceId, 'trace-2');
});

test('throttle mechanism prevents excessive updates', async () => {
  let updateCount = 0;
  let throttleTimer = null;

  function throttledUpdate(text) {
    if (throttleTimer) {
      clearTimeout(throttleTimer);
    }

    throttleTimer = setTimeout(() => {
      throttleTimer = null;
      updateCount++;
    }, 50);
  }

  // Simulate rapid delta events
  throttledUpdate('a');
  throttledUpdate('ab');
  throttledUpdate('abc');
  throttledUpdate('abcd');
  throttledUpdate('abcde');

  // Should only trigger once after throttle period
  assert.equal(updateCount, 0);

  await new Promise((resolve) => setTimeout(resolve, 60));

  assert.equal(updateCount, 1);
});

test('bubble state includes streaming flag', () => {
  const bubbleState = {
    visible: true,
    text: 'Hello',
    streaming: true,
    width: 320,
    height: 60
  };

  assert.equal(bubbleState.streaming, true);

  // Finish streaming
  bubbleState.streaming = false;

  assert.equal(bubbleState.streaming, false);
});

test('showBubble accepts streaming parameter', () => {
  function showBubble(params) {
    const text = String(params?.text || '').trim();
    if (!text) {
      return { ok: false };
    }
    const streaming = Boolean(params?.streaming);
    const durationMs = streaming ? 30000 : 5000;

    return {
      ok: true,
      text,
      streaming,
      durationMs
    };
  }

  const streamingResult = showBubble({ text: 'Hello', streaming: true });
  assert.equal(streamingResult.ok, true);
  assert.equal(streamingResult.streaming, true);
  assert.equal(streamingResult.durationMs, 30000);

  const normalResult = showBubble({ text: 'Hello', streaming: false });
  assert.equal(normalResult.ok, true);
  assert.equal(normalResult.streaming, false);
  assert.equal(normalResult.durationMs, 5000);
});

test('streaming does not auto-hide bubble', () => {
  let hideTimerSet = false;

  function showBubble(params) {
    const streaming = Boolean(params?.streaming);

    hideTimerSet = false;
    if (!streaming) {
      hideTimerSet = true;
    }

    return { ok: true, hideTimerSet };
  }

  const streamingResult = showBubble({ text: 'Hello', streaming: true });
  assert.equal(streamingResult.hideTimerSet, false);

  const normalResult = showBubble({ text: 'Hello', streaming: false });
  assert.equal(normalResult.hideTimerSet, true);
});

test('message.delta event structure validation', () => {
  const deltaEvent = {
    type: 'message.delta',
    timestamp: Date.now(),
    data: {
      session_id: 'test-session',
      trace_id: 'test-trace',
      step_index: 1,
      delta: 'Hello'
    }
  };

  assert.equal(deltaEvent.type, 'message.delta');
  assert.ok(deltaEvent.data.session_id);
  assert.ok(deltaEvent.data.trace_id);
  assert.equal(typeof deltaEvent.data.delta, 'string');
});

test('runtime.final completes streaming correctly', () => {
  const streamingState = {
    active: true,
    sessionId: 'test-session',
    traceId: 'test-trace',
    accumulatedText: 'Hello Wor',
    lastUpdateTime: Date.now()
  };

  const finalEvent = {
    type: 'runtime.final',
    data: {
      output: 'Hello World!',
      session_id: 'test-session',
      trace_id: 'test-trace'
    }
  };

  // Simulate final handling
  let finalText = null;
  if (streamingState.active) {
    finalText = finalEvent.data.output;
    streamingState.active = false;
    streamingState.accumulatedText = '';
  }

  assert.equal(finalText, 'Hello World!');
  assert.equal(streamingState.active, false);
  assert.equal(streamingState.accumulatedText, '');
});

test('non-streaming mode works without delta', () => {
  const streamingState = {
    active: false,
    sessionId: null,
    traceId: null,
    accumulatedText: '',
    lastUpdateTime: 0
  };

  const finalEvent = {
    type: 'runtime.final',
    data: {
      output: 'Complete response',
      session_id: 'test-session',
      trace_id: 'test-trace'
    }
  };

  // Simulate non-streaming final handling
  let displayedText = null;
  if (!streamingState.active) {
    displayedText = finalEvent.data.output;
  }

  assert.equal(displayedText, 'Complete response');
  assert.equal(streamingState.active, false);
});

test('empty delta is ignored', () => {
  const streamingState = {
    active: false,
    sessionId: 'test-session',
    traceId: 'test-trace',
    accumulatedText: '',
    lastUpdateTime: 0
  };

  const emptyDelta = '';
  const whitespaceOnlyDelta = '   ';

  // Simulate delta handling
  function handleDelta(delta) {
    const trimmed = String(delta || '').trim();
    if (!trimmed) {
      return false;
    }
    streamingState.accumulatedText += trimmed;
    return true;
  }

  assert.equal(handleDelta(emptyDelta), false);
  assert.equal(handleDelta(whitespaceOnlyDelta), false);
  assert.equal(streamingState.accumulatedText, '');

  assert.equal(handleDelta('Hello'), true);
  assert.equal(streamingState.accumulatedText, 'Hello');
});
