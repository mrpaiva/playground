import { execFileSync } from 'node:child_process'
import { mkdirSync, mkdtempSync, realpathSync, rmSync, statSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { parseAheadBehind, parseCommitLines, readCommits, readSyncState } from './git-sync'

const git = (cwd: string, ...args: string[]): string =>
  execFileSync('git', ['-c', 'user.name=Dev', '-c', 'user.email=dev@example.com', ...args], {
    cwd,
    encoding: 'utf8'
  })

const commit = (cwd: string, message: string): void => {
  git(cwd, 'commit', '--allow-empty', '-q', '-m', message)
}

/** A primary checkout on `main` tracking `origin/main` in a local bare remote; never fetched. */
function seedRepo(): { root: string; remote: string; repo: string } {
  const root = realpathSync.native(mkdtempSync(join(tmpdir(), 'wtm-sync-')))
  const remote = join(root, 'remote.git')
  const repo = join(root, 'repo')
  git(root, 'init', '-q', '--bare', '-b', 'main', remote)
  mkdirSync(repo)
  git(repo, 'init', '-q', '-b', 'main')
  commit(repo, 'first')
  git(repo, 'remote', 'add', 'origin', remote)
  git(repo, 'push', '-q', '-u', 'origin', 'main')
  return { root, remote, repo }
}

/** Lands `count` commits on the remote's main from a second clone under `root`. */
function pushFromElsewhere(root: string, remote: string, count: number): void {
  const other = join(root, 'other')
  git(root, 'clone', '-q', remote, other)
  for (let i = 0; i < count; i++) commit(other, `remote ${i}`)
  git(other, 'push', '-q', 'origin', 'main')
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

  beforeEach(() => {
    ;({ root, remote, repo } = seedRepo())
  })

  afterEach(() => {
    rmSync(root, { recursive: true, force: true })
  })

  it('counts commits to pull and to push against the upstream from local refs', async () => {
    pushFromElsewhere(root, remote, 2)
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

describe('parseCommitLines', () => {
  it('returns no commits for an empty stdout', () => {
    expect(parseCommitLines('')).toEqual([])
  })

  it("keeps a subject containing the separator's neighbours intact", () => {
    const subject = 'fix:\x1e split\ton  spaces '
    expect(parseCommitLines(`abc1234\x1f${subject}\x1f1700000000\n`)).toEqual([
      { sha: 'abc1234', subject, at: 1700000000000 }
    ])
  })

  it('reads a CRLF-terminated stream without carrying the CR into any field', () => {
    expect(
      parseCommitLines('abc1234\x1fone\x1f1700000000\r\ndef5678\x1ftwo\x1f1700000060\r\n')
    ).toEqual([
      { sha: 'abc1234', subject: 'one', at: 1700000000000 },
      { sha: 'def5678', subject: 'two', at: 1700000060000 }
    ])
  })
})

describe('readCommits', () => {
  let root: string
  let remote: string
  let repo: string

  beforeEach(() => {
    ;({ root, remote, repo } = seedRepo())
  })

  afterEach(() => {
    rmSync(root, { recursive: true, force: true })
  })

  /** Every commit in `range`, newest first, as git itself reports it. */
  const expected = (range: string): { sha: string; subject: string; at: number }[] =>
    parseCommitLines(git(repo, 'log', '--format=%h%x1f%s%x1f%ct', range))

  it('lists incoming as HEAD..@{upstream} and outgoing as @{upstream}..HEAD', async () => {
    pushFromElsewhere(root, remote, 2)
    git(repo, 'fetch', '-q', 'origin')
    commit(repo, 'local work')

    const lists = await readCommits(repo)

    expect(lists.incoming.map((c) => c.subject)).toEqual(['remote 1', 'remote 0'])
    expect(lists.outgoing.map((c) => c.subject)).toEqual(['local work'])
    expect(lists.incoming).toEqual(expected('HEAD..origin/main'))
    expect(lists.outgoing).toEqual(expected('origin/main..HEAD'))
    expect(lists).toMatchObject({ moreIncoming: 0, moreOutgoing: 0 })
  })

  it('caps each list at 20 and counts the rest exactly', async () => {
    pushFromElsewhere(root, remote, 21)
    git(repo, 'fetch', '-q', 'origin')
    for (let i = 0; i < 22; i++) commit(repo, `local ${i}`)

    const lists = await readCommits(repo)

    expect(lists.incoming).toHaveLength(20)
    expect(lists.outgoing).toHaveLength(20)
    expect(lists).toMatchObject({ moreIncoming: 1, moreOutgoing: 2 })
  })

  it('returns two empty lists and zero counts for a branch without an upstream', async () => {
    git(repo, 'switch', '-q', '-c', 'user/dev/4821-fix-login')
    commit(repo, 'unpublished')

    expect(await readCommits(repo)).toEqual({
      incoming: [],
      outgoing: [],
      moreIncoming: 0,
      moreOutgoing: 0
    })
  })
})
