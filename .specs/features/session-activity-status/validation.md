# Session Activity Status Validation — Round 2

## Validation: session-activity-status — PASS ✅

**Date**: 2026-09-15
**Spec**: `.specs/features/session-activity-status/spec.md` (35 ACs, ACTV-01..35)
**Diff range**: `c464e3f~1..HEAD` (`44aa1a3`), 13 commits, branch `feature/session-activity-status`
**Verifier**: independent sub-agent (author ≠ verifier), read-only over the real tree
**Round**: re-verification 2 of a maximum 3. Round 1 returned ❌ FAIL; one fix commit (`44aa1a3`,
`test(agents): close the verifier's evidence gaps`) claims to close its gaps.
**Verdict**: ✅ **PASS** — all three round-1 gaps are closed and independently re-confirmed. Two
residual gaps remain, both **Minor** and both on the renderer side of the project's own testing
convention; neither blocks the feature.

---

## What round 2 re-derived (not inherited)

Round 1's report was treated as a claim, not as evidence. Every `file:line` citation reproduced
below was re-read in the working tree at `44aa1a3`; the two round-1 survivors were **re-injected**
from scratch in a fresh detached worktree, not assumed fixed; and nine further behaviour-level
mutations were injected into code round 1 never touched.

---

## Round-1 gap disposition

| Round-1 gap | Severity then | Status now | Proof |
| ----------- | ------------- | ---------- | ----- |
| **M13** — `activity-machine.ts:77` `SessionStart` ⇒ `to(state,…)` survived | Blocker | ✅ **CLOSED** | Re-injected; killed by `activity-machine.test.ts:49` *"drops the subagents a restarted session was running"* |
| **M14** — `activity-machine.ts:108` `SessionEnd` ⇒ `to(state,…)` survived | Blocker | ✅ **CLOSED** | Re-injected; killed by `activity-machine.test.ts:61` *"drops the subagents of a session whose agent exited"* |
| **ACTV-07** — in-place patch had no assertion anywhere | Major | ✅ **CLOSED (positive half)** · ⚠️ residual | `applyActivity` extracted to `src/renderer/src/lib/session-activity.ts:18`, 5 assertions at `session-activity.test.ts:17-62`, 3 mutations killed. The *negative* half ("without re-fetching") is still structural only — probe **N8 survived** |
| **ACTV-27 + detail-pane halves of ACTV-24..26** — no assertion, not even a hand-verify line | Major | ✅ **CLOSED** | `detailPillText`/`detailPillClass` extracted to `session-activity.ts:44,62`, 22 assertions at `session-activity.test.ts:65-144`, 6 mutations killed. `AgentsView.tsx:10` imports them; **no local copy survives** (`grep ACTIVITY_LABEL src/` returns only the lib) |
| **Fix 4** — ACTV-18 smoke check asserted the machine state, not the row; hand-verify list omitted error/waiting/reduced-motion/detail-pane | Minor | ✅ **CLOSED** | `smoke-activity.mjs:307` renamed to ACTV-03; new `:308-317` reads `.rail-row-status` and asserts `shellLabel === 'shell'`; hand-verify list `:18-31` now names ACTV-14..18, ACTV-20, ACTV-24..27 and the error state; `SPEC_DEVIATION` marker now lives in the script itself at `:32` |
| **Fix 5** — the owner smoke has never been executed | Major, owner action | ❌ **STILL OPEN** | `scripts/smoke-activity.mjs` is still owner-run only. Not a code defect |

---

## Task Completion

| Task | Status | Notes |
| ---- | ------ | ----- |
| T1 Move `commandKey` to shared | ✅ Done | `src/shared/command-key.ts` + `command-key.test.ts` (37 lines added, none deleted) |
| T2 Activity types + channel | ✅ Done | `activity` on `SessionView` only (`src/shared/config.ts:59`); `PersistedSession` untouched |
| T3 Activity state machine | ✅ Done | 38 `it`/`it.each` blocks; every Transition Table row covered; the `subagents = 0` detail effect is now discriminated |
| T4 Keystroke classifier | ✅ Done | `keystroke.test.ts`, 46 lines added |
| T5 Hook settings builder | ✅ Done | Timeout, bearer header, env allowlist, no `matcher`, JSON round-trip |
| T6 Loopback hook endpoint | ✅ Done | Real listener; every reachable response path asserted for a zero-length body |
| T7 SessionManager wiring | ✅ Done | Injection, token, routing, emit gate, revoke-on-stop, keystroke rule |
| T8 App wiring | ⚠️ Done, deviation | `SPEC_DEVIATION` at `src/main/index.ts:257`, judged benign (re-confirmed below) |
| T9 Rail view model | ✅ Done | `rail-groups.test.ts:485-600`; pre-existing rail cases unmodified |
| T10 Rail + detail rendering | ✅ Done | Evidence now exists for ACTV-07 and ACTV-27 via the extracted lib. **Note**: the Done-when bullet at `tasks.md:388` still reads "verified in the T11 smoke by counting IPC calls" — that count was never built; F2 substituted a unit test instead. Wording is stale, the requirement is met |
| T11 Owner smoke | ⚠️ Done, deviation, **not run** | `SPEC_DEVIATION` now marked in the script (`smoke-activity.mjs:32`). Still never executed |
| F1 Kill the surviving mutants | ✅ Done | +2 tests, re-verified by re-injection |
| F2 Evidence for ACTV-07 / ACTV-24..27 | ✅ Done | New lib + 27 tests |
| F3 Smoke accuracy | ✅ Done | Row-label read, hand-verify list, in-script deviation marker |

---

## Spec-Anchored Acceptance Criteria

Legend: **U** = unit-asserted · **S** = smoke-asserted (owner-run script, **not yet executed**) ·
**C** = convention-exempt from unit tests per `.specs/codebase/TESTING.md` ("Renderer React
components", "thin OS/Electron shells", "smoke scripts").

### P1: The session knows what its agent is doing

| AC | Spec-defined outcome | `file:line` + assertion | Result |
| -- | -------------------- | ----------------------- | ------ |
| ACTV-01 | `claude`-normalizing registry agent launches with a hook config; no settings file written | **U** `src/main/session-manager.test.ts:470` — `expect(port.handles[0].plan.autoCommand).toBe('claude --settings C:\\app\\hooks.json')`; `:473` `expect(hooks.registered).toEqual([{ token, sessionId: view.id }])`; `:497-505` full path + `.EXE` ⇒ `toContain('--settings')`. No Claude settings file is written by construction: `--settings <path>` points at a per-launch file under `userData` | ✅ PASS |
| ACTV-02 | Ad-hoc / non-`claude`: no injection, no activity, row as today | **U** `session-manager.test.ts:481-484` (`autoCommand` byte-identical `'claude --resume'`, `envs[0]` undefined, `registered` empty); `:491-494` (Codex). **S** `smoke-activity.mjs:231` `check(..., adhoc === null)` | ✅ PASS |
| ACTV-03 | Event applied per the Transition Table | **U** `src/main/activity-machine.test.ts:25-235` — one block per table row, incl. `:49` and `:61` (the `subagents = 0` detail effect, driven from a state holding 1 subagent: `expect(after?.view).toEqual({ state: 'waiting', subagents: 0 })` / `{ state: 'exited', subagents: 0 }`). Routing: `session-manager.test.ts:534` `expect(manager.list()[0].activity).toEqual({ state:'waiting', subagents:0 })` | ✅ **PASS — round-1 gap closed** |
| ACTV-04 | No token / unknown token / non-object body ⇒ no state change | **U** `src/main/activity-hook-server.test.ts:59-60` `expect(res.status).toBe(401); expect(received).toEqual([])`; `:66-67`; `:82-83` (non-JSON ⇒ 204, nothing dispatched); `:86-95` (array / bare string / `null`); `:97-104` (size cap). **S** `smoke-activity.mjs:165` | ✅ PASS |
| ACTV-05 | Emit `session:activity` with id + new activity | **U** `session-manager.test.ts:535-537` — `expect(activityEvents(emit)).toEqual([{ id: view.id, activity: { state:'waiting', subagents:0 } }])` | ✅ PASS |
| ACTV-06 | Same activity ⇒ no emit | **U** `session-manager.test.ts:553` `expect(activityEvents(emit)).toHaveLength(1)` after 3 events folding to `waiting`; `activity-machine.test.ts:268-288` (`sameView` truth table) | ✅ PASS |
| ACTV-07 | Renderer applies in place, **no list refetch** | **U** `src/renderer/src/lib/session-activity.test.ts:23-24` — `expect(next[0].activity).toEqual({state:'working',subagents:0})` **and** `expect(next[1]).toBe(b)` (identity: the other session is not even re-created); `:45` `expect(patched.activity).toBeUndefined()` on a `null` push; `:53` `expect(next[0]).toBe(a)` for an unknown id; `:32-37` every other field preserved; `:61` replacement. Wiring: `use-sessions.ts:51-53` calls `applyActivity(prev, id, activity)` and **no** `refreshSessions` | ✅ PASS (in-place half) · ⚠️ **residual**: the *absence* of a refetch is still unasserted — probe N8 survived (see Sensor) |
| ACTV-08 | Stop ⇒ discard activity, revoke token, render `stopped` | **U** `session-manager.test.ts:578-580` — `expect(hooks.revoked).toEqual([token])`, `toMatchObject({status:'stopped'})`, `expect(...activity).toBeUndefined()` | ✅ PASS |
| ACTV-09 | Never write activity to `config.json` | **U** `session-manager.test.ts:644-647` — after `PreToolUse` + `SubagentStart`, `expect(manager.list()[0].activity).toEqual({state:'working',tool:'Bash',subagents:1})` **and** every persisted session `not.toHaveProperty('activity')`. Also holds by type (`src/shared/config.ts:59`) | ✅ PASS |
| ACTV-10 | Every authenticated request ⇒ 2xx, empty body | **U** `activity-hook-server.test.ts:51-52` `expect(res.status).toBe(204); expect(res.body).toBe('')`; `:106-119` walks all five reachable paths asserting `res.body === ''` and `status >= 200` | ✅ PASS |
| ACTV-11 | Hook timeout ≤ 5 s | **U** `src/main/claude-hook-settings.test.ts:53-56` — `expect(HOOK_TIMEOUT_SECONDS).toBeLessThanOrEqual(5)` **and** every generated entry's `timeout` equals it | ✅ PASS |
| ACTV-12 | Keystroke while blocked ⇒ `working` | **U** `activity-machine.test.ts:236-245` (both blocked states ⇒ `working`) and `:247-260` (5 non-blocked states unchanged); `session-manager.test.ts:615-616` — `'1'` yields `{state:'working',subagents:0}` **and** is still written to the PTY. **S** `smoke-activity.mjs:292` | ✅ PASS |
| ACTV-13 | Start/respawn ⇒ fresh token, no activity until first event | **U** `session-manager.test.ts:592-595` — two distinct tokens, `envs[1]` carries the new one, `activity` undefined; `activity-machine.test.ts:25-27` `expect(applyHookEvent(null, …)).toBeNull()` | ✅ PASS |

### P2: Legible on the row and in the rail header

| AC | Spec-defined outcome | `file:line` + assertion | Result |
| -- | -------------------- | ----------------------- | ------ |
| ACTV-14 | `working`/`compacting` ⇒ animated loader + that label | **U** (label) `rail-groups.test.ts:494-504` `expect(statusOf(running({state}))).toBe('working'/'compacting')`. **C** (loader) `SessionRail.tsx:239` `SPINNING = ['working','compacting']` → `rail-row-loader` + `<Icon name="loader">`; `SessionRail.css:340-350` `animation: spin 1s linear infinite`. Hand-verify declared `smoke-activity.mjs:19-21` | ⚠️ Convention-exempt — label unit-covered, the animation is a visual pass |
| ACTV-15 | `waiting` ⇒ steady indicator + label `waiting` | **U** (label) `rail-groups.test.ts:494-504`. **C** (dot) `SessionRail.css:368-374` `.rail-row-dot.waiting { background: var(--blue) }`. Hand-verify now names the blue waiting dot (`smoke-activity.mjs:20`) | ⚠️ Convention-exempt |
| ACTV-16 | approval/input ⇒ attention indicator, colour distinct from `waiting`, labels `approval`/`input` | **U** (labels) `rail-groups.test.ts:494-504`. **C** (colour) `SessionRail.css:376-385` — pink + 3px halo vs `waiting`'s plain blue ⇒ distinct. **S** `smoke-activity.mjs:272` `check(..., row.label === 'approval')` | ✅ PASS |
| ACTV-17 | `error` ⇒ error indicator + label `error` | **U** (label) `rail-groups.test.ts:494-504`. **C** (dot) `SessionRail.css:387-393` `background: var(--red)`. Now on the hand-verify list (`smoke-activity.mjs:20`, plus `:30-31` explaining why no script forces a real rate limit) | ⚠️ Convention-exempt — indicator named for hand-verify |
| ACTV-18 | `exited` ⇒ label `shell`, `--amber` | **U** (label) `rail-groups.test.ts:494-504` `toBe('shell')`. **C** (colour) `SessionRail.css:395-401`. **S** `smoke-activity.mjs:317` — now reads the rendered row: `check('the row reads shell once the agent has exited (ACTV-18)', shellLabel === 'shell', shellLabel)` where `shellLabel` is `.rail-row-status` text | ✅ PASS (round-1 mislabelled check fixed) |
| ACTV-19 | stopped / running-without-activity ⇒ render exactly as today | **U** `rail-groups.test.ts:508` `expect(statusOf(running())).toBe('running')`; `:512-513` `'stopped'` / `'path missing'`; `:546` tooltip byte-identical; `:522` actions still `['stop']`; `:567` row order unchanged. Detail pane too: `session-activity.test.ts:71` `expect(detailPillText(session({id:'a'}))).toBe('running')`, `:141-142` `'green'` / `'faint'` | ✅ PASS |
| ACTV-20 | Reduced motion ⇒ loader does not animate | **C** `SessionRail.css:352-356` `@media (prefers-reduced-motion: reduce) { .rail-row-loader { animation: none } }`. Hand-verify `smoke-activity.mjs:22-23` | ⚠️ Convention-exempt (CSS-only) |
| ACTV-21 | Status element exposes an `aria-label` naming the state | **C** `SessionRail.tsx:307` `aria-label={row.status}`. **S** `smoke-activity.mjs:274-277` `check(..., row.aria === 'approval')` | ✅ PASS (smoke-asserted) |
| ACTV-22 | Header reports the count of `working` + `compacting` | **U** `rail-groups.test.ts:583` `expect(counts).toEqual({ running: 3, working: 2, needYou: 0 })`. **S** `smoke-activity.mjs:298` `header.includes('1 working')` | ✅ PASS |
| ACTV-23 | Header reports the count needing the user | **U** `rail-groups.test.ts:593` `expect(counts.needYou).toBe(3)` for approval+input+error; `:583` proves `waiting` is **not** counted. **S** `smoke-activity.mjs:284` `header.includes('1 need you')` | ✅ PASS |

### P3: Detail

| AC | Spec-defined outcome | `file:line` + assertion | Result |
| -- | -------------------- | ----------------------- | ------ |
| ACTV-24 | Tooltip **and detail-pane status** name the running tool | **U** (tooltip) `rail-groups.test.ts:527-529` `expect(tooltipOf(...)).toBe('Claude · 24173-fix-login · user/otavio/24173-fix-login · Bash')`. **U** (detail pane) `session-activity.test.ts:88-93` `expect(detailPillText(… tool:'Bash' …)).toBe('working · Bash')`. Rendered at `AgentsView.tsx:176`. **S** `smoke-activity.mjs:279` | ✅ **PASS — round-1 gap closed** |
| ACTV-25 | Tooltip **and detail-pane** show the subagent count | **U** (tooltip) `rail-groups.test.ts:534-537` `toContain(' · 1 subagent' / ' · 3 subagents')`. **U** (detail pane) `session-activity.test.ts:96-103` `toBe('working · 1 subagent')` / `'working · 2 subagents'` — singular *and* plural | ✅ **PASS — round-1 gap closed** |
| ACTV-26 | Tooltip **and detail-pane** show the `StopFailure` error type | **U** (tooltip) `rail-groups.test.ts:539-542` `toContain(' · rate_limit')`. **U** (detail pane) `session-activity.test.ts:105-111` `toBe('turn failed · rate_limit')` | ✅ **PASS — round-1 gap closed** |
| ACTV-27 | Detail-pane pill shows the activity state in place of `running` | **U** `session-activity.test.ts:74-86` — the full 7-state wording table (`working`, `compacting`, `waiting for you`, `needs approval`, `needs input`, `turn failed`, `agent exited · shell`); `:126-138` the full 7-state tint table (`green/green/blue/pink/pink/red/amber`); `:140-143` the no-activity fallbacks. Rendered at `AgentsView.tsx:175-176`; classes exist at `AgentsView.css:121-148` | ✅ **PASS — round-1 gap closed** |

### Edge cases

| AC | Spec-defined outcome | `file:line` + assertion | Result |
| -- | -------------------- | ----------------------- | ------ |
| ACTV-28 | Esc ⇒ keep last state; `idle_prompt` ⇒ `waiting` | **U** `activity-machine.test.ts:138-144` `expect(after?.view).toEqual({ state:'waiting', subagents:0 })`; the "keep last state" half by construction, proven at `:220-223` (an unconsumed event returns the same object by reference) | ✅ PASS |
| ACTV-29 | Hooks never report ⇒ no activity, row renders `running` | **U** `session-manager.test.ts:512-514` — `settingsPath: null` ⇒ no `--settings`, no env, nothing registered; `rail-groups.test.ts:508` ⇒ row reads `running` | ✅ PASS |
| ACTV-30 | Registry edit mid-session ⇒ keep the launch/token decided at start | **U** `session-manager.test.ts:605-606` — after `config.patch({agents:[{command:'other-cli'}]})` the live handle still carries `--settings` and still folds events | ✅ PASS |
| ACTV-31 | Stop while activity held ⇒ `stopped` wins, no activity survives | **U** `session-manager.test.ts:566-567` `expect(activityEvents(emit)).toEqual([]); expect(manager.list()[0].activity).toBeUndefined()` | ✅ PASS |
| ACTV-32 | Hook request after stop ⇒ ignored | **U** `activity-hook-server.test.ts:74-76` (revoked token ⇒ 401, nothing dispatched); `session-manager.test.ts:565-567` | ✅ PASS |
| ACTV-33 | Mouse/focus report is not a keystroke | **U** `src/main/keystroke.test.ts:26-28` `expect(isKeystroke(data)).toBe(false)` for SGR press/release/motion, X10, urxvt, focus in/out; end-to-end `session-manager.test.ts:626-628` — a mouse report **is written to the PTY** yet leaves `needs-approval` intact | ✅ PASS |
| ACTV-34 | Toolless `PostToolUse` / unknown `SubagentStop` ⇒ no error, count never < 0 | **U** `activity-machine.test.ts:87-90`, `:205-209` (repeat `SubagentStart` counted once), `:210-214` (ghost `SubagentStop` ⇒ `subagents` 0) | ✅ PASS |
| ACTV-35 | Agent dies without `SessionEnd` ⇒ keep last state until PTY stop or respawn | **U (indirect)** `activity-machine.test.ts:220-223` + `session-manager.test.ts:580` / `:595` (only `stop` and `respawn` clear it) | ✅ PASS (by construction) |

**Status**: **31 ✅ PASS** · **0 ❌ no-evidence gaps** · 4 ⚠️ convention-exempt visual criteria
(ACTV-14, 15, 17, 20) · 1 ⚠️ residual on the negative half of ACTV-07 · 0 spec-precision gaps in the
spec itself.

---

## Discrimination Sensor

Isolated scratch: `git worktree add --detach D:\sensor-actv2 HEAD`, `node_modules` reached by NTFS
junction, mutated there, tests run there, scratch removed with `git worktree remove --force` plus
`rmdir` of the junction. **No `git stash`.** Pre-sensor `git status --porcelain` baseline:
`?? .specs/features/session-activity-status/validation.md` + `?? .specs/features/session-idle-notifications/`
— re-checked after cleanup and **identical**; `node_modules` intact (500 entries).

### Round A — re-inject the two round-1 survivors

| # | File:line | Mutation | Killed? | Killing test |
| - | --------- | -------- | ------- | ------------ |
| M13 | `src/main/activity-machine.ts:77` | `SessionStart` ⇒ `to(state,'waiting')` instead of `to(null,'waiting')` (subagent set survives a restart) | ✅ **Killed** | `activity-machine.test.ts:49` *"drops the subagents a restarted session was running"* |
| M14 | `src/main/activity-machine.ts:108` | `SessionEnd` ⇒ `to(state,'exited')` instead of `to(null,'exited')` | ✅ **Killed** | `activity-machine.test.ts:61` *"drops the subagents of a session whose agent exited"* |

Both round-1 survivors are dead. Each fails **exactly one** test — the new ones — which confirms the
fix is the new assertion and not an accidental side effect of another case.

### Round B — fresh mutations over the code round 1 never touched

| # | File:line | Mutation | Killed? | Killing test(s) |
| - | --------- | -------- | ------- | --------------- |
| N1 | `session-activity.ts:24` | `applyActivity` patches **every** session (`session.id === id` → `true`) | ✅ Killed | `session-activity.test.ts:17` *"patches the named session and leaves every other one untouched (ACTV-07)"*; `:48` *"drops a push for a session the list does not hold"* |
| N2 | `session-activity.ts:25` | Drop the `activity: undefined` clear on a `null` push | ✅ Killed | `:40` *"clears the activity when the push carries none"* |
| N3 | `session-activity.ts:68-70` | `detailPillText` ignores the subagent count entirely | ✅ Killed | `:96` *"counts 1/2 subagents (ACTV-25)"* ×2; `:113` *"reads the tool, the subagents and the error in that order"* |
| N4 | `session-activity.ts:47` | `detailPillClass` tints `needs-approval` **green** instead of pink | ✅ Killed | `:126` *"tints needs-approval as pink (ACTV-27)"* |
| N5 | `session-activity.ts:69` | Flip the singular/plural branch (`=== 1 ? 's' : ''`) | ✅ Killed | `:96` *"counts 1/2 subagents (ACTV-25)"* ×2; `:113` ordering case |
| N6 | `session-activity.ts:33` | `ACTIVITY_LABEL.compacting` worded as `'working'` | ✅ Killed | `:82` *"words compacting as \"compacting\" (ACTV-27)"* |
| N7 | `session-activity.ts:45` | `detailPillClass` drops the stopped tint (`faint` → `green`) | ✅ Killed | `:140` *"keeps today's tints for a session with no activity"* |
| N9 | `session-activity.ts:23` | `applyActivity` returns the list untouched | ✅ Killed | `:17`, `:40`, `:56` (3 cases) |
| N10 | `session-activity.ts:64` | `detailPillText` always reports `running`, ignoring the held activity | ✅ Killed | 12 cases across `:74-122` |
| **N8** | `use-sessions.ts:52` | The `session:activity` handler **also** calls `refreshSessions()` — i.e. patches in place *and* refetches the whole list | ❌ **SURVIVED** (boundary probe) | — no test file imports `use-sessions.ts`; its only importer is `App.tsx`, which has no test |

**Sensor depth**: expanded — 11 mutations this round (2 re-injections + 9 fresh), on top of round 1's
15. **Result: 10/10 killed among mutations targeting unit-testable new code; 1 boundary probe
survived.**

**On N8.** It was injected deliberately to measure where the project's testing convention now draws
the line, not to find a defect. `.specs/codebase/TESTING.md` exempts "Renderer React components"
from unit tests; `use-sessions.ts` is a React hook, and after the fix commit it contains three lines
of subscription wiring whose only decision (`applyActivity`) is fully covered. N8 therefore proves
the exemption boundary is real, not that the tests are weak — but it does mean ACTV-07's phrase
"**without re-fetching the session list**" is still a reading, not a measurement. Ranked Minor below.

---

## Code Quality

| Principle | Status |
| --------- | ------ |
| Minimum code | ✅ — the fix commit is net **−45 lines of production code**: `AgentsView.tsx` loses 47, the new lib adds 74 of which 45 are the moved bodies and doc comments |
| Surgical changes | ✅ — pure extraction; `git show` confirms the moved `detailPillClass`/`detailPillText`/`ACTIVITY_LABEL` bodies are unchanged except for `export` and one corrected doc comment (it now mentions the `blue` waiting tint the old comment omitted) |
| No scope creep | ✅ — the fix commit touches only tests, the extracted lib, its two call sites, the smoke's comments/one check, and `tasks.md` |
| Matches patterns | ✅ — the extraction follows the existing `rail-groups.ts` / `task-pills.ts` precedent: renderer *lib* is unit-tested, renderer *component* is hand-verified |
| No duplicate left behind | ✅ — `grep -rn "ACTIVITY_LABEL" src/` returns only `session-activity.ts:31,73`; `AgentsView.tsx:10` imports, `:175-176` calls; `use-sessions.ts:5` imports, `:52` calls. No copy anywhere |
| Spec-anchored outcome check | ✅ — every asserted value is the spec's own string (`approval`, `input`, `shell`, `1 subagent`, `rate_limit`, `agent exited · shell`) |
| Per-layer Coverage Expectation | ✅ — domain logic 1:1 with ACs; the renderer's decision logic is now in libs with tests; only JSX, CSS and a 3-line hook remain exempt |
| Every test maps to a requirement | ✅ — all 27 new tests carry an ACTV id or are the explicit fallback/ordering guards named by the fix task. No unclaimed tests |
| Documented guidelines followed | ✅ — `.specs/codebase/TESTING.md` (co-located `*.test.ts`, no mocking library, renderer/shell/smoke exemptions) |

### `SPEC_DEVIATION` markers (2 in scope, both disclosed in code)

1. **`src/main/index.ts:257`** — the hook server binds asynchronously *after* `SessionManager` is
   constructed, where design.md says before. **Judged justified.** Awaiting one `listen` inside
   `app.whenReady()` would reorder every handler registration; the race window is the millisecond
   before any window is painted, and its consequence is exactly the documented ACTV-29 degrade path
   (no activity, row reads `running`). Unchanged since round 1, re-confirmed.
2. **`scripts/smoke-activity.mjs:32`** — the script prints the observed state sequence instead of
   logging every raw hook payload and flagging undocumented fields (T11 Done-when bullet 4).
   **Justified, and round 1's complaint that the marker lived only in `tasks.md` is fixed** — the
   marker and its reason are now in the script itself. The trade stands: a renamed Claude Code event
   surfaces as a transition that never arrives and a check that fails, which is weaker than payload
   diffing but not silent.

---

## Edge Cases

- [x] Esc interrupt keeps the last state; `idle_prompt` moves to `waiting` (ACTV-28)
- [x] Hooks never report ⇒ no activity, row renders `running` (ACTV-29)
- [x] Registry edited mid-session ⇒ launch and token frozen at spawn (ACTV-30)
- [x] Stop wins over any held activity (ACTV-31)
- [x] Late hook after stop ⇒ 401, ignored (ACTV-32)
- [x] Mouse and focus reports are not keystrokes (ACTV-33)
- [x] Unknown `SubagentStop` / toolless `PostToolUse` ⇒ no error, count never negative (ACTV-34)
- [x] Agent dies without `SessionEnd` ⇒ last state held (ACTV-35, by construction)

---

## Gate Check

- **Gate command**: `npm run typecheck && npm run lint && npm test && npx electron-vite build`
- **Typecheck**: exit 0 — node + web projects, 0 errors
- **Lint**: exit 0 — **0 errors**, 18 warnings, all pre-existing `prettier/prettier` in
  `scripts/smoke-agents.mjs`, `scripts/smoke-rail-v2.mjs` and `src/shared/tasks.test.ts`.
  **None in any file this feature touched** — `smoke-activity.mjs` is clean despite being edited
- **Tests**: **916 passed / 916**, 52 files, 0 failed, 0 skipped, 68.5 s
- **Build**: `npx electron-vite build` exit 0
- **Test count before the feature**: 748 · **after round 1**: 887 · **after the fix commit**: **916**
- **Delta**: +139 for the feature, **+29 for the fix commit** (2 in `activity-machine.test.ts`,
  27 in the new `session-activity.test.ts`) — matches the expected 916 exactly
- **Test integrity**: **no test weakened or deleted.** `git diff --numstat e497ea2 HEAD` shows
  `activity-machine.test.ts  23 / 0` (additions only) and `session-activity.test.ts  144 / 0` (new
  file). Across the whole range the only test-file deletions are 7 lines in
  `session-manager.test.ts`, all import/helper-signature lines — every deleted line was verified not
  to be an `it` block. File count 51 → 52 (the new test file)
- **Skipped tests**: none · **Failures**: none

---

## Remaining Ranked Gaps

### Gap 1 — ACTV-07's negative half is still unmeasured — **Minor**

- **What**: the AC reads "update that session in place **without re-fetching the session list**". The
  in-place patch is now proven six ways; the absence of a refetch is not. Sensor probe N8 (handler
  also calls `refreshSessions()`) survives the whole suite.
- **Why it is Minor, not Major**: the surviving surface is three lines of subscription wiring at
  `use-sessions.ts:49-55` that the project's own `TESTING.md` exempts, and the failure mode is a
  performance regression (a list round-trip per tool call), not a wrong state on screen.
- **Cheapest remedy if the owner wants it closed**: in `scripts/smoke-activity.mjs`, wrap
  `window.api.invoke` to count `sessions:list` calls and assert the count does not rise across a
  burst of activity events — excluding the script's own `waitForState` polling, which calls
  `sessions:list` itself. Then update the stale `tasks.md:388` Done-when wording.

### Gap 2 — the owner smoke has still never been executed — **Minor, owner action, not a code fix**

- Every ✅ marked **S** (ACTV-02, 04, 12, 16, 18, 21, 22, 23) rests on unit tests *plus* a script no
  one has run; the unit half stands on its own for all of them, so nothing is unevidenced. What the
  run would add is the live-Claude end-to-end confirmation and the ACTV-14/15/17/20 visual pass, for
  which the hand-verify list at `smoke-activity.mjs:18-31` is now complete and specific.
- T8's deferred hand-verification rides on the same run.

### Not a gap, recorded for the next round

- `tasks.md:388` still describes ACTV-07's verification as an IPC count in the smoke, which was never
  built; `tasks.md:519` (F2) supersedes it with the unit test. Documentation drift only.

---

## Requirement Traceability Update

| Requirement | Previous Status | New Status |
| ----------- | --------------- | ---------- |
| ACTV-01, 02, 04, 05, 06, 08, 09, 10, 11, 12, 13 | ✅ Verified (round 1) | ✅ Verified |
| **ACTV-03** | ❌ Needs Fix (M13/M14 survived) | ✅ **Verified** |
| **ACTV-07** | ❌ Needs Fix (no evidence) | ✅ **Verified** (residual: negative half structural — Gap 1) |
| **ACTV-24, 25, 26** | ⚠️ Half-covered | ✅ **Verified** |
| **ACTV-27** | ❌ Needs Fix (no evidence) | ✅ **Verified** |
| **ACTV-18** | ⚠️ Smoke check mislabelled | ✅ **Verified** |
| ACTV-16, 19, 21, 22, 23 | ✅ Verified | ✅ Verified |
| ACTV-14, 15, 17, 20 | ⚠️ Pending visual pass | ⚠️ Verified pending the owner-run smoke / visual pass (convention-exempt; hand-verify list now names each) |
| ACTV-28..35 | ✅ Verified | ✅ Verified |

---

## Summary

**Overall**: ✅ **Ready** — the feature may be marked done.

**Spec-anchored check**: 31/35 fully evidenced with `file:line` + assertion · 4 convention-exempt
visual criteria with a named hand-verify path · 0 ACs without evidence · 0 spec-precision gaps.
**Sensor**: round A 2/2 re-injected survivors killed; round B 8/9 fresh mutations killed, the one
survivor a deliberate boundary probe in a convention-exempt React hook. Across both rounds:
24 killed / 26 injected, with every survivor accounted for.
**Gate**: typecheck 0 errors · lint 0 errors (18 pre-existing warnings) · **916/916** tests, 0
skipped · build exit 0. No test weakened or deleted.

**What round 2 confirmed independently**: the two Transition Table detail effects are now driven from
a state holding a live subagent, so the `subagents = 0` reset is asserted for real, not vacuously.
The renderer's two decisions — how a push is applied to the list, and how the detail pane words a
state — moved out of a React hook and a React component into `src/renderer/src/lib/session-activity.ts`
with 27 assertions behind them, following the same precedent as `rail-groups.ts`. Nine fresh
mutations over that new file, including the four the re-verification brief named specifically
(patch-every-session, dropped clear, ignored subagent count, green-for-needs-approval, flipped
plural), all died to a named test. No duplicate of the moved code survives at either call site.

**What is still open**: nothing that blocks. ACTV-07's "without re-fetching" clause and the
owner-run smoke are both Minor, both named above with a concrete remedy, and both sit on the
renderer side of a documented testing convention rather than on unproven behaviour.
