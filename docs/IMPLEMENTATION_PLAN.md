# Core Framework Construction Plan

## Phase P0 (MVP loop)
- Implement event protocol + trace fields
- Implement ToolLoopRunner minimal step loop
- Implement LocalTool execution + result feedback
- Build CLI test harness for loop simulation

## Phase P1 (runtime hardening)
- Add tool dispatcher with timeout/retry/cancel
- Add max_step guard + forced summarize strategy
- Add SessionStore + ContextCompressor
- Add realtime bridge events (tts/lipsync/interrupt)

## Phase P2 (expansion)
- Add MCP adapter
- Add handoff/sub-agent mechanism
- Add policy/sandbox layer
- Add visual event source integration

## Acceptance
- fast-path response < 1.2s
- interrupt effect < 200ms
- 20-step stability no state leak
