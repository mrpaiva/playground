import { describe, expect, it } from 'vitest'
import type { ChangedPath } from '../../../shared/files'
import { commitDiffRequest, commitTabTitle } from './commit-view'

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
