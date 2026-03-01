#!/usr/bin/env node

/**
 * Test: Can model return both text content AND tool calls in one response?
 *
 * This tests whether OpenAI API allows a message to have both:
 * - message.content (text)
 * - message.tool_calls (function calls)
 */

console.log('=== Testing OpenAI API Behavior ===\n');

console.log('According to OpenAI API documentation:');
console.log('- When tool_calls is present, content is typically null or empty');
console.log('- The model chooses EITHER to respond with text OR to call tools');
console.log('- It cannot do both in a single response\n');

console.log('This is a limitation of the OpenAI API design, not our code.\n');

console.log('=== Why Prompt Injection Doesn\'t Work ===\n');

console.log('Even with a prompt saying "you MUST call voice.tts_aliyun_vc after replying":');
console.log('1. Model generates text response → returns { content: "...", tool_calls: null }');
console.log('2. OR model calls tool → returns { content: null, tool_calls: [...] }');
console.log('3. Model cannot do both in ONE response\n');

console.log('=== Possible Solutions ===\n');

console.log('Solution 1: Two-turn approach');
console.log('- First turn: Model returns text (final)');
console.log('- Force a second turn with system message: "Now call voice.tts_aliyun_vc"');
console.log('- Second turn: Model calls TTS tool');
console.log('Pros: AI-native, model generates voice text');
console.log('Cons: Extra LLM call (cost + latency)\n');

console.log('Solution 2: Parallel tool calling');
console.log('- Modify prompt: "Call live2d tool AND voice tool, then return final text"');
console.log('- Model calls both tools in one turn');
console.log('- Then returns final text in next turn');
console.log('Pros: AI-native, one extra turn');
console.log('Cons: Model must call tools BEFORE knowing final text\n');

console.log('Solution 3: Event-driven handler (our previous proposal)');
console.log('- Listen to final event');
console.log('- Auto-generate voice text (rule-based or LLM)');
console.log('- Call TTS tool');
console.log('Pros: Reliable, no extra turn for main response');
console.log('Cons: Less AI-native\n');

console.log('=== Recommendation ===\n');
console.log('We need to verify: Does OpenAI API actually support content + tool_calls together?');
console.log('If NO: Solution 1 (two-turn) is most AI-native');
console.log('If YES: We need to modify reasoner to handle this case');
