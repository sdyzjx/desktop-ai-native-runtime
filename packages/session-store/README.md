# Session Store

File-backed persistence for runtime sessions.

## Scope

Current implementation persists:
- session metadata (title, created/updated time)
- message history (user/assistant)
- runtime event stream
- run records (input/output/state/trace)
- session-local memory snapshot field (reserved/compatibility)

## Storage Layout

Default root directory:
- `data/session-store`

Files:
- `data/session-store/index.json` (session summaries)
- `data/session-store/sessions/<session_id>.json` (full session data)

## Runtime Integration

Hooks are triggered by `RuntimeRpcWorker`:
- `buildPromptMessages` -> load SOP/bootstrap context (new session) + recent history into LLM prompt context
- `onRunStart` -> ensure session + append user message
- `onRuntimeEvent` -> append runtime event
- `onRunFinal` -> append assistant message + run record

## Environment Variables

- `SESSION_STORE_DIR`: override storage directory path
- `CONTEXT_MAX_MESSAGES`: max historical user/assistant messages injected per run (default 12)
- `CONTEXT_MAX_CHARS`: max total characters injected per run (default 12000)
- `MEMORY_BOOTSTRAP_MAX_ENTRIES`: max long-term memory entries injected on new session (default 10)
- `MEMORY_BOOTSTRAP_MAX_CHARS`: max injected memory chars on new session (default 2400)
- `MEMORY_SOP_PATH`: markdown file path for memory SOP (default `docs/memory_sop.md`)
- `MEMORY_SOP_MAX_CHARS`: max SOP chars injected on new session (default 8000)
- `LONG_TERM_MEMORY_DIR`: global long-term memory store dir (default `data/long-term-memory`)

## API Exposure (Gateway)

- `GET /api/sessions`
- `GET /api/sessions/:sessionId`
- `GET /api/sessions/:sessionId/events`
- `GET /api/sessions/:sessionId/memory`
- `GET /api/memory`
- `GET /api/memory/search?q=<keyword>`
