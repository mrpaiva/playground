import type { CommitDetail, CommitPage, CommitRow } from '../shared/files'
import { parseNumstat } from './file-diff'
import { parseNameStatus } from './file-tree'
import { git, gitFailureLine } from './git'
import { parseRemote } from './remote-url'

/** How many commits one page holds before Load more appears (FCMT-08/09). */
export const PAGE_SIZE = 100

/** Field separator inside one record; record separator between commits. */
const FS = '\x1f'
const RS = '\x1e'

/**
 * `git log --format` for one row. `%B` is last because it is the only field
 * that can hold anything — newlines, tabs, blank lines — and putting it at the
 * end means nothing after it has to be found.
 */
const FORMAT = `%H${FS}%h${FS}%an${FS}%ct${FS}%P${FS}%s${FS}%B${RS}`

/** A row as the log carries it: everything but whether it reached the upstream. */
export type LoggedCommit = Omit<CommitRow, 'pushed'>

/**
 * The branch's own commits since its base, newest first (FCMT-02/08/09).
 *
 * First-parent: a branch that merged another one lists its own commits and the
 * merge as one row, never the twenty commits the merge brought in (F3-Q3).
 *
 * Paging is by cursor, not by offset. The next page starts at the last listed
 * commit's first parent, so a commit landing on the branch between two pages
 * can neither duplicate a row nor push one out of sight, which `--skip` would
 * do. One extra row is asked for and dropped: its existence is what `hasMore`
 * reports.
 *
 * Never throws. A failure that leaves nothing to list — a base that no longer
 * resolves, a broken log — comes back as `error` with an empty list. A failure
 * that only costs information — no upstream, an unrecognized host — comes back
 * as null in its own field, because the list is still worth showing.
 */
export async function listCommits(
  worktreePath: string,
  base: string,
  cursor?: string
): Promise<CommitPage> {
  const empty = { commits: [], hasMore: false, cursor: null, upstream: null, browse: null }

  let mergeBase: string
  try {
    const { stdout } = await git(worktreePath, ['merge-base', 'HEAD', base])
    mergeBase = stdout.trim()
  } catch (err) {
    return { ...empty, error: gitFailureLine(err) }
  }

  const upstream = await upstreamOf(worktreePath)
  const browse = await browseProvider(worktreePath)

  // `<start> ^<mergeBase>` is the range; `<cursor>^1` resumes below the last
  // row the previous page showed.
  const start = cursor === undefined ? 'HEAD' : `${cursor}^1`
  let logged: LoggedCommit[]
  try {
    const { stdout } = await git(worktreePath, [
      'log',
      '--first-parent',
      `-n${PAGE_SIZE + 1}`,
      `--format=${FORMAT}`,
      start,
      `^${mergeBase}`
    ])
    logged = parseLog(stdout)
  } catch (err) {
    // A cursor whose commit has no first parent is the end of the history, not
    // a failure: the page before it already said there was more, and this one
    // honestly holds nothing.
    if (cursor !== undefined) return { ...empty, upstream, browse }
    return { ...empty, upstream, browse, error: gitFailureLine(err) }
  }

  const hasMore = logged.length > PAGE_SIZE
  const page = hasMore ? logged.slice(0, PAGE_SIZE) : logged
  const unpushed = await unpushedShas(worktreePath)
  const commits: CommitRow[] = page.map((row) => ({
    ...row,
    // No upstream means nothing has been pushed anywhere (FCMT-13); the set is
    // then empty, so the flag has to come from `upstream` rather than from it.
    pushed: upstream !== null && !unpushed.has(row.sha)
  }))

  return {
    commits,
    hasMore,
    cursor: hasMore ? (page[page.length - 1]?.sha ?? null) : null,
    upstream,
    browse
  }
}

/**
 * Parses the `--format` above. Pure.
 *
 * Records are separated by a control character rather than by a newline, and
 * the message is the last field, so a commit body holding blank lines, tabs or
 * anything else survives intact — the row's tooltip shows it as written
 * (FCMT-04). More than one parent is a merge (FCMT-05), and a commit with no
 * subject reads `(no subject)` rather than as an empty row (edge case).
 */
export function parseLog(stdout: string): LoggedCommit[] {
  const rows: LoggedCommit[] = []
  for (const record of stdout.split(RS)) {
    // git writes a newline between records; it belongs to neither.
    const trimmed = record.replace(/^[\r\n]+/, '')
    if (trimmed === '') continue
    const fields = trimmed.split(FS)
    if (fields.length < 7) continue
    const [sha, shortSha, author, at, parents, subject] = fields
    // The message is whatever is left, so a body that somehow held the field
    // separator is rejoined rather than truncated.
    const message = fields.slice(6).join(FS)
    rows.push({
      sha,
      shortSha,
      author,
      at: Number(at) * 1000,
      isMerge: parents.trim().split(/\s+/).filter(Boolean).length > 1,
      subject: subject === '' ? '(no subject)' : subject,
      message: message.replace(/\s+$/, '')
    })
  }
  return rows
}

/**
 * What one commit changed, against its first parent (FCMT-16/17/18).
 *
 * The parent is always named explicitly. `git diff-tree -r <merge>` with one
 * argument prints nothing at all — measured on this repository's merge
 * `7cef47a`: 0 lines with one argument, 24 with `<merge>^1 <merge>` — so a
 * merge commit would otherwise open as an empty stack.
 *
 * A root commit has no `^1`; `--root` then reports every file as added, which
 * is what an empty original side means in the tab (FCMT-18).
 *
 * Never throws: a sha the repository no longer holds comes back as `error`,
 * which the tab renders in place of a stale stack (edge case).
 */
export async function commitFiles(worktreePath: string, sha: string): Promise<CommitDetail> {
  let parent: string | null
  try {
    const { stdout } = await git(worktreePath, ['rev-parse', '--verify', `${sha}^1`])
    parent = stdout.trim()
  } catch {
    // No first parent. Either a root commit, or a sha that does not resolve at
    // all — the diff below tells the two apart.
    parent = null
  }

  // `--no-commit-id` matters for the root form: with a single revision
  // `diff-tree` prints the commit's own sha ahead of the records, and with
  // `-z` that line would run into the first status field.
  const range = parent === null ? ['--root', sha] : [parent, sha]
  const base = ['diff-tree', '-r', '-M', '-z', '--no-commit-id', ...range]
  try {
    const [names, counts] = await Promise.all([
      git(worktreePath, [...base, '--name-status']),
      git(worktreePath, [...base, '--numstat'])
    ])
    return { parent, files: parseNameStatus(names.stdout), stats: parseNumstat(counts.stdout) }
  } catch (err) {
    return { parent, files: [], stats: [], error: gitFailureLine(err) }
  }
}

/** The branch's upstream, e.g. `fork/feature/x`; null when it has none (FCMT-13). */
async function upstreamOf(worktreePath: string): Promise<string | null> {
  try {
    const { stdout } = await git(worktreePath, [
      'rev-parse',
      '--abbrev-ref',
      '--symbolic-full-name',
      '@{upstream}'
    ])
    const name = stdout.trim()
    return name === '' ? null : name
  } catch {
    return null
  }
}

/** Commits not reachable from the upstream — the ones the list marks (FCMT-12). */
async function unpushedShas(worktreePath: string): Promise<Set<string>> {
  try {
    const { stdout } = await git(worktreePath, ['rev-list', '@{upstream}..HEAD'])
    return new Set(stdout.split(/\r?\n/).filter((line) => line !== ''))
  } catch {
    return new Set()
  }
}

/**
 * Which provider the branch's upstream remote is on, or null (FCMT-23/26).
 *
 * The remote comes from the branch's own config rather than from the upstream
 * ref's name, because a remote name may itself contain a slash. A detached
 * HEAD has no branch config and so no provider — the list still works, it
 * simply offers no browser button (edge case).
 */
async function browseProvider(worktreePath: string): Promise<'github' | 'azure-devops' | null> {
  try {
    const { stdout: head } = await git(worktreePath, ['rev-parse', '--abbrev-ref', 'HEAD'])
    const branch = head.trim()
    if (branch === '' || branch === 'HEAD') return null
    const { stdout: remoteName } = await git(worktreePath, [
      'config',
      '--get',
      `branch.${branch}.remote`
    ])
    const remote = remoteName.trim()
    if (remote === '') return null
    const { stdout: url } = await git(worktreePath, ['remote', 'get-url', remote])
    return parseRemote(url.trim())?.provider ?? null
  } catch {
    return null
  }
}
