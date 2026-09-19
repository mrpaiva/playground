# Terminal Links Validation

**Result**: ✅ PASS (pass 2, `49a70c1..626762f`) — 30/30 active ACs spec-anchored (19/19 P1, 2/2 P2, 9/9 edge); gate 1021/1021 green (typecheck 0, lint 0 errors); sensor 9/9 mutants killed (8 in pass 1, +1 in pass 2). Pass 1 (`6ecd19c..49a70c1`) returned FAIL on one evidence-only gap (`LINK-20`, no smoke row) and one optional inspection finding (stale `pendingLink`); both closed by `9afe7f6` (one-line reset) and `626762f` (smoke rows 18–21, two spec assumptions). 0 spec-precision gaps open. Pass-1 report and the pass-2 re-verification below the owner smoke.

**Date**: 2026-09-18
**Spec**: `.specs/features/terminal-links/spec.md`
**Branch**: `feature/terminal-links` from `main` at `6ecd19c`
**Diff range**: `6ecd19c..HEAD` — see the Verifier report for the exact range of each pass

---

## Owner-run smoke (T11)

Run on 2026-09-18 by the author, driving the dev app (`electron-vite dev -- --remote-debugging-port=9222`,
xterm 6.0.0, Windows 11 Pro 10.0.26200) through the Chrome DevTools Protocol: mouse events dispatched by
coordinates (`Input.dispatchMouseEvent`, `modifiers: 2` = Ctrl), outcomes read from the OS (window titles,
Explorer COM, process list) and from the app DOM. The nightly install was left running untouched (separate
`playground-nightly` user data). Fixture: an ad-hoc `pwsh` session in `E:\Triade\Repos\playground` printing
six lines; a directory with a space (`%TEMP%\lnk test\probe.zzqx`) created for the run and removed after.

Machine facts that shaped the run: `assoc .md` → no association; `assoc .ts` → `WMP11.AssocFile.TTS`
(Windows Media Player). Both are real consequences of the "default app" decision (AD-021): on this machine a
Ctrl+click on `src\main\index.ts` would launch Media Player, so that link was hover-checked but not opened.

| # | Check | Requirement | Method | Observed | Result |
| - | ----- | ----------- | ------ | -------- | ------ |
| 1 | App mounts with the wiring | — | console after load | only vite/React DevTools notices; no errors | ✅ |
| 2 | Hover a URL | LINK-01 | mousemove to `https://example.com/`, screenshot | exact URL span underlined, `cursor: pointer` | ✅ |
| 3 | Ctrl+click the URL | LINK-02 | click with Ctrl, then window titles | default browser (Comet) window "Example Domain" | ✅ |
| 4 | Hover an existing file with `:line` | LINK-06 | `src\main\index.ts:10` | `cursor: pointer` (link) | ✅ |
| 5 | Hover a missing path | LINK-07 | `src/main/nope.ts` | `cursor: text` (not a link) | ✅ |
| 6 | Hover a spaced path | LINK-08 | `C:\…\Temp\lnk test\probe.zzqx` | whole path underlined, up to `.zzqx` | ✅ |
| 7 | Ctrl+click a directory | LINK-11 | `.\src`, then Explorer COM windows | new Explorer window on `E:\Triade\Repos\playground\src`; closed afterwards | ✅ |
| 8 | Ctrl+click an unassociated file | LINK-10 | `probe.zzqx`, then process/window list | `rundll32 shell32.dll,OpenAs_RunDLL "…\lnk test\probe.zzqx"` spawned; visible window "Selecionar um aplicativo" (OpenWith.exe); quoted spaced path accepted | ✅ |
| 9 | Ctrl+click `.\README.md:3` | LINK-10, LINK-12 | same | `rundll32 … OpenAs_RunDLL E:\Triade\Repos\playground\README.md` — resolved against cwd, `:3` stripped; chooser shown | ✅ |
| 10 | First click on output painted under a still pointer | LINK-19 | pointer parked on an empty row, then the shell printed its prompt `PS E:\Triade\Repos\playground>` under it; Ctrl+click with no mousemove | Explorer opened on `E:\Triade\Repos\playground` on the first click | ✅ |
| 11 | Plain click reaches a mouse-tracking agent | baseline | Node probe in the session (`setRawMode`, `CSI ?1000h ?1006h`, echoes stdin as hex) | `ESC[<0;59;30M` + `ESC[<0;59;30m` received | ✅ (probe works) |
| 12 | Ctrl+click on a link never reaches the agent | LINK-14 | Ctrl+click the URL with the probe listening | **no** bytes received; browser activated | ✅ |
| 13 | Ctrl+click off a link reaches the agent | LINK-15 | Ctrl+click empty space | `ESC[<16;72;33M` / `m` received (button 0 + Ctrl) | ✅ |
| 14 | Plain click on a link reaches the agent, opens nothing | LINK-16 | plain click on the URL | `ESC[<0;9;1M` / `m` received; no chooser/no new window | ✅ |
| 15 | Failure toast | LINK-13 | delete `probe.zzqx` after it was cached as existing, Ctrl+click it | toast "C:\…\lnk test\probe.zzqx no longer exists" | ✅ |
| 16 | Blur clears a pending press | LINK-18 | not exercised live (cannot blur the window from CDP without changing the foreground) | covered by `terminal-link-gesture.test.ts:58` (`pending null → ignore`) + inspection of the 3-line `blur` listener | ☐ unit + inspection |
| 17 | Shift+drag, right-click copy/paste unchanged | TCU suite | not re-exercised live | TCU tests green in the 1021-test run; the new listeners return early on every chord but bare Ctrl+button 0 (`terminal-link-gesture.test.ts:31-39`) | ☐ unit |
| 18 | Hover an OSC 8 `https` link | LINK-20 | second run (after the Verifier's gap): `[Console]::WriteLine` with `ESC ] 8 ; ; https://www.iana.org/domains/reserved BEL iana link ESC ] 8 ; ; BEL` | `cursor: pointer` on "iana link" | ✅ |
| 19 | Ctrl+click the OSC 8 `https` link | LINK-20, LINK-14 | Ctrl+click on "iana link" (a URL that appears nowhere in the visible text); raw-mode probe listening on a second click | browser opened "IANA-managed Reserved Domains"; **no** bytes reached the agent | ✅ |
| 20 | OSC 8 `mailto:` target | LINK-22 | `ESC ] 8 ; ; mailto:a@b.c BEL mail me …`; hover, then Ctrl+click with the probe listening | `cursor: text` (xterm provides no link for it); Ctrl+click passed through as `ESC[<16;7;2M` / `m`; nothing opened, no toast | ✅ |
| 21 | Static OSC 8 decoration | LINK-22 (precision) | screenshot of rows 1–2 | xterm draws its own dotted underline on **every** OSC 8 cell, `https` and `mailto:` alike — that is the renderer's hyperlink decoration, not a provided link; the link underline/pointer appears only for `http(s)` | ℹ️ recorded as a spec assumption |

Cleanup verified after both runs: ad-hoc sessions stopped and removed (config back to the two pre-existing
stopped Claude sessions), dev Electron processes ended, `%TEMP%\lnk test` removed, no `OpenWith`/`rundll32`
left, nightly install untouched.

**Finding for the owner (not a defect of the feature):** with `.ts` associated to Windows Media Player on this
machine, Ctrl+click on any `.ts` path opens Media Player. This is AD-021 working as decided; the follow-ups
recorded in `context.md` (VS Code at line via `code -g`, or a Shift+Ctrl alternate) are the way out if it
annoys in practice.

---

# Verifier report — terminal-links

**Date**: 2026-09-18
**Spec**: `.specs/features/terminal-links/spec.md` (30 active requirements, `LINK-21` withdrawn)
**Diff range**: `6ecd19c..49a70c1` — 15 commits: 4 `docs(specs)`, 10 feature, 1 unrelated `test(main)`
(`7e498c5`, `dir-remover.test.ts`: replaces a fixed 2.5 s pwsh delay with a lock probe — no assertion
added, removed or weakened; not counted as feature coverage)
**Verifier**: independent sub-agent (author ≠ verifier); read-only over the real tree; mutations in scratch
state only, `git status --short` empty at the end
**Baseline**: 917 tests at `985621d` → **1021** at `49a70c1` (+104 = exactly the five new test files)

---

## Task Completion

| Task | Commit | Status | Notes |
| ---- | ------ | ------ | ----- |
| T1 contract | `1b07824 feat(shared): declare the terminal link probe and open channels` | ✅ Done | `src/shared/links.ts`, three `links:*` channels doc-commented like their neighbours |
| T2 resolve + probe | `b6426c7 feat(main): resolve and probe terminal link candidates` | ✅ Done | — |
| T3 openUrl | `ade85c3 feat(main): open http and https terminal links in the default browser` | ✅ Done | — |
| T4 openPath | `12f0feb feat(main): open terminal file links with the Windows default app or the chooser` | ✅ Done | — |
| T5 handlers | `b02fbcf feat(main): serve the terminal link channels` | ✅ Done | `hasAssociation('')` is never reached: `openPath` guards `ext &&` (`link-opener.ts:85`), pinned by `link-opener.test.ts:210-216` |
| T6 detection | `ece154c feat(renderer): detect url and file path candidates on a terminal line` | ✅ Done | — |
| T7 geometry | `962f2e0 feat(renderer): map terminal link text to buffer cells across soft wraps` | ✅ Done | — |
| T8 gesture | `18f9e87 feat(renderer): classify the ctrl-click link gesture` | ✅ Done | — |
| T9 provider | `9f1afff feat(renderer): provide terminal links to xterm and hit-test them for the pane` | ✅ Done | `settled` resolves to `KnownLinkHit \| null`, not the design's `Promise<PathKind>` — harmless drift, design.md not updated |
| T10 pane wiring | `aa10c60 feat(terminal): open urls and file paths with ctrl+click` | ✅ Done | Task text claims "every decision is in T6–T9's tested libs" — not true for the OSC 8 branch (`hoveredOsc` containment → url hit), which is pane-only. See LINK-20 |
| T11 owner smoke | `49a70c1 docs(specs): record the owner smoke for terminal-links` | ⚠️ Partial | 17 rows cover every Success Criterion and LINK-14/15/16/19; **no OSC 8 row** (spec P2 Independent Test not run) |

---

## Spec-Anchored Acceptance Criteria

Evidence rule applied: tested libs (`src/main/link-opener.ts`, `src/renderer/src/lib/*`) need a `file:line`
+ assertion; wiring-only requirements (`TerminalPane.tsx`, `AgentsView.tsx`, `App.tsx` — hand-verified by
repo convention, `vitest.config.ts:15-18`, `tasks.md` Test Coverage Matrix) need the owner-smoke row **and**
the inspected source line. No citation → not covered.

### P1: Ctrl+click opens a URL in the browser

| Criterion | Spec-defined outcome | `file:line` + assertion | Result |
| --------- | -------------------- | ----------------------- | ------ |
| LINK-01 hover underlines an `http(s)` URL while the pointer is over it | link with `underline` decoration over the exact URL span | `terminal-link-provider.test.ts:65-70` — `expect(links).toHaveLength(1)`; `toMatchObject({ text: 'https://example.com/x', range: { start: { x: 5, y: 1 }, end: { x: 25, y: 1 } }, decorations: { underline: true, pointerCursor: true } })`; `terminal-links.test.ts:7-14` exact span; smoke row 2 (underline + `cursor: pointer` in the app) | ✅ PASS |
| LINK-02 Ctrl+press+release over a URL, < 4 px, opens it in the default browser | `shell.openExternal(url)` called once with that URL; `{ ok: true }` | `link-opener.test.ts:142-143` — `expect(result).toEqual({ ok: true })`; `expect(fakes.openedUrls).toEqual(['https://dev.azure.com/x/y/_workitems/edit/123'])`; hit: `terminal-link-provider.test.ts:157` — `expect(provider.hitTest(10, 1)).toEqual({ kind: 'url', url: 'https://example.com/x' })`; gesture: `terminal-link-gesture.test.ts:50-51` — `toBe('open')` at 0 px and 3.9 px; wiring `TerminalPane.tsx:183-184`; smoke row 3 | ✅ PASS |
| LINK-03 soft-wrapped URL is one link and opens complete | joined text equals the full URL; range spans the rows | `terminal-buffer-lines.test.ts:70-74` — `expect(windowedLine(buffer, 2)).toEqual({ text: 'https://example.com/a/b.ts', topRow: 1, … })`; `:139-140` — `expect(range).toEqual({ start: { x: 1, y: 1 }, end: { x: 0, y: 3 } })`, `expect(range!.start.y).toBeLessThan(range!.end.y)`; the provider's link `text` is `line.text.slice(candidate.start, end)` over the windowed text (`terminal-link-provider.ts:114`, inspected — no provider test uses a wrapped fake) | ✅ PASS (composition by inspection) |
| LINK-04 non-`http(s)` scheme in main: no `openExternal`, refusal reported | `{ ok: false, error }` naming the URL; fake never called | `link-opener.test.ts:152-161` (`mailto:`, `vscode://`, `file:///`, `javascript:`) — `expect(result.ok).toBe(false)`; `expect(result.error).toContain(url)`; `expect(fakes.openedUrls).toEqual([])`; `:163-169` unparsable text | ✅ PASS |
| LINK-05 open failure → toast naming the URL; terminal and PTY untouched | error string contains the URL; `onToast` receives it | `link-opener.test.ts:175-176` — `expect(result.ok).toBe(false)`; `expect(result.error).toContain('https://example.com/')`; toast wiring `TerminalPane.tsx:186` `onToastRef.current(result.error …)` and `:211-213` (rejection); PTY untouched by construction — `stopPropagation` at `:199-200`/`:205-206` precedes activation; smoke row 12 (no bytes reach the agent on a link Ctrl+click), row 15 (toast text) | ✅ PASS |

### P1: Ctrl+click opens a file path with its default app

| Criterion | Spec-defined outcome | `file:line` + assertion | Result |
| --------- | -------------------- | ----------------------- | ------ |
| LINK-06 separator path (+ optional `:line[:col]`) that exists → underlined, suffix included | candidate `text` includes the suffix, `pathText` excludes it; only existing candidates become links | `terminal-links.test.ts:50-70` — `toEqual([{ kind: 'path', text, pathText, line, col, start: 7, end: 7 + text.length }])` for `src/lib/foo.ts:12:3` (line 12, col 3), `E:\Repos\X\Foo.cs:40`, `.\a\b.sql`, `..\c.md`, `~/x/y`, `/abs/p`; `terminal-link-provider.test.ts:82-84` — `expect(calls).toEqual([['src/a.ts', 'src/b.ts', 'src/nope.ts']])`; `expect(links?.map((l) => l.text)).toEqual(['src/a.ts', 'src/b.ts'])`; `expect(links![0].range).toEqual({ start: { x: 8, y: 1 }, end: { x: 15, y: 1 } })`; smoke row 4 | ✅ PASS |
| LINK-07 missing candidate → no underline; once probed, Ctrl+click passes through | not in links; `hitTest` → `null`; gesture → `'pass'` | `terminal-link-provider.test.ts:83` (`nope.ts` absent), `:172-179` — `expect(provider.hitTest(10, 1)).toBeNull()` after the probe; `terminal-link-gesture.test.ts:23-25` — `expect(linkGestureOnMouseDown(ctrlClick, null)).toBe('pass')`; wiring `TerminalPane.tsx:198` (early return, no `stopPropagation`); smoke row 5 | ✅ PASS |
| LINK-08 spaced candidate: probe each extension-terminated prefix, link the longest that exists | alternatives = extension-terminated prefixes; longest existing wins | `terminal-links.test.ts:116-123` — `expect(alternatives?.map((a) => a.pathText)).toEqual(['E:\Meus Docs\a.txt b.md', 'E:\Meus Docs\a.txt'])`; `:110-114` `E:\Meus` **not** offered; `terminal-link-provider.test.ts:123-128` — one batch `expect.arrayContaining(['E:\Meus Docs\a.txt', 'E:\Meus', 'Docs\a.txt'])`, `expect(links?.map((l) => l.text)).toEqual(['E:\Meus Docs\a.txt'])`, range `{ start: { x: 10, y: 1 }, end: { x: 27, y: 1 } }`; `:131-137` fallback to the plain candidate; smoke row 6 | ✅ PASS |
| LINK-09 Ctrl+click a linked file → Windows default app | `shell.openPath(abs)` once; no spawn | `link-opener.test.ts:185-192` — `expect(result).toEqual({ ok: true })`; `expect(fakes.associationQueries).toEqual(['.ts'])`; `expect(fakes.openedPaths).toEqual([FILE])`; `expect(fakes.spawns).toEqual([])` (smoke deliberately did not open `.ts` — Media Player association on the author's machine) | ✅ PASS |
| LINK-10 no association → native "Open with" chooser | `rundll32.exe shell32.dll,OpenAs_RunDLL <abs>`; `openPath` not called | `link-opener.test.ts:194-200` — `expect(fakes.openedPaths).toEqual([])`; `expect(fakes.spawns).toEqual([CHOOSER])` with `CHOOSER = ['rundll32.exe', ['shell32.dll,OpenAs_RunDLL', FILE]]`; `:202-208` fallback when `openPath` reports failure; smoke rows 8-9 (OpenWith window "Selecionar um aplicativo") | ✅ PASS |
| LINK-11 Ctrl+click a linked directory → File Explorer | `explorer.exe <abs>` | `link-opener.test.ts:218-224` — `expect(fakes.spawns).toEqual([['explorer.exe', [DIR]]])`; `expect(fakes.openedPaths).toEqual([])`; smoke row 7 | ✅ PASS |
| LINK-12 relative → session cwd; `~/` → home; `:line[:col]` stripped before resolution, never passed on | resolved absolute path; `pathText` without suffix | `link-opener.test.ts:66-68` — `toBe('E:\Repos\X\wt-1\src\main\index.ts')`; `:73-74` `./`, `../`; `:79` — `toBe('C:\Users\dev\x\y.txt')`; suffix strip `terminal-links.test.ts:51-52` (`pathText: 'src/lib/foo.ts'`, `line: 12`, `col: 3`); the renderer sends `pathText` only (`terminal-link-provider.ts:90,161`; `TerminalPane.tsx:185`, inspected); smoke row 9 (`:3` absent from the rundll32 args) | ✅ PASS |
| LINK-13 open fails → toast naming the path | error string contains the path | `link-opener.test.ts:226-229` — `toEqual({ ok: false, error: `${CWD}\src\gone.ts no longer exists` })`; `:236-246` — `` `Couldn’t open ${FILE}` `` / `` `Couldn’t open ${DIR}` ``; wiring `TerminalPane.tsx:186`; smoke row 15 (toast "… no longer exists") | ✅ PASS |

### P1: The agent keeps the mouse

| Criterion | Spec-defined outcome | `file:line` + assertion | Result |
| --------- | -------------------- | ----------------------- | ------ |
| LINK-14 Ctrl+press over a link is stopped before xterm; no mouse report for press or release | `'intercept'`; `preventDefault` + `stopPropagation` on both capture events | `terminal-link-gesture.test.ts:19-21` — `expect(linkGestureOnMouseDown(ctrlClick, hit)).toBe('intercept')`; wiring `TerminalPane.tsx:199-201` (mousedown), `:205-206` (mouseup), both registered in capture at `:219-220`, before `onRightMouseDown` (`:388`); smoke row 12 — mouse-tracking probe received **no** bytes | ✅ PASS |
| LINK-15 Ctrl+press not over a link is untouched | `'pass'`; no `stopPropagation` | `terminal-link-gesture.test.ts:23-25` — `toBe('pass')` with `null` hit; wiring `TerminalPane.tsx:197-198`; smoke row 13 — `ESC[<16;72;33M`/`m` received by the agent | ✅ PASS |
| LINK-16 click without Ctrl → nothing link-related | `'pass'`; no hit test, no probe; OSC 8 default activation disabled | `terminal-link-gesture.test.ts:27-29` — `expect(linkGestureOnMouseDown({ …ctrlClick, ctrlKey: false }, hit)).toBe('pass')`; wiring `TerminalPane.tsx:190` (chord checked before any hit test) and `:169` `activate: () => {}` (xterm's default would `window.open` the OSC 8 target — verified in the 6.0.0 bundle); smoke row 14 — plain click reaches the agent, nothing opens | ✅ PASS |
| LINK-17 Ctrl+press then ≥ 4 px before release → not opened | `'ignore'` at ≥ 4 px; threshold constant 4 | `terminal-link-gesture.test.ts:45-47` — `expect(DRAG_THRESHOLD_PX).toBe(4)`; `:54-57` — `toBe('ignore')` at 104,100 (4.0 px) and 103,103 (4.24 px); `:49-52` — `toBe('open')` at 3.9 px (mutation 2 killed) | ✅ PASS |
| LINK-18 window blur forgets the pending gesture | `pendingLink = null`; subsequent mouseup → `'ignore'` | `terminal-link-gesture.test.ts:59-61` — `expect(linkGestureOnMouseUp(null, …)).toBe('ignore')`; wiring `TerminalPane.tsx:216-218,221` (`window.addEventListener('blur', forgetPendingLink)`), removed at `:402`; smoke row 16 (not exercised live — unit + inspection, declared by the author) | ✅ PASS (wiring by inspection) |
| LINK-19 first click on output painted under a still pointer resolves and opens; unprobed candidate intercepted and probed; a miss is swallowed and cached | `hitTest` returns `{ state: 'unprobed', settled }`; `settled` → existing hit or `null`; miss cached → next `hitTest` `null` | `terminal-link-provider.test.ts:185-189` — `toMatchObject({ kind: 'path', pathText: 'src/a.ts', state: 'unprobed' })`; `expect(settled).toEqual({ kind: 'path', pathText: 'src/a.ts', state: 'file' })`; `expect(calls).toEqual([['src/a.ts']])`; `:192-198` — `expect(await hit.settled).toBeNull()`; `expect(provider.hitTest(10, 1)).toBeNull()`; wiring `TerminalPane.tsx:180-181` (`await hit.settled`, return on `null`), `:198-201` (unprobed hit is intercepted); smoke row 10 (prompt painted under a parked pointer, first Ctrl+click opened Explorer) | ✅ PASS |

### P2: Explicit OSC 8 hyperlinks

| Criterion | Spec-defined outcome | `file:line` + assertion | Result |
| --------- | -------------------- | ----------------------- | ------ |
| LINK-20 OSC 8 `http(s)` target: Ctrl+click on its text opens the target regardless of the visible text | `links:openUrl` with the OSC 8 URI | **No test** (pane-only composition: `TerminalPane.tsx:168-176` tracks `hoveredOsc = { text, range }` from `linkHandler.hover`; `:194-195` returns `{ kind: 'url', url: hoveredOsc.text }` when the cell is inside the range). xterm 6.0.0 bundle inspected: `OscLinkProvider` passes the link **URI** as `text` to `hover`/`activate`, so the mechanism is right. **No smoke row** — the spec's P2 Independent Test (`printf '\e]8;;https://example.com\e\\click me\e]8;;\e\\'`) was not run (T11 Done-when omits it) | ❌ GAP — implemented by inspection, never exercised |
| LINK-22 OSC 8 target with any other scheme is not a link: no underline, Ctrl+click passes through | xterm drops the link; text detection never yields non-http candidates | Text half: `terminal-links.test.ts:35-40` — `expect(detectLinkCandidates(line)).toEqual([])` for `mailto:`, `vscode://file/E:/x/y.ts`, `file:///E:/x/y.cs`, `ms-teams:launch`; `link-opener.test.ts:152-161` (main refuses anyway). OSC 8 half: `allowNonHttpProtocols` not set (`TerminalPane.tsx:168-176`) and the 6.0.0 bundle's `OscLinkProvider` gate `["http:","https:"].includes(e.protocol)` inspected; no smoke row for a non-http OSC 8 target | ✅ PASS (OSC half by inspection of xterm; would be closed for free by the LINK-20 smoke with a `mailto:` variant) |

### Edge cases

| Criterion | Spec-defined outcome | `file:line` + assertion | Result |
| --------- | -------------------- | ----------------------- | ------ |
| LINK-23 URL ending in `.`, `,`, `;`, `:` or an unmatched `)`/`]` excludes that character | link text without the trailing char | `terminal-links.test.ts:22-33` — six cases, `expect(candidates[0]).toMatchObject({ kind: 'url', text: expected })` (`https://x.y/a?b=1.` → `…?b=1`, `;` → mutation 4 killed, `(https://x.y/a)` → `https://x.y/a`, `[…]`); paths: `:84-87` `(see src/a.ts).` → `src/a.ts` | ✅ PASS — ⚠️ spec-precision flag: the spec says "unmatched", implying a **balanced** `)` stays; the ported URL regex excludes `(`/`)` from the URL body entirely, so `https://en.wikipedia.org/wiki/Foo_(bar)` links as `…/Foo_` (probed with the pure lib; addon-web-links behaviour). Paths do balance (`trimPathTail`). No AC states the balanced case; not a defect against the spec as written |
| LINK-24 probe failure → every candidate on the row non-existent, no throw | main: stat error → `'missing'`; renderer: rejection → `cb(undefined)`, cached `'missing'` | `link-opener.test.ts:117-121` — `expect(results[0].kind).toBe('missing')`; `terminal-link-provider.test.ts:100-107` — `expect(await provideLinks(provider, 1)).toBeUndefined()` twice, `expect(calls).toHaveLength(1)` (mutation 7 killed) | ✅ PASS |
| LINK-25 probe result after the row changed is discarded | `cb(undefined)` on fingerprint mismatch | `terminal-link-provider.test.ts:109-116` — `buffer.set(0, 'something else')` between start and settle; `expect(await pending).toBeUndefined()` (mutation 6 killed); fingerprint sensitivity `terminal-buffer-lines.test.ts:111-118` | ✅ PASS |
| LINK-26 same resolved path again in the pane → cached, no re-probe | second `provideLinks` issues no probe | `terminal-link-provider.test.ts:87-94` — `expect(calls).toHaveLength(1)` after the second call; `expect(second?.map((l) => l.text)).toEqual(['src/a.ts'])` | ✅ PASS |
| LINK-27 terminal disposed → provider, listeners and cache disposed | `dispose()` clears the cache; pane cleanup removes listeners and disposes the provider registration | `terminal-link-provider.test.ts:95-97` — `provider.dispose()` then `expect(calls).toHaveLength(2)`; wiring `TerminalPane.tsx:400-404` (`removeEventListener` ×3, `linkProvider.dispose()`, `links.dispose()`) inside the effect cleanup that also runs `term.dispose()` (`:413`); smoke row 1 / session switch not separately measured | ✅ PASS (wiring by inspection) |
| LINK-28 links in scrollback behave like live rows | mouse → 1-based, `viewportY`-offset cell; `hitTest` on a row above the viewport | `terminal-buffer-lines.test.ts:209-214` — `toEqual({ x: 41, y: 111 })` for (405, 210) at `viewportY = 100` (mutation 8 killed); `terminal-link-provider.test.ts:200-209` — `expect(provider.hitTest(10, 151)).toEqual({ kind: 'url', … })` on row 151 of 200 | ✅ PASS |
| LINK-29 non-absolute after resolution → "does not exist", not probed or opened | `absolutePath: null`, `kind: 'missing'`, no `stat`; `openPath` → `ok: false` | `link-opener.test.ts:87-91` — `expect(opener.resolveCandidate('', 'src/a.ts')).toBeNull()`; `:109-115` — `toEqual([{ pathText: 'src/a.ts', absolutePath: null, kind: 'missing' }])`, `expect(fakes.statCalls).toEqual([])`; `:231-234` — `toEqual({ ok: false, error: 'src/a.ts no longer exists' })` | ✅ PASS |
| LINK-30 never open on `mousedown`; activation on `mouseup` only | `mousedown` classifier returns only `'intercept' \| 'pass'`; `'open'` exists only on `mouseup` | `terminal-link-gesture.test.ts:19-21,49-52` (`'open'` is a `linkGestureOnMouseUp` outcome); wiring: `activateLink` is called only from `onLinkMouseUp` (`TerminalPane.tsx:210-211`), never from `onLinkMouseDown` (`:188-202`); smoke rows 3/7/8 opened after a full click | ✅ PASS (wiring by inspection) |
| LINK-31 executable path treated like any file | `.ps1` → association route, `openPath` called | `link-opener.test.ts:248-255` — `expect(fakes.associationQueries).toEqual(['.ps1'])`; `expect(fakes.openedPaths).toEqual([script])` | ✅ PASS |

**Status**: ❌ Gaps present — 29/30 active ACs evidenced (24/24 P1, 8/9 edge, 1/2 P2); **LINK-20** has no
test and no smoke; 1 ⚠️ spec-precision flag (LINK-23 balanced parentheses in URLs).

---

## Discrimination Sensor

Scratch-only: edit → run that module's test file (`--reporter=json`) → `git restore` → `git status --short`
empty before the next. Tree clean at the end.

| # | File:line | Mutation | Killed by | Result |
| - | --------- | -------- | --------- | ------ |
| 1 | `src/main/link-opener.ts:55` | scheme guard also accepts `mailto:` | `refuses mailto:a@b.c without calling the shell` (26/27) | ✅ Killed |
| 2 | `src/renderer/src/lib/terminal-link-gesture.ts:44` | `moved < DRAG_THRESHOLD_PX` → `<=` | `ignores a release 4 px or further away` (11/12) | ✅ Killed |
| 3 | `src/renderer/src/lib/terminal-link-gesture.ts:33` | dropped `!event.shiftKey` | `passes when Shift held` (11/12) | ✅ Killed |
| 4 | `src/renderer/src/lib/terminal-links.ts:30` | removed `;` from the URL last-char class | `excludes trailing punctuation: https://x.y/a; → https://x.y/a` (31/32) | ✅ Killed |
| 5 | `src/renderer/src/lib/terminal-links.ts:51` | dropped the drive lookbehind `(?<![\p{L}\p{N}])` | `never yields a candidate for vscode://file/E:/x/y.ts` + `file:///E:/x/y.cs` (30/32) | ✅ Killed |
| 6 | `src/renderer/src/lib/terminal-link-provider.ts:139` | fingerprint check skipped (always `linksFor`) | `discards a probe result for a row that was repainted meanwhile` (14/15) | ✅ Killed |
| 7 | `src/renderer/src/lib/terminal-link-provider.ts:66` | failed probe cached as `'file'` | `treats a failed probe as missing: no links, no throw, cached as missing` (14/15) | ✅ Killed |
| 8 | `src/renderer/src/lib/terminal-buffer-lines.ts:164` | dropped `+ viewportY` (scrollback offset) | `maps a click to the 1-based cell, offset by the viewport scroll` (17/18) | ✅ Killed |

**Sensor depth**: lightweight (8 behaviour-level mutations, two per tested module)
**Result**: 8/8 killed — PASS ✅

---

## Interactive UAT Results

Not performed by the Verifier; the owner-run smoke above (17 rows, CDP-driven, OS-observed) stands as the
hand-verification of the renderer wiring. Rows 16-17 are declared "unit + inspection" by the author.

---

## Code Quality

| Principle | Status | Notes |
| --------- | ------ | ----- |
| Minimum code | ✅ | 105-line `LinkOpener`; 45-line gesture classifier; 168/166/192-line libs where the ported addon code is attributed. `inFlight` dedupe in the provider is the minimum that keeps hover and `hitTest` from double-probing (LINK-19 + LINK-26) |
| Surgical changes | ✅ | `shortcut-launcher.ts`: `export` only. `index.ts`: one block next to `shortcuts:launch`, reuses the existing `execFileAsync`. No adjacent code reformatted; the `useEffect` gains `cwd` in its deps (static per session — no practical remount) |
| No scope creep | ✅ | Nothing beyond the 30 ACs: no tooltip, no `code -g`, no block list (AD-021), `allowNonHttpProtocols` untouched |
| Matches patterns | ✅ | Capture-listener pattern of TCU (`onRightMouseDown`), pure classifier shape of `terminal-keys.ts`, DI-with-fakes of `session-manager.test.ts`, typed `handle()` channels. Nit: `hit: unknown \| null` in `linkGestureOnMouseDown` collapses to `unknown` — harmless |
| Spec-anchored outcome check | ✅ | Every asserted value above matches the spec outcome; one ⚠️ (LINK-23 balanced parens) where the spec is silent |
| Per-layer Coverage Expectation met | ⚠️ | Libs and `LinkOpener`: 1:1 with the ACs they own, every design Error-Handling row has a test. Renderer components: the smoke covers every Success Criterion + LINK-14/15/16/19 as the matrix asked — but LINK-20/22 (OSC 8) were left out of both the matrix's smoke list and T11 |
| Every test maps to a spec AC / edge / Done-when — no unclaimed tests | ✅ | `describe` titles carry the LINK ids; the untitled ones map to Done-when items (`bounds` → T6 cap 32; `rangeContains` → T7; `file without an extension` → T4/T5 `''` ext; batch cap → T2) |
| Test integrity | ✅ | No existing assertion weakened or deleted; 917 → 1021, +104 = the five new files. `7e498c5` swaps a sleep for a lock probe in `dir-remover.test.ts` (timing only) |
| Documented guidelines followed | ✅ | `README.md:111` pre-PR gate run; `vitest.config.ts:15-18` layering respected (libs + main tested, components hand-verified); precedent `.specs/features/terminal-copy-undo-fixes/spec.md:52-54` (pure classifier + hand-verified pane) followed |

**Observations (non-blocking, by inspection):**

1. `TerminalPane.tsx:203-215` — `pendingLink` is cleared only by a `mouseup` **on the container** or a
   window `blur`. A Ctrl+press on a link followed by a release outside the pane (over the sidebar, in the
   same window) leaves `pendingLink` set: the next plain click's `mouseup` in the pane is then
   `preventDefault`ed/`stopPropagation`ed (the agent gets a press without its release), and if that click
   lands within 4 px of the original press point the link opens on a **plain** click (LINK-16 corner).
   One-line fix: reset `pendingLink = null` at the top of `onLinkMouseDown`, or listen `mouseup` on
   `window`. Not reproduced live.
2. LINK-19 × OSC 8: `hoveredOsc` is only set by xterm's `hover`, i.e. on mousemove. A first Ctrl+click on
   an un-hovered OSC 8 link whose visible text is not itself a URL/path (`click me`) falls to
   `links.hitTest` → `null` → passes through. The spec words LINK-19 for path candidates, so this is
   outside the ACs; recording it because it is the one first-click case the design's approach B does not
   cover.
3. design.md `LinkHit.settled: Promise<PathKind>` vs implementation `Promise<KnownLinkHit | null>` —
   doc drift only.
4. The header of this file says "13 commits"; `6ecd19c..49a70c1` holds 15 (14 before the smoke commit).

---

## Edge Cases

- [x] LINK-23 trailing punctuation / unmatched bracket excluded (⚠️ balanced `)` in a URL is cut — spec silent)
- [x] LINK-24 probe failure → non-existent, no throw (main and renderer)
- [x] LINK-25 stale probe result discarded
- [x] LINK-26 cache reuse per pane
- [x] LINK-27 dispose clears provider registration, listeners, cache
- [x] LINK-28 scrollback rows
- [x] LINK-29 non-absolute → "does not exist", never probed/opened
- [x] LINK-30 activation on `mouseup` only
- [x] LINK-31 executables take the file route

---

## Gate Check

- **Gate command**: `npm run typecheck && npm run lint && npm test` (Build level, `tasks.md` §Gate Check Commands)
- **typecheck**: exit 0 (`tsconfig.node.json` + `tsconfig.web.json`)
- **lint**: exit 0 — 0 errors, 18 warnings, all `prettier/prettier` in pre-existing files
  (`scripts/fixtures/implement-ticket/workflow.ts`, `scripts/smoke-agent-config.mjs`, `scripts/smoke-agents.mjs`,
  `src/shared/tasks.test.ts`); none in feature files — identical to `main`
- **tests**: `npx vitest run --reporter=json` → **1021 passed, 0 failed, 0 skipped, 0 todo** (236 suites, exit 0)
- **Test count before feature**: 917 (`985621d`)
- **Test count after feature**: 1021
- **Delta**: +104 — `link-opener.test.ts` 27, `terminal-links.test.ts` 32, `terminal-buffer-lines.test.ts` 18,
  `terminal-link-gesture.test.ts` 12, `terminal-link-provider.test.ts` 15
- **Skipped tests**: none
- **Failures**: none

---

## Fix Plans

### Fix 1: LINK-20 has no evidence (P2, Minor)

- **Root cause**: the OSC 8 branch is a pane-only composition (`hoveredOsc` range containment → url hit);
  the Test Coverage Matrix's smoke list named LINK-14/15/16/18/19 but not LINK-20/22, and T11's Done-when
  followed that list. The mechanism is correct by inspection of the xterm 6.0.0 bundle (`text` = URI,
  http(s) gate), but nothing measured it.
- **Fix task**: run the spec's P2 Independent Test in the dev app —
  `printf '\e]8;;https://example.com\e\\click me\e]8;;\e\\'` → hover underlines "click me", Ctrl+click
  opens example.com (LINK-20); repeat with `\e]8;;mailto:a@b.c\e\\mail\e]8;;\e\\` → no underline, Ctrl+click
  passes through (LINK-22 OSC half). Append two rows to the owner smoke table. No code change expected.
- **Priority**: Minor (P2 story; no agent observed emitting OSC 8)

### Fix 2 (optional): pending gesture survives a release outside the pane

- **Root cause**: `pendingLink` cleared only by container `mouseup` / window `blur` (Observation 1).
- **Fix task**: `pendingLink = null` at the top of `onLinkMouseDown` (or `window`-level `mouseup`); smoke:
  Ctrl+press a link, release over the sidebar, plain-click the same spot → nothing opens, agent receives
  the plain press and release.
- **Priority**: Minor (narrow corner, not reproduced)

---

## Requirement Traceability Update

| Requirement | Previous Status | New Status |
| ----------- | --------------- | ---------- |
| LINK-01 | In Tasks | ✅ Verified |
| LINK-02 | In Tasks | ✅ Verified |
| LINK-03 | In Tasks | ✅ Verified |
| LINK-04 | In Tasks | ✅ Verified |
| LINK-05 | In Tasks | ✅ Verified |
| LINK-06 | In Tasks | ✅ Verified |
| LINK-07 | In Tasks | ✅ Verified |
| LINK-08 | In Tasks | ✅ Verified |
| LINK-09 | In Tasks | ✅ Verified |
| LINK-10 | In Tasks | ✅ Verified |
| LINK-11 | In Tasks | ✅ Verified |
| LINK-12 | In Tasks | ✅ Verified |
| LINK-13 | In Tasks | ✅ Verified |
| LINK-14 | In Tasks | ✅ Verified |
| LINK-15 | In Tasks | ✅ Verified |
| LINK-16 | In Tasks | ✅ Verified |
| LINK-17 | In Tasks | ✅ Verified |
| LINK-18 | In Tasks | ✅ Verified |
| LINK-19 | In Tasks | ✅ Verified |
| LINK-20 | In Tasks | ❌ Needs Fix (evidence: smoke) |
| LINK-21 | Withdrawn | Withdrawn |
| LINK-22 | In Tasks | ✅ Verified |
| LINK-23 | In Tasks | ✅ Verified (⚠️ spec-precision: balanced `)` in URLs) |
| LINK-24 | In Tasks | ✅ Verified |
| LINK-25 | In Tasks | ✅ Verified |
| LINK-26 | In Tasks | ✅ Verified |
| LINK-27 | In Tasks | ✅ Verified |
| LINK-28 | In Tasks | ✅ Verified |
| LINK-29 | In Tasks | ✅ Verified |
| LINK-30 | In Tasks | ✅ Verified |
| LINK-31 | In Tasks | ✅ Verified |

---

## Summary

**Overall**: ⚠️ Issues — P1 MVP fully verified; one P2 AC unevidenced

**Spec-anchored check**: 29/30 ACs matched the spec outcome (24/24 P1, 8/9 edge, 1/2 P2) | 1 spec-precision gap flagged (LINK-23)
**Sensor**: 8/8 mutations killed
**Gate**: 1021 passed, 0 failed, 0 skipped; typecheck clean; lint 0 errors (18 pre-existing warnings)

**What works**: URL and file-path detection with the exact spans the spec asks for; existence-gated path
links with per-pane cache, stale-row discard and failure-as-missing; scheme-gated `openUrl` and the
Explorer / default-app / "Open with" routes in main, every error path returning a `LaunchResult` the pane
toasts; the Ctrl gesture classifier at the 4 px boundary; the capture-phase interception that keeps the
agent's mouse (measured with a mouse-tracking probe); first-click reliability on freshly painted output.

**Issues found**: LINK-20 (OSC 8 Ctrl+click) — implemented, never exercised: run the P2 Independent Test
and record it (Fix 1). Optional: clear `pendingLink` on every `mousedown` (Fix 2).

**Next steps**: Fix 1 (smoke rows for LINK-20/22) → re-verify; then update `spec.md` statuses per the
table above.

---

## Re-verification (pass 2)

**Date**: 2026-09-18
**Delta range**: `49a70c1..626762f` — 2 commits on top of the pass-1 range: `9afe7f6 fix(terminal): forget a
link press released outside the pane` (1 file, +3 lines) and `626762f docs(specs): close the terminal-links
verifier gaps …` (`.specs/` only: `validation.md` +4 smoke rows, `spec.md` +2 assumptions + traceability,
`design.md` `settled` type + Status Approved, `tasks.md` Status Done). Full feature range `6ecd19c..626762f`,
17 commits. No test file changed.
**Verifier**: independent sub-agent (author ≠ verifier), second pass; read-only over the real tree except
this file; one scratch mutation, `git restore`d, `git status --porcelain` empty at the end.

### Fix review — `9afe7f6` (pass-1 Fix 2 / Observation 1)

The diff is exactly the recommended one-liner plus a two-line comment, at the top of `onLinkMouseDown`
(`src/renderer/src/components/TerminalPane.tsx:189-191`), before the chord check (`:193`).

**Closes the corner case.** Sequence: Ctrl+press over a link → `pendingLink` set (`:204`); release over the
sidebar → the container's capture `mouseup` (`:206`) never fires, `pendingLink` stays; next **plain** press
in the pane → `:191` clears it, then `:193` returns `'pass'` (no Ctrl); its release → `:207` `if (!pendingLink)
return` → the plain `mouseup` is neither `preventDefault`ed nor stopped, and `activateLink` is never
reached. Before the fix that release was swallowed and, within 4 px of the stale press, opened the link on a
plain click (LINK-16 corner). Now the agent receives the plain press and its release.

**No regression on the gestures it touches, by trace:**

- LINK-14 (Ctrl+press over a link stopped for press and release): `:191` is a no-op when nothing is pending;
  `:193` `'intercept'`, hit test `:194-199`, `preventDefault`/`stopPropagation` `:202-203`, pending set
  `:204`; release stopped at `:208-209`. Unchanged. Smoke rows 12 and 19 measured it (no bytes reach the
  mouse-tracking probe).
- LINK-17 (≥ 4 px → not opened): decided on `mouseup` by `linkGestureOnMouseUp` (`:211`,
  `terminal-link-gesture.ts:38-45`); the new reset runs on a *later* `mousedown`, so it cannot change the
  outcome of the release it was armed for.
- LINK-18 (blur forgets): `forgetPendingLink` (`:219-221`) still registered on `window` `blur` (`:224`) and
  removed at `:405`. The new reset is a second, independent forget site.
- LINK-30 (never open on `mousedown`): `activateLink` (`:179`) is still called only from `onLinkMouseUp`
  (`:214`); the reset adds no call.

**Adversarial check on the one new behaviour.** The reset runs for *every* button, before the chord check.
So a secondary press while a Ctrl+primary press is still pending (right-click during the hold) now retires
the pending link; the primary release then propagates to xterm unstopped. Verified in the installed
`@xterm/xterm` 6.0.0 bundle (`lib/xterm.js`) that this orphan release is inert: xterm attaches its
mouse-report `mouseup` to `document` only from inside its own `mousedown` handler (`s.mouseup &&
this._document.addEventListener("mouseup", s.mouseup)` after `sendEvent`), and the selection service does the
same from its `mousedown`; both were skipped because the press was stopped in capture. The only element-level
`mouseup` is the Linkifier's activation path, and every link here carries a no-op `activate` (`:169` for OSC 8,
provider links by design). Net: that exotic chord opens nothing and reports nothing — more conservative than
before, consistent with LINK-17's intent. Not a defect.

**Citation shift.** The 3 inserted lines move every pass-1 `TerminalPane.tsx` citation after line 188 by +3
(`:190`→`:193`, `:194-195`→`:197-198`, `:197-198`→`:200-201`, `:199-201`→`:202-204`, `:203-215`→`:206-218`,
`:205-206`→`:208-209`, `:210-211`→`:213-214`, `:216-218,221`→`:219-221,224`, `:219-220`→`:222-223`,
`:388`→`:391`, `:400-404`→`:403-407`, `:402`→`:405`, `:413`→`:416`). Citations at or before `:186` are
unchanged. The pass-1 report is left as written; this table is the map.

### Evidence verdicts — LINK-20 / LINK-22 / LINK-23

| Criterion | Spec-defined outcome | New evidence | Result |
| --------- | -------------------- | ------------ | ------ |
| LINK-20 OSC 8 `http(s)` target: Ctrl+click on its text opens the target regardless of the visible text | target opened per LINK-02 (default browser); press stopped before xterm (LINK-14) | Smoke row 18: OSC 8 `https://www.iana.org/domains/reserved` with visible text `iana link` → `cursor: pointer` on hover. Row 19: Ctrl+click on `iana link` (the URL appears nowhere in the visible text, so text detection cannot have produced the hit) → browser opened "IANA-managed Reserved Domains"; raw-mode probe received **no** bytes. Wiring `TerminalPane.tsx:168-176` (`hoveredOsc`), `:197-198` (range containment → `{ kind: 'url', url: hoveredOsc.text }`), `:183-184` (`links:openUrl`) | ✅ PASS — the P2 Independent Test was run (target substituted for `example.com`, same outcome class); "regardless of the visible text" is exactly what the fixture isolates |
| LINK-22 OSC 8 target with any other scheme: not a link — no underline, Ctrl+click passes through | not provided as a link; Ctrl+click reaches xterm/agent as an ordinary click | Smoke row 20: OSC 8 `mailto:a@b.c` → `cursor: text` on hover (no provided link); Ctrl+click passed through as `ESC[<16;7;2M` / `m` (button 0 + Ctrl, same encoding as row 13's LINK-15 pass-through); nothing opened, no toast. Row 21 + new spec assumption "xterm's static OSC 8 decoration is out of our hands": xterm draws its own dotted underline on every OSC 8 cell regardless of scheme; the assumption (owner-accepted, `y`) scopes LINK-22's "no underline" to the **link** underline/pointer a provider grants. Text half unchanged (`terminal-links.test.ts:35-40`, `link-opener.test.ts:152-161`) | ✅ PASS — pass-through measured; "no underline" is now precise by assumption. Nit (cosmetic): the AC text still reads "no underline"; the assumption row is the disambiguation — "no link underline" in the AC would spare the next reader the lookup |
| LINK-23 trailing `.`/`,`/`;`/`:` or unmatched `)`/`]` excluded — pass-1 ⚠️ spec-precision flag on **balanced** parentheses | unmatched trailing char excluded (tested, `terminal-links.test.ts:22-33`); balanced case previously undefined | New spec assumption "Parentheses inside a URL" (owner-accepted, `y`): the ported regex stops a URL at `(`; `https://en.wikipedia.org/wiki/Foo_(bar)` links as `…/Foo_`; LINK-23 covers the unmatched trailing bracket only, balanced ones are upstream behaviour. Re-evaluated the regex at `terminal-links.ts:30` directly: `see https://en.wikipedia.org/wiki/Foo_(bar) now` → `["https://en.wikipedia.org/wiki/Foo_"]`; `(https://x.y/a)` → `["https://x.y/a"]` — the assumption states the implementation's actual behaviour, not a wish. No test asserts the balanced case (grep for `(bar)`/`wikipedia` in the test file: none) | ✅ PASS — the spec now defines the balanced outcome explicitly, so the ⚠️ flag is closed; evidence-or-zero applies to ACs, and the balanced case is an assumption, not an AC. Suggestion (not a gap): one `it` pinning `…/Foo_(bar)` → `…/Foo_` would turn the assumption into a guarded fact |

Pass-1 Observation 2 (first Ctrl+click on an **un-hovered** OSC 8 link whose visible text is not itself a
URL/path falls through) is unchanged and stays outside the ACs: LINK-19 is worded for path candidates, and
the new smoke rows hovered before clicking. Recorded, not counted.

**Spec-anchored status after pass 2**: 30/30 active ACs evidenced (19/19 P1, 2/2 P2, 9/9 edge); 0
spec-precision gaps open. `spec.md` traceability (30 × Verified, `626762f`) is consistent with this verdict.
Count re-derived from the spec's traceability table (LINK-01..19 P1, LINK-20/22 P2, LINK-23..31 edge) and
the pass-1 per-AC tables (19 + 2 + 9 rows). The pass-1 summary breakdown "24/24 P1, 8/9 edge, 1/2 P2" did
not sum to its own 29/30 (it is 33); the tables, not that line, were the authority — corrected here, the
pass-1 text left as written.
`design.md` drift (pass-1 Observation 3) closed: `settled: Promise<KnownLinkHit | null>` matches
`terminal-link-provider.ts`.

### Gate (Build level, re-run on `626762f`)

- **typecheck**: exit 0 (`tsconfig.node.json` + `tsconfig.web.json`)
- **lint**: exit 0 — **0 errors, 18 warnings**, all `prettier/prettier`, same four pre-existing files as pass 1
  (`scripts/fixtures/implement-ticket/workflow.ts` 1, `scripts/smoke-agent-config.mjs` 12,
  `scripts/smoke-agents.mjs` 4, `src/shared/tasks.test.ts` 1); none in feature files
- **tests**: `npx vitest run --reporter=json` → exit 0, **236/236 suites, 1021 passed, 0 failed, 0 skipped,
  0 todo** (`scratchpad/verify2.json`); the five feature files unchanged at 27 + 32 + 18 + 12 + 15 = 104
- **Test integrity**: 1021 → 1021 (no test added, removed or weakened in the delta — it is 1 source line +
  docs); baseline 917 at `985621d` still holds as the pre-feature count

### Discrimination Sensor (pass 2, +1)

| # | File:line | Mutation | Killed by | Result |
| - | --------- | -------- | --------- | ------ |
| 9 | `src/renderer/src/lib/terminal-link-gesture.ts:34` | dropped the hit gate: `bareCtrl && hit !== null` → `bareCtrl` (the `mousedown` classifier the fix sits in front of) | `passes a Ctrl press over nothing to the agent (LINK-15)` — `expected 'intercept' to be 'pass'` (11/12) | ✅ Killed |

`TerminalPane.tsx` not mutated (hand-verified by convention, `vitest.config.ts:15-18`). Scratch only:
`git restore` after the run; `git status --porcelain` → 0 lines.

**Cumulative**: 9/9 killed — PASS ✅

### Verdict

**✅ PASS.** Both pass-1 findings are closed with the minimum change: a one-line reset that closes the
release-outside-the-pane corner without touching any tested gesture, and smoke rows that exercise the OSC 8
path end-to-end with the agent's mouse-report probe listening. The two new assumptions state what the
implementation does (verified against the regex and the smoke), are owner-accepted, and turn the pass-1 ⚠️
into defined behaviour. Gate green, sensor 9/9, tree clean. Ready.

**Non-blocking, for the owner** (no fix task): (a) LINK-22 AC wording "no underline" vs the assumption's
"link underline" — cosmetic; (b) optional test pinning the balanced-parentheses URL behaviour; (c) pass-1
Observation 2 (un-hovered OSC 8 first click) remains a known, out-of-AC limit of Design approach B.
