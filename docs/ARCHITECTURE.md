# Architecture (Native Runtime, Queue + EventBus)

## Core Flow
1. WebSocket receives JSON-RPC 2.0 request (`runtime.run`) or legacy `type=run`.
2. Gateway converts request to RPC envelope and pushes into `RpcInputQueue`.
3. `RuntimeRpcWorker` pops queue items and invokes `ToolLoopRunner`.
4. `ToolLoopRunner` asks LLM provider for next decision.
5. If tool is needed, runner publishes `tool.call.requested` to EventBus.
6. `ToolCallDispatcher` consumes call event, executes tool, publishes `tool.call.result`.
7. Runner waits on EventBus result event, updates context, and continues loop.
8. Final result is emitted as runtime events and JSON-RPC response.

## Decoupling Guarantees
- Runner never invokes tool execution directly.
- Tool execution path is only EventBus-based (`requested -> result`).
- Gateway never calls runtime internals directly; it only enqueues RPC inputs.
- RPC worker is the sole queue consumer and method router.

## Provider Config (YAML)
- Config file: `config/providers.yaml`
- Gateway reads provider config through `ProviderConfigStore` + `LlmProviderManager`
- Debug front-end edits YAML via `/api/config/providers/raw`
- Runner resolves reasoner per request, so provider updates apply immediately without process restart

## Runtime State Machine
- IDLE -> RUNNING -> DONE
- IDLE -> RUNNING -> ERROR
- IDLE -> RUNNING -> ABORTED

## JSON-RPC Contract
- Supported method: `runtime.run`
- Params:
  - `input` (string, required)
  - `session_id` (string, optional)
- Notifications emitted:
  - `runtime.start`
  - `runtime.event`
  - `runtime.final`
- If request includes `id`, worker returns JSON-RPC result object.
