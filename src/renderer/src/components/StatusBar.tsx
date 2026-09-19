import type { JSX } from 'react'
import type { AppConfig, SessionView } from '../../../shared/config'
import type { SyncState } from '../../../shared/git'
import type { WorkspaceNode } from '../../../shared/tree'
import { barTargetFor, splitBranch, syncSectionFor } from '../lib/status-bar'
import { useGitSync } from '../lib/use-git-sync'
import { Icon } from './Icon'
import './StatusBar.css'

interface StatusBarProps {
  tree: WorkspaceNode[]
  selectedId: string | null
  sessions: SessionView[]
  selectedSessionId: string | null
  direction: AppConfig['ui']['direction']
  /** Report an operation outcome whose popover is gone (STBR-26). */
  onToast: (message: string) => void
  /** Refresh the tree after a successful operation (STBR-25). */
  onRefreshTree: () => void
}

/**
 * The window-wide status bar (STBR-01): always mounted, describing the tree
 * selection — or, in Agents, the selected session's worktree (STBR-02..05).
 * Repo, branch and the changed-file counter come from the tree snapshot; only
 * the sync section asks main, through `useGitSync`.
 */
export function StatusBar({
  tree,
  selectedId,
  sessions,
  selectedSessionId,
  direction,
  onToast,
  onRefreshTree
}: StatusBarProps): JSX.Element {
  const target = barTargetFor({ direction, tree, selectedId, sessions, selectedSessionId })
  const targetPath = target.kind === 'worktree' ? target.selected.worktree.path : null
  const sync = useGitSync({ targetPath, tree, popoverPath: null, onToast, onRefreshTree })

  if (target.kind === 'none') {
    return (
      <footer className="status-bar" role="status">
        <span className="status-bar-empty">No worktree selected</span>
      </footer>
    )
  }

  if (target.kind === 'folder') {
    // STBR-04: a folder outside every worktree has no sync section and no counter.
    return (
      <footer className="status-bar" role="status">
        <span className="status-bar-folder" title={target.path}>
          <Icon name="folder" size={12} />
          <span className="status-bar-folder-path">{target.path}</span>
        </span>
        <span className="status-bar-note">not a worktree</span>
      </footer>
    )
  }

  const { repoName, worktree } = target.selected
  const { head, tail } = splitBranch(worktree.branch)

  return (
    <footer className="status-bar" role="status">
      <span className="status-bar-repo">{repoName}</span>
      <span className="status-bar-branch" title={worktree.branch}>
        <Icon name="git-branch" size={12} />
        <span className="status-bar-branch-head">{head}</span>
        {tail && <span className="status-bar-branch-tail">{tail}</span>}
      </span>
      <span className="status-bar-spacer" />
      <SyncSection state={sync.state} />
      <span className="status-bar-changes" title={`${worktree.changes} changed files`}>
        <Icon name="pencil" size={11} />
        {worktree.changes}
      </span>
    </footer>
  )
}

/** The ahead/behind section, or the reason it cannot show counts (STBR-09, 12, 13, 14). */
function SyncSection({ state }: { state: SyncState | null }): JSX.Element {
  if (state === null) return <span className="status-bar-sync muted">…</span>
  const section = syncSectionFor(state)
  switch (section.kind) {
    case 'counts':
      return (
        <span className="status-bar-sync" title="Commits to pull / to push">
          ↓{section.behind} ↑{section.ahead}
        </span>
      )
    case 'no-upstream':
      return <span className="status-bar-sync muted">no upstream</span>
    case 'detached':
      return <span className="status-bar-sync muted">detached HEAD</span>
    case 'no-remote':
      return <span className="status-bar-sync muted">no remote</span>
    case 'error':
      return (
        <span className="status-bar-sync error" title={section.message}>
          {section.message}
        </span>
      )
  }
}
