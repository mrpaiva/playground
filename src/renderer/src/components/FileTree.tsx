import type { JSX } from 'react'
import type { FilesMode } from '../../../shared/files'
import type { ChangeStatus } from '../../../shared/worktrees'
import { api } from '../lib/api'
import { buildTree, isSolution, type TreeNode } from '../lib/files-view'
import { absoluteIn, type UseFiles } from '../lib/use-files'
import { Icon } from './Icon'
import './FileTree.css'

interface FileTreeProps {
  /** The selected worktree, absolute — what the launchers and reads are rooted at. */
  worktreePath: string
  files: UseFiles
  /** The launcher's existing failure toast (FXPL-30). */
  onToast: (message: string) => void
}

/** The three lenses of FXPL-07, in the order the spec lists them. */
const MODES: { mode: FilesMode; label: string }[] = [
  { mode: 'full', label: 'Folder' },
  { mode: 'since-base', label: 'Diff to origin' },
  { mode: 'uncommitted', label: 'Uncommitted' }
]

const STATUS_LETTER: Record<ChangeStatus, string> = {
  modified: 'M',
  added: 'A',
  deleted: 'D',
  renamed: 'R',
  untracked: 'U'
}

const STATUS_LABEL: Record<ChangeStatus, string> = {
  modified: 'Modified',
  added: 'Added',
  deleted: 'Deleted',
  renamed: 'Renamed',
  untracked: 'Untracked'
}

/** Rows nest by padding, not by nested boxes: a deep tree stays one flat list. */
function indent(depth: number): { paddingLeft: number } {
  return { paddingLeft: 8 + depth * 13 }
}

interface FolderRowsProps {
  dir: string
  depth: number
  files: UseFiles
  onFile: (path: string) => void
}

/**
 * One folder of the full-folder mode. Children are listed when the folder opens
 * and kept afterwards, so expanding costs exactly one `files:list-dir`
 * (FXPL-05); a git failure renders in place of the rows (edge case).
 */
function FolderRows({ dir, depth, files, onFile }: FolderRowsProps): JSX.Element {
  const listing = files.entries[dir]
  if (!listing) return <div className="file-tree-note">Loading…</div>
  if (listing.error) return <div className="file-tree-error">{listing.error}</div>
  return (
    <>
      {listing.entries.map((entry) =>
        entry.kind === 'file' ? (
          <button
            key={entry.path}
            type="button"
            className="file-tree-row"
            style={indent(depth)}
            title={entry.path}
            onClick={() => onFile(entry.path)}
          >
            <Icon name="file" size={13} />
            <span className="file-tree-name">{entry.name}</span>
          </button>
        ) : (
          <div key={entry.path}>
            <button
              type="button"
              className="file-tree-row"
              style={indent(depth)}
              aria-expanded={files.expanded.includes(entry.path)}
              title={entry.path}
              onClick={() => {
                files.selectFolder(entry.path)
                files.toggleFolder(entry.path)
              }}
            >
              <span
                className={`file-tree-chevron${files.expanded.includes(entry.path) ? ' open' : ''}`}
              >
                <Icon name="chevron-down" size={13} />
              </span>
              <span className="file-tree-name">{entry.name}</span>
            </button>
            {files.expanded.includes(entry.path) && (
              <FolderRows dir={entry.path} depth={depth + 1} files={files} onFile={onFile} />
            )}
          </div>
        )
      )}
    </>
  )
}

interface ChangedRowsProps {
  nodes: TreeNode[]
  depth: number
  onFile: (path: string, status: ChangeStatus) => void
  onFolder: (path: string) => void
}

/**
 * The nesting `buildTree` derives from a diff mode's flat list (FXPL-08/12).
 * The folders are invented by the nesting rather than listed, so they are drawn
 * open: there is nothing further to fetch for them.
 */
function ChangedRows({ nodes, depth, onFile, onFolder }: ChangedRowsProps): JSX.Element {
  return (
    <>
      {nodes.map((node) =>
        node.kind === 'file' ? (
          <button
            key={node.path}
            type="button"
            className="file-tree-row"
            style={indent(depth)}
            title={node.path}
            onClick={() => onFile(node.path, node.status)}
          >
            <span className={`file-tree-pill ${node.status}`} title={STATUS_LABEL[node.status]}>
              {STATUS_LETTER[node.status]}
            </span>
            <span className="file-tree-name">{node.name}</span>
          </button>
        ) : (
          <div key={node.path}>
            <button
              type="button"
              className="file-tree-row"
              style={indent(depth)}
              title={node.path}
              onClick={() => onFolder(node.path)}
            >
              <span className="file-tree-chevron open">
                <Icon name="chevron-down" size={13} />
              </span>
              <span className="file-tree-name">{node.name}</span>
            </button>
            <ChangedRows
              nodes={node.children}
              depth={depth + 1}
              onFile={onFile}
              onFolder={onFolder}
            />
          </div>
        )
      )}
    </>
  )
}

/**
 * The base the diff mode compares against, and every branch it could be
 * (FXPL-09/10/11). A repository whose branches could not be listed at all shows
 * git's line in a disabled control instead of an invitation to choose from a
 * list that does not exist (AD-032).
 */
function BasePicker({ files }: { files: UseFiles }): JSX.Element {
  const { bases } = files
  return (
    <div className="file-tree-base">
      <span className="file-tree-base-label">Base</span>
      {bases?.error ? (
        <select className="file-tree-base-select" value="" disabled>
          <option value="">{bases.error}</option>
        </select>
      ) : (
        <select
          className="file-tree-base-select"
          value={files.base ?? ''}
          onChange={(event) => files.setBase(event.target.value)}
        >
          {files.base === undefined && <option value="">Choose a base…</option>}
          {(bases?.branches ?? []).map((branch) => (
            <option key={branch} value={branch}>
              {branch}
            </option>
          ))}
        </select>
      )}
    </div>
  )
}

/**
 * The Files direction's left column: the mode selector of FXPL-07, the base
 * picker the diff mode needs, and the tree itself.
 *
 * A click opens the file in a tab, except for a solution, which opens in VS 2026
 * and no tab at all (FXPL-28). Clicking a folder also records it as the
 * launcher row's target, which is the selection FXPL-26 compares against the
 * active tab.
 */
export function FileTree({ worktreePath, files, onToast }: FileTreeProps): JSX.Element {
  const launchSolution = (path: string): void => {
    api
      .invoke('shortcuts:launch', { tool: 'vs2026', path: absoluteIn(worktreePath, path) })
      .then((result) => {
        if (!result.ok) onToast(result.error ?? 'Launch failed')
      })
      .catch((err) => onToast(err instanceof Error ? err.message : String(err)))
  }

  const openFile = (path: string, status?: ChangeStatus): void => {
    // A solution the branch deleted has nothing to open; it gets the placeholder
    // like any other deleted file (FXPL-15).
    if (status !== 'deleted' && isSolution(path)) {
      launchSolution(path)
      return
    }
    files.openFile(path, {
      fromDiffMode: files.mode !== 'full',
      deleted: status === 'deleted'
    })
  }

  return (
    <div className="file-tree">
      <div className="file-tree-modes" role="tablist" aria-label="Files mode">
        {MODES.map(({ mode, label }) => (
          <button
            key={mode}
            type="button"
            role="tab"
            aria-selected={files.mode === mode}
            className={`file-tree-mode${files.mode === mode ? ' active' : ''}`}
            onClick={() => files.setMode(mode)}
          >
            {label}
          </button>
        ))}
      </div>

      {files.mode === 'since-base' && <BasePicker files={files} />}

      <div className="file-tree-body">
        {files.mode === 'full' ? (
          <FolderRows dir="" depth={0} files={files} onFile={openFile} />
        ) : files.mode === 'uncommitted' ? (
          files.uncommitted.length === 0 ? (
            <div className="file-tree-note">No uncommitted changes.</div>
          ) : (
            <ChangedRows
              nodes={buildTree(files.uncommitted)}
              depth={0}
              onFile={openFile}
              onFolder={files.selectFolder}
            />
          )
        ) : (
          <SinceBase files={files} onFile={openFile} />
        )}
      </div>
    </div>
  )
}

/**
 * What the diff-to-origin mode lists (FXPL-08), or why it lists nothing. With
 * no base the mode stays empty and asks for one (FXPL-11); a base that has since
 * been deleted fails the merge-base and lands on that same prompt (edge case).
 */
function SinceBase({
  files,
  onFile
}: {
  files: UseFiles
  onFile: (path: string, status: ChangeStatus) => void
}): JSX.Element {
  // AD-032: the branches could not be listed, so there is no base to choose and
  // no prompt to show — only what git said.
  if (files.bases?.error) return <div className="file-tree-error">{files.bases.error}</div>
  // The default base is not known until `files:bases` answers; asking for one
  // before that would prompt for something the repository may already provide.
  if (!files.bases) return <div className="file-tree-note">Loading…</div>
  if (files.base === undefined) {
    return <div className="file-tree-note">Choose a base branch to compare this branch with.</div>
  }
  const { changed } = files
  if (!changed) return <div className="file-tree-note">Loading…</div>
  if (changed.error) {
    return (
      <div className="file-tree-note">
        Choose a base branch to compare this branch with.
        <div className="file-tree-error">{changed.error}</div>
      </div>
    )
  }
  if (changed.files.length === 0) {
    return <div className="file-tree-note">Nothing changed since {files.base}.</div>
  }
  return (
    <ChangedRows
      nodes={buildTree(changed.files)}
      depth={0}
      onFile={onFile}
      onFolder={files.selectFolder}
    />
  )
}
