import type { ChangedPath, DiffRef, DiffRequest, FilesMode } from '../../../shared/files'

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
