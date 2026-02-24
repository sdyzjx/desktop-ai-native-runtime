# desktop-ai-native-runtime

Native-first desktop AI assistant runtime.

## Goals
- Electron + React + Live2D desktop shell
- Native Agentic ReAct loop runtime (no LangChain)
- Unified tool executor (local / mcp / handoff / background)
- Event bus driven async orchestration
- Realtime core for ASR/TTS/Lipsync/Interrupt

## Repo Layout
- `apps/desktop`: UI shell (ChatBox + Live2D)
- `apps/runtime`: core agentic runtime
- `apps/realtime`: realtime voice/lipsync services
- `apps/gateway`: API/event bus bridge
- `packages/protocols`: shared event schemas
- `packages/tool-contracts`: tool io contracts
- `packages/mcp-skills-adapter`: mcp/skills bridge
- `packages/session-store`: persistence + checkpoints

## Next
See `docs/IMPLEMENTATION_PLAN.md` and `docs/ARCHITECTURE.md`.
