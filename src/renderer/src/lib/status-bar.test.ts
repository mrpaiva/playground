import { describe, expect, it } from 'vitest'
import type { SessionView } from '../../../shared/config'
import type { WorkspaceNode, WorktreeNode } from '../../../shared/tree'
import { barTargetFor } from './status-bar'

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
