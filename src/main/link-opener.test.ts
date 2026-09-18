import { describe, expect, it } from 'vitest'
import { LinkOpener, PROBE_BATCH_LIMIT, type LinkOpenerDeps } from './link-opener'

interface Fakes extends LinkOpenerDeps {
  statCalls: string[]
  openedUrls: string[]
}

/** Every OS call is a fake; `dirs` and `files` decide what `stat` reports. */
function makeFakes(
  opts: {
    files?: string[]
    dirs?: string[]
    statThrows?: boolean
    openExternalThrows?: boolean
  } = {}
): Fakes {
  const files = new Set(opts.files ?? [])
  const dirs = new Set(opts.dirs ?? [])
  const fakes: Fakes = {
    statCalls: [],
    openedUrls: [],
    homedir: () => 'C:\\Users\\dev',
    stat: async (path) => {
      fakes.statCalls.push(path)
      if (opts.statThrows) throw new Error('EACCES')
      if (dirs.has(path)) return { isDirectory: () => true }
      if (files.has(path)) return { isDirectory: () => false }
      throw Object.assign(new Error('ENOENT'), { code: 'ENOENT' })
    },
    openPath: async () => '',
    openExternal: async (url) => {
      if (opts.openExternalThrows) throw new Error('boom')
      fakes.openedUrls.push(url)
    },
    spawnDetached: async () => true,
    hasAssociation: async () => true
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
