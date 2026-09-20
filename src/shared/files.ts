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

/**
 * Where one side of a diff is read from: a revision, or the working copy on
 * disk. Deliberately revision-or-disk rather than mode-shaped, so F3's commit
 * diff is `{ rev: 'abc^' }` → `{ rev: 'abc' }` with nothing new in main.
 */
export type DiffRef = { rev: string; path: string } | { disk: true; path: string }

/**
 * The two sides one diff compares (FDIF-01/02). Each side carries its own
 * path, so a rename reads its original from `oldPath` (FDIF-05).
 */
export interface DiffRequest {
  /** null = the side does not exist: an added or untracked file (FDIF-03). */
  original: DiffRef | null
  /** null = the side does not exist: a deleted file (FDIF-04). */
  modified: DiffRef | null
}

/**
 * What one side of a diff got. F1's `FileContent` plus `absent`, which is not
 * the same as its `missing`: `absent` means the file is not meant to exist on
 * this side, `missing` that it was looked for and was not there.
 */
export type DiffSide = FileContent | { kind: 'absent' }

/** A line terminator, as the raw bytes of a side carry it. */
export type Eol = 'LF' | 'CRLF' | 'CR'

/**
 * One diff as main produces it (FDIF-01..06, 15). Line-ending changes come
 * with it because Monaco's diff cannot see them: its models keep their own
 * terminators, but the diff of a CRLF side against an identical LF side
 * reports zero changes (F2 spike, finding 1).
 */
export interface DiffSides {
  original: DiffSide
  modified: DiffSide
  /** Modified-side line numbers, 1-based, whose terminator differs from the original's. */
  eolChanged: number[]
  /** The original side's dominant ending, for the strip text (FDIF-15). */
  eolFrom?: Eol
  /** The modified side's dominant ending, for the strip text (FDIF-15). */
  eolTo?: Eol
}

/** One changed file's line counts, for the All changes header and sections (FDIF-19/20). */
export interface FileStat {
  path: string
  added: number
  removed: number
  /** Git reported `-` for both counts: there are no lines to count. */
  binary: boolean
}
