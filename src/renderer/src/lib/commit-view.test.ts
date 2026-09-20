import { describe, expect, it } from 'vitest'
import type { ChangedPath, CommitRow } from '../../../shared/files'
import {
  browseState,
  commitDiffRequest,
  commitTabTitle,
  mergePages,
  uncommittedRowLabel
} from './commit-view'

const SHA = '0f2b9c1d4e6a8b3c5d7e9f0a1b2c3d4e5f6a7b8c'
const PARENT = '9e8d7c6b5a40312f1e0d9c8b7a6f5e4d3c2b1a09'

describe('commitDiffRequest', () => {
  it('compares a modified file between the parent and the commit', () => {
    const changed: ChangedPath = { path: 'src/a.ts', status: 'modified' }

    expect(commitDiffRequest(SHA, PARENT, changed)).toEqual({
      original: { rev: PARENT, path: 'src/a.ts' },
      modified: { rev: SHA, path: 'src/a.ts' }
    })
  })

  it('leaves the original side empty for a file the commit added', () => {
    const changed: ChangedPath = { path: 'src/new.ts', status: 'added' }

    expect(commitDiffRequest(SHA, PARENT, changed)).toEqual({
      original: null,
      modified: { rev: SHA, path: 'src/new.ts' }
    })
  })

  it('leaves the modified side empty for a file the commit deleted', () => {
    const changed: ChangedPath = { path: 'src/gone.ts', status: 'deleted' }

    expect(commitDiffRequest(SHA, PARENT, changed)).toEqual({
      original: { rev: PARENT, path: 'src/gone.ts' },
      modified: null
    })
  })

  it('reads a rename original from the path it came from', () => {
    // FDIF-05: the parent holds it only under the old path.
    const changed: ChangedPath = { path: 'src/b.ts', status: 'renamed', oldPath: 'src/a.ts' }

    expect(commitDiffRequest(SHA, PARENT, changed)).toEqual({
      original: { rev: PARENT, path: 'src/a.ts' },
      modified: { rev: SHA, path: 'src/b.ts' }
    })
  })

  it('leaves every original side empty in a root commit', () => {
    // FCMT-18: no parent, so there is no earlier version of anything.
    const files: ChangedPath[] = [
      { path: 'a.ts', status: 'added' },
      { path: 'b.ts', status: 'modified' }
    ]

    expect(files.map((f) => commitDiffRequest(SHA, null, f).original)).toEqual([null, null])
  })
})

describe('commitTabTitle', () => {
  it('names a tab by its short sha and subject', () => {
    expect(commitTabTitle({ shortSha: 'abc1234', subject: 'fix the thing' })).toBe(
      'abc1234 · fix the thing'
    )
  })

  it('names a subjectless commit (no subject)', () => {
    expect(commitTabTitle({ shortSha: 'abc1234', subject: '' })).toBe('abc1234 · (no subject)')
  })
})

/** A row carrying only what the helpers under test read. */
const row = (sha: string, pushed = true): CommitRow => ({
  sha,
  shortSha: sha.slice(0, 7),
  subject: `subject ${sha}`,
  message: `subject ${sha}`,
  author: 'Dev',
  at: 1700000000000,
  isMerge: false,
  pushed
})

describe('mergePages', () => {
  it('appends the next page below the current one, in order', () => {
    const merged = mergePages([row('a'), row('b')], [row('c'), row('d')])

    expect(merged.map((r) => r.sha)).toEqual(['a', 'b', 'c', 'd'])
  })

  it('drops a sha the list already holds', () => {
    const merged = mergePages([row('a'), row('b')], [row('b'), row('c')])

    expect(merged.map((r) => r.sha)).toEqual(['a', 'b', 'c'])
  })
})

describe('uncommittedRowLabel', () => {
  it('counts the changed files in the row it heads the list with', () => {
    expect(uncommittedRowLabel(3)).toBe('Uncommitted changes (3)')
  })

  it('offers no row when the worktree is clean', () => {
    expect(uncommittedRowLabel(0)).toBeNull()
  })
})

describe('browseState', () => {
  it('hides the action when the upstream host is not one the app can open', () => {
    // FCMT-26: nothing to disable toward, so the button is not there at all.
    expect(browseState(row('a', true), { browse: null })).toBe('hidden')
  })

  it('disables the action on a commit that has not been pushed', () => {
    // FCMT-25: the button stays, so it can say why it does nothing.
    expect(browseState(row('a', false), { browse: 'github' })).toBe('disabled')
  })

  it('enables the action on a pushed commit of a recognized host', () => {
    expect(browseState(row('a', true), { browse: 'azure-devops' })).toBe('enabled')
  })
})
