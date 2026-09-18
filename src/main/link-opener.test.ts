import { describe, expect, it } from 'vitest'
import { LinkOpener, PROBE_BATCH_LIMIT, type LinkOpenerDeps } from './link-opener'

interface Fakes extends LinkOpenerDeps {
  statCalls: string[]
  openedUrls: string[]
  openedPaths: string[]
  spawns: Array<[string, string[]]>
  associationQueries: string[]
}

/** Every OS call is a fake; `dirs` and `files` decide what `stat` reports. */
function makeFakes(
  opts: {
    files?: string[]
    dirs?: string[]
    statThrows?: boolean
    openExternalThrows?: boolean
    /** What `shell.openPath` resolves with ('' = success). */
    openPathResult?: string
    spawnOk?: boolean
    associated?: boolean
  } = {}
): Fakes {
  const files = new Set(opts.files ?? [])
  const dirs = new Set(opts.dirs ?? [])
  const fakes: Fakes = {
    statCalls: [],
    openedUrls: [],
    openedPaths: [],
    spawns: [],
    associationQueries: [],
    homedir: () => 'C:\\Users\\dev',
    stat: async (path) => {
      fakes.statCalls.push(path)
      if (opts.statThrows) throw new Error('EACCES')
      if (dirs.has(path)) return { isDirectory: () => true }
      if (files.has(path)) return { isDirectory: () => false }
      throw Object.assign(new Error('ENOENT'), { code: 'ENOENT' })
    },
    openPath: async (path) => {
      fakes.openedPaths.push(path)
      return opts.openPathResult ?? ''
    },
    openExternal: async (url) => {
      if (opts.openExternalThrows) throw new Error('boom')
      fakes.openedUrls.push(url)
    },
    spawnDetached: async (command, args) => {
      fakes.spawns.push([command, args])
      return opts.spawnOk ?? true
    },
    hasAssociation: async (ext) => {
      fakes.associationQueries.push(ext)
      return opts.associated ?? true
    }
  }
  return fakes
}

const CWD = 'E:\\Repos\\X\\wt-1'

describe('LinkOpener.resolveCandidate (LINK-12, LINK-29)', () => {
  it('resolves a relative path against the session cwd', () => {
    const opener = new LinkOpener(makeFakes())
    expect(opener.resolveCandidate(CWD, 'src/main/index.ts')).toBe(
      'E:\\Repos\\X\\wt-1\\src\\main\\index.ts'
    )
  })

  it('resolves ./ and ../ segments against the cwd', () => {
    const opener = new LinkOpener(makeFakes())
    expect(opener.resolveCandidate(CWD, '.\\a\\b.sql')).toBe('E:\\Repos\\X\\wt-1\\a\\b.sql')
    expect(opener.resolveCandidate(CWD, '..\\c.md')).toBe('E:\\Repos\\X\\c.md')
  })

  it('expands ~/ to the home directory', () => {
    const opener = new LinkOpener(makeFakes())
    expect(opener.resolveCandidate(CWD, '~/x/y.txt')).toBe('C:\\Users\\dev\\x\\y.txt')
  })

  it('keeps an absolute drive path as is', () => {
    const opener = new LinkOpener(makeFakes())
    expect(opener.resolveCandidate(CWD, 'E:\\x\\y.cs')).toBe('E:\\x\\y.cs')
  })

  it('returns null when the result is not absolute', () => {
    const opener = new LinkOpener(makeFakes())
    expect(opener.resolveCandidate('', 'src/a.ts')).toBeNull()
    expect(opener.resolveCandidate('relative\\cwd', 'a.ts')).toBeNull()
  })
})

describe('LinkOpener.probe (LINK-12, LINK-24, LINK-29)', () => {
  it('returns one result per candidate, in input order, with the resolved path', async () => {
    const fakes = makeFakes({
      files: ['E:\\Repos\\X\\wt-1\\src\\a.ts'],
      dirs: ['E:\\Repos\\X\\wt-1\\src']
    })
    const opener = new LinkOpener(fakes)
    const results = await opener.probe(CWD, ['src/a.ts', 'src', 'src/nope.ts'])
    expect(results).toEqual([
      { pathText: 'src/a.ts', absolutePath: 'E:\\Repos\\X\\wt-1\\src\\a.ts', kind: 'file' },
      { pathText: 'src', absolutePath: 'E:\\Repos\\X\\wt-1\\src', kind: 'dir' },
      { pathText: 'src/nope.ts', absolutePath: 'E:\\Repos\\X\\wt-1\\src\\nope.ts', kind: 'missing' }
    ])
  })

  it('reports an unresolvable candidate as missing with a null path and never stats it', async () => {
    const fakes = makeFakes()
    const opener = new LinkOpener(fakes)
    const results = await opener.probe('', ['src/a.ts'])
    expect(results).toEqual([{ pathText: 'src/a.ts', absolutePath: null, kind: 'missing' }])
    expect(fakes.statCalls).toEqual([])
  })

  it('treats a stat failure as missing instead of throwing', async () => {
    const opener = new LinkOpener(makeFakes({ statThrows: true }))
    const results = await opener.probe(CWD, ['src/a.ts'])
    expect(results[0].kind).toBe('missing')
  })

  it('caps a batch at the limit and reports the overflow as missing without stat', async () => {
    const paths = Array.from({ length: PROBE_BATCH_LIMIT + 3 }, (_, i) => `f${i}.txt`)
    const fakes = makeFakes({ files: paths.map((p) => `${CWD}\\${p}`) })
    const opener = new LinkOpener(fakes)
    const results = await opener.probe(CWD, paths)
    expect(PROBE_BATCH_LIMIT).toBe(32)
    expect(results).toHaveLength(35)
    expect(results.slice(0, 32).every((r) => r.kind === 'file')).toBe(true)
    expect(results.slice(32).map((r) => r.kind)).toEqual(['missing', 'missing', 'missing'])
    expect(fakes.statCalls).toHaveLength(32)
  })
})

describe('LinkOpener.openUrl (LINK-04, LINK-05)', () => {
  it('opens an https url in the default browser', async () => {
    const fakes = makeFakes()
    const result = await new LinkOpener(fakes).openUrl(
      'https://dev.azure.com/x/y/_workitems/edit/123'
    )
    expect(result).toEqual({ ok: true })
    expect(fakes.openedUrls).toEqual(['https://dev.azure.com/x/y/_workitems/edit/123'])
  })

  it('opens an http url too', async () => {
    const fakes = makeFakes()
    await new LinkOpener(fakes).openUrl('http://localhost:3000/')
    expect(fakes.openedUrls).toEqual(['http://localhost:3000/'])
  })

  it.each(['mailto:a@b.c', 'vscode://file/E:/x', 'file:///E:/x/y.cs', 'javascript:alert(1)'])(
    'refuses %s without calling the shell',
    async (url) => {
      const fakes = makeFakes()
      const result = await new LinkOpener(fakes).openUrl(url)
      expect(result.ok).toBe(false)
      expect(result.error).toContain(url)
      expect(fakes.openedUrls).toEqual([])
    }
  )

  it('refuses text that is not a url without calling the shell', async () => {
    const fakes = makeFakes()
    const result = await new LinkOpener(fakes).openUrl('not a url')
    expect(result.ok).toBe(false)
    expect(result.error).toContain('not a url')
    expect(fakes.openedUrls).toEqual([])
  })

  it('reports a shell failure instead of throwing', async () => {
    const result = await new LinkOpener(makeFakes({ openExternalThrows: true })).openUrl(
      'https://example.com/'
    )
    expect(result.ok).toBe(false)
    expect(result.error).toContain('https://example.com/')
  })
})

describe('LinkOpener.openPath (LINK-09, LINK-10, LINK-11, LINK-13, LINK-31)', () => {
  const FILE = 'E:\\Repos\\X\\wt-1\\src\\a.ts'
  const DIR = 'E:\\Repos\\X\\wt-1\\src'
  const CHOOSER: [string, string[]] = ['rundll32.exe', ['shell32.dll,OpenAs_RunDLL', FILE]]

  it('opens an associated file with the Windows default app', async () => {
    const fakes = makeFakes({ files: [FILE] })
    const result = await new LinkOpener(fakes).openPath(CWD, 'src/a.ts')
    expect(result).toEqual({ ok: true })
    expect(fakes.associationQueries).toEqual(['.ts'])
    expect(fakes.openedPaths).toEqual([FILE])
    expect(fakes.spawns).toEqual([])
  })

  it('shows the Open with chooser when the extension has no association, without openPath', async () => {
    const fakes = makeFakes({ files: [FILE], associated: false })
    const result = await new LinkOpener(fakes).openPath(CWD, 'src/a.ts')
    expect(result).toEqual({ ok: true })
    expect(fakes.openedPaths).toEqual([])
    expect(fakes.spawns).toEqual([CHOOSER])
  })

  it('falls back to the chooser when openPath reports a failure', async () => {
    const fakes = makeFakes({ files: [FILE], openPathResult: 'Failed to open path' })
    const result = await new LinkOpener(fakes).openPath(CWD, 'src/a.ts')
    expect(result).toEqual({ ok: true })
    expect(fakes.openedPaths).toEqual([FILE])
    expect(fakes.spawns).toEqual([CHOOSER])
  })

  it('treats a file without an extension as unassociated', async () => {
    const noExt = 'E:\\Repos\\X\\wt-1\\LICENSE'
    const fakes = makeFakes({ files: [noExt] })
    await new LinkOpener(fakes).openPath(CWD, 'LICENSE')
    expect(fakes.associationQueries).toEqual([])
    expect(fakes.spawns).toEqual([['rundll32.exe', ['shell32.dll,OpenAs_RunDLL', noExt]]])
  })

  it('opens a directory in File Explorer', async () => {
    const fakes = makeFakes({ dirs: [DIR] })
    const result = await new LinkOpener(fakes).openPath(CWD, 'src')
    expect(result).toEqual({ ok: true })
    expect(fakes.spawns).toEqual([['explorer.exe', [DIR]]])
    expect(fakes.openedPaths).toEqual([])
  })

  it('reports a path that no longer exists', async () => {
    const result = await new LinkOpener(makeFakes()).openPath(CWD, 'src/gone.ts')
    expect(result).toEqual({ ok: false, error: `${CWD}\\src\\gone.ts no longer exists` })
  })

  it('reports an unresolvable path as no longer existing', async () => {
    const result = await new LinkOpener(makeFakes()).openPath('', 'src/a.ts')
    expect(result).toEqual({ ok: false, error: 'src/a.ts no longer exists' })
  })

  it('reports a chooser that could not launch, naming the path', async () => {
    const fakes = makeFakes({ files: [FILE], associated: false, spawnOk: false })
    const result = await new LinkOpener(fakes).openPath(CWD, 'src/a.ts')
    expect(result).toEqual({ ok: false, error: `Couldn’t open ${FILE}` })
  })

  it('reports an Explorer that could not launch, naming the path', async () => {
    const fakes = makeFakes({ dirs: [DIR], spawnOk: false })
    const result = await new LinkOpener(fakes).openPath(CWD, 'src')
    expect(result).toEqual({ ok: false, error: `Couldn’t open ${DIR}` })
  })

  it('opens an executable through the same association route as any file (LINK-31)', async () => {
    const script = 'E:\\Repos\\X\\wt-1\\run.ps1'
    const fakes = makeFakes({ files: [script] })
    const result = await new LinkOpener(fakes).openPath(CWD, 'run.ps1')
    expect(result).toEqual({ ok: true })
    expect(fakes.associationQueries).toEqual(['.ps1'])
    expect(fakes.openedPaths).toEqual([script])
  })
})
