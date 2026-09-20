import { useCallback, useEffect, useRef, useState } from 'react'
import type { AppConfig, FilesState } from '../../../shared/config'
import type {
  BaseOptions,
  ChangedListing,
  ChangedPath,
  DirListing,
  FileContent,
  FilesMode
} from '../../../shared/files'
import { api } from './api'
import { filesStateFor, launcherTarget, tabsAfterClose, tabsAffected } from './files-view'

/** One open tab (FXPL-18): what was read for it, and when it was last picked. */
export interface FileTab {
  /** Path relative to the worktree root, forward slashes. */
  path: string
  /** What main answered for it; null while the read is in flight. */
  content: FileContent | null
  /** Opened from one of the diff modes, so the viewer says so (FXPL-14). */
  fromDiffMode: boolean
  /** Listed as deleted by a diff mode: there was never content to read (FXPL-15). */
  deleted: boolean
  /** When the user last picked this tab — the recency FXPL-26 compares. */
  at: number
}

/** How a file was opened, so the tab knows what to show (FXPL-14/15). */
export interface OpenOptions {
  fromDiffMode?: boolean
  deleted?: boolean
}

/**
 * Everything one worktree shows, kept in memory for as long as the app runs
 * (FXPL-18). Mode and base are not here: those persist in the config (D4).
 */
interface WorktreeFiles {
  tabs: FileTab[]
  activeTab: string | null
  /** Folder paths opened in the full-folder tree (FXPL-05). */
  expanded: string[]
  /** The folder last clicked in the tree, and when (FXPL-26). */
  lastFolder: { path: string; at: number } | null
  /** Full-folder listings by folder path; `''` is the worktree root. */
  entries: Record<string, DirListing>
  changed: ChangedListing | null
  uncommitted: ChangedPath[]
  bases: BaseOptions | null
}

/** A worktree the user has not opened yet. Constant, so it stays referentially stable. */
const EMPTY: WorktreeFiles = {
  tabs: [],
  activeTab: null,
  expanded: [],
  lastFolder: null,
  entries: {},
  changed: null,
  uncommitted: [],
  bases: null
}

export interface UseFilesOptions {
  /** The selected worktree's path; null when nothing is selected (FXPL-03). */
  worktreePath: string | null
  /** The Files direction is showing. The watch follows it (FXPL-23). */
  active: boolean
  /** App's UI config — the per-worktree lens is read out of it (FXPL-13). */
  ui: AppConfig['ui']
  /** Hands a changed lens back to App, the one writer of the config (D4). */
  onPersist: (files: Record<string, FilesState>) => void
}

export interface UseFiles {
  /** The lens this worktree is in, restored from the config (FXPL-13). */
  mode: FilesMode
  /** The base the diff mode compares against: the picked one, else `origin/HEAD`. */
  base: string | undefined
  bases: BaseOptions | null
  entries: Record<string, DirListing>
  expanded: string[]
  changed: ChangedListing | null
  uncommitted: ChangedPath[]
  tabs: FileTab[]
  activeTab: string | null
  /** Absolute path the launcher row acts on (FXPL-26); null when nothing is picked. */
  launchTarget: string | null
  setMode: (mode: FilesMode) => void
  setBase: (base: string) => void
  /** Opens or folds a folder; opening it lists its children once (FXPL-05). */
  toggleFolder: (path: string) => void
  /** Records the folder the user just clicked, for the launchers (FXPL-26). */
  selectFolder: (path: string) => void
  openFile: (path: string, options?: OpenOptions) => void
  focusTab: (path: string) => void
  closeTab: (path: string) => void
}

/**
 * The Files direction's state (AD-004): tabs, expanded folders and the current
 * listing live here, per worktree, so switching away and back restores what the
 * user left (FXPL-06/18). The mode and base persist through App instead, since
 * they outlive the session (FXPL-13, design D4).
 *
 * The hook is mounted by App, above the direction switch, so leaving Files can
 * stop the watch: `files:watch` is called with the selected worktree while the
 * direction is Files and with `null` otherwise (FXPL-23).
 *
 * A `files:changed` batch is reacted to twice over, and no wider: the open tabs
 * the batch touches are re-read (FXPL-21), and the current mode's list is
 * re-listed (FXPL-22). The re-list is unconditional, because a commit or a
 * `git add` changes what both diff modes list without touching any path in the
 * batch — that is what `gitStateChanged` reports.
 */
export function useFiles({ worktreePath, active, ui, onPersist }: UseFilesOptions): UseFiles {
  const [byWorktree, setByWorktree] = useState<Record<string, WorktreeFiles>>({})
  const here = (worktreePath && byWorktree[worktreePath]) || EMPTY
  const { mode, base } = filesStateFor(ui, worktreePath ?? '')
  // FXPL-10: until the user picks one, the base is whatever `origin/HEAD` names.
  const effectiveBase = base ?? here.bases?.defaultBase ?? undefined

  const patchFiles = useCallback(
    (wt: string, patch: (state: WorktreeFiles) => Partial<WorktreeFiles>): void => {
      setByWorktree((prev) => {
        const current = prev[wt] ?? EMPTY
        return { ...prev, [wt]: { ...current, ...patch(current) } }
      })
    },
    []
  )

  const loadDir = useCallback(
    (wt: string, dir: string): void => {
      api
        .invoke('files:list-dir', { worktreePath: wt, dir })
        .then((listing) => patchFiles(wt, (s) => ({ entries: { ...s.entries, [dir]: listing } })))
        .catch(console.error)
    },
    [patchFiles]
  )

  const loadChanged = useCallback(
    (wt: string, from: string): void => {
      api
        .invoke('files:changed-since', { worktreePath: wt, base: from })
        .then((changed) => patchFiles(wt, () => ({ changed })))
        .catch(console.error)
    },
    [patchFiles]
  )

  const loadUncommitted = useCallback(
    (wt: string): void => {
      api
        .invoke('worktrees:changes', { worktreePath: wt })
        .then((files) => patchFiles(wt, () => ({ uncommitted: files })))
        .catch(console.error)
    },
    [patchFiles]
  )

  const readTab = useCallback(
    (wt: string, path: string): void => {
      api
        .invoke('files:read', { worktreePath: wt, relPath: path })
        .then((content) =>
          patchFiles(wt, (s) => ({
            tabs: s.tabs.map((tab) => (tab.path === path ? { ...tab, content } : tab))
          }))
        )
        .catch(console.error)
    },
    [patchFiles]
  )

  /** Re-lists whatever the current mode shows, and nothing else (FXPL-22/23). */
  const refreshMode = useCallback(
    (wt: string, lens: FilesMode, from: string | undefined, expanded: string[]): void => {
      if (lens === 'full') {
        loadDir(wt, '')
        for (const dir of expanded) loadDir(wt, dir)
        return
      }
      if (lens === 'uncommitted') {
        loadUncommitted(wt)
        return
      }
      // FXPL-11: with no base there is nothing to compare, and the picker asks
      // for one rather than the app guessing.
      if (from) loadChanged(wt, from)
      else patchFiles(wt, () => ({ changed: null }))
    },
    [loadDir, loadUncommitted, loadChanged, patchFiles]
  )

  // What the `files:changed` subscription needs to read without resubscribing
  // on every keystroke of state.
  const live = useRef({ worktreePath, active, mode, effectiveBase, here })
  useEffect(() => {
    live.current = { worktreePath, active, mode, effectiveBase, here }
  })

  // The picker's choices and the `origin/HEAD` default (FXPL-09/10/11). One git
  // call per worktree visit; the diff mode cannot list until it resolves.
  useEffect(() => {
    if (!active || !worktreePath) return
    api
      .invoke('files:bases', { worktreePath })
      .then((bases) => patchFiles(worktreePath, () => ({ bases })))
      .catch(console.error)
  }, [active, worktreePath, patchFiles])

  // The current mode's list. `expanded` is read through the ref on purpose: as a
  // dependency it would re-list a folder that `toggleFolder` has just listed.
  useEffect(() => {
    if (!active || !worktreePath) return
    refreshMode(worktreePath, mode, effectiveBase, live.current.here.expanded)
  }, [active, worktreePath, mode, effectiveBase, refreshMode])

  // FXPL-23: one worktree is watched, and only while the direction is Files.
  useEffect(() => {
    api.invoke('files:watch', { worktreePath: active ? worktreePath : null }).catch(console.error)
  }, [active, worktreePath])

  useEffect(() => {
    return api.on('files:changed', (event) => {
      const current = live.current
      if (!current.active || !current.worktreePath) return
      if (event.worktreePath !== current.worktreePath) return
      const wt = current.worktreePath
      // A tab opened as deleted has no file to re-read; everything else the
      // batch touches is re-read in place (FXPL-21/24).
      const open = current.here.tabs.filter((tab) => !tab.deleted).map((tab) => tab.path)
      for (const path of tabsAffected(open, event.paths)) readTab(wt, path)
      refreshMode(wt, current.mode, current.effectiveBase, current.here.expanded)
    })
  }, [readTab, refreshMode])

  const persist = useCallback(
    (patch: Partial<FilesState>): void => {
      if (!worktreePath) return
      const next = { ...filesStateFor(ui, worktreePath), ...patch }
      onPersist({ ...(ui.files ?? {}), [worktreePath]: next })
    },
    [ui, worktreePath, onPersist]
  )

  const setMode = useCallback((next: FilesMode): void => persist({ mode: next }), [persist])
  const setBase = useCallback((next: string): void => persist({ base: next }), [persist])

  const toggleFolder = useCallback(
    (path: string): void => {
      if (!worktreePath) return
      const wt = worktreePath
      patchFiles(wt, (s) => ({
        expanded: s.expanded.includes(path)
          ? s.expanded.filter((dir) => dir !== path)
          : [...s.expanded, path]
      }))
      // FXPL-05: a folder's children are listed when it opens, and only once —
      // a folder already listed keeps what it has.
      if (!here.expanded.includes(path) && here.entries[path] === undefined) loadDir(wt, path)
    },
    [worktreePath, patchFiles, loadDir, here]
  )

  const selectFolder = useCallback(
    (path: string): void => {
      if (!worktreePath) return
      patchFiles(worktreePath, () => ({ lastFolder: { path, at: Date.now() } }))
    },
    [worktreePath, patchFiles]
  )

  const openFile = useCallback(
    (path: string, options: OpenOptions = {}): void => {
      if (!worktreePath) return
      const wt = worktreePath
      const at = Date.now()
      // Decided from the ref, NOT from inside the updater below: React runs a
      // setState updater at the next render, so a flag assigned in there is
      // still false on the line after the call and the read never fires — the
      // tab opens and sits at "Loading…" forever (caught by the T23 smoke).
      const known = live.current.here.tabs.find((tab) => tab.path === path)
      const needsRead = !options.deleted && (!known || known.content === null)
      patchFiles(wt, (s) => {
        const existing = s.tabs.find((tab) => tab.path === path)
        // FXPL-16: an already-open file focuses its tab instead of opening a second one.
        if (existing) {
          return {
            tabs: s.tabs.map((tab) => (tab.path === path ? { ...tab, at } : tab)),
            activeTab: path
          }
        }
        const tab: FileTab = {
          path,
          content: null,
          fromDiffMode: options.fromDiffMode ?? false,
          deleted: options.deleted ?? false,
          at
        }
        return { tabs: [...s.tabs, tab], activeTab: path }
      })
      if (needsRead) readTab(wt, path)
    },
    [worktreePath, patchFiles, readTab]
  )

  const focusTab = useCallback(
    (path: string): void => {
      if (!worktreePath) return
      patchFiles(worktreePath, (s) => ({
        tabs: s.tabs.map((tab) => (tab.path === path ? { ...tab, at: Date.now() } : tab)),
        activeTab: path
      }))
    },
    [worktreePath, patchFiles]
  )

  const closeTab = useCallback(
    (path: string): void => {
      if (!worktreePath) return
      patchFiles(worktreePath, (s) => {
        const index = s.tabs.findIndex((tab) => tab.path === path)
        if (index === -1) return {}
        const after = tabsAfterClose(
          s.tabs.map((tab) => tab.path),
          index,
          s.activeTab
        )
        return {
          tabs: s.tabs.filter((tab) => tab.path !== path),
          activeTab: after.active
        }
      })
    },
    [worktreePath, patchFiles]
  )

  const focused = here.tabs.find((tab) => tab.path === here.activeTab) ?? null
  const target = launcherTarget(
    focused ? { path: focused.path, at: focused.at } : null,
    here.lastFolder
  )

  return {
    mode,
    base: effectiveBase,
    bases: here.bases,
    entries: here.entries,
    expanded: here.expanded,
    changed: here.changed,
    uncommitted: here.uncommitted,
    tabs: here.tabs,
    activeTab: here.activeTab,
    launchTarget: worktreePath && target !== null ? absoluteIn(worktreePath, target) : null,
    setMode,
    setBase,
    toggleFolder,
    selectFolder,
    openFile,
    focusTab,
    closeTab
  }
}

/**
 * A worktree-relative path as the launchers need it: absolute, with Windows
 * separators. `explorer.exe /select,` parses its own command line and wants
 * backslashes, and every tool the launcher row offers is Windows-only.
 */
export function absoluteIn(worktreePath: string, relPath: string): string {
  const root = worktreePath.replace(/[\\/]+$/, '')
  const rest = relPath.replace(/\//g, '\\')
  return rest === '' ? root : `${root}\\${rest}`
}
