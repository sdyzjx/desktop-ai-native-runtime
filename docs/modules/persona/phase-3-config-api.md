# Persona Phase 3 — Profile Config API

## Goal
提供便捷的运行时配置入口，让用户可直接查看/修改全局人格配置。

## API
### GET `/api/persona/profile`
- Returns normalized global persona profile.
- If profile file missing, auto-creates default profile.

### PUT `/api/persona/profile`
- Body:
```json
{ "profile": { "addressing": { "custom_name": "..." } } }
```
- Applies patch merge and persists to global profile path.
- Returns normalized updated profile.

## Runtime Wiring
- `apps/gateway/server.js`
  - Adds singleton `personaProfileStore`.
  - Reuses same store for `PersonaContextBuilder` to guarantee immediate consistency.

## Validation
- Extended integration test: `test/integration/gateway.e2e.test.js`
  - Verify default profile includes `default_user_title=主人`
  - Verify patching `custom_name` works
  - Verify invalid patch returns 400
