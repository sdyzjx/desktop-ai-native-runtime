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

- Latest full test result on feature branch: `npm test` passed (`150/150`).
- Integration branch is intentionally **not merged into `main`** yet.

## 3. TODO / Next Actions

## 3.1 Near-term

1. `DONE` Execute Desktop Live2D Phase A replan baseline
- Owner: runtime
- Acceptance:
  - chat panel / RPC event stream / tool-calling exposure are all reflected in design docs
  - requirement register and staged acceptance are synced

2. `DONE` Implement Phase B chat panel UI
- Scope:
  - renderer chat panel (`history + input + visibility`)
  - rpc methods `chat.panel.*`
  - tests for history truncation / append / ipc submit

3. `DONE` Implement Phase C RPC message forwarding
- Scope:
  - runtime event -> desktop event bridge
  - event notification contract (`desktop.event`)
  - tests for ordering, reconnection, and timeout handling

4. `DONE` Implement Phase D model-control tool-calling exposure
- Scope:
  - `tool.list` / `tool.invoke`
  - strict tool whitelist + schema + rate limit + audit log
  - tests for mapping success and rejection paths

5. `REVIEW` Execute Phase E stabilization and release hardening
- Scope:
  - stress and regression checklist
  - telemetry/trace observability completion
  - packaging and release sanity verification

6. `DONE` Implement Phase F session sync + chat panel interaction polish
- Scope:
  - click-character to toggle chat panel (default hidden)
  - panel anchor/mask update to avoid face blocking
  - desktop startup new session + `/new` command session switch
  - web-side session/message sync for desktop conversation visibility

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
- Status: DONE
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
  - `d89e99f` (M0 doc baseline)
  - `d9258f8` (M1 implementation baseline)
  - `392243d` (layout hotfix)
  - `59dc03a` (configurability patch)
- Update Log:
  - 2026-02-26 01:02 IN_PROGRESS requirement registered and development started.
  - 2026-02-26 01:06 DONE M0 baseline decisions frozen (port/token/import strategy/V1 method scope).
  - 2026-02-26 01:18 REVIEW M1 baseline implementation completed (import/startup/rpc/ipc/bubble + tests pass), waiting GUI smoke.
  - 2026-02-26 01:24 DONE M1 accepted via GUI+RPC smoke (`desktop:up`, `state.get`, `chat.show`).
  - 2026-02-26 01:33 DONE M1 layout hotfix: adaptive auto-fit and bottom alignment resolved oversized/cropped viewport issue.
  - 2026-02-26 01:45 DONE M1 configurability patch: added `config/desktop-live2d.json` for window/layout/clarity tuning and drag-ready right-bottom defaults.
  - 2026-02-26 02:16 DONE baseline scope closed and moved follow-up capabilities to REQ-20260226-005.

### [REQ-20260226-005] Desktop Live2D phase expansion: chat panel + RPC forwarding + tool-calling
- Created At: 2026-02-26 02:16
- Source: user
- Priority: P0
- Status: IN_PROGRESS
- Owner: runtime
- Branch: `codex/feature/electron-desktop`
- Description:
  - Replan Desktop Live2D to include missing core capabilities: full chat panel, standardized RPC message forwarding pipeline, and secure model-control tool-calling exposure for Agent integration.
- Acceptance Criteria:
  1. Chat panel supports history append/clear/show/hide and optional local input submission.
  2. RPC layer supports both request/response and event notifications (`desktop.event`) with end-to-end forwarding tests.
  3. Tool-calling surface is exposed via `tool.list` / `tool.invoke` with whitelist, schema validation, and rejection-path tests.
  4. Construction docs, README, and progress register remain synchronized per phase with commit traceability.
- Impacted Modules:
  - `apps/desktop-live2d/main/*`
  - `apps/desktop-live2d/renderer/*`
  - `test/desktop-live2d/*`
  - `docs/DESKTOP_LIVE2D_CONSTRUCTION_PLAN.md`
  - `README.md`
- Risks/Dependencies:
  - Runtime event schema may evolve; adapter layer must be versioned to avoid desktop-side coupling.
  - Tool-calling without strict governance can cause control contention and unstable model behavior.
- Plan:
  1. Phase A: freeze expanded protocol and test plan.
  2. Phase B: deliver chat panel UI and rpc methods.
  3. Phase C: deliver runtime-to-desktop event forwarding pipeline.
  4. Phase D: deliver tool-calling exposure and model-control mapping.
  5. Phase E: stabilization, observability, and release smoke.
- Commits/PR:
  - `999237a` (Phase A docs replan)
  - `a401e63` (Phase B chat panel + RPC + submit IPC)
  - `a329295` (Phase C/D runtime forwarding + tool-calling bridge)
  - `13eb4a1` (Phase E smoke script + smoke tests + docs sync)
  - `5df6279` (progress trace sync)
- Update Log:
  - 2026-02-26 02:16 IN_PROGRESS requirement created from user feedback.
  - 2026-02-26 02:16 DONE Phase A docs replanned and synchronized (`construction plan`, `README`, `progress register`).
  - 2026-02-26 02:20 DONE Phase B delivered (`chat.panel.*` rpc + chat panel UI + submit IPC + tests).
  - 2026-02-26 02:34 DONE Phase C delivered (gateway runtime notification forwarding to `desktop.event` + renderer final sync).
  - 2026-02-26 02:34 DONE Phase D delivered (`tool.list`/`tool.invoke` + `model.*` control methods + whitelist tests).
  - 2026-02-26 02:34 IN_PROGRESS Phase E stabilization started.
  - 2026-02-26 02:46 REVIEW Phase E automation baseline delivered (`desktop:smoke` + smoke tests + regression docs sync), waiting manual release smoke.

### [REQ-20260226-006] Desktop chat panel interaction + cross-end session sync
- Created At: 2026-02-26 03:02
- Source: user
- Priority: P0
- Status: REVIEW
- Owner: runtime
- Branch: `codex/feature/electron-desktop`
- Description:
  - Make desktop chat panel non-resident (show on character click), avoid face overlap, and synchronize desktop messages/replies to web chat with startup session bootstrap and `/new` session command.
- Acceptance Criteria:
  1. Desktop chat panel default hidden and toggles on Live2D character click.
  2. Default chat panel location does not cover character face region.
  3. Desktop startup creates fresh gateway session; `/new` creates and switches to fresh session.
  4. Web chat can observe desktop sessions/messages/replies via server sync.
- Impacted Modules:
  - `apps/desktop-live2d/main/gatewayRuntimeClient.js`
  - `apps/desktop-live2d/main/desktopSuite.js`
  - `apps/desktop-live2d/main/config.js`
  - `apps/desktop-live2d/renderer/bootstrap.js`
  - `apps/desktop-live2d/renderer/index.html`
  - `apps/gateway/public/chat.js`
  - `config/desktop-live2d.json`
  - `test/desktop-live2d/*.test.js`
- Risks/Dependencies:
  - Cross-end sync currently uses poll loop; temporary network failures may delay visibility by one interval.
  - UI overlap still depends on custom model proportions and user layout config.
- Plan:
  1. Add desktop session bootstrap + `/new` command pipeline in main runtime client/suite.
  2. Adjust renderer/chat panel interaction and default placement.
  3. Add web sync loop and follow-latest behavior for server sessions.
  4. Add/refresh tests and run full regression.
- Commits/PR:
  - TDB
- Update Log:
  - 2026-02-26 03:02 IN_PROGRESS requirement registered from latest user UX feedback.
  - 2026-02-26 03:06 REVIEW implementation + tests completed (`npm test` 142/142), waiting user desktop UX verification.

### [REQ-20260226-007] Desktop pet hide/close controls and compact window mode
- Created At: 2026-02-26 03:22
- Source: user
- Priority: P0
- Status: REVIEW
- Owner: runtime
- Branch: `codex/feature/electron-desktop`
- Description:
  - Add explicit hide/close controls for desktop pet window without shutting down gateway service, and auto-shrink pet window when chat panel is hidden.
- Acceptance Criteria:
  1. Chat panel header provides `Hide` and `Close` controls.
  2. `Hide` and `Close` do not stop local gateway backend process.
  3. Chat panel visibility changes trigger expanded/compact window size switch.
  4. Window compact behavior is configurable in `config/desktop-live2d.json`.
- Impacted Modules:
  - `apps/desktop-live2d/main/desktopSuite.js`
  - `apps/desktop-live2d/main/preload.js`
  - `apps/desktop-live2d/main/electronMain.js`
  - `apps/desktop-live2d/renderer/index.html`
  - `apps/desktop-live2d/renderer/bootstrap.js`
  - `apps/desktop-live2d/main/config.js`
  - `config/desktop-live2d.json`
  - `test/desktop-live2d/desktopSuite.test.js`
  - `test/desktop-live2d/config.test.js`
- Risks/Dependencies:
  - Closing pet window currently keeps process/gateway alive but does not auto-recreate window.
  - Compact window defaults may require per-model fine tuning.
- Plan:
  1. Add new IPC channels for window control and chat panel visibility.
  2. Add renderer controls and visibility reporting.
  3. Add main-process window-size state machine and keep-gateway behavior.
  4. Add tests for control payload validation and resize flow.
- Commits/PR:
  - TDB
- Update Log:
  - 2026-02-26 03:22 IN_PROGRESS implementation started from user UX requirement.
  - 2026-02-26 03:29 REVIEW implementation + tests completed (`npm test` 150/150), waiting user runtime verification.
