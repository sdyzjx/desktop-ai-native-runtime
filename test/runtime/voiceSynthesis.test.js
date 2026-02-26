const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const fs = require('node:fs');

// Test the voice adapter module loads and exports the correct adapter key
test('voice adapter exports voice.synthesize function', () => {
  const voice = require('../../apps/runtime/tooling/adapters/voice');
  assert.ok(typeof voice['voice.synthesize'] === 'function', 'voice.synthesize should be a function');
});

// Test validation: missing text
test('voice.synthesize rejects missing text', async () => {
  const voice = require('../../apps/runtime/tooling/adapters/voice');
  await assert.rejects(
    () => voice['voice.synthesize']({ voice_tag: 'zh' }),
    (err) => {
      assert.match(err.message, /text is required/i);
      return true;
    }
  );
});

// Test validation: invalid voice_tag
test('voice.synthesize rejects invalid voice_tag', async () => {
  const voice = require('../../apps/runtime/tooling/adapters/voice');
  await assert.rejects(
    () => voice['voice.synthesize']({ text: 'hello', voice_tag: 'xx' }),
    (err) => {
      assert.match(err.message, /voice_tag must be one of/i);
      return true;
    }
  );
});

// Test validation: missing DASHSCOPE_API_KEY
test('voice.synthesize rejects when DASHSCOPE_API_KEY is not set', async () => {
  const savedKey = process.env.DASHSCOPE_API_KEY;
  delete process.env.DASHSCOPE_API_KEY;

  const voice = require('../../apps/runtime/tooling/adapters/voice');
  await assert.rejects(
    () => voice['voice.synthesize']({ text: 'hello', voice_tag: 'zh' }),
    (err) => {
      assert.match(err.message, /DASHSCOPE_API_KEY/i);
      return true;
    }
  );

  if (savedKey !== undefined) process.env.DASHSCOPE_API_KEY = savedKey;
});

// Test toolRegistry loads voice adapter without error
test('toolRegistry includes voice.synthesize adapter', () => {
  const { ToolRegistry } = require('../../apps/runtime/tooling/toolRegistry');
  const config = {
    tools: [
      {
        name: 'voice.synthesize',
        type: 'local',
        adapter: 'voice.synthesize',
        description: 'Synthesize voice',
        input_schema: {
          type: 'object',
          properties: { text: { type: 'string' }, voice_tag: { type: 'string' } },
          required: ['text'],
          additionalProperties: false
        }
      }
    ]
  };
  const registry = new ToolRegistry({ config });
  const tool = registry.get('voice.synthesize');
  assert.ok(tool, 'voice.synthesize should be registered');
  assert.equal(tool.name, 'voice.synthesize');
  assert.equal(typeof tool.run, 'function');
});
