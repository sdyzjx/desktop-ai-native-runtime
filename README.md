# open-yachiyo

![open-yachiyo cover](assets/readme-cover.jpg)

Native-first desktop AI assistant runtime.

## Current State

This repository now runs in real LLM mode with a decoupled architecture:
- Runtime loop asks LLM for next action (final response or tool call)
- Tool calls are dispatched through event bus topics, not direct method calls
- Input requests enter a JSON-RPC 2.0 message queue before runtime processing

## Quick Start

1. Install dependencies:

```bash
npm install
```

2. Configure model provider YAML (`config/providers.yaml`):

```bash
# edit config/providers.yaml:
# - active_provider
# - providers.<name>.base_url
# - providers.<name>.model
# - providers.<name>.api_key or api_key_env
```

If using `api_key_env`, export the env var (example):

```bash
export OPENAI_API_KEY="<your_api_key>"
```

3. Start service:

```bash
npm run dev
```

4. Health check:

```bash
curl http://localhost:3000/health
```

5. Web UI:
- Chat UI: `http://localhost:3000/`
- Provider config UI: `http://localhost:3000/config.html`

## Desktop Live2D (Replanned)

1. Import model assets into project path:

```bash
npm run live2d:import
```

2. Start desktop suite (gateway + live2d window + RPC):

```bash
npm run desktop:up
```

Runtime summary file:
- `data/desktop-live2d/runtime-summary.json`

UI config file:
- `config/desktop-live2d.json`
- Editable knobs include:
  - window position: `window.placement.anchor` / `margin*`
  - model size/position: `layout.*`
  - clarity: `render.resolutionScale` / `render.maxDevicePixelRatio`

Current baseline (already done):
- transparent desktop Live2D window
- chat panel: history + local input + show/hide + clear + append
- rpc methods: `state.get`, `param.set`, `model.param.set`, `model.param.batchSet`, `model.motion.play`, `model.expression.set`, `chat.show`, `chat.bubble.show`, `chat.panel.show`, `chat.panel.hide`, `chat.panel.append`, `chat.panel.clear`, `tool.list`, `tool.invoke`
- right-bottom placement + drag-ready window + configurable layout/clarity
- renderer-to-main submit event: `live2d:chat:input:submit`
- runtime forwarding: gateway `runtime.*` notification -> desktop `desktop.event` -> renderer final response append
- agent tool-calling surface: `tool.list` + whitelisted `tool.invoke`

Current gaps under active development:
- Phase E stabilization: observability hardening, stress regression, and release checklist

Detailed construction plan:
- `docs/DESKTOP_LIVE2D_CONSTRUCTION_PLAN.md`

## Persistence

Session persistence is enabled by default (file-backed):
- default path: `data/session-store`
- override path: `SESSION_STORE_DIR=/your/path`

Session APIs:
- `GET /api/sessions`
- `GET /api/sessions/:sessionId`
- `GET /api/sessions/:sessionId/events`
- `GET /api/sessions/:sessionId/memory`
- `GET /api/memory`
- `GET /api/memory/search?q=<keyword>`

## Context Management

Each `runtime.run` now assembles multi-turn prompt context from persisted session history:
- Source: latest user/assistant messages from session store
- Injection point: before current input is appended to prompt
- Runtime tunables:
  - `CONTEXT_MAX_MESSAGES` (default: `12`)
  - `CONTEXT_MAX_CHARS` (default: `12000`)

## Long-Term Memory

Long-term memory is now decoupled from runtime finalization and managed by model tool-calls:
- Write flow: model calls `memory_write` tool
- Search flow: model calls `memory_search` tool by keyword query
- Storage: global file-backed memory store (`data/long-term-memory` by default)

Session-start context behavior:
- On new session start, gateway injects:
  1. memory SOP markdown (`docs/memory_sop.md` by default)
  2. bootstrap long-term memory entries (top N, configurable)

Memory tunables:
- `LONG_TERM_MEMORY_DIR` (default: `data/long-term-memory`)
- `MEMORY_BOOTSTRAP_MAX_ENTRIES` (default: `10`)
- `MEMORY_BOOTSTRAP_MAX_CHARS` (default: `2400`)
- `MEMORY_SOP_PATH` (default: `docs/memory_sop.md`)
- `MEMORY_SOP_MAX_CHARS` (default: `8000`)

## Testing

Run the complete test suite:

```bash
npm test
```

CI-equivalent command:

```bash
npm run test:ci
```

Detailed testing guide:
- `docs/TESTING.md`

## Runtime Message Paths

### Legacy Web Debug Message (backward compatible)

WebSocket `/ws` accepts:

```json
{ "type": "run", "input": "现在几点了" }
```

Returns `start` / `event` / `final` messages.

### JSON-RPC 2.0 Queue Input

WebSocket `/ws` also accepts JSON-RPC request:

```json
{
  "jsonrpc": "2.0",
  "id": "req-1",
  "method": "runtime.run",
  "params": {
    "session_id": "demo-session",
    "input": "12+35"
  }
}
```

Runtime sends:
- `runtime.start` notification
- `runtime.event` notifications (plan/tool.call/tool.result/done/tool.error)
- `runtime.final` notification
- JSON-RPC response with final result (when `id` is provided)

## Provider Config API
- `GET /api/config/providers` summary view
- `GET /api/config/providers/config` full parsed config
- `PUT /api/config/providers/config` save full config object
- `GET /api/config/providers/raw` raw YAML text
- `PUT /api/config/providers/raw` save YAML text

Provider config now has a dedicated page (`/config.html`) with graphical form editing and raw YAML editing.

## Repo Layout
- `apps/gateway`: websocket gateway + rpc queue ingress
- `apps/runtime`: event bus, rpc worker, llm reasoner, tool loop
- `apps/realtime`: realtime voice/lipsync services (planned)
- `apps/desktop`: electron + react + live2d shell (planned)
- `packages/*`: shared protocol/contracts placeholders

## Next
See `docs/IMPLEMENTATION_PLAN.md`, `docs/ARCHITECTURE.md`, and `docs/TESTING.md`.

Detailed feature implementation record:
- `docs/LONG_TERM_MEMORY_TOOL_CALL_IMPLEMENTATION.md`
- `docs/SESSION_WORKSPACE_PERMISSION_IMPLEMENTATION.md`
- `docs/SKILLS_RUNTIME_IMPLEMENTATION.md`

Module-level runtime docs:
- `docs/modules/runtime/session-workspace-permission.md`
- `docs/modules/runtime/skills-runtime.md`

Practical usage cases:
- `docs/TEST_SKILL_SMOKE_GUIDE.md`
- `docs/RUNTIME_FEATURE_USAGE_CASES.md`
