# desktop-ai-native-runtime

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
