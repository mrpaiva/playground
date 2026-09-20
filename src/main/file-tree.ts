import type { DirListing, FileEntry } from '../shared/files'
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

function compareEntries(a: FileEntry, b: FileEntry): number {
  if (a.kind !== b.kind) return a.kind === 'dir' ? -1 : 1
  const lower = a.name.toLowerCase().localeCompare(b.name.toLowerCase())
  return lower !== 0 ? lower : a.name.localeCompare(b.name)
}
