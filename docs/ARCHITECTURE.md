# Architecture (V3 Native Runtime)

## Core Flow
1. DesktopInputEvent enters EventBus
2. SessionContextBuilder builds ProviderRequest
3. ToolLoopRunner executes ReAct step loop
4. Executor dispatches tool calls
5. ToolResult observed and fed back
6. MessageEventResult dispatched to UI + realtime core

## Runtime State Machine
- IDLE -> RUNNING -> DONE
- IDLE -> RUNNING -> ERROR
- IDLE -> RUNNING -> ABORTED

## Tool Dispatch Types
- local
- mcp
- handoff
- background (returns task_id immediately)
