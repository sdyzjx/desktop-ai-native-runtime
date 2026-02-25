---
name: test_skill_smoke
description: Smoke-test skill for validating skills loading and selection in runtime.
---

# test_skill_smoke

## Purpose
Use this skill only for runtime smoke tests.

## Trigger
Activate when the user message explicitly contains `test_skill_smoke`.

## Procedure
1. Call `get_time` to verify tool pipeline connectivity.
2. Optionally call `echo` with a short diagnostic text.
3. Return a concise summary that includes:
   - selected skill name
   - tool call result
   - pass/fail judgment

## Guardrails
- Do not write files.
- Do not call shell commands unless the user explicitly asks.
- Keep output under 6 lines.
