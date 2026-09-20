import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import type { FilesChanged } from '../shared/files'
import { BATCH_MS, FileWatcher, type WatchHandle, type WatchPort } from './file-watcher'

const WORKTREE = 'C:\\work\\repo-feature'
const GIT_DIR = 'C:\\work\\repo\\.git\\worktrees\\repo-feature'

interface FakeHandle extends WatchHandle {
  path: string
  recursive: boolean
  closed: boolean
  fire(relPath: string): void
}

/**
 * The injected seams of pattern 3: a watch port recording every handle it
 * opened, a scheduler whose one pending callback the test fires by hand, and an
 * emit sink. No real `fs.watch`, no timers.
 */
function harness(): {
  watcher: FileWatcher
  handles: FakeHandle[]
  emitted: FilesChanged[]
  delays: number[]
  flush(): void
  handleFor(path: string): FakeHandle
} {
  const handles: FakeHandle[] = []
  const watch: WatchPort = (path, opts, listener) => {
    const handle: FakeHandle = {
      path,
      recursive: opts.recursive,
      closed: false,
      fire: listener,
      close: () => {
        handle.closed = true
      }
    }
    handles.push(handle)
    return handle
  }
  const emitted: FilesChanged[] = []
  const delays: number[] = []
  let pending: (() => void) | null = null
  return {
    watcher: new FileWatcher({
      watch,
      resolveGitDir: async () => GIT_DIR,
      schedule: {
        after: (ms, fn) => {
          delays.push(ms)
          pending = fn
          return () => {
            pending = null
          }
        }
      },
      emit: (event) => emitted.push(event)
    }),
    handles,
    emitted,
    delays,
    flush: () => {
      const fn = pending
      pending = null
      fn?.()
    },
    handleFor: (path) => handles.filter((h) => h.path === path && !h.closed).at(-1) as FakeHandle
  }
}

describe('FileWatcher', () => {
  it('emits one change carrying every path of a batch', async () => {
    const h = harness()
    await h.watcher.select(WORKTREE)

    h.handleFor(WORKTREE).fire('src\\a.ts')
    h.handleFor(WORKTREE).fire('src\\b.ts')
    h.handleFor(WORKTREE).fire('readme.md')
    h.flush()

    expect(h.delays).toEqual([BATCH_MS])
    expect(h.emitted).toEqual([
      {
        worktreePath: WORKTREE,
        paths: ['src/a.ts', 'src/b.ts', 'readme.md'],
        gitStateChanged: false
      }
    ])
  })

  it('drops an event under the root’s .git entry', async () => {
    const h = harness()
    await h.watcher.select(WORKTREE)

    h.handleFor(WORKTREE).fire('.git\\index')
    h.handleFor(WORKTREE).fire('src\\a.ts')
    h.flush()

    expect(h.emitted[0].paths).toEqual(['src/a.ts'])
  })

  it('flags a git state change when the git dir’s index moves', async () => {
    const h = harness()
    await h.watcher.select(WORKTREE)

    h.handleFor(join(GIT_DIR, 'index')).fire('index')
    h.flush()

    expect(h.emitted).toEqual([{ worktreePath: WORKTREE, paths: [], gitStateChanged: true }])
  })

  it('flags a git state change when the git dir’s HEAD moves', async () => {
    const h = harness()
    await h.watcher.select(WORKTREE)

    h.handleFor(join(GIT_DIR, 'HEAD')).fire('HEAD')
    h.flush()

    expect(h.emitted).toEqual([{ worktreePath: WORKTREE, paths: [], gitStateChanged: true }])
  })

  it('closes every handle of the previous worktree before opening new ones', async () => {
    const h = harness()
    await h.watcher.select(WORKTREE)
    const first = [...h.handles]

    await h.watcher.select('C:\\work\\repo-other')

    expect(first.every((handle) => handle.closed)).toBe(true)
    expect(h.handles.filter((handle) => !handle.closed).map((handle) => handle.path)).toEqual([
      'C:\\work\\repo-other',
      join(GIT_DIR, 'index'),
      join(GIT_DIR, 'HEAD')
    ])
  })

  it('closes every handle when nothing is selected', async () => {
    const h = harness()
    await h.watcher.select(WORKTREE)

    await h.watcher.select(null)

    expect(h.handles.every((handle) => handle.closed)).toBe(true)
  })

  it('discards a pending batch for a worktree that is no longer selected', async () => {
    const h = harness()
    await h.watcher.select(WORKTREE)
    h.handleFor(WORKTREE).fire('src\\a.ts')

    await h.watcher.select(null)
    h.flush()

    expect(h.emitted).toEqual([])
  })
})
