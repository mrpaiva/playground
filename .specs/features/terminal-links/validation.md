# Terminal Links Validation

**Result**: PENDING — Verifier not yet run (this file holds the owner-run smoke; the Verifier appends its report below)

**Date**: 2026-09-18
**Spec**: `.specs/features/terminal-links/spec.md`
**Branch**: `feature/terminal-links` from `main` at `6ecd19c`
**Diff range**: `6ecd19c..aa10c60` (13 commits: 4 docs, 8 feature, 1 `test(main)` flakiness fix)

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

Cleanup verified: ad-hoc session stopped and removed (config back to the two pre-existing stopped Claude
sessions), dev Electron processes ended, `%TEMP%\lnk test` removed, no `OpenWith`/`rundll32` left.

**Finding for the owner (not a defect of the feature):** with `.ts` associated to Windows Media Player on this
machine, Ctrl+click on any `.ts` path opens Media Player. This is AD-021 working as decided; the follow-ups
recorded in `context.md` (VS Code at line via `code -g`, or a Shift+Ctrl alternate) are the way out if it
annoys in practice.
