import type { ChangeStatus } from './worktrees'

/**
 * The three lenses the Files direction puts over one worktree (FXPL-07): the
 * whole folder, what the branch changed since its base, and what is not
 * committed yet.
 */
export type FilesMode = 'full' | 'since-base' | 'uncommitted'

/** One row of a folder listing — a direct child, never a descendant. */
export interface FileEntry {
  name: string
  /** Path relative to the worktree root, forward slashes. */
  path: string
  kind: 'file' | 'dir'
  /** A folder `git ls-files --directory` reported as wholly untracked. */
  untracked?: boolean
}

/** One folder's direct children, or git's first error line instead (edge case). */
export interface DirListing {
  entries: FileEntry[]
  error?: string
}

/**
 * One changed path in either diff mode. `status` is the same `ChangeStatus`
 * the uncommitted mode already uses, so both modes carry one label vocabulary.
 */
export interface ChangedPath {
  path: string
  status: ChangeStatus
  /** The source path of a rename or a copy. */
  oldPath?: string
}

/** What the branch changed since its base (FXPL-08), committed changes only. */
export interface ChangedListing {
  mergeBase: string | null
  files: ChangedPath[]
  error?: string
}

/** What the base picker offers (FXPL-09/10/11). */
export interface BaseOptions {
  /** `origin/HEAD`'s target, e.g. 'origin/main'; null when the repo has none (FXPL-11). */
  defaultBase: string | null
  branches: string[]
  /**
   * Git's first error line when the branches could not be listed at all
   * (AD-032). Distinct from an empty `branches`: nothing to list invites the
   * FXPL-11 prompt, a failure cannot, because there is nothing to choose from.
   */
  error?: string
}

/**
 * What the viewer got for one file (FXPL-16/20/24). A discriminated union, so a
 * file that cannot be rendered is a state the tab shows, never an exception.
 */
export type FileContent =
  | { kind: 'text'; text: string; size: number }
  | { kind: 'binary'; size: number }
  | { kind: 'too-large'; size: number }
  | { kind: 'missing' }
  | { kind: 'error'; message: string }

/** One batch of disk changes in the selected worktree (FXPL-21/22). */
export interface FilesChanged {
  worktreePath: string
  /** Relative paths touched in this batch. */
  paths: string[]
  /** The index or HEAD moved: a commit, a stage or a checkout. */
  gitStateChanged: boolean
}
