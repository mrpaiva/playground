import { describe, expect, it } from 'vitest'
import type { ChangedPath, FileStat } from '../../../shared/files'
import {
  ALL_CHANGES_KEY,
  diffRequestFor,
  initialExpansion,
  isSameTab,
  tabKeyOf,
  tabsWithAllChanges,
  totals,
  type DiffMode,
  type TabRef
} from './diff-view'

function changed(path: string, status: ChangedPath['status'], oldPath?: string): ChangedPath {
  return { path, status, ...(oldPath ? { oldPath } : {}) }
}

function fileTab(path: string): TabRef {
  return { kind: 'file', path }
}

function diffTab(mode: DiffMode, path: string): TabRef {
  return { kind: 'diff', mode, path }
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

describe('tabKeyOf', () => {
  it('keys a diff tab by its mode and path, apart from a file tab (FDIF-08)', () => {
    const keys = [
      tabKeyOf(diffTab('since-base', 'src/app.ts')),
      tabKeyOf(diffTab('uncommitted', 'src/app.ts')),
      tabKeyOf(fileTab('src/app.ts'))
    ]

    expect(new Set(keys).size).toBe(3)
  })

  it('gives All changes a key no file or diff tab can produce (FDIF-17)', () => {
    const allChanges = tabKeyOf({ kind: 'all-changes' })

    // The strip and `tabsAfterClose` recognise the fixed tab by this key, so a
    // file that happens to be named like it must not answer to it.
    expect(allChanges).toBe(ALL_CHANGES_KEY)
    expect(tabKeyOf(fileTab('all-changes'))).not.toBe(allChanges)
    expect(tabKeyOf(diffTab('uncommitted', 'all-changes'))).not.toBe(allChanges)
  })
})

describe('isSameTab', () => {
  it('matches a diff tab only in the mode it was opened in (FDIF-08, FDIF-09)', () => {
    const open = diffTab('since-base', 'src/app.ts')

    expect(isSameTab(open, diffTab('since-base', 'src/app.ts'))).toBe(true)
    expect(isSameTab(open, diffTab('uncommitted', 'src/app.ts'))).toBe(false)
    expect(isSameTab(open, fileTab('src/app.ts'))).toBe(false)
  })
})

describe('tabsWithAllChanges', () => {
  const open = [fileTab('src/app.ts'), diffTab('uncommitted', 'src/lib/util.ts')]

  it('puts All changes first in both diff modes (FDIF-17)', () => {
    for (const mode of ['since-base', 'uncommitted'] as const) {
      const tabs = tabsWithAllChanges(open, mode)

      expect(tabs.map(tabKeyOf)).toEqual([
        ALL_CHANGES_KEY,
        'file:src/app.ts',
        'diff:uncommitted:src/lib/util.ts'
      ])
    }
  })

  it('drops All changes in full-folder mode (FDIF-18)', () => {
    const tabs = tabsWithAllChanges([{ kind: 'all-changes' }, ...open], 'full')

    expect(tabs.map(tabKeyOf)).toEqual(['file:src/app.ts', 'diff:uncommitted:src/lib/util.ts'])
  })

  it('never shows All changes twice (FDIF-17)', () => {
    const tabs = tabsWithAllChanges([{ kind: 'all-changes' }, ...open], 'since-base')

    expect(tabs.filter((tab) => tab.kind === 'all-changes')).toHaveLength(1)
    expect(tabKeyOf(tabs[0])).toBe(ALL_CHANGES_KEY)
  })

  it('leaves a diff tab comparing what it compared when the mode changes (FDIF-09)', () => {
    const tabs = tabsWithAllChanges([diffTab('since-base', 'src/app.ts')], 'uncommitted')

    expect(tabs.map(tabKeyOf)).toEqual([ALL_CHANGES_KEY, 'diff:since-base:src/app.ts'])
  })
})

function stat(path: string, added = 0, removed = 0, binary = false): FileStat {
  return { path, added, removed, binary }
}

function stats(count: number): FileStat[] {
  return Array.from({ length: count }, (_, i) => stat(`src/file-${i + 1}.ts`, 1, 1))
}

describe('initialExpansion', () => {
  it('starts only the first 10 of 40 sections expanded, in tree order (FDIF-21)', () => {
    const expanded = initialExpansion(stats(40))

    expect([...expanded]).toEqual(
      stats(40)
        .slice(0, 10)
        .map((file) => file.path)
    )
    expect(expanded.has('src/file-11.ts')).toBe(false)
  })

  it('starts every section expanded when the list is 10 or shorter (FDIF-21)', () => {
    expect(initialExpansion(stats(7)).size).toBe(7)
    expect(initialExpansion(stats(10)).size).toBe(10)
  })
})

describe('totals', () => {
  it('counts the files and sums the added and removed lines (FDIF-20)', () => {
    const changed = [stat('src/app.ts', 12, 3), stat('src/lib/util.ts', 4, 40)]

    expect(totals(changed)).toEqual({ files: 2, added: 16, removed: 43 })
  })

  it('counts a file with no countable lines as a file and nothing else (FDIF-20)', () => {
    // `binary` is set whenever git reported no line counts, so the numbers
    // beside it describe nothing and must not reach the header.
    const changed = [stat('src/app.ts', 12, 3), stat('assets/logo.png', 99, 99, true)]

    expect(totals(changed)).toEqual({ files: 2, added: 12, removed: 3 })
  })
})
