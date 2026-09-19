import { stat } from 'node:fs/promises'
import { resolve } from 'node:path'
import type { SyncState } from '../shared/git'
import { git, gitFailureLine } from './git'

/**
 * `rev-list --count --left-right @{upstream}...HEAD` prints `behind<TAB>ahead`:
 * the left side counts commits only the upstream has, the right side commits
 * only HEAD has (STBR-09).
 */
export function parseAheadBehind(stdout: string): { behind: number; ahead: number } {
  const [behind, ahead] = stdout.trim().split(/\s+/).map(Number)
  return { behind, ahead }
}

/**
 * Where a worktree stands against its upstream, from local refs only — this
 * never touches the network (STBR-09/10). Never throws: a git failure lands in
 * `error` alongside whatever was already read (STBR-14).
 */
export async function readSyncState(worktreePath: string): Promise<SyncState> {
  const state: SyncState = {
    branch: null,
    upstream: null,
    behind: 0,
    ahead: 0,
    remotes: [],
    lastFetchAt: null
  }
  try {
    const head = (await git(worktreePath, ['rev-parse', '--abbrev-ref', 'HEAD'])).stdout.trim()
    if (head === 'HEAD') {
      state.detachedSha = (await git(worktreePath, ['rev-parse', '--short', 'HEAD'])).stdout.trim()
    } else {
      state.branch = head
    }
    state.remotes = (await git(worktreePath, ['remote'])).stdout.split(/\r?\n/).filter(Boolean)
    state.lastFetchAt = await lastFetchAt(worktreePath)
    if (state.branch !== null) await readUpstream(worktreePath, state)
  } catch (err) {
    state.error = gitFailureLine(err)
  }
  return state
}

/**
 * A branch without an upstream makes `rev-list` fail with `no upstream
 * configured` — that failure, not a zero count, is the no-upstream signal
 * (STBR-12). Any other failure (e.g. an upstream ref deleted locally) throws.
 */
async function readUpstream(worktreePath: string, state: SyncState): Promise<void> {
  let counts: string
  try {
    counts = (
      await git(worktreePath, ['rev-list', '--count', '--left-right', '@{upstream}...HEAD'])
    ).stdout
  } catch (err) {
    if (/no upstream configured/.test(gitFailureLine(err))) return
    throw err
  }
  Object.assign(state, parseAheadBehind(counts))
  state.upstream = (
    await git(worktreePath, ['rev-parse', '--abbrev-ref', '@{upstream}'])
  ).stdout.trim()
}

/**
 * `FETCH_HEAD` lives in the repo's common git dir — a linked worktree has none
 * of its own — and git prints that dir relative (`.git`) in a primary checkout,
 * so it is resolved against the worktree before the stat (STBR-22).
 */
async function lastFetchAt(worktreePath: string): Promise<number | null> {
  const commonDir = (await git(worktreePath, ['rev-parse', '--git-common-dir'])).stdout.trim()
  try {
    return (await stat(resolve(worktreePath, commonDir, 'FETCH_HEAD'))).mtimeMs
  } catch {
    return null
  }
}
