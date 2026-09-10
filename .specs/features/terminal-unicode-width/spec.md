# Terminal Unicode Width Specification

## Problem Statement

The embedded agent terminals (xterm.js 6.0.0) render lines containing icons,
emojis or wide Unicode characters as garbled, hard-to-read text. The Claude
Code TUI is the loudest victim — its status gutter (first two columns), spinner
and vertical borders break — but the same corruption shows in ordinary output
that contains emojis (`✓`, `🎉`, …). Selecting the text changes what is on
screen, and the first two columns plus the last column keep stale, fixed
residue. Root cause: xterm.js 6.0.0 computes character cell width with the
**Unicode 6** wcwidth tables by default (`UnicodeV6` in the shipped bundle), and
modern icons/emojis have Unicode 11+ widths (typically 2 cells). The buffer is
laid out with the wrong width, so neighbours overwrite each other, the re-render
on selection re-measures and shifts text, and wide glyphs painted into
half-cells leave ghost residue on the borders.

## Goals

- [ ] Agent output containing emojis, icons and wide characters renders aligned and legible
- [ ] The Claude Code TUI gutter/borders render correctly (manual check)
- [ ] Selecting text no longer changes what is on screen
- [ ] No stale residue in the first two columns or the last column

## Out of Scope

| Feature | Reason |
| ------- | ------ |
| Upgrading `@xterm/xterm` past 6.0.0 | Same rationale as previous terminal work: new dependency, regression risk, and Unicode width is fixed by the addon alone |
| Full grapheme-cluster segmentation (`@xterm/addon-unicode-graphemes`, ZWJ emoji families) | Experimental addon; the reported corruption is plain width mis-measurement, fixed by Unicode 11 rules. Revisit if ZWJ sequences still render wrong after this lands |
| Re-encoding or filtering agent output | The bytes are correct; the renderer is measuring them wrong. Patching content would hide the bug and corrupt TUIs |
| Changing the terminal font | INPUT-12 already pinned Cascadia Mono for the TUI corners; width, not glyph coverage, is the failure here |
| Windows Terminal / external terminal parity beyond rendering | App-embedded xterm only |

---

## Assumptions & Open Questions

| Assumption / decision | Chosen default | Rationale | Confirmed? |
| --------------------- | -------------- | --------- | ---------- |
| xterm 6.0.0 computes widths with Unicode 6 rules unless told otherwise | Register Unicode 11 via `@xterm/addon-unicode11` and set `term.unicode.activeVersion = '11'` | The shipped bundle contains `UnicodeV6` (`node_modules/@xterm/xterm/lib/*.js`, module 7428); the terminal exposes `term.unicode` (`IUnicodeHandling`) with `register()` + `activeVersion` — the addon's README shows exactly this two-step activation. Unicode 11 re-classifies modern icons/emojis (width 2) and combining marks (width 0) correctly | y |
| The addon only registers; activation is a separate step | `term.loadAddon(new Unicode11Addon())` **and** `term.unicode.activeVersion = '11'` | Read the addon's minified source: `activate(e){e.unicode.register(new UnicodeV11)}` — registration alone leaves the default version active; the README explicitly adds the `activeVersion` line | y |
| `term.unicode` is proposed API, gated behind `allowProposedApi` | Set `allowProposedApi: true` in the `Terminal` options | The installed typings mark `IUnicodeHandling` "(EXPERIMENTAL)" and `allowProposedApi` defaults to `false` — accessing `term.unicode` without it throws `You must set the allowProposedApi option to true to use proposed API`, so the terminal would never open (verifier probe, 2026-09-10) | y |
| `@xterm/addon-unicode11@0.9.0` is the right version | Latest stable (0.9.0), peer-compatible with xterm 6.0.0 | Published 2025-12-22 alongside xterm 6.0.0; ships `UnicodeV11` provider + `Unicode11Addon` (Umdon `ITerminalAddon`); no peerDependencies declared | y |
| The fix applies to **every** session, not per agent | One change in `TerminalPane`, which is the single terminal surface | The bug is renderer-side (measurement), not agent-side; all agents emit the same Unicode | y |
| The corruption is not caused by the font or the PTY env | No font/env change | INPUT-12 fixed glyph coverage (U+23BE/U+23BF corners) with Cascadia Mono and the UAT confirmed the banner correct *without* icons; the remaining corruption is the width mis-measurement, and it reproduces in plain emoji output (user-confirmed) | y |
| Validation is manual | User-run live session check | Renderer components are not unit-tested by repo convention (TESTING.md); the symptom is visual. The terminal itself can't be exercised by vitest without a DOM/Electron harness | y |
| Unicode 11 covers the characters Claude emits | Yes | Claude's TUI icons (✓ U+2713, ✗ U+2717, spinner blocks, borders) and common emojis are all in the U+11 width tables (either 2-cell or unambiguous 1-cell); ZWJ sequences (out of scope) are the only known gap | y |
| Remaining implicit dimensions (auth, persistence, idempotency, rate limits, data lifecycle) | N/A for this scope — one renderer option change; no I/O | No storage, no network, no permissions boundary | y |

**Open questions:** none - all resolved or logged above.

---

## User Stories

### P1: Agent output with icons/emojis renders legible ⭐ MVP

**User Story**: As a user running Claude (or any agent) in the embedded
terminal, I want lines containing icons, emojis and wide characters to align
with the cell grid, so that output is readable and the TUI layout holds.

**Why P1**: The reported bug — the corrupted text is the day-to-day agent output.

**Acceptance Criteria** (each line is one EARS pattern):

1. WHEN the terminal renders a line containing a wide character (emoji, icon, or other Unicode 11 width-2 code point) THEN the character SHALL occupy exactly two cells and the following text SHALL align to the cell grid. <!-- event-driven -->
2. WHEN the terminal renders a line containing a combining mark or zero-width code point THEN it SHALL not advance the cursor or displace neighbouring text. <!-- event-driven -->
3. WHEN the user selects terminal output that contains wide characters THEN the on-screen text SHALL remain unchanged. <!-- event-driven -->
4. WHILE the terminal is rendered, its active Unicode version SHALL be `'11'`. <!-- state-driven -->

**Independent Test**: In a live agent session, run `echo "✓ 🎉 │ ─"` (or prompt the agent to print emoji) — the glyphs align, the following text is legible, selecting the line does not reflow it, and no stale marks sit in the first two or last column.

---

### P1: Claude Code TUI renders its gutter and borders correctly ⭐ MVP

**User Story**: As a user running the Claude Code TUI, I want the status
gutter (first two columns), spinner and vertical borders to hold their shape,
so the interactive layout stays usable while the agent works.

**Why P1**: The most visible manifestation; the TUI redraws constantly, so the
corruption is in front of the user the whole session.

**Acceptance Criteria**:

1. WHEN the Claude Code TUI draws its status icons in the first two columns THEN those columns SHALL keep exactly the TUI's intended content and SHALL NOT show stale residue as lines scroll. <!-- event-driven -->
2. WHEN the Claude Code TUI draws vertical borders at the viewport edges THEN the borders SHALL render as a single continuous column and SHALL NOT leave ghost glyphs on the neighbouring column. <!-- event-driven -->
3. WHEN the TUI redraws (spinner tick, line scroll, selection) THEN previously rendered lines SHALL be repainted cleanly with no leftover glyph fragments. <!-- event-driven -->

**Independent Test**: Open a Claude Code session and let it run — the left status gutter and right border stay crisp through spinner ticks, scrolls and selections; no ghost characters accumulate on the edges.

---

## Edge Cases

- IF a wide character lands on the last column of the viewport THEN it SHALL wrap or clip per xterm's own wrapping rules, and SHALL NOT bleed into the following line's residue. <!-- unwanted-behavior -->
- IF output mixes wide and narrow characters on one line THEN the cumulative alignment SHALL match Unicode 11 widths cell-by-cell. <!-- unwanted-behavior -->
- IF the active Unicode version cannot be set (addon missing at runtime) THEN the terminal SHALL keep the default version and SHALL NOT crash. <!-- unwanted-behavior -->
- IF the user switches sessions (pane unmount/remount) THEN the new terminal SHALL activate the same Unicode version. <!-- unwanted-behavior -->

---

## Requirement Traceability

| Requirement ID | Story | Phase | Status |
| -------------- | ----- | ----- | ------ |
| UNIC-01 | P1: legible output | Execute | Implementing |
| UNIC-02 | P1: legible output | Execute | Implementing |
| UNIC-03 | P1: legible output | Execute | Implementing |
| UNIC-04 | P1: legible output | Execute | Implementing |
| UNIC-05 | P1: Claude TUI | Execute | Implementing |
| UNIC-06 | P1: Claude TUI | Execute | Implementing |
| UNIC-07 | P1: Claude TUI | Execute | Implementing |
| UNIC-08 | Edge | - | Implementing |
| UNIC-09 | Edge | - | Implementing |
| UNIC-10 | Edge | - | Implementing |
| UNIC-11 | Edge | - | Implementing |

**ID format:** `UNIC-[NUMBER]`

**Coverage:** 11 total, all mapped at Execute.

---

## Success Criteria

- [ ] `echo "✓ 🎉"` in a live agent session renders aligned, stays stable on selection, and leaves no edge residue
- [ ] The Claude Code TUI gutter and borders hold through spinner ticks, scrolls and selections
- [ ] Gate (`typecheck && lint && test`) stays green