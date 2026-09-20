import { useEffect, useState } from 'react'
import type { JSX } from 'react'
import type { CommitRow } from '../../../shared/files'
import { browseState, commitListState, uncommittedRowLabel } from '../lib/commit-view'
import { relativeTime } from '../lib/relative-time'
import type { UseFiles } from '../lib/use-files'
import './CommitList.css'

/** How often the relative dates are re-rendered, so "3m ago" does not freeze. */
const TICK_MS = 60_000

interface CommitListProps {
  files: UseFiles
  onToast: (message: string) => void
}

/**
 * The branch's own commits, newest first, with uncommitted work on top
 * (FCMT-02..15, 21..26).
 *
 * What it can show, in order: git's line when the branches could not be
 * listed, F1's base prompt when no base is known (FCMT-07), git's line when
 * the log failed, and otherwise the list — which may legitimately be empty
 * when the branch has added nothing of its own (FCMT-10).
 *
 * The base picker is not here: Commits mode shares it with diff-to-origin
 * mode, so `FileTree` renders one above both (FCMT-06).
 */
export function CommitList({ files, onToast }: CommitListProps): JSX.Element {
  const [now, setNow] = useState(() => Date.now())
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), TICK_MS)
    return () => clearInterval(timer)
  }, [])

  const state = commitListState(files.bases, files.base, files.commits)
  if (state.kind === 'error') return <div className="file-tree-error">{state.message}</div>
  if (state.kind === 'loading') return <div className="file-tree-note">Loading…</div>
  if (state.kind === 'no-base') {
    // FCMT-07: the same prompt diff-to-origin mode shows, for the same reason —
    // the repository has no `origin/HEAD` to fall back on.
    return <div className="file-tree-note">Choose a base branch to compare this branch with.</div>
  }

  const page = state.page
  const uncommitted = uncommittedRowLabel(files.uncommittedCount)

  return (
    <div className="commit-list">
      {uncommitted && (
        <button
          type="button"
          className="commit-uncommitted"
          onClick={() => files.setMode('uncommitted')}
        >
          {uncommitted}
        </button>
      )}
      {page.commits.length === 0 ? (
        <div className="file-tree-note">This branch has no commits of its own.</div>
      ) : (
        page.commits.map((row) => (
          <Row key={row.sha} row={row} files={files} now={now} onToast={onToast} />
        ))
      )}
      {page.hasMore && (
        <button type="button" className="commit-more" onClick={() => files.loadMoreCommits()}>
          Load more
        </button>
      )}
    </div>
  )
}

/** One commit (FCMT-03/04/05/12, 21..26). */
function Row({
  row,
  files,
  now,
  onToast
}: {
  row: CommitRow
  files: UseFiles
  now: number
  onToast: (message: string) => void
}): JSX.Element {
  const browse = browseState(row, files.commits ?? { browse: null })

  const openInBrowser = (): void => {
    files
      .openCommitInBrowser(row.sha)
      .then((result) => {
        if (!result.ok) onToast(result.error ?? 'Could not open this commit.')
      })
      .catch((err) => onToast(err instanceof Error ? err.message : String(err)))
  }

  return (
    <div className="commit-row" data-sha={row.sha}>
      {/* FCMT-04: the whole message is the row's tooltip, subject included. */}
      <button
        type="button"
        className="commit-open"
        title={row.message}
        onClick={() => files.openCommit(row)}
      >
        <span className="commit-head">
          <span className="commit-sha">{row.shortSha}</span>
          <span className="commit-subject">{row.subject}</span>
        </span>
        <span className="commit-meta">
          <span className="commit-author">{row.author}</span>
          <span className="commit-date">{relativeTime(row.at, now)}</span>
          {row.isMerge && <span className="commit-badge commit-merge">merge</span>}
          {!row.pushed && <span className="commit-badge commit-unpushed">not pushed</span>}
        </span>
      </button>
      <span className="commit-actions">
        <button
          type="button"
          className="commit-copy"
          // FCMT-22: the full sha. A short one is ambiguous in a large
          // repository and some tools refuse it outright.
          title="Copy the full commit sha"
          onClick={() => navigator.clipboard.writeText(row.sha).catch(console.error)}
        >
          Copy sha
        </button>
        {browse !== 'hidden' && (
          <button
            type="button"
            className="commit-browse"
            disabled={browse === 'disabled'}
            title={
              browse === 'disabled'
                ? 'This commit has not been pushed yet'
                : 'Open this commit on its provider'
            }
            onClick={openInBrowser}
          >
            Open in browser
          </button>
        )}
      </span>
    </div>
  )
}
