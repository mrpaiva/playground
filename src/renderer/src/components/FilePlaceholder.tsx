import type { JSX } from 'react'
import type { ShortcutTool } from '../../../shared/shortcuts'
import { Icon, type IconName } from './Icon'
import './FilePlaceholder.css'

/**
 * Why a tab shows no content. `binary` and `too-large` are `FileContent` kinds
 * the reader returns (FXPL-20); `missing` is a file deleted from disk while its
 * tab was open (FXPL-24); `deleted` is a file opened from a diff mode that the
 * branch deleted, so there was never anything to show (FXPL-15).
 */
export type PlaceholderKind = 'binary' | 'too-large' | 'missing' | 'deleted'

interface FilePlaceholderProps {
  /** Path relative to the worktree root — its last segment is the name. */
  path: string
  kind: PlaceholderKind
  /** Bytes, for the two kinds that have a file on disk to measure. */
  size?: number
  /** Launches a tool on this file. Absent for the kinds that have no file. */
  onLaunch?: (tool: ShortcutTool) => void
}

/** The launchers of FXPL-25, minus Terminal: a file is not a working directory. */
const LAUNCHERS: { tool: ShortcutTool; label: string; icon: IconName }[] = [
  { tool: 'explorer', label: 'File Explorer', icon: 'folder' },
  { tool: 'vscode', label: 'VS Code', icon: 'code' },
  { tool: 'vs2022', label: 'VS 2022', icon: 'shield' },
  { tool: 'vs2026', label: 'VS 2026', icon: 'shield' }
]

const WORDING: Record<PlaceholderKind, { icon: IconName; headline: string; detail: string }> = {
  binary: {
    icon: 'file',
    headline: 'Binary file',
    detail: 'Its bytes are not text, so there is nothing to display.'
  },
  'too-large': {
    icon: 'file',
    headline: 'Too large to display',
    detail: 'Files above 1 MB are not read into the viewer.'
  },
  missing: {
    icon: 'alert',
    headline: 'This file no longer exists',
    detail: 'It was deleted or renamed on disk while this tab was open.'
  },
  deleted: {
    icon: 'alert',
    headline: 'This file was deleted',
    detail: 'The branch deletes it, so there is no content to show.'
  }
}

/** Bytes as the size a file manager would print. */
function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  const units = ['KB', 'MB', 'GB']
  let value = bytes / 1024
  let unit = 0
  while (value >= 1024 && unit < units.length - 1) {
    value /= 1024
    unit += 1
  }
  return `${value < 10 ? value.toFixed(1) : Math.round(value)} ${units[unit]}`
}

/** The extension as a type label, or a plain statement that there is none. */
function fileType(name: string): string {
  const dot = name.lastIndexOf('.')
  return dot > 0 ? `${name.slice(dot + 1).toUpperCase()} file` : 'No extension'
}

/**
 * What a tab shows when the file cannot be rendered (FXPL-15/20/24).
 *
 * Every kind is a state the tab displays, never an error dialog: the tab stays
 * open and keeps its place in the strip, which is what FXPL-24 requires of a
 * file deleted underneath the user.
 *
 * The launchers render only for `binary` and `too-large`. For the two deleted
 * kinds the path does not exist, and every launcher here targets the file
 * itself — File Explorer selects it, the editors open it — so offering them
 * would mean offering an action that can only fail.
 */
export function FilePlaceholder({ path, kind, size, onLaunch }: FilePlaceholderProps): JSX.Element {
  const name = path.split('/').pop() ?? path
  const { icon, headline, detail } = WORDING[kind]
  const hasFile = kind === 'binary' || kind === 'too-large'

  return (
    <div className="file-placeholder">
      <div className="file-placeholder-card">
        <Icon name={icon} size={22} />
        <div className="file-placeholder-name">{name}</div>
        <div className="file-placeholder-headline">{headline}</div>
        <div className="file-placeholder-detail">{detail}</div>
        {hasFile && (
          <div className="file-placeholder-meta">
            <span>{fileType(name)}</span>
            {size !== undefined && <span>{formatSize(size)}</span>}
          </div>
        )}
        {hasFile && onLaunch && (
          <div className="file-placeholder-launchers">
            {LAUNCHERS.map((launcher) => (
              <button
                key={launcher.tool}
                type="button"
                className="file-placeholder-launcher"
                onClick={() => onLaunch(launcher.tool)}
              >
                <Icon name={launcher.icon} size={14} />
                <span>{launcher.label}</span>
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
