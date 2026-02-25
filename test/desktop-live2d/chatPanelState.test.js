const test = require('node:test');
const assert = require('node:assert/strict');

const {
  createInitialState,
  appendMessage,
  clearMessages,
  setPanelVisible
} = require('../../apps/desktop-live2d/renderer/chatPanelState');

test('createInitialState applies defaults from config', () => {
  const state = createInitialState({
    defaultVisible: true,
    maxMessages: 3,
    inputEnabled: false
  });

  assert.equal(state.visible, true);
  assert.equal(state.maxMessages, 3);
  assert.equal(state.inputEnabled, false);
  assert.deepEqual(state.messages, []);
});

test('appendMessage keeps latest N records when max reached', () => {
  let state = createInitialState({ maxMessages: 2, defaultVisible: true, inputEnabled: true });
  state = appendMessage(state, { role: 'user', text: 'one', timestamp: 1 }, 'assistant');
  state = appendMessage(state, { role: 'assistant', text: 'two', timestamp: 2 }, 'assistant');
  state = appendMessage(state, { role: 'system', text: 'three', timestamp: 3 }, 'assistant');

  assert.equal(state.messages.length, 2);
  assert.equal(state.messages[0].text, 'two');
  assert.equal(state.messages[1].text, 'three');
});

test('clearMessages and setPanelVisible update state as expected', () => {
  let state = createInitialState({ maxMessages: 10, defaultVisible: false, inputEnabled: true });
  state = appendMessage(state, { role: 'assistant', text: 'hello' }, 'assistant');
  state = setPanelVisible(state, true);
  assert.equal(state.visible, true);
  assert.equal(state.messages.length, 1);

  state = clearMessages(state);
  assert.equal(state.messages.length, 0);
});
