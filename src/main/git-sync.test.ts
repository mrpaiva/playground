import { execFileSync } from 'node:child_process'
import { mkdirSync, mkdtempSync, realpathSync, rmSync, statSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { parseAheadBehind, readSyncState } from './git-sync'

const git = (cwd: string, ...args: string[]): string =>
  execFileSync('git', ['-c', 'user.name=Dev', '-c', 'user.email=dev@example.com', ...args], {
    cwd,
    encoding: 'utf8'
  })

const commit = (cwd: string, message: string): void => {
  git(cwd, 'commit', '--allow-empty', '-q', '-m', message)
}

describe('parseAheadBehind', () => {
  it("reads git's behind<TAB>ahead order for @{upstream}...HEAD", () => {
    expect(parseAheadBehind('2\t1\n')).toEqual({ behind: 2, ahead: 1 })
  })
})

describe('readSyncState', () => {
  let root: string
  let remote: string
  let repo: string

  /** A primary checkout on `main` tracking `origin/main` in a local bare remote; never fetched. */
  beforeEach(() => {
    root = realpathSync.native(mkdtempSync(join(tmpdir(), 'wtm-sync-')))
    remote = join(root, 'remote.git')
    repo = join(root, 'repo')
    git(root, 'init', '-q', '--bare', '-b', 'main', remote)
    mkdirSync(repo)
    git(repo, 'init', '-q', '-b', 'main')
    commit(repo, 'first')
    git(repo, 'remote', 'add', 'origin', remote)
    git(repo, 'push', '-q', '-u', 'origin', 'main')
  })

  afterEach(() => {
    rmSync(root, { recursive: true, force: true })
  })

  /** Lands `count` commits on the remote's main from a second clone. */
  const pushFromElsewhere = (count: number): void => {
    const other = join(root, 'other')
    git(root, 'clone', '-q', remote, other)
    for (let i = 0; i < count; i++) commit(other, `remote ${i}`)
    git(other, 'push', '-q', 'origin', 'main')
  }

  it('counts commits to pull and to push against the upstream from local refs', async () => {
    pushFromElsewhere(2)
    git(repo, 'fetch', '-q', 'origin')
    commit(repo, 'local')

    const state = await readSyncState(repo)

    expect(state).toMatchObject({
      branch: 'main',
      upstream: 'origin/main',
      behind: 2,
      ahead: 1,
      remotes: ['origin']
    })
    expect(state.error).toBeUndefined()
  })

  it('treats a branch without an upstream as no-upstream, not as an error', async () => {
    git(repo, 'switch', '-q', '-c', 'user/dev/4821-fix-login')

    const state = await readSyncState(repo)

    expect(state).toMatchObject({
      branch: 'user/dev/4821-fix-login',
      upstream: null,
      behind: 0,
      ahead: 0,
      remotes: ['origin']
    })
    expect(state.error).toBeUndefined()
  })

  it('reports no remotes for a repo that has none', async () => {
    git(repo, 'remote', 'remove', 'origin')

    const state = await readSyncState(repo)

    expect(state).toMatchObject({ branch: 'main', upstream: null, remotes: [] })
    expect(state.error).toBeUndefined()
  })

  it("stats FETCH_HEAD under the primary checkout's relative .git common dir", async () => {
    git(repo, 'fetch', '-q', 'origin')

    const state = await readSyncState(repo)

    expect(state.lastFetchAt).toBe(statSync(join(repo, '.git', 'FETCH_HEAD')).mtimeMs)
  })

  it("reads a linked worktree's fetch age from the repo's FETCH_HEAD", async () => {
    git(repo, 'fetch', '-q', 'origin')
    const linked = join(root, 'repo-linked')
    git(repo, 'worktree', 'add', '-q', '-b', 'user/dev/4821-fix-login', linked)

    const state = await readSyncState(linked)

    expect(state.lastFetchAt).toBe(statSync(join(repo, '.git', 'FETCH_HEAD')).mtimeMs)
  })

  it('reads lastFetchAt as null when the repo never fetched', async () => {
    const state = await readSyncState(repo)

    expect(state.lastFetchAt).toBeNull()
  })

  it('names a detached HEAD by its short sha, with no branch and no upstream', async () => {
    git(repo, 'checkout', '-q', '--detach')
    const sha = git(repo, 'rev-parse', '--short', 'HEAD').trim()

    const state = await readSyncState(repo)

    expect(state).toMatchObject({ branch: null, detachedSha: sha, upstream: null })
    expect(state.error).toBeUndefined()
  })

  it("resolves any other git failure to git's first line instead of throwing or stale counts", async () => {
    // An upstream whose ref is missing locally (a deleted remote branch, spec edge case).
    git(repo, 'config', 'branch.main.merge', 'refs/heads/gone')

    const state = await readSyncState(repo)

    expect(state.error).toMatch(/^fatal: /)
    expect(state).toMatchObject({ branch: 'main', upstream: null, behind: 0, ahead: 0 })
  })
})
