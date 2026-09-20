import type {
  BaseOptions,
  ChangedListing,
  ChangedPath,
  DirListing,
  FileEntry
} from '../shared/files'
import type { ChangeStatus } from '../shared/worktrees'
import { git, gitFailureLine } from './git'

/**
 * One folder of a worktree as the Files tree shows it (FXPL-04/05): tracked
 * files plus untracked files `.gitignore` does not exclude, folded to the
 * folder's direct children. `dir` is worktree-relative, `''` for the root.
 * Never throws: a git failure comes back as `error` and the tree renders that
 * line instead of an empty folder.
 */
export async function listDir(worktreePath: string, dir: string): Promise<DirListing> {
  const folder = dir.replace(/\/+$/, '')
  const pathspec = folder === '' ? [] : ['--', `${folder}/`]
  try {
    const { stdout } = await git(worktreePath, [
      'ls-files',
      '--cached',
      '--others',
      '--exclude-standard',
      '--directory',
      '-z',
      ...pathspec
    ])
    const paths = stdout.split('\0').filter((p) => p !== '')
    return { entries: foldChildren(paths, folder) }
  } catch (err) {
    return { entries: [], error: gitFailureLine(err) }
  }
}

/**
 * Folds `git ls-files` output into one level of children of `dir`. Two shapes
 * arrive: `--cached` lists every tracked *descendant* (`src/a/f.ts` under
 * `src`), while `--directory` collapses a wholly untracked folder to a single
 * `newdir/`. Both become one entry per direct child, folders first, then
 * alphabetical, case-insensitive.
 */
export function foldChildren(paths: string[], dir: string): FileEntry[] {
  const folder = dir.replace(/\/+$/, '')
  const prefix = folder === '' ? '' : `${folder}/`
  const byName = new Map<string, FileEntry>()
  for (const path of paths) {
    if (!path.startsWith(prefix)) continue
    const rest = path.slice(prefix.length)
    if (rest === '') continue
    const cut = rest.indexOf('/')
    if (cut === -1) {
      byName.set(rest, { name: rest, path: `${prefix}${rest}`, kind: 'file' })
      continue
    }
    const name = rest.slice(0, cut)
    // `newdir/` — the whole folder is untracked; anything deeper is a tracked
    // descendant, so the folder itself is not.
    const untracked = rest === `${name}/`
    const existing = byName.get(name)
    if (existing && !untracked) continue
    byName.set(name, {
      name,
      path: `${prefix}${name}`,
      kind: 'dir',
      ...(untracked ? { untracked: true } : {})
    })
  }
  return [...byName.values()].sort(compareEntries)
}

/**
 * What the branch committed since it left its base (FXPL-08): the merge-base
 * with `base`, then the diff from there to HEAD. Committed changes only —
 * uncommitted work is the other mode's subject. A base that no longer exists
 * comes back as `mergeBase: null` with git's error line (edge case).
 */
export async function changedSince(worktreePath: string, base: string): Promise<ChangedListing> {
  let mergeBase: string
  try {
    const { stdout } = await git(worktreePath, ['merge-base', 'HEAD', base])
    mergeBase = stdout.trim()
  } catch (err) {
    return { mergeBase: null, files: [], error: gitFailureLine(err) }
  }
  try {
    const { stdout } = await git(worktreePath, ['diff', '--name-status', '-z', mergeBase, 'HEAD'])
    return { mergeBase, files: parseNameStatus(stdout) }
  } catch (err) {
    return { mergeBase, files: [], error: gitFailureLine(err) }
  }
}

/**
 * Parses `git diff --name-status -z`: NUL-separated fields, a status letter
 * followed by one path, or a scored `R100` / `C75` followed by the old path
 * and the new one. Statuses land in the `ChangeStatus` vocabulary the
 * uncommitted mode already uses, so the tree labels both diff modes alike.
 */
export function parseNameStatus(stdout: string): ChangedPath[] {
  const fields = stdout.split('\0').filter((f) => f !== '')
  const files: ChangedPath[] = []
  let i = 0
  while (i < fields.length) {
    const code = fields[i++]
    const letter = code[0]
    if (letter === 'R' || letter === 'C') {
      const oldPath = fields[i++]
      const path = fields[i++]
      if (path === undefined) break
      // A copy is a new file that happens to have a source; only a rename is renamed.
      files.push({ path, status: letter === 'R' ? 'renamed' : 'added', oldPath })
      continue
    }
    const path = fields[i++]
    if (path === undefined) break
    files.push({ path, status: statusOf(letter) })
  }
  return files
}

/**
 * What the base picker offers (FXPL-09/10/11): `origin/HEAD`'s target as the
 * default, every local and remote branch as the choices. A repo without an
 * `origin/HEAD` gets `defaultBase: null` — the picker then asks for a base
 * rather than the app guessing one.
 */
export async function listBases(worktreePath: string): Promise<BaseOptions> {
  let defaultBase: string | null = null
  try {
    const { stdout } = await git(worktreePath, [
      'symbolic-ref',
      '--short',
      'refs/remotes/origin/HEAD'
    ])
    defaultBase = stdout.trim() || null
  } catch {
    defaultBase = null
  }
  try {
    const { stdout } = await git(worktreePath, [
      'for-each-ref',
      '--format=%(refname:short)%09%(symref)',
      'refs/heads',
      'refs/remotes'
    ])
    const branches = stdout
      .split(/\r?\n/)
      .filter((line) => line.trim() !== '')
      .map((line) => line.split('\t'))
      // `%(symref)` is non-empty only for a symbolic ref: `origin/HEAD` points
      // at a branch already listed beside it, and shortens to plain `origin`.
      .filter(([, symref]) => !symref)
      .map(([name]) => name.trim())
    return { defaultBase, branches }
  } catch (err) {
    // AD-032: a failure is not an empty list. The picker shows this line instead
    // of inviting a choice it cannot offer.
    return { defaultBase, branches: [], error: gitFailureLine(err) }
  }
}

/** A type change (`T`) is a modification as far as the tree is concerned. */
function statusOf(letter: string): ChangeStatus {
  switch (letter) {
    case 'A':
      return 'added'
    case 'D':
      return 'deleted'
    default:
      return 'modified'
  }
}

function compareEntries(a: FileEntry, b: FileEntry): number {
  if (a.kind !== b.kind) return a.kind === 'dir' ? -1 : 1
  const lower = a.name.toLowerCase().localeCompare(b.name.toLowerCase())
  return lower !== 0 ? lower : a.name.localeCompare(b.name)
}
