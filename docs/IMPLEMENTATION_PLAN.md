# Core Framework Construction Plan

## Completed in this iteration
- Added real LLM reasoner using OpenAI-compatible `chat/completions`
- Added YAML-based provider registry (`config/providers.yaml`)
- Added provider manager APIs and debug-page YAML editor for online updates
- Introduced runtime EventBus abstraction
- Reworked tool execution to event-driven dispatch (`tool.call.requested` / `tool.call.result`)
- Added JSON-RPC 2.0 input queue (`RpcInputQueue`) and queue consumer worker (`RuntimeRpcWorker`)
- Updated gateway to route all runtime input through RPC queue
- Kept backward compatibility for debug UI `type=run`

## Next (P1 hardening)
- Add timeout/retry/cancel policy on tool dispatcher per tool type
- Add queue persistence and replay strategy for crash recovery
- Add idempotency key / dedupe in RPC worker for repeated request ids
- Add event schema validation before publishing to bus
- Add automated tests for JSON-RPC error codes and queue saturation behavior

## Next (P2 expansion)
- Add MCP tool adapter behind same event bus contract
- Add handoff/background task dispatcher with `task_id`
- Add session store + context compression
- Add realtime bridge events (tts/lipsync/interrupt)
