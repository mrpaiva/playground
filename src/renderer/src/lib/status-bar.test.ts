import { describe, expect, it } from 'vitest'
import type { SessionView } from '../../../shared/config'
import type { WorkspaceNode, WorktreeNode } from '../../../shared/tree'
import type { SyncState } from '../../../shared/git'
import { BRANCH_TAIL_MAX, barTargetFor, splitBranch, syncSectionFor } from './status-bar'

function wt(path: string, branch: string, isDefault = false): WorktreeNode {
  return { id: path, branch, path, isDefault, dirty: false, changes: 0 }
}

function session(id: string, cwd: string): SessionView {
  return { id, agent: 'Ad-hoc', cwd, title: id, status: 'running', pathMissing: false }
}

const tree: WorkspaceNode[] = [
  {
    id: 'c:/work/acme',
    path: 'C:/work/acme',
    displayName: 'Acme',
    repos: [
      {
        name: 'widget',
        path: 'C:/work/acme/widget',
        worktrees: [
          wt('C:/work/acme/widget', 'main', true),
          wt('C:/work/acme/widget-12345', 'user/dev/4821-fix-login/12345-endpoint')
        ]
      }
    ]
  }
]

const sessions = [session('s-wt', 'C:/work/acme/widget-12345'), session('s-adhoc', 'C:/Windows')]

describe('barTargetFor', () => {
  it("describes the selected session's worktree in Agents, not the tree selection (STBR-03)", () => {
    const target = barTargetFor({
      direction: 'agents',
      tree,
      selectedId: 'C:/work/acme/widget',
      sessions,
      selectedSessionId: 's-wt'
    })
    expect(target.kind).toBe('worktree')
    if (target.kind !== 'worktree') return
    expect(target.selected.repoName).toBe('widget')
    expect(target.selected.worktree.path).toBe('C:/work/acme/widget-12345')
    expect(target.selected.worktree.branch).toBe('user/dev/4821-fix-login/12345-endpoint')
  })

  it("returns the folder target carrying the path when the session's cwd is no worktree (STBR-04)", () => {
    const target = barTargetFor({
      direction: 'agents',
      tree,
      selectedId: 'C:/work/acme/widget',
      sessions,
      selectedSessionId: 's-adhoc'
    })
    expect(target).toEqual({ kind: 'folder', path: 'C:/Windows' })
  })

  it('returns the tree-selected worktree in every other direction, ignoring the session (STBR-02)', () => {
    for (const direction of ['tree', 'board', 'workflows'] as const) {
      const target = barTargetFor({
        direction,
        tree,
        selectedId: 'C:/work/acme/widget',
        sessions,
        selectedSessionId: 's-wt'
      })
      expect(target.kind, direction).toBe('worktree')
      if (target.kind !== 'worktree') return
      expect(target.selected.worktree.path, direction).toBe('C:/work/acme/widget')
      expect(target.selected.repoName, direction).toBe('widget')
    }
  })

  it('returns the none target when nothing is selected anywhere (STBR-05)', () => {
    for (const direction of ['tree', 'board', 'agents', 'workflows'] as const) {
      const target = barTargetFor({
        direction,
        tree,
        selectedId: null,
        sessions,
        selectedSessionId: null
      })
      expect(target, direction).toEqual({ kind: 'none' })
    }
  })

  it('falls back to the tree selection in Agents when no session is selected', () => {
    const target = barTargetFor({
      direction: 'agents',
      tree,
      selectedId: 'C:/work/acme/widget',
      sessions,
      selectedSessionId: null
    })
    expect(target.kind).toBe('worktree')
    if (target.kind !== 'worktree') return
    expect(target.selected.worktree.path).toBe('C:/work/acme/widget')
  })

  it('treats a session id that no longer exists as no session selected', () => {
    const withSelection = barTargetFor({
      direction: 'agents',
      tree,
      selectedId: 'C:/work/acme/widget',
      sessions,
      selectedSessionId: 's-gone'
    })
    expect(withSelection.kind).toBe('worktree')
    if (withSelection.kind !== 'worktree') return
    expect(withSelection.selected.worktree.path).toBe('C:/work/acme/widget')

    const withoutSelection = barTargetFor({
      direction: 'agents',
      tree,
      selectedId: null,
      sessions,
      selectedSessionId: 's-gone'
    })
    expect(withoutSelection).toEqual({ kind: 'none' })
  })
})

describe('splitBranch', () => {
  it('splits so the tail is the final segment (STBR-06)', () => {
    expect(splitBranch('user/dev/4821-fix-login/12345-endpoint')).toEqual({
      head: 'user/dev/4821-fix-login/',
      tail: '12345-endpoint'
    })
  })

  it('returns a name with no slash whole as the head, with an empty tail', () => {
    expect(splitBranch('main')).toEqual({ head: 'main', tail: '' })
  })

  it('returns a single segment longer than the cap whole, leaving the ellipsis to the CSS', () => {
    const long = 'a-very-long-single-segment-branch-name-for-acme-widget'
    expect(long.length).toBeGreaterThan(BRANCH_TAIL_MAX)
    expect(splitBranch(long)).toEqual({ head: long, tail: '' })
  })

  it('caps the tail to the end of an over-long final segment, losing no characters', () => {
    const leaf = '12345-endpoint-with-a-description-far-longer-than-the-cap'
    const branch = `user/dev/${leaf}`
    const { head, tail } = splitBranch(branch)
    expect(tail).toBe(leaf.slice(-BRANCH_TAIL_MAX))
    expect(head + tail).toBe(branch)
  })

  it('passes a detached label through untouched', () => {
    expect(splitBranch('(detached abc1234)')).toEqual({ head: '(detached abc1234)', tail: '' })
  })
})

describe('syncSectionFor', () => {
  const tracking: SyncState = {
    branch: 'user/dev/4821-fix-login/12345-endpoint',
    upstream: 'origin/user/dev/4821-fix-login/12345-endpoint',
    behind: 2,
    ahead: 1,
    remotes: ['origin'],
    lastFetchAt: 1_700_000_000_000
  }

  it('carries both counts while the branch has an upstream (STBR-09)', () => {
    expect(syncSectionFor(tracking)).toEqual({ kind: 'counts', behind: 2, ahead: 1 })
  })

  it('carries 0 / 0 when the branch is in sync (STBR-09)', () => {
    expect(syncSectionFor({ ...tracking, behind: 0, ahead: 0 })).toEqual({
      kind: 'counts',
      behind: 0,
      ahead: 0
    })
  })

  it('reads no-upstream when a remote exists, carrying the remotes Publish offers (STBR-12)', () => {
    const state: SyncState = { ...tracking, upstream: null, behind: 0, ahead: 0 }
    expect(syncSectionFor({ ...state, remotes: ['origin', 'fork'] })).toEqual({
      kind: 'no-upstream',
      remotes: ['origin', 'fork']
    })
  })

  it('reads no-remote only when the repository has no remote (STBR-13)', () => {
    const state: SyncState = { ...tracking, upstream: null, behind: 0, ahead: 0, remotes: [] }
    expect(syncSectionFor(state)).toEqual({ kind: 'no-remote' })
  })

  it('ranks detached above no-upstream (STBR-08, STBR-13)', () => {
    const state: SyncState = {
      branch: null,
      detachedSha: 'abc1234',
      upstream: null,
      behind: 0,
      ahead: 0,
      remotes: ['origin'],
      lastFetchAt: null
    }
    expect(syncSectionFor(state)).toEqual({ kind: 'detached', sha: 'abc1234' })
  })

  it('lets an error win over every other case, so no stale counts show (STBR-14)', () => {
    const error = "fatal: ambiguous argument '@{upstream}': unknown revision"
    expect(syncSectionFor({ ...tracking, error })).toEqual({ kind: 'error', message: error })
    expect(
      syncSectionFor({ ...tracking, branch: null, detachedSha: 'abc1234', remotes: [], error })
    ).toEqual({ kind: 'error', message: error })
  })
})
