import type { JSX } from 'react'
import type { ShortcutTool } from '../../../shared/shortcuts'
import { api } from '../lib/api'
import { tabKeyOf } from '../lib/diff-view'
import type { FileTab, UseFiles } from '../lib/use-files'
import { CodeViewer } from './CodeViewer'
import { FilePlaceholder } from './FilePlaceholder'
import { Icon, type IconName } from './Icon'
import './FileTabs.css'

interface FileTabsProps {
  files: UseFiles
  /** The launcher's existing failure toast (FXPL-30). */
  onToast: (message: string) => void
}

/** The launcher row of FXPL-25, in the order the requirement lists it. */
const LAUNCHERS: { tool: ShortcutTool; label: string; icon: IconName }[] = [
  { tool: 'explorer', label: 'File Explorer', icon: 'folder' },
  { tool: 'vscode', label: 'VS Code', icon: 'code' },
  { tool: 'vs2022', label: 'VS 2022', icon: 'shield' },
  { tool: 'vs2026', label: 'VS 2026', icon: 'shield' }
]

/** What the active tab shows: the file, or why it cannot be shown. */
function TabBody({ tab }: { tab: FileTab }): JSX.Element {
  // FXPL-15: listed as deleted by a diff mode, so nothing was ever read.
  if (tab.deleted) return <FilePlaceholder path={tab.path} kind="deleted" />
  if (!tab.content) return <div className="file-tabs-note">Loading…</div>
  const content = tab.content
  switch (content.kind) {
    case 'text':
      return <CodeViewer path={tab.path} text={content.text} fromDiffMode={tab.fromDiffMode} />
    case 'binary':
      return <FilePlaceholder path={tab.path} kind="binary" size={content.size} />
    case 'too-large':
      return <FilePlaceholder path={tab.path} kind="too-large" size={content.size} />
    case 'missing':
      return <FilePlaceholder path={tab.path} kind="missing" />
    case 'error':
      return <div className="file-tabs-error">{content.message}</div>
  }
}

/**
 * The Files direction's right column: the tab strip (FXPL-16/18/19), the
 * launcher row under it (FXPL-25), and the active tab's viewer or placeholder.
 *
 * The launchers act on `launchTarget`, which is the active tab's file unless a
 * folder was clicked in the tree more recently (FXPL-26). With nothing picked
 * at all they are disabled rather than hidden: FXPL-25 puts them under the tabs
 * unconditionally, and a row that comes and goes reads as a bug.
 *
 * **This is the only launcher row on screen.** `FilePlaceholder` was built with
 * one of its own (T15) because FXPL-20 asks a binary tab for "the launchers";
 * that row is gone now, because this one sits in the same column, is always
 * visible above the placeholder, and targets the same file. Two identical rows
 * stacked would have been the alternative.
 *
 * Only the active tab is mounted, keyed by path, so Monaco creates one editor
 * per file and disposes it when the tab loses focus or closes (T14).
 */
export function FileTabs({ files, onToast }: FileTabsProps): JSX.Element {
  // T19 renders the diff tabs and the fixed All changes tab. Until then the
  // strip shows what F1 shipped, keyed the way F2 keys it.
  const open = files.tabs.filter((tab): tab is FileTab => tab.kind === 'file')
  const active = open.find((tab) => tabKeyOf(tab) === files.activeTab) ?? null

  const launch = (tool: ShortcutTool): void => {
    const path = files.launchTarget
    if (!path) return
    api
      .invoke('shortcuts:launch', { tool, path })
      .then((result) => {
        if (!result.ok) onToast(result.error ?? 'Launch failed')
      })
      .catch((err) => onToast(err instanceof Error ? err.message : String(err)))
  }

  return (
    <div className="file-tabs">
      <div className="file-tabs-strip" role="tablist" aria-label="Open files">
        {open.map((tab) => (
          <div
            key={tabKeyOf(tab)}
            className={`file-tab${tabKeyOf(tab) === files.activeTab ? ' active' : ''}`}
          >
            <button
              type="button"
              role="tab"
              aria-selected={tabKeyOf(tab) === files.activeTab}
              className="file-tab-label"
              title={tab.path}
              onClick={() => files.focusTab(tabKeyOf(tab))}
            >
              {tab.path.split('/').pop() ?? tab.path}
            </button>
            <button
              type="button"
              className="file-tab-close"
              aria-label={`Close ${tab.path}`}
              title="Close"
              onClick={() => files.closeTab(tabKeyOf(tab))}
            >
              <Icon name="x" size={12} />
            </button>
          </div>
        ))}
      </div>

      <div className="file-tabs-launchers">
        {LAUNCHERS.map(({ tool, label, icon }) => (
          <button
            key={tool}
            type="button"
            className="file-tabs-launcher"
            disabled={files.launchTarget === null}
            title={files.launchTarget ?? 'Open a file or pick a folder first'}
            onClick={() => launch(tool)}
          >
            <Icon name={icon} size={14} />
            <span>{label}</span>
          </button>
        ))}
      </div>

      <div className="file-tabs-body">
        {active ? (
          <TabBody key={active.path} tab={active} />
        ) : (
          // FXPL-19: closing the last tab leaves this, not a blank column.
          <div className="file-tabs-empty">No file open. Pick one in the tree.</div>
        )}
      </div>
    </div>
  )
}
