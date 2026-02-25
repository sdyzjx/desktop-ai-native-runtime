# Long-Term Memory SOP

## Goal
- Keep durable user preferences and stable project facts in long-term memory.
- Do not store transient chat noise or sensitive secrets.

## Write Policy
- Use `memory_write` only when information is likely useful across future sessions.
- Preferred write targets:
  - stable preferences
  - recurring constraints
  - important project facts/decisions
- Avoid writing:
  - one-off calculations
  - temporary troubleshooting states
  - private credentials or tokens

## Search Policy
- Before answering questions about historical preferences/facts, use `memory_search`.
- Query should include concise keywords.
- Use top relevant entries as supporting context, then answer directly.

## Quality Rules
- Keep memory entries concise and atomic.
- One entry should represent one clear fact.
- Use explicit keywords for better retrieval.
