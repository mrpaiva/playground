import type { AppConfig, SessionView } from '../../../shared/config'
import type { WorkspaceNode } from '../../../shared/tree'
import { findWorktree, type SelectedWorktree } from './tree-selection'

/** What the status bar describes (STBR-02..05). */
export type BarTarget =
  /** A worktree in the tree — the tree selection, or the Agents session's worktree. */
  | { kind: 'worktree'; selected: SelectedWorktree }
  /** A session rooted outside every worktree: path only, no counters (STBR-04). */
  | { kind: 'folder'; path: string }
  /** Nothing selected: the bar stays mounted with a neutral state (STBR-05). */
  | { kind: 'none' }

export interface BarTargetInput {
  direction: AppConfig['ui']['direction']
  tree: WorkspaceNode[]
  selectedId: string | null
  sessions: SessionView[]
  selectedSessionId: string | null
}

/**
 * Resolve what the bar describes. In Agents a selected session wins over the
 * tree selection (STBR-03); its cwd is matched to a worktree by the same exact
 * path comparison `deriveAttribution` uses. Everywhere else, and in Agents when
 * no live session is selected, the tree selection is described (STBR-02).
 */
export function barTargetFor(input: BarTargetInput): BarTarget {
  const { direction, tree, selectedId, sessions, selectedSessionId } = input
  if (direction === 'agents') {
    const session = sessions.find((s) => s.id === selectedSessionId)
    if (session) {
      for (const workspace of tree) {
        for (const repo of workspace.repos) {
          const worktree = repo.worktrees.find((w) => w.path === session.cwd)
          if (worktree) {
            const selected = {
              workspaceName: workspace.displayName,
              repoName: repo.name,
              repoPath: repo.path,
              worktree
            }
            return { kind: 'worktree', selected }
          }
        }
      }
      return { kind: 'folder', path: session.cwd }
    }
  }
  const selected = findWorktree(tree, selectedId)
  return selected ? { kind: 'worktree', selected } : { kind: 'none' }
}

/** Longest tail kept whole; the tail span never shrinks, so it must stay short (STBR-06). */
export const BRANCH_TAIL_MAX = 24

/**
 * Split a branch for middle truncation (STBR-06): the tail is the last
 * `/`-delimited segment, capped at `BRANCH_TAIL_MAX` characters from its end,
 * and the head is everything before it, so `head + tail` is always the full
 * name. A name with no `/` (including `(detached <sha>)`) is all head. The
 * CSS, not this function, decides where the ellipsis falls.
 */
export function splitBranch(branch: string): { head: string; tail: string } {
  const cut = branch.lastIndexOf('/')
  if (cut === -1) return { head: branch, tail: '' }
  const at = Math.max(cut + 1, branch.length - BRANCH_TAIL_MAX)
  return { head: branch.slice(0, at), tail: branch.slice(at) }
}
