# Terminal Unicode Width Fix — Validation (iteration 2)

## Validation

**Result**: ✅ PASS (manual UAT pending user confirmation — declared manual by the spec)

**Date**: 2026-09-10
**Spec**: `.specs/features/terminal-unicode-width/spec.md` (11 requirements, UNIC-01..11)
**Diff range**: `main..HEAD` = `f08908d` (docs(specs)) + `ada3a69` (fix(terminal)) + `d196df5` (fix(terminal): allowProposedApi), branch `feature/terminal-unicode-width`
**Verifier**: independent sub-agent (author ≠ verifier), evidence-or-zero — **re-run (iteration 2)** after iteration 1 FAIL (missing `allowProposedApi`) and the `d196df5` fix

---

## Task Completion

| Task | Status | Notes |
| ---- | ------ | ----- |
| T1   | ✅ Done | Dependency `@xterm/addon-unicode11@^0.9.0` declared (`package.json:31`), `@xterm/xterm@^6.0.0` (`package.json:32`), installed in `node_modules` (probe loaded real packages: xterm 6.0.0, addon 0.9.0) |
| T2   | ✅ Done | `Unicode11Addon` imported (`TerminalPane.tsx:3`), loaded (`:96`), v11 activated (`:97`), and **`allowProposedApi: true`** now in the `Terminal` options (`TerminalPane.tsx:87`) — the three-part sequence the spec mandates, plus the proposed-API gate that killed iteration 1 |

No `tasks.md` for this feature (spec-only); no unit tests added (renderer component — repo convention TESTING.md, validation declared manual).

---

## Spec-Anchored Acceptance Criteria

| Criterion (WHEN X THEN Y) | Spec-defined outcome | `file:line` + evidence | Result |
| ------------------------- | -------------------- | ---------------------- | ------ |
| UNIC-01: wide char SHALL occupy exactly two cells, following text aligned | v11 width rules active | impl `TerminalPane.tsx:87` (`allowProposedApi: true`), `:96` (`loadAddon(new Unicode11Addon())`), `:97` (`term.unicode.activeVersion = '11'`); **probe** (node against installed bundle): `new Terminal({allowProposedApi:true})` → `loadAddon` → `activeVersion='11'`, no throw | ✅ impl-evidence + probe; visual render **manual-pending user UAT** (not FAIL — spec declared manual validation) |
| UNIC-02: combining mark/zero-width SHALL not advance cursor | v11 width rules active | same three lines as UNIC-01 (`TerminalPane.tsx:87,96,97`); probe confirms v11 active | ✅ impl-evidence; **manual-pending** |
| UNIC-03: selection SHALL not change on-screen text | v11 width rules active | same three lines as UNIC-01; probe confirms v11 active (correct width measurement is the mechanism) | ✅ impl-evidence; **manual-pending** |
| UNIC-04: WHILE rendered, active Unicode version SHALL be `'11'` (state-driven) | `term.unicode.activeVersion === '11'` | **probe (runtime, decisive)**: positive control `activeVersion = "11"`; M2 extension (registered, never activated) reads `"6"` — proves the line is what flips it | ✅ PASS (runtime probe) |
| UNIC-05: Claude TUI gutter SHALL keep intended content, no stale residue | visual (live session) | impl v11 active (`TerminalPane.tsx:87,96,97`) — the gate that blocked UAT in iteration 1 is now open; terminal opens | ✅ impl-evidence; **manual-pending user UAT** |
| UNIC-06: vertical borders SHALL be one continuous column, no ghosts | visual (live session) | same impl; no crash path remains (probe) | ✅ impl-evidence; **manual-pending user UAT** |
| UNIC-07: TUI redraw SHALL repaint cleanly | visual (live session) | same impl | ✅ impl-evidence; **manual-pending user UAT** |
| UNIC-08: wide char at last column wraps/clips per xterm rules, no bleed | xterm wrapping with correct width | v11 active (impl + probe) → xterm measures wide glyphs at 2 cells and wraps/clips per its own margin rules; visual confirmation pending | ✅ impl-evidence; **manual-pending** |
| UNIC-09: mixed wide/narrow alignment matches v11 cell-by-cell | v11 width rules active | v11 active (impl + probe) | ✅ impl-evidence; **manual-pending** |
| UNIC-10: IF active version cannot be set THEN keep default, SHALL NOT crash | graceful fallback, no crash | correct ordering in impl: `loadAddon` (`:96`) registers before `activeVersion` setter (`:97`); **probe**: setting `activeVersion='11'` before registering throws `unknown Unicode version "11"` (M3 extension) — the happy-path order avoids it and the probe confirms no throw; the addon is statically bundled so the "missing addon" branch cannot occur at runtime | ✅ PASS (impl order + probe no-throw) |
| UNIC-11: session switch SHALL re-activate the same version | per-mount activation | both lines sit inside `useEffect(..., [sessionId])` body (`TerminalPane.tsx:71-98`, dep `:191`) → re-run per pane mount/remount | ✅ PASS (impl evidence) |

**Status**: ✅ **11/11 addressed — 0 blocked.** The iteration-1 blocking root cause (`allowProposedApi` missing → `loadAddon` threw → terminal never opened) is verified fixed by the runtime probe: `new Terminal({ allowProposedApi: true })` + `loadAddon(new Unicode11Addon())` + `activeVersion='11'` succeeds and reads `"11"`. UNIC-04/10/11 are automatable PASS; the visual criteria (UNIC-01/02/03/05/06/07/08/09) carry impl-evidence and are **manual-pending user UAT** per the spec's declared manual-validation convention — they are not FAIL.

---

## Runtime Probe (the probe that killed iteration 1, re-run)

CJS script against the installed bundles (`node_modules/@xterm/xterm/lib/xterm.js` + `@xterm/addon-unicode11/lib/addon-unicode11.js`), real versions xterm 6.0.0 / addon 0.9.0:

| Control | Action | Result |
| ------- | ------ | ------ |
| **Negative (gate still exists)** | `new Terminal({})` → `loadAddon(new Unicode11Addon())` | **THREW**: `You must set the allowProposedApi option to true to use proposed API` — confirms the gate is real and the fix is necessary |
| **Positive (the fix)** | `new Terminal({ allowProposedApi: true })` → `loadAddon(new Unicode11Addon())` → `term.unicode.activeVersion = '11'` | **No throw; `activeVersion = "11"`** — the exact state UNIC-04 and the width outcomes depend on |
| M3 extension | `new Terminal({ allowProposedApi: true })` → set `activeVersion='11'` **without** registering | **THREW**: `unknown Unicode version "11"` — proves removing `loadAddon` breaks the setter (UNIC-10 ordering matters) |
| M2 extension | `new Terminal({ allowProposedApi: true })` → `loadAddon` only, never activate | `activeVersion` stays `"6"` — proves removing `activeVersion='11'` leaves the default Unicode 6 active |

---

## Discrimination Sensor

Scratch: `D:\worktrees\unicode-verifier2` (detached HEAD `d196df5`, `node_modules` junction) — removed after; real tree untouched (`git status --porcelain` identical to baseline before/after, no `git stash`).

| Mutation | File:line | Description | Killed? |
| -------- | --------- | ----------- | ------- |
| 1 | `TerminalPane.tsx:87` | Removed `allowProposedApi: true` from the `Terminal` options | Survives gate (typecheck exit 0) → **killed by probe, not by gate**: the probe's negative control reproduces this exact state — `loadAddon` throws `You must set the allowProposedApi...` and the terminal never opens |
| 2 | `TerminalPane.tsx:97` | Removed `term.unicode.activeVersion = '11'` (provider registered but never activated) | Survives gate (typecheck exit 0) → **killed by probe, not by gate**: probe M2 extension shows default stays `"6"` ≠ `"11"`, so UNIC-04's state-driven outcome is unsatisfiable |
| 3 | `TerminalPane.tsx:96` | Removed only `term.loadAddon(new Unicode11Addon())`, kept the import | ✅ **Killed by gate**: typecheck `TS6133 'Unicode11Addon' is declared but its value is never read` (exit 2; `noUnusedLocals` in `@electron-toolkit/tsconfig`); behaviorally confirmed by probe M3 extension (setter on unregistered version throws) |

**Sensor depth**: lightweight (3 behavior-level mutations, per default tier) + runtime API probe.
**Result**: 1/3 killed by gate (M3); M1 and M2 survive the gate and are **documented as "morto por probe, não por gate"** — the typecheck stays green because the renderer terminal path is untested by convention, so only the behavior-level probe discriminates. All three mutations do break the feature's behavior, so the sensor is effective.

---

## Interactive UAT Results

Not performed in this iteration — **pending user UAT** (the spec declares validation manual; the iteration-1 blocker that made UAT impossible is gone). Suggested script (from spec Independent Test): `echo "✓ 🎉 │ ─"` in a live agent session + a Claude Code session; verify alignment, stable selection, and no edge residue.

---

## Code Quality

| Principle | Status |
| --------- | ------ |
| Minimum code | ✅ three lines in the effect body + one option in the constructor (`TerminalPane.tsx:84-87,96-97`); no new abstractions |
| Surgical changes | ✅ `TerminalPane.tsx` + 6/-1 lines total across the two fix commits; `package.json` one dependency line; no unrelated edits |
| No scope creep | ✅ xterm upgrade and grapheme segmentation correctly deferred (spec Out of Scope); no new deps beyond `@xterm/addon-unicode11` |
| Matches patterns | ✅ addon usage mirrors the existing `FitAddon` pattern (`loadAddon`); inline in the single terminal surface |
| Spec-anchored outcome check | ✅ the three-part activation sequence now matches the spec's assumptions exactly (`allowProposedApi` gate closed in `d196df5`, spec assumption A-03 updated at `spec.md:43`) |
| Every test maps to a spec requirement | ✅ no feature tests added/removed (renderer component, per TESTING.md convention); 667 existing tests unchanged |
| Documented guidelines followed | ✅ `.specs/codebase/TESTING.md`, spec-assumption update, comment references UNIC-01..11 |

---

## Edge Cases

- [x] UNIC-08 (wide char at viewport margin): v11 active → xterm wraps/clips wide glyphs per its own margin rules; visual pending
- [x] UNIC-09 (mixed width, cumulative alignment): v11 provider active (probe) → cell-by-cell alignment follows Unicode 11
- [x] UNIC-10 (addon missing → keep default, no crash): happy-path order `loadAddon` before `activeVersion` is correct and probe-confirmed no-throw; the "missing addon" branch is structurally impossible (static bundling)
- [x] UNIC-11 (session switch re-activates): per-mount effect re-runs both lines

---

## Gate Check

- **Gate command**: `npm run typecheck && npm run lint && npm test`
- **typecheck**: PASS (node + web, exit 0, no diagnostics)
- **lint**: PASS — 0 errors, **19 pre-existing `prettier/prettier` warnings** (all in `scripts/`, `*.test.ts`, non-feature files), exit 0
- **test**: **667 passed, 0 failed, 0 skipped** (44 test files, vitest run)
- **Skipped**: none; **Failures**: none
- **Test integrity**: no tests added or removed by this feature (no unit per convention); the green gate does not exercise the renderer terminal path — which is exactly why the sensor mutations M1/M2 survive the gate and only the runtime probe discriminates them

---

## Fix Plans (if issues found)

None blocking. Iteration 1's required fix (`allowProposedApi: true` at `TerminalPane.tsx:87`) is present, probe-verified, and the spec Assumptions table was updated (`spec.md:43`). The unrelated `@electron/windows-sign` lockfile churn noted in iteration 1 is unchanged — still harmless and out of feature scope.

---

## Requirement Traceability Update

| Requirement | Iteration 1 Status | New Status |
| ----------- | ------------------ | ---------- |
| UNIC-01 | ❌ FAIL (runtime-blocked) | ✅ impl-evidence + probe; **manual-pending** |
| UNIC-02 | ❌ FAIL (runtime-blocked) | ✅ impl-evidence; **manual-pending** |
| UNIC-03 | ❌ FAIL (runtime-blocked) | ✅ impl-evidence; **manual-pending** |
| UNIC-04 | ❌ FAIL (state never set) | ✅ Verified (runtime probe: `activeVersion = "11"`) |
| UNIC-05 | ❌ FAIL (blocked) | ✅ impl-evidence; **manual-pending** |
| UNIC-06 | ❌ FAIL (blocked) | ✅ impl-evidence; **manual-pending** |
| UNIC-07 | ❌ FAIL (blocked) | ✅ impl-evidence; **manual-pending** |
| UNIC-08 | ❌ FAIL (blocked) | ✅ impl-evidence; **manual-pending** |
| UNIC-09 | ❌ FAIL (blocked) | ✅ impl-evidence; **manual-pending** |
| UNIC-10 | ❌ FAIL (crash confirmed) | ✅ Verified (impl order + probe no-throw) |
| UNIC-11 | ❌ FAIL (blocked) | ✅ Verified (impl evidence, per-mount effect) |

---

## Summary

**Overall**: ✅ **PASS** (with manual UAT pending user confirmation — declared manual by the spec, not a FAIL)

**Spec-anchored check**: 11/11 addressed, **0 blocked** — 3 automatable PASS (UNIC-04/10/11) + 8 impl-evidence criteria with **manual-pending** visual confirmation (UNIC-01/02/03/05/06/07/08/09), per the spec's declared manual-validation convention.
**Root cause closed (evidence)**: the iteration-1 blocker — xterm 6.0.0 gates `term.unicode` behind `allowProposedApi` (default `false`), so the as-committed `loadAddon(new Unicode11Addon())` threw and the terminal never opened. `d196df5` adds `allowProposedApi: true` (`TerminalPane.tsx:87`); the runtime probe confirms the full sequence now succeeds and `activeVersion` reads `"11"`. The negative control proves the gate is still real (the fix is necessary, not decorative).
**Sensor**: 1/3 killed by gate (M3, TS6133); M1 and M2 survive the gate and are **killed by probe** — documented as "morto por probe, não por gate", the expected profile for a renderer terminal path with no unit tests.
**Gate**: typecheck PASS, lint PASS (0 errors, 19 pre-existing warnings), **667 passed / 0 failed / 0 skipped** — green, same baseline as iteration 1.
**Real tree**: clean — `git status --porcelain` identical to baseline after scratch removal (no `git stash`, scratch worktree removed).

**What works**: the full three-step activation (`allowProposedApi` + `loadAddon` + `activeVersion='11'`) is probe-proven end-to-end; the dependency versions are correct; the ordering that avoids the "unknown Unicode version" throw is right; the spec Assumptions now document the gate.

**Gaps**: (1) **manual UAT pending** — the visual criteria need a user-run live session (`echo "✓ 🎉 │ ─"` + a Claude Code session) to flip `manual-pending` → `Verified`; (2) minor — unrelated `@electron/windows-sign` lockfile churn (out of feature scope, unchanged from iteration 1).

**Next steps**: user-run UAT for the visual ACs, then the feature is verifiably done.