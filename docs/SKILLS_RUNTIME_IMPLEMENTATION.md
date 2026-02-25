# Skills Runtime Implementation (Phase 1-8)

## Branch
- `feature/skills-integration-research`

## What was implemented

### Phase 1: Yachiyo runtime paths + config
- `config/skills.yaml`
- `apps/runtime/skills/runtimePaths.js`
- `apps/runtime/skills/skillConfigStore.js`

### Phase 2: Multi-source loader
- `apps/runtime/skills/frontmatter.js`
- `apps/runtime/skills/skillLoader.js`
- Precedence: `workspace > ~/yachiyo/skills > extraDirs`

### Phase 3: Eligibility gating
- `apps/runtime/skills/skillEligibility.js`
- Checks: `enabled`, `requires_env`, `requires_bins`, `requires_any_bins`, `requires_config`, `os`

### Phase 4: Multi-stage limits
- `apps/runtime/skills/skillPromptBudgeter.js`
- Discovery/load limits wired in loader
- Prompt count+char budget clipping (binary search)

### Phase 5: Trigger selector
- `apps/runtime/skills/skillSelector.js`
- Hybrid trigger scoring + threshold + cooldown + risk guard

### Phase 6: Runner integration
- `apps/runtime/skills/skillRuntimeManager.js`
- `apps/runtime/loop/toolLoopRunner.js` injects skills system prompt

### Phase 7: Watch/snapshot/telemetry
- `apps/runtime/skills/skillWatcher.js`
- `apps/runtime/skills/skillSnapshotStore.js`
- `apps/runtime/skills/skillTelemetry.js`
- `apps/gateway/server.js` wires `SkillRuntimeManager` in runtime

## Reliability guards
- Hard eligibility before trigger selection
- Prompt budget clipping prevents overflow
- Snapshot cache with version bump on skill file changes
- Telemetry JSONL logs under `~/yachiyo/logs/skills-telemetry.jsonl`

## Test status
- `npm test`
- Result: all tests passing (70/70)

## Follow-up items
1. Add explicit command-dispatch from skill -> tool executor
2. Add per-skill approval policy (`safe/review/danger`) to runtime enforcement
3. Add API endpoints for skills diagnostics and snapshot status
