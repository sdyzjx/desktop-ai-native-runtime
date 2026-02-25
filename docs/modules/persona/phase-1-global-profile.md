# Persona Phase 1 — Global Yachiyo Profile & Default Addressing

## Goal
- 默认启用八千代人格
- 默认称呼用户为“主人”
- 全会话共享人格状态（mode/addressing）

## Implementation
- Added `apps/runtime/persona/personaProfileStore.js`
  - Global profile path (repo default): `persona/profile.yaml`
  - Auto-create default profile if missing
  - Supports read/save with normalization
- Updated `apps/runtime/persona/personaContextBuilder.js`
  - Loads global persona profile each turn
  - Injects `Address user as: ...` into system prompt
  - Keeps shared persona mode via shared session key

## Default Profile
```yaml
version: 1
profile: yachiyo
addressing:
  default_user_title: 主人
  custom_name: ""
  use_custom_first: true
guidance:
  prompt_if_missing_name: true
  remind_cooldown_hours: 24
```

## Validation
- New tests:
  - `test/runtime/persona/personaProfileStore.test.js`
- Updated tests:
  - `test/runtime/persona/personaContextBuilder.test.js`

## Notes
- 该阶段不依赖 session permission；属于全局 persona 注入层。
