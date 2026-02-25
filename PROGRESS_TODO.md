# Runtime Progress & TODO List

Last Updated: 2026-02-26
Branch: `codex/feature/electron-desktop`

## 1. Status Legend

- `TODO`: not started
- `IN_PROGRESS`: actively implementing
- `BLOCKED`: waiting on dependency/decision
- `REVIEW`: implemented, waiting for validation
- `DONE`: validated and merged into integration branch
- `CANCELLED`: dropped by decision

## 2. Current Progress Snapshot

## 2.1 Completed (`DONE`)

1. Session permission model + per-session settings API + frontend selector
- Scope: `low/medium/high` permissions, `/api/sessions/:id/settings`, UI permission select
- Main commits: `a2720fc`, `4eae368`

2. Session workspace isolation across runtime tool execution
- Scope: workspace manager + runtime context propagation (`workspace_root`)
- Main commits: `6b83411`

3. Permission-gated memory/shell behavior
- Scope: permission policy + middleware + adapter-side enforcement + low-permission memory bootstrap gate
- Main commits: `db6b0ff`

4. Skills runtime integration
- Scope: skill loader, eligibility, selector, prompt budget, watcher/snapshot/telemetry, loop injection
- Main commits: `58a6e59`, `d88a761`, `426cb01`

5. Smoke-test skill
- Scope: `skills/test_skill_smoke/SKILL.md` + smoke guide + repository load test
- Main commit: `8e05b36`

6. UI pending-state freeze fix during tool run session switching
- Scope: pending resolution logic in chat websocket handlers
- Main commit: `fe795a9`

## 2.2 Validation Status

- Latest full test result on integration: `npm test` passed (`83/83`).
- Integration branch is intentionally **not merged into `main`** yet.

## 3. TODO / Next Actions

## 3.1 Near-term

1. `REVIEW` Validate integrated branch with manual smoke scenarios
- Owner: user + runtime
- Acceptance:
  - session permission behavior matches matrix
  - workspace boundary behavior matches policy
  - skills selection/prompt injection works with real messages

2. `TODO` Add skills diagnostics API endpoints
- Scope:
  - snapshot version/status
  - selected/dropped skill metadata for recent turns
  - telemetry tail endpoint (read-only)

3. `TODO` Add command-dispatch path from skill directives to explicit tool execution policy
- Scope:
  - define dispatch schema
  - policy guard and approval mode
  - tests for dispatch + rejection cases

4. `TODO` Add per-skill approval policy (`safe/review/danger`) to runtime enforcement
- Scope:
  - enforce before tool call
  - include override/audit trail

## 3.2 Merge Gate (before `main`)

1. `TODO` complete manual acceptance on integration branch
2. `TODO` review unresolved high-risk regression items
3. `TODO` approve integration PR for main merge

## 4. Mandatory Format For New Requirements

All new requirements must be appended to **Section 5** using the exact template below.
Do not add free-form items outside this format.

```md
### [REQ-YYYYMMDD-XXX] <short title>
- Created At: <YYYY-MM-DD HH:mm>
- Source: <user|review|bug|ops>
- Priority: <P0|P1|P2|P3>
- Status: <TODO|IN_PROGRESS|BLOCKED|REVIEW|DONE|CANCELLED>
- Owner: <name/role>
- Branch: <branch-name or TDB>
- Description:
  - <clear requirement statement>
- Acceptance Criteria:
  1. <measurable criterion>
  2. <measurable criterion>
- Impacted Modules:
  - `<path-or-module>`
  - `<path-or-module>`
- Risks/Dependencies:
  - <risk or dependency>
- Plan:
  1. <step>
  2. <step>
- Commits/PR:
  - <commit or PR link, can be TDB>
- Update Log:
  - <YYYY-MM-DD HH:mm> <status change> <note>
```

## 5. Requirement Register

### [REQ-20260225-001] Integration branch manual acceptance before main merge
- Created At: 2026-02-25 21:35
- Source: user
- Priority: P0
- Status: REVIEW
- Owner: runtime
- Branch: `codex/integration/runtime-core`
- Description:
  - Keep current integrated capabilities on integration branch for manual testing.
- Acceptance Criteria:
  1. No merge to `main` during active testing window.
  2. Test baseline remains green (`npm test` all pass).
- Impacted Modules:
  - `apps/gateway/*`
  - `apps/runtime/*`
  - `test/**/*`
- Risks/Dependencies:
  - Requires manual UAT completion.
- Plan:
  1. Maintain integration-only updates.
  2. Collect UAT feedback and patch.
- Commits/PR:
  - `PR #3` (integration only)
- Update Log:
  - 2026-02-25 21:35 REVIEW integration kept open for test.

### [REQ-20260225-002] Add and validate runtime smoke test skill
- Created At: 2026-02-25 21:40
- Source: user
- Priority: P1
- Status: DONE
- Owner: runtime
- Branch: `codex/integration/runtime-core`
- Description:
  - Add a repository skill for smoke validation of skills loading and tool execution.
- Acceptance Criteria:
  1. Skill file is discoverable by runtime loader.
  2. Automated test asserts metadata and path contract.
  3. Manual guide is available for triggering and expected behavior.
- Impacted Modules:
  - `skills/test_skill_smoke/SKILL.md`
  - `test/runtime/skills/repoTestSkill.test.js`
  - `docs/TEST_SKILL_SMOKE_GUIDE.md`
- Risks/Dependencies:
  - Depends on skills runtime being enabled and loaded.
- Plan:
  1. Add smoke skill.
  2. Add test and guide.
- Commits/PR:
  - `8e05b36`
- Update Log:
  - 2026-02-25 21:40 DONE smoke skill implemented and validated.

### [REQ-20260225-003] Bootstrap Electron desktop shell integration
- Created At: 2026-02-25 23:59
- Source: user
- Priority: P1
- Status: REVIEW
- Owner: runtime
- Branch: `codex/feature/electron-desktop`
- Description:
  - Start desktop-client development by adding a runnable Electron shell that hosts gateway UI.
- Acceptance Criteria:
  1. `npm run desktop:start` launches Electron and opens gateway UI.
  2. Desktop process can auto-start local gateway and wait for health readiness.
  3. Gateway wait utility has unit tests for ready and timeout paths.
- Impacted Modules:
  - `apps/desktop/*`
  - `package.json`
  - `test/desktop/*`
- Risks/Dependencies:
  - Depends on Electron package installation in local environment.
- Plan:
  1. Add Electron entrypoint/preload and embedded gateway lifecycle control.
  2. Add gateway health wait utility with test coverage.
  3. Validate with `npm test` and manual desktop launch.
- Commits/PR:
  - TDB
- Update Log:
  - 2026-02-25 23:59 IN_PROGRESS desktop shell bootstrap started.
  - 2026-02-26 00:04 REVIEW code + tests completed (85/85 pass), waiting manual desktop smoke.

### [REQ-20260226-004] Build isolated Desktop Live2D system with unified startup
- Created At: 2026-02-26 01:02
- Source: user
- Priority: P0
- Status: IN_PROGRESS
- Owner: runtime
- Branch: `codex/feature/electron-desktop`
- Description:
  - Build Desktop Live2D subsystem with one-command startup, local RPC control, transparent chat bubble, and strict runtime isolation from main program internals.
- Acceptance Criteria:
  1. `npm run desktop:up` can start the suite and expose usable RPC endpoint.
  2. Runtime loads model from project assets path only, without absolute path dependency.
  3. V1 RPC methods (`state.get`, `param.set`, `chat.show`) complete end-to-end with tests.
- Impacted Modules:
  - `apps/desktop-live2d/*`
  - `scripts/live2d-import.js`
  - `scripts/desktop-up.js`
  - `docs/DESKTOP_LIVE2D_CONSTRUCTION_PLAN.md`
- Risks/Dependencies:
  - Depends on model asset import completeness and Electron runtime stability.
- Plan:
  1. Freeze M0 baseline decisions and stage acceptance criteria.
  2. Implement M1 minimal loop with import/startup/RPC/IPC/renderer bubble.
  3. Expand to M2/M3 control and packaging milestones.
- Commits/PR:
  - TDB
- Update Log:
  - 2026-02-26 01:02 IN_PROGRESS requirement registered and development started.
  - 2026-02-26 01:06 DONE M0 baseline decisions frozen (port/token/import strategy/V1 method scope).
  - 2026-02-26 01:18 REVIEW M1 baseline implementation completed (import/startup/rpc/ipc/bubble + tests pass), waiting GUI smoke.
  - 2026-02-26 01:24 DONE M1 accepted via GUI+RPC smoke (`desktop:up`, `state.get`, `chat.show`).
  - 2026-02-26 01:33 DONE M1 layout hotfix: adaptive auto-fit and bottom alignment resolved oversized/cropped viewport issue.
  - 2026-02-26 01:45 DONE M1 configurability patch: added `config/desktop-live2d.json` for window/layout/clarity tuning and drag-ready right-bottom defaults.
