import { execFileSync } from 'node:child_process'
import { mkdirSync, mkdtempSync, realpathSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { foldChildren, listDir } from './file-tree'

const git = (cwd: string, ...args: string[]): string =>
  execFileSync('git', args, { cwd, encoding: 'utf8' })

describe('foldChildren', () => {
  it('folds recursive descendants into one level of files and folders', () => {
    // FXPL-05: `--cached` reports every tracked descendant of the folder;
    // expanding `src/` must yield its direct children only.
    const entries = foldChildren(['src/a/f.ts', 'src/a/g.ts', 'src/index.ts'], 'src')

    expect(entries).toEqual([
      { name: 'a', path: 'src/a', kind: 'dir' },
      { name: 'index.ts', path: 'src/index.ts', kind: 'file' }
    ])
  })

  it('collapses a wholly untracked folder into one dir entry flagged untracked', () => {
    const entries = foldChildren(['newdir/'], '')

    expect(entries).toEqual([{ name: 'newdir', path: 'newdir', kind: 'dir', untracked: true }])
  })

  it('sorts folders before files, each alphabetically, case-insensitive', () => {
    const entries = foldChildren(['Zebra.ts', 'apple.ts', 'Beta/x.ts', 'alpha/y.ts'], '')

    expect(entries.map((e) => e.name)).toEqual(['alpha', 'Beta', 'apple.ts', 'Zebra.ts'])
  })
})

describe('listDir', () => {
  let root: string
  let repo: string

  beforeEach(() => {
    root = realpathSync.native(mkdtempSync(join(tmpdir(), 'wtm-ft-')))
    repo = join(root, 'repo')
    mkdirSync(repo)
    git(repo, 'init', '-b', 'main')
    git(repo, 'config', 'user.email', 'test@test.local')
    git(repo, 'config', 'user.name', 'Test')
    writeFileSync(join(repo, '.gitignore'), 'node_modules/\n', 'utf8')
    mkdirSync(join(repo, 'src'))
    writeFileSync(join(repo, 'src', 'index.ts'), 'export {}\n', 'utf8')
    mkdirSync(join(repo, 'src', 'lib'))
    writeFileSync(join(repo, 'src', 'lib', 'deep.ts'), 'export {}\n', 'utf8')
    git(repo, 'add', '.')
    git(repo, 'commit', '-m', 'init')
    mkdirSync(join(repo, 'node_modules'))
    writeFileSync(join(repo, 'node_modules', 'dep.js'), 'module.exports = 1\n', 'utf8')
    writeFileSync(join(repo, 'notes.md'), '# notes\n', 'utf8')
  })

  afterEach(() => {
    rmSync(root, { recursive: true, force: true })
  })

  it('never lists an ignored folder', async () => {
    const listing = await listDir(repo, '')

    expect(listing.entries.map((e) => e.name)).not.toContain('node_modules')
  })

  it('lists an untracked file that .gitignore does not exclude', async () => {
    const listing = await listDir(repo, '')

    expect(listing.entries).toContainEqual({ name: 'notes.md', path: 'notes.md', kind: 'file' })
  })

  it('lists one folder’s direct children, not the whole tree', async () => {
    const listing = await listDir(repo, 'src')

    expect(listing.entries).toEqual([
      { name: 'lib', path: 'src/lib', kind: 'dir' },
      { name: 'index.ts', path: 'src/index.ts', kind: 'file' }
    ])
  })

  it('returns git’s error line and no entries when git fails', async () => {
    const listing = await listDir(root, '')

    expect(listing.entries).toEqual([])
    expect(listing.error).toMatch(/^fatal: not a git repository/)
  })
})
