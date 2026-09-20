import type { ChangedPath, CommitRow, DiffRef, DiffRequest } from '../../../shared/files'

/**
 * The two sides of one file's diff inside a commit's tab (FCMT-17/18).
 *
 * A commit is just a pair of revisions, which is why F2's viewer needs nothing
 * new: `parent` → `sha`. A root commit has no parent, so every original side
 * is empty and the tab reads as one long addition (FCMT-18).
 *
 * Pure.
 */
export function commitDiffRequest(
  sha: string,
  parent: string | null,
  changed: ChangedPath
): DiffRequest {
  return {
    original: originalRef(changed, parent),
    // A file the commit deleted has no version on the right (FDIF-04).
    modified: changed.status === 'deleted' ? null : { rev: sha, path: changed.path }
  }
}

/**
 * Where the earlier version of this file lives in the parent. A file the
 * commit created has none, and neither does anything in a root commit; a
 * rename's original is at the path it came from, which is the only place the
 * parent holds it (FDIF-05).
 */
function originalRef(changed: ChangedPath, parent: string | null): DiffRef | null {
  if (parent === null) return null
  if (changed.status === 'added' || changed.status === 'untracked') return null
  return { rev: parent, path: changed.oldPath ?? changed.path }
}

/**
 * What a commit's tab is called (FCMT-16): the short sha and the subject, so
 * two tabs of the same subject are still told apart. A commit with no subject
 * reads `(no subject)` rather than leaving the title trailing off.
 */
export function commitTabTitle(row: Pick<CommitRow, 'shortSha' | 'subject'>): string {
  const subject = row.subject.trim() === '' ? '(no subject)' : row.subject
  return `${row.shortSha} · ${subject}`
}
