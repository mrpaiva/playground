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
