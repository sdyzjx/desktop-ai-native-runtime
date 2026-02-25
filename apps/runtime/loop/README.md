# ToolLoopRunner

Native ReAct runtime loop with real LLM decisioning.

Loop cycle:
- Ask LLM for next step (final or tool)
- Publish tool call request to EventBus
- Wait for tool result event
- Feed observation back into message context
- Repeat until done/maxStep/error
