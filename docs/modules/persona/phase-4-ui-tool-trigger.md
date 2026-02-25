# Persona Phase 4 — Frontend Panel + Tool Trigger (Global & Permission-agnostic)

## Goal
- 在前端提供 Persona 设置面板
- 当用户表达“修改人格/修改称呼/叫我xxx”等意图时，触发工具调用更新 persona
- 该操作在 low/medium/high 所有 permission 下可执行

## Frontend
- Updated `apps/gateway/public/index.html`
  - Added Persona panel in sidebar
  - Inputs:
    - `personaCustomName`
    - `savePersonaBtn`
    - `personaHint`
- Updated `apps/gateway/public/chat.js`
  - `loadPersonaProfile()` calls `GET /api/persona/profile`
  - `savePersonaProfile()` calls `PUT /api/persona/profile`
- Updated `apps/gateway/public/chat.css`
  - persona panel/input/hint styles

## Tool Trigger
- Added tool adapter in `apps/runtime/tooling/adapters/builtin.js`
  - `builtin.persona_update_via_curl`
  - Uses curl to call `PUT /api/persona/profile`
- Added tool in `config/tools.yaml`
  - `persona.update_profile`
- Updated runner instruction in `apps/runtime/loop/toolLoopRunner.js`
  - Adds explicit guidance to call `persona.update_profile` on persona/addressing intent
  - Adds keyword-based hint for persona modification intents

## Permission Behavior
- Updated `apps/runtime/security/sessionPermissionPolicy.js`
  - `persona.update_profile` always allowed (low/medium/high)

## Validation
- Updated tests:
  - `test/runtime/tooling.test.js` adds curl tool execution test
  - `test/runtime/sessionPermissionPolicy.test.js` adds permission matrix checks
  - `test/runtime/toolLoopRunner.test.js` adds persona keyword hint assertion
