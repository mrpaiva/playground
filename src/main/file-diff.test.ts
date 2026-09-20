import { execFileSync } from 'node:child_process'
import { mkdirSync, mkdtempSync, realpathSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { diffStats, lineEndingChanges, parseNumstat } from './file-diff'

const git = (cwd: string, ...args: string[]): string =>
  execFileSync('git', args, { cwd, encoding: 'utf8' })

/** `git diff --numstat -z` output: every record NUL-terminated, including the last. */
const z = (...records: string[]): string => records.map((r) => `${r}\0`).join('')

/** `git diff --shortstat` as three numbers, so a test can compare against git itself. */
const shortstat = (raw: string): { files: number; added: number; removed: number } => ({
  files: Number(/(\d+) files? changed/.exec(raw)?.[1] ?? 0),
  added: Number(/(\d+) insertions?\(\+\)/.exec(raw)?.[1] ?? 0),
  removed: Number(/(\d+) deletions?\(-\)/.exec(raw)?.[1] ?? 0)
})

describe('lineEndingChanges', () => {
  it('reports every line of a whole-file CRLF to LF flip', () => {
    // FDIF-15 / spike finding 1: Monaco's diff calls this "no changes", so main
    // must name every line, or the flip is invisible to the user.
    const original = 'alpha\r\nbeta\r\ngamma\r\n'
    const modified = 'alpha\nbeta\ngamma\n'

    expect(lineEndingChanges(original, modified)).toEqual({
      lines: [1, 2, 3],
      from: 'CRLF',
      to: 'LF'
    })
  })

  it('reports only the 4 CRLF lines of a mixed file flipped to pure LF', () => {
    const texts = Array.from({ length: 719 }, (_, i) => `line ${i + 1}`)
    const crlfLines = new Set([100, 200, 300, 400])
    const original = texts.map((t, i) => t + (crlfLines.has(i + 1) ? '\r\n' : '\n')).join('')
    const modified = texts.map((t) => `${t}\n`).join('')

    expect(lineEndingChanges(original, modified).lines).toEqual([100, 200, 300, 400])
  })

  it('reports nothing when the endings match, even where the text changed', () => {
    const original = 'alpha\nbeta\ngamma\n'
    const modified = 'alpha\nBETA rewritten\ngamma\n'

    expect(lineEndingChanges(original, modified).lines).toEqual([])
  })

  it('names a CR-only side as CR', () => {
    const original = 'alpha\rbeta\rgamma\r'
    const modified = 'alpha\nbeta\ngamma\n'

    const changes = lineEndingChanges(original, modified)

    expect(changes.from).toBe('CR')
    expect(changes.lines).toEqual([1, 2, 3])
  })

  it('counts a last line that gained a terminator as changed', () => {
    const original = 'alpha\nbeta'
    const modified = 'alpha\nbeta\n'

    expect(lineEndingChanges(original, modified).lines).toEqual([2])
  })

  it('leaves out a line the text change added, and keeps the surviving ones', () => {
    // The inserted line exists on one side only, so it has no terminator to
    // have changed; the three lines that survive the edit all flipped.
    const original = 'alpha\r\nbeta\r\ngamma\r\n'
    const modified = 'alpha\ninserted\nbeta\ngamma\n'

    expect(lineEndingChanges(original, modified).lines).toEqual([1, 3, 4])
  })
})

describe('parseNumstat', () => {
  it('reads one record per changed file', () => {
    const stats = parseNumstat(z('3\t1\tsrc/a.ts', '12\t0\tsrc/b.ts'))

    expect(stats).toEqual([
      { path: 'src/a.ts', added: 3, removed: 1, binary: false },
      { path: 'src/b.ts', added: 12, removed: 0, binary: false }
    ])
  })

  it('reads a rename record as one file at its new path', () => {
    // A rename leaves the record's path empty and follows with the old path
    // and the new one; the stack shows the file where it is now.
    const stats = parseNumstat(z('2\t5\t', 'src/old.ts', 'src/new.ts', '1\t0\tsrc/c.ts'))

    expect(stats).toEqual([
      { path: 'src/new.ts', added: 2, removed: 5, binary: false },
      { path: 'src/c.ts', added: 1, removed: 0, binary: false }
    ])
  })

  it('maps a dash for both counts to a binary file with no lines', () => {
    const stats = parseNumstat(z('-\t-\tassets/logo.png'))

    expect(stats).toEqual([{ path: 'assets/logo.png', added: 0, removed: 0, binary: true }])
  })
})

describe('diffStats', () => {
  let root: string
  let repo: string

  beforeEach(() => {
    root = realpathSync.native(mkdtempSync(join(tmpdir(), 'wtm-ds-')))
    repo = join(root, 'repo')
    mkdirSync(repo)
    git(repo, 'init', '-b', 'main')
    git(repo, 'config', 'user.email', 'test@test.local')
    git(repo, 'config', 'user.name', 'Test')
    writeFileSync(join(repo, 'a.txt'), 'one\ntwo\nthree\nfour\n', 'utf8')
    git(repo, 'add', '.')
    git(repo, 'commit', '-m', 'init')
  })

  afterEach(() => {
    rmSync(root, { recursive: true, force: true })
  })

  it('totals what git itself reports for the branch since its base', async () => {
    git(repo, 'checkout', '-b', 'feature')
    writeFileSync(join(repo, 'a.txt'), 'one\nTWO\nthree\n', 'utf8')
    writeFileSync(join(repo, 'b.txt'), 'alpha\nbeta\n', 'utf8')
    git(repo, 'add', '.')
    git(repo, 'commit', '-m', 'work')
    const mergeBase = git(repo, 'merge-base', 'HEAD', 'main').trim()
    const expected = shortstat(git(repo, 'diff', '--shortstat', mergeBase, 'HEAD'))

    const stats = await diffStats(repo, 'since-base', 'main')

    // Guards the comparison: a fixture that changed nothing would let an empty
    // result match git's zeros.
    expect(expected.added).toBeGreaterThan(0)
    expect({
      files: stats.length,
      added: stats.reduce((sum, s) => sum + s.added, 0),
      removed: stats.reduce((sum, s) => sum + s.removed, 0)
    }).toEqual(expected)
  })

  it('counts an untracked file that numstat leaves out', async () => {
    writeFileSync(join(repo, 'notes.md'), 'l1\nl2\nl3\nl4\nl5\nl6\nl7\n', 'utf8')

    const stats = await diffStats(repo, 'uncommitted')

    expect(stats).toEqual([{ path: 'notes.md', added: 7, removed: 0, binary: false }])
  })

  it('returns an empty list when the mode has nothing to diff', async () => {
    // A clean worktree has nothing uncommitted (FDIF-24)…
    expect(await diffStats(repo, 'uncommitted')).toEqual([])

    // …and full-folder mode has no reference to compare against (FDIF-18),
    // which stays true once the worktree is dirty.
    writeFileSync(join(repo, 'a.txt'), 'one\nedited\n', 'utf8')
    expect(await diffStats(repo, 'full')).toEqual([])
  })
})
