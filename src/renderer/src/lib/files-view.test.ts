import { describe, expect, it } from 'vitest'
import type { ChangedPath } from '../../../shared/files'
import { buildTree, isSolution, launcherTarget, tabsAfterClose } from './files-view'

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

describe('tabsAfterClose', () => {
  const three = ['a.ts', 'b.ts', 'c.ts']

  it('focuses the next tab when the active middle one is closed (FXPL-19)', () => {
    expect(tabsAfterClose(three, 1, 'b.ts')).toEqual({ tabs: ['a.ts', 'c.ts'], active: 'c.ts' })
  })

  it('focuses the previous tab when the active last one is closed (FXPL-19)', () => {
    expect(tabsAfterClose(three, 2, 'c.ts')).toEqual({ tabs: ['a.ts', 'b.ts'], active: 'b.ts' })
  })

  it('leaves no active tab when the only tab is closed (FXPL-19)', () => {
    expect(tabsAfterClose(['a.ts'], 0, 'a.ts')).toEqual({ tabs: [], active: null })
  })

  it('keeps the active tab when an inactive one is closed', () => {
    expect(tabsAfterClose(three, 0, 'b.ts')).toEqual({ tabs: ['b.ts', 'c.ts'], active: 'b.ts' })
  })
})

describe('launcherTarget', () => {
  it('returns whichever of the active file and the last folder is more recent (FXPL-26)', () => {
    const tab = { path: 'src/app.ts', at: 100 }

    expect(launcherTarget(tab, { path: 'src/lib', at: 200 })).toBe('src/lib')
    expect(launcherTarget(tab, { path: 'src/lib', at: 50 })).toBe('src/app.ts')
  })

  it('falls back to whichever exists, and to null when neither does (FXPL-26)', () => {
    expect(launcherTarget({ path: 'src/app.ts', at: 100 }, null)).toBe('src/app.ts')
    expect(launcherTarget(null, { path: 'src/lib', at: 100 })).toBe('src/lib')
    expect(launcherTarget(null, null)).toBeNull()
  })
})
