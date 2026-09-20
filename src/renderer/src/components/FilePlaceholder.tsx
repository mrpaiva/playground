import type { JSX } from 'react'
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
}

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
 * The launchers of FXPL-20 are not here. `FileTabs` owns the one launcher row
 * FXPL-25 puts under the tabs, in this same column and always visible, and it
 * targets this file: a second row inside the card would have shown the same
 * four buttons twice (T18).
 */
export function FilePlaceholder({ path, kind, size }: FilePlaceholderProps): JSX.Element {
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
      </div>
    </div>
  )
}
