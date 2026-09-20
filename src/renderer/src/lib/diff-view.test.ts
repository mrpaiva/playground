import { describe, expect, it } from 'vitest'
import type { ChangedPath } from '../../../shared/files'
import { diffRequestFor } from './diff-view'

function changed(path: string, status: ChangedPath['status'], oldPath?: string): ChangedPath {
  return { path, status, ...(oldPath ? { oldPath } : {}) }
}

describe('diffRequestFor', () => {
  it('compares the merge base with HEAD in diff-to-origin mode (FDIF-01)', () => {
    const request = diffRequestFor('since-base', changed('src/app.ts', 'modified'), 'abc1234')

    expect(request).toEqual({
      original: { rev: 'abc1234', path: 'src/app.ts' },
      modified: { rev: 'HEAD', path: 'src/app.ts' }
    })
  })

  it('compares HEAD with the disk in uncommitted mode (FDIF-02)', () => {
    const request = diffRequestFor('uncommitted', changed('src/app.ts', 'modified'), 'abc1234')

    expect(request).toEqual({
      original: { rev: 'HEAD', path: 'src/app.ts' },
      modified: { disk: true, path: 'src/app.ts' }
    })
  })

  it('leaves the original side out for an added or untracked file (FDIF-03)', () => {
    const added = diffRequestFor('since-base', changed('src/new.ts', 'added'), 'abc1234')
    const untracked = diffRequestFor('uncommitted', changed('src/new.ts', 'untracked'), 'abc1234')

    expect(added).toEqual({ original: null, modified: { rev: 'HEAD', path: 'src/new.ts' } })
    expect(untracked).toEqual({ original: null, modified: { disk: true, path: 'src/new.ts' } })
  })

  it('leaves the modified side out for a deleted file (FDIF-04)', () => {
    const request = diffRequestFor('uncommitted', changed('src/gone.ts', 'deleted'), 'abc1234')

    expect(request).toEqual({ original: { rev: 'HEAD', path: 'src/gone.ts' }, modified: null })
  })

  it('reads a rename original from its previous path (FDIF-05)', () => {
    const request = diffRequestFor(
      'since-base',
      changed('src/widget.ts', 'renamed', 'src/gadget.ts'),
      'abc1234'
    )

    expect(request).toEqual({
      original: { rev: 'abc1234', path: 'src/gadget.ts' },
      modified: { rev: 'HEAD', path: 'src/widget.ts' }
    })
  })

  it('has no diff to build when the base no longer resolves (edge case, FXPL-11)', () => {
    // The base prompt takes the place of a stale diff, so there is no request.
    expect(diffRequestFor('since-base', changed('src/app.ts', 'modified'), null)).toBeNull()
  })
})
