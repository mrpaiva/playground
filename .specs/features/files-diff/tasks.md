# Files Direction — Diffs (F2) Tasks

## Execution Protocol (MANDATORY -- do not skip)

Implement these tasks with the `tlc-spec-driven` skill: **activate it by name and follow its Execute flow and Critical Rules.** Do not search for skill files by filesystem path. The skill is the source of truth for the full flow (per-task cycle, sub-agent delegation, adequacy review, Verifier, discrimination sensor).

**If the skill cannot be activated, STOP and tell the user - do not proceed without it.**

---

**Design**: `.specs/features/files-diff/design.md`
**Status**: Draft

**Branch**: `feature/files-diff`, stacked on `feature/files-explore`. PR carries "depends on" the F1 PR; once F1 merges, `git rebase --onto origin/main feature/files-explore feature/files-diff`.

**Prerequisite**: F1 executed — this feature extends its `file-reader.ts`, `file-tree.ts`, `file-watcher.ts`, `files-view.ts`, `use-files.ts`, `FileTabs.tsx`, `FileTree.tsx`, `CodeViewer.tsx` and `monaco-setup.ts`.

**Test baseline**: **850** — the count F1's `tasks.md` projects at its end, itself resting on two earlier projections (status-bar's 797 and `origin/main`'s recorded 748). **Re-measure with `npm test` as the first act of Execute** and re-anchor every count below.

**Baseline measured 2026-09-19** with `npx vitest run` on `origin/main` `6ecd19c`, after the upstream merged #88: **917 tests / 52 files**, all passing. The 748 the plans started from was recorded before #88 and is stale by **+169**. Its baseline becomes **1019**; every count below shifts by **+169** and this feature ends at **1067**, not 898. Still re-measure as the first act of Execute.

**Baseline measured 2026-09-20** with `npm test` on this branch, rebased onto `feature/files-explore` `72d6e98`: **1042 tests / 59 files**, all passing; lint **0 errors / 18 warnings**. F1 ended 23 tests above the 1019 projected for it, so the shift from the written counts is **+192**, not +169. **Every count below reads +192**; T2's 850 means 1042, and this feature ends at **1090**. A measurement, not a projection.

---

## What F2 inherits from F1 that this plan predates

Written 2026-09-20, after F1 shipped. Each of these was discovered during F1's execution and is not in the design below.

| Fact | Consequence for F2 |
| ---- | ------------------ |
| **Monaco's import specifiers are not the documented ones.** 0.56 ships an `exports` map (`"./*": "./esm/vs/*.js"`), so `monaco-editor/esm/vs/...` resolves to `esm/vs/esm/vs/...` and Rollup fails | Import `monaco-editor/editor/editor.api`, `monaco-editor/basic-languages/monaco.contribution`, `monaco-editor/editor/editor.worker?worker`. F1's `monaco-setup.ts` already does |
| **`followAppTheme()` is called inside `CodeViewer`**, once per mounted viewer, because F1 only ever mounts one Monaco surface at a time | Monaco's theme is global. The moment F2 mounts a diff editor beside a file tab, **move the call up to the direction root** (`FilesView`) and drop it from `CodeViewer`, or two observers will fight over one global |
| **The editor worker runs and is a served file** — proved packaged in F1 T13, `file:///.../app.asar/out/renderer/assets/editor.worker-*.js`, not a `blob:` | F2's diff is computed in that worker. The CSP question is settled; do not re-spike it |
| **`languageForPath(path)` exists in `monaco-setup.ts`**, matching filename first, then extension, then `plaintext` | Both sides of a diff take their language from it |
| **A tab is a `FileTab` object**, not a path string, and `openFile(path, { fromDiffMode, deleted })` already carries `fromDiffMode` | FDIF's "a click in a diff mode opens a diff" replaces what `fromDiffMode` currently labels; the flag is the seam |
| **`FilesState` is `{ mode, base? }`** and `filesStateFor(ui, worktreeId)` reads it | A per-worktree diff preference (side-by-side vs inline) goes here, and a config write must carry direction and mode in **one** patch (AD-028 pattern, T22) |
| **AD-032**: `BaseOptions` carries an optional `error` | F2 inherits the base picker wholesale; a failed listing renders the git line disabled, not the FXPL-11 prompt |
| **AD-033**: a `.sln` opens VS 2026 on a **double** click; a single click opens a tab; 3 s relaunch guard | F2's click handling in the tree must preserve this — the single-click path is deferred by 250 ms for solutions only |

**Smoke lessons from F1 T23** — the CDP checks that passed while proving nothing, and what they cost:
Monaco scrolls **virtually** (drive it with CDP `Input.dispatchMouseEvent` `mouseWheel`, assert the first
**rendered line number**, never a `scrollTop` that stays 0); it renders spaces as **NBSP** in
`view-line.textContent`; it emits `mtk1` for plaintext, so assert **distinct** `mtk` classes, not a token
count; `Input.dispatchKeyEvent` needs `text` to produce a character; read-only is provable only by
**typing and comparing**, never by a DOM property, because `NativeEditContext` sets `readonly`
unconditionally. **Falsify every new check against a deliberately broken build before trusting it** —
that is how a hole inside a fix for the previous hole was found. The smoke also needs a **freshly
launched app** and an isolated `--user-data-dir`.

---

## Test Coverage Matrix

> Generated from codebase, project guidelines, and spec — confirm before Execute. Guidelines found: `.specs/codebase/TESTING.md`, `vitest.config.ts`, `package.json` scripts.

| Code Layer | Required Test Type | Coverage Expectation | Location Pattern | Run Command |
| ---------- | ------------------ | -------------------- | ---------------- | ----------- |
| Main-process module with logic (`file-diff.ts`) | unit | All branches; 1:1 to FDIF-01..06, 15, 19, 20, 24; every listed edge case reachable without a GUI | `src/main/file-diff.test.ts` | `npm test` |
| Extracted pure helpers (`lineEndingChanges`, `parseNumstat`, `diff-view.ts`, F1's `tabsAfterClose`) | unit | Input→output per AC, including failure shapes | co-located `*.test.ts` | `npm test` |
| Shared types, IPC contract, config schema | none | build gate only | — | `npm run typecheck` |
| Thin Electron shell (`index.ts` wiring) | none (hand-verified) | — | `src/main/index.ts` | `npm run typecheck` |
| Renderer components and hooks | none (CDP smoke + visual) | — | — | `node scripts/smoke-files-diff.mjs` |
| Spike findings | manual | Each assumption the design flagged as unverified, measured | `design.md` § Spike Findings | by hand |
| Out-of-CI smoke script | manual only | Every AC no unit test reaches | `scripts/smoke-*.mjs` | `node scripts/smoke-files-diff.mjs` (live session) |

## Gate Check Commands

| Gate Level | When to Use | Command |
| ---------- | ----------- | ------- |
| Quick | After a task whose only tests are unit tests | `npm test` |
| Full | After a logic-bearing, contract, config or renderer task | `npm run typecheck && npm run lint && npm test` |
| Build | At each phase boundary | `npx electron-vite build` |
| Manual | The spike (T1) and the CDP smoke (T21) | by hand / `node scripts/smoke-files-diff.mjs` |

**Lint is judged by exit code AND by warning count** — record the count at T1 and diff it at every gate.

---

## Execution Plan

### Phase 1: De-risk the diff editor

```
T1
```

**Stop point.** If the spike contradicts the design — Monaco keeps line endings after all, or one of the three APIs is missing on the pinned version — the design is amended and Phases 2–5 re-planned before T2.

### Phase 2: Main process

```
T1 → T2 → T3 → T4 → T5 → T6
```

### Phase 3: Renderer decisions

```
T6 → T7 → T8 → T9 → T10 → T11 → T12 → T13
```

### Phase 4: The viewer and its wiring

```
T13 → T14 → T15 → T16 → T17 → T18 → T19 → T20
```

### Phase 5: End to end

```
T20 → T21
```

---

## Task Breakdown

### T1: Measure what the design assumed about Monaco's diff editor

**What**: With a throwaway mount of Monaco's `DiffEditor` on the version F1 pinned, measure the four things the design flagged as unverified, and record the results in `design.md` under a new **Spike Findings** section.
**Where**: `.specs/features/files-diff/design.md`
**Depends on**: None
**Reuses**: F1's `monaco-setup.ts`; the AM1 / F1 T13 spike precedent.
**Requirement**: FDIF-13, 15, 22, 25

**Tools**: MCP: NONE · Skill: NONE

**Done when**:

- [x] **Line endings**: a CRLF original against an LF modified with identical text — recorded whether Monaco reports zero line changes (the premise of D2) — **0 line changes**, models keeping their own terminators
- [x] **Folding**: `hideUnchangedRegions` exists on the pinned version and folds a 2000-line file with one change into a strip; the option names recorded — 2000 lines to **15 rendered**, 4 fold widgets
- [x] **Navigation**: the diff editor exposes next / previous change on the pinned version; the call recorded — `goToDiff('next')` moved line 1 to **1001**
- [x] **Sizing**: `onDidContentSizeChange` fires on both inner editors, including when a folded region is expanded — 6/6 from mount, **9/8** after unfolding
- [x] **Shortcut**: VS Code's own binding for next / previous change in its diff editor read from VS Code's Keyboard Shortcuts on this machine and recorded — **Alt+F5** / **Shift+Alt+F5**
- [x] The throwaway mount is removed; only the design file changes
- [x] Lint warning baseline recorded in the commit body
- [x] If any finding contradicts the design: the design is amended in the same commit and the stop point above applies — **nothing contradicted it; Phases 2-5 stand as planned**

**Tests**: manual
**Gate**: manual
**Commit**: `docs(specs): record the monaco diff editor spike findings`
**Status**: Complete — stop point cleared, all four assumptions hold.

> **The shortcut is not F7.** Most references say F7 / Shift+F7, and that is what the diff-editor
> commands used to be; F7 now belongs to the accessible diff viewer. Read out of the installed
> build's own bundle rather than from memory: `workbench.action.compareEditor.nextChange` registers
> `primary: 575` = `512` (Alt) + `63` (F5), and `previousChange` `1599` = `1024` (Shift) + `512` +
> `63`. No user override exists in `%APPDATA%\Code\User\keybindings.json`. Had this been written
> from memory the app would have shipped a binding VS Code no longer uses.
>
> **Use `goToDiff`, not `accessibleDiffViewerNext/Prev`.** Both exist on the pinned version; the
> latter drives the accessibility view, not the editor's own position.
>
> **The EOL finding is the one that mattered**, since D2's whole design rests on it: Monaco's models
> *do* keep their terminators (`getEOL()` reports CRLF and LF, and the raw text differs), but the
> diff reports zero changes. So the normalization is in the diff, not in the model — which is why
> detection has to come from raw bytes in main, and why a whole-file EOL flip would otherwise read
> as "no changes" to the user.

---

### T2: Declare the diff contract

**What**: Add `DiffRef`, `DiffRequest`, `DiffSide`, `Eol`, `DiffSides`, `FileStat` to `src/shared/files.ts` as the design defines them, and register `files:diff-sides` and `files:diff-stats` in `IpcContract`.
**Where**: `src/shared/files.ts`
**Depends on**: T1
**Reuses**: F1's `FileContent` and the contract's doc-comment convention.
**Requirement**: FDIF-01, 02, 19

**Tools**: MCP: NONE · Skill: NONE

**Done when**:

- [x] `DiffSide` is `FileContent | { kind: 'absent' }` — `absent` means the side does not exist, distinct from F1's `missing`
- [x] `DiffRef` is revision-or-disk per side, so F3 reuses it unchanged
- [x] Gate passes: `npm run typecheck && npm run lint && npm test`
- [x] Test count: **1042** (unchanged; lint 0 errors / 18 warnings)

**Tests**: none
**Gate**: full
**Commit**: `feat(shared): declare the diff contract`
**Status**: ✅ Complete

> Note: `DiffRef` carries `path` **inside** each side rather than once per request, which is what
> lets FDIF-05 read a rename's original from `oldPath` without a second field. `files:diff-stats`
> takes `FilesMode`, so `ipc-contract.ts` imports it too.

---

### T3: Find the lines whose ending changed

**What**: Create `src/main/file-diff.ts` with the pure `lineEndingChanges(originalRaw, modifiedRaw)`, returning the modified-side line numbers whose terminator differs from the matching original line, plus the dominant endings.
**Where**: `src/main/file-diff.ts`
**Depends on**: T2
**Reuses**: Nothing — new pure logic.
**Requirement**: FDIF-15

**Tools**: MCP: NONE · Skill: NONE

**Done when**:

- [x] A whole-file CRLF → LF flip returns every line and `CRLF` → `LF` — `file-diff.test.ts:11`
- [x] A mixed file where 4 of 719 lines are CRLF, flipped to pure LF, returns exactly those 4 — `:24`
- [x] Identical endings return `[]` — `:31`
- [x] A CR-only file is recognized as `CR` — `:40`
- [x] A final line with no terminator on one side and one on the other counts as changed — `:48`
- [x] Lines added or removed by the text change are not reported as ending changes — `:57`
- [x] `src/main/file-diff.test.ts` created
- [x] Gate passes: `npm test`
- [x] Test count: 1042 + 6 = **1048**

**Tests**: unit
**Gate**: quick
**Commit**: `feat(main): find the lines whose line ending changed`
**Status**: ✅ Complete

> **Signature deviates from the design, on purpose.** The design typed it
> `lineEndingChanges(originalRaw: Buffer, modifiedRaw: Buffer, lineMap)`. It ships as
> `(originalRaw: string, modifiedRaw: string): EolChanges`. Both sides arrive as strings anyway —
> `git show`'s stdout and F1's `readForView` text — and neither decoding normalizes a terminator,
> so a `Buffer` round-trip would buy nothing. The `lineMap` third argument is gone: matching is
> internal, by the run of identical line text at the top and at the bottom of the two sides. What
> the text change itself added or removed sits between those runs and is never reported.
>
> **The limit of that matching, for T13 and T14.** Two *distant* edits leave a large middle block
> unreported, so a flip that also edits line 10 and line 700 of a 719-line file names only the lines
> outside those two edits. Under-reporting, never over-reporting: a marker on a line whose ending
> did not change would be a lie, a missing marker is only a missing marker.
>
> **`from` / `to` are the *dominant* endings, so they can be equal while lines are reported.** The
> mixed-file case (715 LF + 4 CRLF → pure LF) yields `from: 'LF'`, `to: 'LF'`, `lines: [4 of them]`.
> `eolStripText` (T13) has to word that case; `CRLF → LF on 4 lines` would be wrong there.
>
> Mutation-checked: 6 deliberate breaks, all killed. Index-pairing without the text guard and
> dropping the bottom-run pass both die on the insertion test; reporting a text difference instead
> of an ending difference dies on 5 of the 6; treating a missing terminator as equal to any dies on
> the last-line test; calling a CR side LF dies on the CR test; reporting every aligned line dies on
> the identical-endings test.

---

### T4: Count the changes per file

**What**: Add `diffStats(worktreePath, mode, base?)` and the pure `parseNumstat(stdout)` to `file-diff.ts`; count the lines of untracked files, which `numstat` omits.
**Where**: `src/main/file-diff.ts`
**Depends on**: T3
**Reuses**: `git.ts`; F1's `changedSince` merge base and `worktrees:changes` list.
**Requirement**: FDIF-19, 20, 24

**Tools**: MCP: NONE · Skill: NONE

**Done when**:

- [ ] `parseNumstat` reads `-z` output, including a rename record, and maps `-\t-` to `binary: true`
- [ ] Diff-to-origin totals equal `git diff --shortstat <mergeBase> HEAD` on a temp repo
- [ ] An untracked 7-line file counts as `added: 7, removed: 0`
- [ ] An empty mode returns `[]`
- [ ] Gate passes: `npm run typecheck && npm run lint && npm test`
- [ ] Test count: 856 + 6 = **862**

**Tests**: unit
**Gate**: full
**Commit**: `feat(main): count added and removed lines per changed file`

---

### T5: Read both sides of a diff

**What**: Add `readDiffSides(worktreePath, request)` to `file-diff.ts` — revisions via `git cat-file -s` then `git show`, the disk via F1's `readForView`, `null` refs as `absent`, and `lineEndingChanges` on the raw bytes.
**Where**: `src/main/file-diff.ts`
**Depends on**: T4
**Reuses**: `git.ts`; F1's `readForView`, `isBinary` and 1 MB cap.
**Requirement**: FDIF-01, 02, 03, 04, 05, 06, 15

**Tools**: MCP: NONE · Skill: NONE

**Done when**:

- [ ] Merge base → `HEAD`, and `HEAD` → disk, each return the right content on a temp repo
- [ ] An added file returns `original: absent`; a deleted one `modified: absent`
- [ ] A renamed file reads its original from `oldPath`
- [ ] A blob above 1 MB returns `too-large` **without `git show` being run** (asserted by the size path taken, not by timing)
- [ ] A binary blob returns `binary`
- [ ] A missing revision returns `{ kind: 'error' }` and never throws
- [ ] A CRLF-committed file edited to LF on disk returns its `eolChanged` lines
- [ ] Gate passes: `npm run typecheck && npm run lint && npm test`
- [ ] Test count: 862 + 8 = **870**

**Tests**: unit
**Gate**: full
**Commit**: `feat(main): read both sides of a diff`

---

### T6: Serve the diff channels

**What**: Register `files:diff-sides` and `files:diff-stats` in `index.ts`.
**Where**: `src/main/index.ts`
**Depends on**: T5
**Reuses**: `handle()`; F1's handler registrations.
**Requirement**: FDIF-01, 19

**Tools**: MCP: NONE · Skill: NONE

**Done when**:

- [ ] Two one-line delegations
- [ ] Gate passes: `npm run typecheck && npm run lint && npm test`
- [ ] Phase gate passes: `npx electron-vite build`
- [ ] Test count: **870** (unchanged)

**Tests**: none
**Gate**: build
**Commit**: `feat(main): serve the diff channels`

---

### T7: Persist the diff preferences

**What**: Add `ui.diffLayout?: 'side-by-side' | 'inline'` and `ui.diffIgnoreWhitespace?: boolean` to `AppConfig`.
**Where**: `src/shared/config.ts`
**Depends on**: T6
**Reuses**: The optional-means-default convention of `ui.*`.
**Requirement**: FDIF-11, 12, 15, 16

**Tools**: MCP: NONE · Skill: NONE

**Done when**:

- [ ] Absent means side by side and whitespace shown; `DEFAULT_CONFIG` unchanged
- [ ] Existing `config-store` tests pass unedited
- [ ] Gate passes: `npm run typecheck && npm run lint && npm test`
- [ ] Test count: **870** (unchanged)

**Tests**: none
**Gate**: full
**Commit**: `feat(shared): persist the diff layout and whitespace choice`

---

### T8: Decide what each side of a diff is

**What**: Create `src/renderer/src/lib/diff-view.ts` with `diffRequestFor(mode, changed, mergeBase)`.
**Where**: `src/renderer/src/lib/diff-view.ts`
**Depends on**: T7
**Reuses**: `ChangedPath`, `DiffRequest`.
**Requirement**: FDIF-01, 02, 03, 04, 05

**Tools**: MCP: NONE · Skill: NONE

**Done when**:

- [ ] Diff-to-origin: `{ rev: mergeBase }` → `{ rev: 'HEAD' }`
- [ ] Uncommitted: `{ rev: 'HEAD' }` → `{ disk: true }`
- [ ] `added` and `untracked` → original `null`; `deleted` → modified `null`
- [ ] `renamed` → original path is `oldPath`
- [ ] `diff-view.test.ts` created
- [ ] Gate passes: `npm test`
- [ ] Test count: 870 + 6 = **876**

**Tests**: unit
**Gate**: quick
**Commit**: `feat(renderer): decide the two sides of a diff`

---

### T9: Key the tabs and place All changes

**What**: Add `tabKeyOf`, `isSameTab` and `tabsWithAllChanges(tabs, mode)` to `diff-view.ts`.
**Where**: `src/renderer/src/lib/diff-view.ts`
**Depends on**: T8
**Reuses**: F1's tab shape.
**Requirement**: FDIF-08, 09, 17, 18

**Tools**: MCP: NONE · Skill: NONE

**Done when**:

- [ ] A diff tab of `a.ts` in each mode and a file tab of `a.ts` are three different keys
- [ ] `tabsWithAllChanges` puts All changes first in both diff modes, removes it in full-folder mode, and never duplicates it
- [ ] A diff tab keeps its mode when the view's mode changes
- [ ] Gate passes: `npm test`
- [ ] Test count: 876 + 5 = **881**

**Tests**: unit
**Gate**: quick
**Commit**: `feat(renderer): key diff tabs and place the all changes tab`

---

### T10: Keep All changes open

**What**: Extend F1's `tabsAfterClose` so the All changes tab can never be closed, and closing the tab next to it never focuses nothing while All changes remains.
**Where**: `src/renderer/src/lib/files-view.ts`
**Depends on**: T9
**Reuses**: F1's `tabsAfterClose` and its tests, which must keep passing unedited.
**Requirement**: FDIF-17

**Tools**: MCP: NONE · Skill: NONE

**Done when**:

- [ ] A close request for All changes returns the tabs unchanged
- [ ] Closing the only other tab focuses All changes
- [ ] Every pre-existing `tabsAfterClose` test passes unedited
- [ ] Gate passes: `npm test`
- [ ] Test count: 881 + 2 = **883**

**Tests**: unit
**Gate**: quick
**Commit**: `feat(renderer): keep the all changes tab open`

---

### T11: Decide the stack's opening state and totals

**What**: Add `initialExpansion(files)` and `totals(files)` to `diff-view.ts`.
**Where**: `src/renderer/src/lib/diff-view.ts`
**Depends on**: T10
**Reuses**: `FileStat`.
**Requirement**: FDIF-20, 21

**Tools**: MCP: NONE · Skill: NONE

**Done when**:

- [ ] 40 files → the first 10 in tree order expanded; 7 files → all 7
- [ ] `totals` sums added and removed and counts files; binary files count as files with no lines
- [ ] Gate passes: `npm test`
- [ ] Test count: 883 + 4 = **887**

**Tests**: unit
**Gate**: quick
**Commit**: `feat(renderer): decide the all changes opening state and totals`

---

### T12: Decide where next change goes

**What**: Add `nextChangeTarget(position, sections, direction)` to `diff-view.ts`.
**Where**: `src/renderer/src/lib/diff-view.ts`
**Depends on**: T11
**Reuses**: The line-change list the diff editor reports (shape confirmed in T1).
**Requirement**: FDIF-25, 26

**Tools**: MCP: NONE · Skill: NONE

**Done when**:

- [ ] Within a file: the next change after the cursor, or the previous one before it
- [ ] Past a file's last change: the first change of the next section, flagged to expand it
- [ ] Past the last change of the last file: stays put
- [ ] Before the first change of a section: the previous section's last change
- [ ] A section with no changes (identical content) is skipped
- [ ] Gate passes: `npm test`
- [ ] Test count: 887 + 5 = **892**

**Tests**: unit
**Gate**: quick
**Commit**: `feat(renderer): decide where next and previous change go`

---

### T13: Word the EOL strip and plan which sections mount

**What**: Add `eolStripText(lines, from, to)` and `mountPlan(visible, mounted, cap = 12)` to `diff-view.ts`.
**Where**: `src/renderer/src/lib/diff-view.ts`
**Depends on**: T12
**Reuses**: `Eol`.
**Requirement**: FDIF-15, 22

**Tools**: MCP: NONE · Skill: NONE

**Done when**:

- [ ] `CRLF → LF on 12 lines`; singular `on 1 line`
- [ ] `mountPlan` mounts visible sections not yet mounted, never exceeds the cap, and unmounts the sections farthest from the visible range first
- [ ] A collapsed section is never in the mount set, even when visible
- [ ] Gate passes: `npm test`
- [ ] Phase gate passes: `npx electron-vite build`
- [ ] Test count: 892 + 6 = **898**

**Tests**: unit
**Gate**: quick
**Commit**: `feat(renderer): word the line ending strip and plan section mounts`

---

### T14: Render one diff

**What**: Create the `DiffViewer` component — read-only Monaco `DiffEditor`, layout and whitespace from preferences, unchanged regions folded, the EOL strip and glyph-margin markers, next / previous change on VS Code's binding (as recorded in T1), an "identical" message, fit-to-content sizing when used in a section, and scroll kept across a content refresh.
**Where**: `src/renderer/src/components/DiffViewer.tsx`
**Depends on**: T13
**Reuses**: F1's `monaco-setup.ts`; `eolStripText`; the APIs T1 confirmed.
**Requirement**: FDIF-07, 11, 12, 13, 14, 15, 16, 25, 30

**Tools**: MCP: NONE · Skill: NONE

**Done when**:

- [ ] Both sides reject typing
- [ ] Ignoring whitespace hides trim-whitespace changes **and** the EOL strip and markers
- [ ] The shortcut is VS Code's binding as recorded in T1; if it differs from the design's `Alt+F5`, the task records the deviation
- [ ] Models are disposed with the editor — no leak across tab switches
- [ ] Gate passes: `npm run typecheck && npm run lint && npm test`
- [ ] Test count: **898** (unchanged)

**Tests**: none
**Gate**: full
**Commit**: `feat(renderer): render a read-only diff`

---

### T15: Render one section of the stack

**What**: Create the `DiffSection` component — header (path, status, +/−), expand / collapse, `DiffViewer` only when the mount plan says so, the last measured height held while unmounted, `FilePlaceholder` for binary or oversized files.
**Where**: `src/renderer/src/components/DiffSection.tsx`
**Depends on**: T14
**Reuses**: `DiffViewer`; F1's `FilePlaceholder`.
**Requirement**: FDIF-19, 22, 23

**Tools**: MCP: NONE · Skill: NONE

**Done when**:

- [ ] Unmounting a section does not move the scroll position
- [ ] An estimated height from `added + removed` is used until the first measurement
- [ ] Gate passes: `npm run typecheck && npm run lint && npm test`
- [ ] Test count: **898** (unchanged)

**Tests**: none
**Gate**: full
**Commit**: `feat(renderer): render one section of the change stack`

---

### T16: Render the All changes tab

**What**: Create the `AllChangesTab` component — totals header, one `DiffSection` per file in tree order, the `IntersectionObserver` feeding `mountPlan`, cross-file navigation, the empty state.
**Where**: `src/renderer/src/components/AllChangesTab.tsx`
**Depends on**: T15
**Reuses**: `initialExpansion`, `totals`, `mountPlan`, `nextChangeTarget`.
**Requirement**: FDIF-19, 20, 21, 22, 24, 26

**Tools**: MCP: NONE · Skill: NONE

**Done when**:

- [ ] Never more than 12 editors live, checked by hand on a 40-file branch
- [ ] Next change at the end of a file expands and enters the next one
- [ ] **[amended at F3 Design]** Takes the file list, the `FileStat[]` and a `(changed) => DiffRequest` builder as props and reads nothing from the Files mode itself — F3's commit tab mounts it unchanged
- [ ] Gate passes: `npm run typecheck && npm run lint && npm test`
- [ ] Test count: **898** (unchanged)

**Tests**: none
**Gate**: full
**Commit**: `feat(renderer): render the all changes tab`

---

### T17: Hold diff state in the Files hook

**What**: Extend `use-files.ts` — diff tabs, the All changes tab via `tabsWithAllChanges`, stats per mode, both preferences through `config:patch`, and refresh on `files:changed`, `gitStateChanged` and a base change.
**Where**: `src/renderer/src/lib/use-files.ts`
**Depends on**: T16
**Reuses**: F1's hook shape and its `files:changed` subscription.
**Requirement**: FDIF-08, 09, 12, 16, 17, 21, 30, 31, 32

**Tools**: MCP: NONE · Skill: NONE

**Done when**:

- [ ] An uncommitted diff re-reads only when its own path is in a change batch
- [ ] `gitStateChanged` re-reads every open diff and the stats
- [ ] A base change re-reads only diff-to-origin diffs and stats
- [ ] Gate passes: `npm run typecheck && npm run lint && npm test`
- [ ] Test count: **898** (unchanged)

**Tests**: none
**Gate**: full
**Commit**: `feat(renderer): hold diff tabs and preferences in the files hook`

---

### T18: Open a diff from the tree

**What**: In `FileTree`, a click in either diff mode opens a diff tab built from `diffRequestFor`.
**Where**: `src/renderer/src/components/FileTree.tsx`
**Depends on**: T17
**Reuses**: `diffRequestFor`; the hook from T17.
**Requirement**: FDIF-01, 02, 10

**Tools**: MCP: NONE · Skill: NONE

**Done when**:

- [ ] No click in a diff mode opens a file tab any more
- [ ] Full-folder mode is unchanged
- [ ] Gate passes: `npm run typecheck && npm run lint && npm test`
- [ ] Test count: **898** (unchanged)

**Tests**: none
**Gate**: full
**Commit**: `feat(renderer): open a diff from the tree in the diff modes`

---

### T19: Show diff tabs and their controls

**What**: Extend `FileTabs` — diff tabs with a diff glyph, the fixed All changes tab, **Open file** (hidden for deleted files), the layout and whitespace toggles, next / previous buttons, and the F1 launcher row acting on the diff's file.
**Where**: `src/renderer/src/components/FileTabs.tsx`
**Depends on**: T18
**Reuses**: F1's tab strip and launcher row; `DiffViewer`; `AllChangesTab`.
**Requirement**: FDIF-12, 16, 17, 25, 27, 28, 29

**Tools**: MCP: NONE · Skill: NONE

**Done when**:

- [ ] All changes has no close button
- [ ] Open file lands in a file tab for the same path, leaving the diff tab open
- [ ] Toggles apply to every open diff at once
- [ ] Gate passes: `npm run typecheck && npm run lint && npm test`
- [ ] Test count: **898** (unchanged)

**Tests**: none
**Gate**: full
**Commit**: `feat(renderer): show diff tabs and their controls`

---

### T20: Retire the interim file view

**What**: Remove the "file view, not a diff" label from `CodeViewer`, and mark FXPL-14 in `files-explore/spec.md` as superseded by FDIF-10.
**Where**: `src/renderer/src/components/CodeViewer.tsx`
**Depends on**: T19
**Reuses**: The AD-018 pattern for superseding a shipped requirement.
**Requirement**: FDIF-10

**Tools**: MCP: NONE · Skill: NONE

**Done when**:

- [ ] No code path renders the interim label
- [ ] `files-explore/spec.md` FXPL-14 carries "superseded by FDIF-10"
- [ ] Gate passes: `npm run typecheck && npm run lint && npm test`
- [ ] Phase gate passes: `npx electron-vite build`
- [ ] Test count: **898** (unchanged)

**Tests**: none
**Gate**: build
**Commit**: `refactor(renderer): retire the interim file view in diff modes`

---

### T21: Drive the diffs end to end

**What**: Create `scripts/smoke-files-diff.mjs` — seeds a temp repo with a renamed, an added, a deleted and a modified file on a branch, a CRLF-committed file rewritten as LF on disk, a binary and a 2 MB file, 40 changed files for the stack, and drives every surface.
**Where**: `scripts/smoke-files-diff.mjs`
**Depends on**: T20
**Reuses**: F1's `scripts/smoke-files.mjs` harness and teardown.
**Requirement**: FDIF-01..32 end to end; the sole evidence for 07, 09, 11, 12, 13, 14, 16, 22, 23, 25, 26, 27, 28, 29, 30, 31, 32

**Tools**: MCP: NONE · Skill: NONE

**Done when**:

- [ ] Checks: each reference side; the EOL strip and markers, and their disappearance when whitespace is hidden; layout and whitespace surviving a restart; All changes present only in diff modes, not closable, 10 of 40 expanded, totals matching `git diff --shortstat`, at most 12 editors live while scrolling; next change crossing files; Open file; a shell append updating an uncommitted diff within 1 s without jumping; a commit dropping the file from All changes
- [ ] Unregisters the temp workspace and restores the owner's direction, theme and diff preferences
- [ ] Numbered pass/fail line per check; all pass against a live dev app

**Tests**: manual
**Gate**: manual
**Commit**: `test(files): drive the diffs end to end`

---

## Phase Execution Map

```
Phase 1 → Phase 2 → Phase 3 → Phase 4 → Phase 5

Phase 1:  T1   (stop point)
Phase 2:  T2 → T3 → T4 → T5 → T6
Phase 3:  T7 → T8 → T9 → T10 → T11 → T12 → T13
Phase 4:  T14 → T15 → T16 → T17 → T18 → T19 → T20
Phase 5:  T21
```

Strictly sequential. **Packing** (~7 per batch, whole phases): Phases 1 + 2 (1 + 5) = batch 1; Phase 3 (7) = batch 2; Phases 4 + 5 (7 + 1) = batch 3. 21 tasks > 8, so the sub-agent offer applies at Execute — offer-then-confirm. The T1 stop point holds regardless of batching.

---

## Task Granularity Check

| Task | Scope | Status |
| ---- | ----- | ------ |
| T1 | 1 findings section | ✅ |
| T2 | 1 types file + contract entries | ✅ |
| T3 | 1 pure function | ✅ |
| T4 | 1 function + 1 parser | ✅ |
| T5 | 1 function | ✅ |
| T6 | 1 wiring file | ✅ |
| T7 | 1 schema change | ✅ |
| T8 | 1 pure function | ✅ |
| T9 | 3 small pure functions on tab identity | ⚠️ cohesive — one concept, tab identity |
| T10 | 1 function extension | ✅ |
| T11 | 2 small pure functions | ✅ |
| T12 | 1 pure function | ✅ |
| T13 | 2 small pure functions | ✅ |
| T14–T19 | 1 component / hook each | ✅ |
| T20 | 1 component change + a spec note | ✅ |
| T21 | 1 script | ✅ |

---

## Diagram-Definition Cross-Check

| Task | Depends On (task body) | Diagram Shows | Status |
| ---- | ---------------------- | ------------- | ------ |
| T1 | None | phase head | ✅ |
| T2 | T1 | T1 → T2 (boundary) | ✅ |
| T3 | T2 | T2 → T3 | ✅ |
| T4 | T3 | T3 → T4 | ✅ |
| T5 | T4 | T4 → T5 | ✅ |
| T6 | T5 | T5 → T6 | ✅ |
| T7 | T6 | T6 → T7 (boundary) | ✅ |
| T8 | T7 | T7 → T8 | ✅ |
| T9 | T8 | T8 → T9 | ✅ |
| T10 | T9 | T9 → T10 | ✅ |
| T11 | T10 | T10 → T11 | ✅ |
| T12 | T11 | T11 → T12 | ✅ |
| T13 | T12 | T12 → T13 | ✅ |
| T14 | T13 | T13 → T14 (boundary) | ✅ |
| T15 | T14 | T14 → T15 | ✅ |
| T16 | T15 | T15 → T16 | ✅ |
| T17 | T16 | T16 → T17 | ✅ |
| T18 | T17 | T17 → T18 | ✅ |
| T19 | T18 | T18 → T19 | ✅ |
| T20 | T19 | T19 → T20 | ✅ |
| T21 | T20 | T20 → T21 (boundary) | ✅ |

---

## Test Co-location Validation

| Task | Code Layer | Matrix Requires | Task Says | Status |
| ---- | ---------- | --------------- | --------- | ------ |
| T1 | Spike findings | manual | manual | ✅ |
| T2 | Shared types + contract | none | none | ✅ |
| T3 | Pure helper in main | unit | unit | ✅ |
| T4, T5 | Main module with logic | unit | unit | ✅ |
| T6 | Thin Electron shell | none | none | ✅ |
| T7 | Config schema | none | none | ✅ |
| T8–T13 | Pure helpers | unit | unit | ✅ |
| T14–T19 | Renderer components / hook | none | none | ✅ |
| T20 | Renderer component | none | none | ✅ |
| T21 | Smoke script | manual only | manual | ✅ |

---

## Requirement Traceability

| AC | Tasks |
| -- | ----- |
| FDIF-01 | T2, T5, T6, T8, T18, T21 |
| FDIF-02 | T2, T5, T8, T18, T21 |
| FDIF-03 | T5, T8, T21 |
| FDIF-04 | T5, T8, T21 |
| FDIF-05 | T5, T8, T21 |
| FDIF-06 | T5, T21 |
| FDIF-07 | T14, T21 |
| FDIF-08 | T9, T17 |
| FDIF-09 | T9, T17, T21 |
| FDIF-10 | T18, T20 |
| FDIF-11 | T7, T14, T21 |
| FDIF-12 | T7, T14, T17, T19, T21 |
| FDIF-13 | T1, T14, T21 |
| FDIF-14 | T14, T21 |
| FDIF-15 | T1, T3, T5, T7, T13, T14, T21 |
| FDIF-16 | T7, T14, T17, T19, T21 |
| FDIF-17 | T9, T10, T17, T19, T21 |
| FDIF-18 | T9, T21 |
| FDIF-19 | T2, T4, T6, T15, T16, T21 |
| FDIF-20 | T4, T11, T16, T21 |
| FDIF-21 | T11, T16, T17, T21 |
| FDIF-22 | T1, T13, T15, T16, T21 |
| FDIF-23 | T15, T21 |
| FDIF-24 | T4, T16, T21 |
| FDIF-25 | T1, T12, T14, T19, T21 |
| FDIF-26 | T12, T16, T21 |
| FDIF-27 | T19, T21 |
| FDIF-28 | T19, T21 |
| FDIF-29 | T19, T21 |
| FDIF-30 | T14, T17, T21 |
| FDIF-31 | T17, T21 |
| FDIF-32 | T17, T21 |

All 32 mapped; none unmapped.
