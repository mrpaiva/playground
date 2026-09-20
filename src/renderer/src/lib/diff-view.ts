import type { ChangedPath, DiffRef, DiffRequest, FileStat, FilesMode } from '../../../shared/files'

/**
 * The two lenses that open a diff (FDIF-01/02). Full-folder mode is not one of
 * them: it lists files that nothing changed, so there is no second side to
 * compare against.
 */
export type DiffMode = Exclude<FilesMode, 'full'>

/**
 * Which revision or working copy each side of a diff comes from (FDIF-01..05),
 * in one place, so the tree, the tab strip and the All changes stack all ask
 * the same question the same way.
 *
 * `mergeBase` is the resolved `merge-base(HEAD, base)` diff-to-origin compares
 * against; `null` means the base no longer resolves, and there is no diff to
 * build — F1's base prompt takes the tab's place rather than a stale diff
 * (edge case, FXPL-11). Uncommitted mode never reads it.
 */
export function diffRequestFor(
  mode: DiffMode,
  changed: ChangedPath,
  mergeBase: string | null
): DiffRequest | null {
  if (mode === 'since-base') {
    if (mergeBase === null) return null
    return {
      original: originalRef(changed, mergeBase),
      modified: modifiedExists(changed) ? { rev: 'HEAD', path: changed.path } : null
    }
  }
  return {
    original: originalRef(changed, 'HEAD'),
    modified: modifiedExists(changed) ? { disk: true, path: changed.path } : null
  }
}

/**
 * Where the earlier version of this file lives, at `rev`. A file the change
 * created has none (FDIF-03); a rename's is at the path it came from
 * (FDIF-05), which is the only place that revision holds it.
 */
function originalRef(changed: ChangedPath, rev: string): DiffRef | null {
  if (changed.status === 'added' || changed.status === 'untracked') return null
  return { rev, path: changed.oldPath ?? changed.path }
}

/** A deleted file has no current version to put on the right (FDIF-04). */
function modifiedExists(changed: ChangedPath): boolean {
  return changed.status !== 'deleted'
}

/** What the tab strip can hold, as far as identity goes (FDIF-08, FDIF-17). */
export type TabRef =
  | { kind: 'file'; path: string }
  | { kind: 'diff'; mode: DiffMode; path: string }
  | { kind: 'all-changes' }

/** The key of the fixed first tab of both diff modes (FDIF-17). */
export const ALL_CHANGES_KEY = 'all-changes'

/** One instance, so re-deriving the strip does not remount the stack. */
const ALL_CHANGES_TAB: TabRef = { kind: 'all-changes' }

/**
 * What identifies a tab (FDIF-08). A diff of one path is a different tab in
 * each mode, and both are different from a file tab for that same path: the
 * kind and, for a diff, the mode are part of the key, not just the path.
 */
export function tabKeyOf(tab: TabRef): string {
  if (tab.kind === 'all-changes') return ALL_CHANGES_KEY
  return tab.kind === 'file' ? `file:${tab.path}` : `diff:${tab.mode}:${tab.path}`
}

/** Whether two tabs are the same tab, by the identity `tabKeyOf` defines. */
export function isSameTab(a: TabRef, b: TabRef): boolean {
  return tabKeyOf(a) === tabKeyOf(b)
}

/**
 * The tab strip for the mode currently shown: All changes first in both diff
 * modes (FDIF-17), absent in full-folder mode (FDIF-18), and never twice. The
 * All changes tab is derived from the mode rather than stored, which is what
 * lets it follow a mode switch while every diff tab beside it keeps comparing
 * what it was opened on (FDIF-09).
 */
export function tabsWithAllChanges<T extends TabRef>(
  tabs: readonly T[],
  mode: FilesMode
): (T | TabRef)[] {
  const rest = tabs.filter((tab) => tab.kind !== 'all-changes')
  return mode === 'full' ? rest : [ALL_CHANGES_TAB, ...rest]
}

/** How many sections of the All changes stack start expanded (FDIF-21). */
const INITIALLY_EXPANDED = 10

/**
 * Which sections of the All changes stack start open (FDIF-21): the first ten
 * of the mode's list, in the tree order the stack renders them in, and all of
 * them when the list is shorter. Ten expanded sections is already more than a
 * screen, and a branch of two hundred files must not mount two hundred editors.
 */
export function initialExpansion(files: readonly FileStat[]): Set<string> {
  return new Set(files.slice(0, INITIALLY_EXPANDED).map((file) => file.path))
}

/**
 * The stack header (FDIF-20): how many files changed, and how many lines the
 * whole set added and removed.
 *
 * A file git reported no line counts for is counted as a file and nothing else.
 * That is every file with `binary` set, which also covers an untracked file too
 * large to read: `diffStats` marks it the same way, because there are no lines
 * anyone is willing to count, and a `+0 −0` in the header would be a claim
 * about content nobody looked at.
 */
export function totals(files: readonly FileStat[]): {
  files: number
  added: number
  removed: number
} {
  let added = 0
  let removed = 0
  for (const file of files) {
    if (file.binary) continue
    added += file.added
    removed += file.removed
  }
  return { files: files.length, added, removed }
}

/** One file of the All changes stack, as next / previous change sees it. */
export interface ChangeSection {
  /** The file's path, which is the section's identity in the stack. */
  path: string
  /** The modified-side lines the diff reports as changed, ascending. */
  changes: number[]
  expanded: boolean
}

/** Where the reader is: which section, and which line inside it. */
export interface ChangePosition {
  path: string
  line: number
}

/** Where next or previous change lands (FDIF-25/26). */
export interface ChangeTarget {
  path: string
  line: number
  /** The section is collapsed, so it has to be opened before the line shows. */
  expand: boolean
}

/**
 * Where next or previous change goes (FDIF-25/26). Inside the current file it
 * is the nearest change past the cursor; once there is none, it is the first
 * change of the next file that has one, which the All changes tab expands on
 * the way in (FDIF-26). Past the last change of the last file there is nowhere
 * to go, and the position stays where it is.
 *
 * A file whose sides are identical contributes no changes, so navigation walks
 * over it rather than landing on a section with nothing to show.
 *
 * `sections` is the whole stack in the order it renders. A single diff tab is
 * the one-section case, and there `null` means the file's own last change
 * (FDIF-25) rather than the end of a stack.
 */
export function nextChangeTarget(
  position: ChangePosition,
  sections: readonly ChangeSection[],
  direction: 'next' | 'previous'
): ChangeTarget | null {
  const at = sections.findIndex((section) => section.path === position.path)
  if (at === -1) return null
  const forward = direction === 'next'
  const here = sections[at].changes
  const inside = forward
    ? here.find((line) => line > position.line)
    : here.filter((line) => line < position.line).pop()
  if (inside !== undefined) return targetIn(sections[at], inside)
  const step = forward ? 1 : -1
  for (let i = at + step; i >= 0 && i < sections.length; i += step) {
    const section = sections[i]
    if (section.changes.length === 0) continue
    const edge = forward ? section.changes[0] : section.changes[section.changes.length - 1]
    return targetIn(section, edge)
  }
  return null
}

function targetIn(section: ChangeSection, line: number): ChangeTarget {
  return { path: section.path, line, expand: !section.expanded }
}
