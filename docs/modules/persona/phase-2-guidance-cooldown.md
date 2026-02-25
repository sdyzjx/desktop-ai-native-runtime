# Persona Phase 2 — Missing-Name Guidance with Cooldown

## Goal
当用户未配置自定义称呼时，机器人自动引导一次；避免每轮重复打扰。

## Implementation
- Added `apps/runtime/persona/personaGuidanceStateStore.js`
  - State file: `~/.openclaw/workspace/persona/state.json`
  - API:
    - `shouldPromptForCustomName(profile)`
    - `markPrompted()`
- Updated `PersonaContextBuilder`
  - Adds gentle guidance instruction into system prompt when needed
  - Records prompt timestamp to respect cooldown window

## Behavior
- If `addressing.custom_name` is empty and guidance enabled:
  - assistant gets instruction to ask user preferred addressing
- If prompted recently (`remind_cooldown_hours`):
  - no repeated guidance until cooldown expires

## Validation
- Added `test/runtime/persona/personaGuidanceStateStore.test.js`
- Updated `test/runtime/persona/personaContextBuilder.test.js`
