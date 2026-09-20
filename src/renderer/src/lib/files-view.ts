import type { ChangedPath } from '../../../shared/files'
import type { ChangeStatus } from '../../../shared/worktrees'

/** A changed file as the tree renders it, carrying the status it was listed with. */
export interface FileNode {
  kind: 'file'
  name: string
  /** Path relative to the worktree root, forward slashes. */
  path: string
  status: ChangeStatus
}

/** A folder the nesting invented; the diff modes never list folders themselves. */
export interface DirNode {
  kind: 'dir'
  name: string
  path: string
  children: TreeNode[]
}

export type TreeNode = FileNode | DirNode

/**
 * Nests the flat path list both diff modes return (FXPL-08, FXPL-12) into the
 * folders the tree draws, keeping each leaf's change status. Ordering matches
 * `foldChildren` in main, so the full-folder mode and the diff modes read the
 * same: folders first, then alphabetical, case-insensitive.
 */
export function buildTree(paths: ChangedPath[]): TreeNode[] {
  const root: DirNode = { kind: 'dir', name: '', path: '', children: [] }
  for (const { path, status } of paths) {
    const segments = path.split('/').filter((segment) => segment !== '')
    if (segments.length === 0) continue
    let parent = root
    for (const [index, name] of segments.entries()) {
      const here = parent.path === '' ? name : `${parent.path}/${name}`
      if (index === segments.length - 1) {
        parent.children.push({ kind: 'file', name, path: here, status })
        break
      }
      const existing = parent.children.find(
        (node): node is DirNode => node.kind === 'dir' && node.name === name
      )
      if (existing) {
        parent = existing
        continue
      }
      const dir: DirNode = { kind: 'dir', name, path: here, children: [] }
      parent.children.push(dir)
      parent = dir
    }
  }
  sortInPlace(root)
  return root.children
}

/** A solution opens in VS 2026 instead of a tab (FXPL-28). */
export function isSolution(path: string): boolean {
  return /\.slnx?$/i.test(path)
}

/**
 * Which tabs are left after one is closed, and which is focused (FXPL-19).
 * Closing the active tab moves focus to the next one, or to the previous when
 * there is no next; closing the last remaining tab leaves `null`, the empty
 * state. Closing an inactive tab leaves the focus where it was. Tabs are
 * identified by path, as opening an already-open file does (FXPL-16).
 */
export function tabsAfterClose(
  tabs: string[],
  closedIndex: number,
  activePath: string | null
): { tabs: string[]; active: string | null } {
  const left = tabs.filter((_, index) => index !== closedIndex)
  if (tabs[closedIndex] !== activePath) return { tabs: left, active: activePath }
  const adjacent = left[closedIndex] ?? left[closedIndex - 1] ?? null
  return { tabs: left, active: adjacent }
}

/** A path the user picked, and when — the recency FXPL-26 compares. */
export interface Selected {
  path: string
  at: number
}

/**
 * What the launcher row acts on (FXPL-26): the active tab's file, unless a
 * folder was selected in the tree after that tab was opened. Null when nothing
 * has been selected at all.
 */
export function launcherTarget(
  activeTab: Selected | null,
  lastFolder: Selected | null
): string | null {
  if (!activeTab) return lastFolder?.path ?? null
  if (!lastFolder) return activeTab.path
  return lastFolder.at > activeTab.at ? lastFolder.path : activeTab.path
}

function sortInPlace(dir: DirNode): void {
  dir.children.sort(compareNodes)
  for (const child of dir.children) {
    if (child.kind === 'dir') sortInPlace(child)
  }
}

function compareNodes(a: TreeNode, b: TreeNode): number {
  if (a.kind !== b.kind) return a.kind === 'dir' ? -1 : 1
  const lower = a.name.toLowerCase().localeCompare(b.name.toLowerCase())
  return lower !== 0 ? lower : a.name.localeCompare(b.name)
}
