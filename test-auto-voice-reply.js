#!/usr/bin/env node

/**
 * Test script for auto voice reply feature
 *
 * This script simulates a complete runtime flow to test if the model
 * automatically calls voice.tts_aliyun_vc after generating a reply.
 */

const { PersonaContextBuilder } = require('./apps/runtime/persona/personaContextBuilder');
const { loadVoicePolicy } = require('./apps/runtime/tooling/voice/policy');

console.log('=== Auto Voice Reply Feature Test ===\n');

// Step 1: Check voice policy configuration
console.log('Step 1: Checking voice policy configuration...');
const policy = loadVoicePolicy();
console.log('Voice Policy:', JSON.stringify(policy, null, 2));

if (!policy.auto_voice_reply?.enabled) {
  console.error('\n❌ ERROR: auto_voice_reply is not enabled in config/voice-policy.yaml');
  console.error('Please set enabled: true to test this feature.');
  process.exit(1);
}

console.log('✓ Auto voice reply is enabled\n');

// Step 2: Build persona context and check prompt injection
console.log('Step 2: Building persona context...');

const builder = new PersonaContextBuilder({
  configStore: {
    load: () => ({
      defaults: {
        profile: 'yachiyo',
        mode: 'hybrid',
        injectEnabled: true,
        maxContextChars: 3000,
        sharedAcrossSessions: false
      },
      source: { preferredRoot: '.', allowWorkspaceOverride: false },
      writeback: { enabled: false }
    })
  },
  profileStore: {
    load: () => ({
      profile: 'yachiyo',
      addressing: {
        default_user_title: '主人',
        custom_name: '',
        use_custom_first: false
      },
      guidance: {
        prompt_if_missing_name: false,
        remind_cooldown_hours: 24
      }
    })
  },
  guidanceStore: {
    shouldPromptForCustomName: () => false,
    markPrompted: () => ({})
  },
  loader: {
    load: () => ({
      soul: 'You are Yachiyo, a helpful AI assistant.',
      identity: 'You speak naturally and can use voice when appropriate.',
      user: 'The user prefers concise responses.',
      paths: {
        soulPath: 'soul.md',
        identityPath: 'identity.md',
        userPath: 'user.md'
      }
    })
  },
  stateStore: {
    get: () => null,
    set: () => ({})
  },
  memoryStore: null
});

builder.build({ sessionId: 'test-session', input: 'hello' }).then(ctx => {
  console.log('✓ Persona context built successfully\n');

  // Step 3: Verify prompt injection
  console.log('Step 3: Verifying prompt injection...');

  const hasVoiceReplyMode = ctx.prompt.includes('Voice Reply Mode');
  const hasAutoVoiceReplyFlag = ctx.prompt.includes('isAutoVoiceReply');
  const hasCallExample = ctx.prompt.includes('replyMeta');

  console.log('Prompt includes "Voice Reply Mode":', hasVoiceReplyMode ? '✓' : '✗');
  console.log('Prompt includes "isAutoVoiceReply":', hasAutoVoiceReplyFlag ? '✓' : '✗');
  console.log('Prompt includes call example:', hasCallExample ? '✓' : '✗');

  if (!hasVoiceReplyMode || !hasAutoVoiceReplyFlag || !hasCallExample) {
    console.error('\n❌ ERROR: Prompt injection incomplete');
    console.error('\nGenerated prompt:');
    console.error('---');
    console.error(ctx.prompt);
    console.error('---');
    process.exit(1);
  }

  console.log('\n✓ All prompt checks passed\n');

  // Step 4: Show the injected prompt
  console.log('Step 4: Injected Voice Reply Prompt:');
  console.log('---');
  const voiceReplySection = ctx.prompt.split('Voice Reply Mode:')[1]?.split('\n\n')[0];
  if (voiceReplySection) {
    console.log('Voice Reply Mode:' + voiceReplySection);
  }
  console.log('---\n');

  // Step 5: Summary
  console.log('=== Test Summary ===');
  console.log('✓ Configuration loaded correctly');
  console.log('✓ Auto voice reply is enabled');
  console.log('✓ Prompt injection is working');
  console.log('✓ Model will receive instructions to call voice.tts_aliyun_vc');
  console.log('\n=== Next Steps ===');
  console.log('1. Start the gateway: cd apps/gateway && npm start');
  console.log('2. Enable debug mode: curl -X PUT http://localhost:3000/api/debug/mode -H "Content-Type: application/json" -d \'{"enabled": true}\'');
  console.log('3. Monitor events: curl -N "http://localhost:3000/api/debug/events?topics=tool.call.*,voice.*,chain.loop.*"');
  console.log('4. Send a test message and check if voice.tts_aliyun_vc is called');
  console.log('\nIf the model still doesn\'t call TTS, check:');
  console.log('- Is the LLM provider configured correctly?');
  console.log('- Does the model have access to the voice.tts_aliyun_vc tool?');
  console.log('- Are there any errors in the debug stream?');

}).catch(err => {
  console.error('❌ ERROR:', err.message);
  console.error(err.stack);
  process.exit(1);
});
