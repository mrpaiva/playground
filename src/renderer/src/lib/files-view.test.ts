import { describe, expect, it } from 'vitest'
import type { ChangedPath } from '../../../shared/files'
import { buildTree, isSolution } from './files-view'

function changed(path: string, status: ChangedPath['status'] = 'modified'): ChangedPath {
  return { path, status }
}

describe('buildTree', () => {
  it('nests descendants of one folder under a single node, keeping each leaf status (FXPL-08, FXPL-12)', () => {
    const tree = buildTree([changed('a/b/c.ts', 'added'), changed('a/d.ts', 'deleted')])

    expect(tree).toEqual([
      {
        kind: 'dir',
        name: 'a',
        path: 'a',
        children: [
          {
            kind: 'dir',
            name: 'b',
            path: 'a/b',
            children: [{ kind: 'file', name: 'c.ts', path: 'a/b/c.ts', status: 'added' }]
          },
          { kind: 'file', name: 'd.ts', path: 'a/d.ts', status: 'deleted' }
        ]
      }
    ])
  })

  it('sorts folders before files at every level, as foldChildren does', () => {
    const tree = buildTree([changed('zeta.ts'), changed('alpha/one.ts')])

    expect(tree.map((node) => node.path)).toEqual(['alpha', 'zeta.ts'])
  })

  it('sorts each group alphabetically, case-insensitively', () => {
    const tree = buildTree([changed('Beta.ts'), changed('alpha.ts'), changed('Charlie.ts')])

    expect(tree.map((node) => node.name)).toEqual(['alpha.ts', 'Beta.ts', 'Charlie.ts'])
  })
})

describe('isSolution', () => {
  it('accepts a .sln in any case (FXPL-28)', () => {
    expect(isSolution('src/Widget.sln')).toBe(true)
    expect(isSolution('src/Widget.SLN')).toBe(true)
  })

  it('accepts a .slnx in any case (FXPL-28)', () => {
    expect(isSolution('src/Widget.slnx')).toBe(true)
    expect(isSolution('src/Widget.SlnX')).toBe(true)
  })

  it('rejects a path that only contains .sln', () => {
    expect(isSolution('src/Widget.sln.bak')).toBe(false)
    expect(isSolution('src/Widget.ts')).toBe(false)
  })
})
