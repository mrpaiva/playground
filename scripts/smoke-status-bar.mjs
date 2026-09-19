/* CDP smoke for the status bar (STBR-01..32). Drives the bar and both popovers
 * through the states the unit tests cannot reach, against real git: a temp
 * workspace whose repo clones a temp BARE remote, plus a second bare remote.
 * Nothing here touches a real remote — every push goes to a bare repo under
 * the temp dir, which is deleted on the way out.
 *
 * Seeded fixture (fictional names only — this repo is public):
 *   <tmp>/origin.git, <tmp>/backup.git       two bare remotes
 *   <tmp>/acme-workspace/acme-widget         primary checkout (main), left
 *                                            with all five change statuses
 *   <tmp>/wt/long     a very long branch, tracking origin, diverged 1/1
 *   <tmp>/wt/sync     tracking origin, 1 behind → Sync → 1 ahead → Sync
 *   <tmp>/wt/publish  no upstream, two remotes → Publish needs a choice
 *   <tmp>/other       a second clone that pushes the "remote" commits
 *   <tmp>/loose       a plain folder, the cwd of the non-worktree session
 *
 * Sessions: ad-hoc `pwsh -NoLogo` sessions only (never a registry agent, never
 * any input sent). Only the sessions this script spawned are stopped/removed.
 *
 * Owner state: the dev app runs on the owner's real user data, so the UI
 * direction, theme, workspace list and the Agents selection are snapshotted
 * first and restored in a `finally`, even on failure.
 *
 * Screenshots (light + dark) go to %TEMP%\status-bar-smoke\ — never the repo.
 *
 * NOT automatable here (hand-verify from the screenshots): both themes read
 * well; the middle ellipsis looks right; the popovers sit above the bar.
 *
 * Run: npm run dev -- -- --remote-debugging-port=9222   (in one shell)
 *      node scripts/smoke-status-bar.mjs                  (in another)
 */

import { execFileSync } from 'node:child_process'
import { mkdirSync, mkdtempSync, realpathSync, rmSync, unlinkSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { basename, join } from 'node:path'

const PORT = Number(process.env.SMOKE_PORT) || 9222
const TMP = realpathSync.native(tmpdir())
const SHOTS = join(TMP, 'status-bar-smoke')

const LONG_BRANCH =
  'user/dev/4821-fix-login-redirect-after-session-timeout-on-the-legacy-portal-and-new-dashboard/12345-endpoint-with-a-long-name'
const SYNC_BRANCH = 'user/dev/4821-fix-login/12346-sync-both-ways'
const PUBLISH_BRANCH = 'user/dev/4821-fix-login/12347-publish-me'
const TARGET_TITLE = 'stbr-smoke target'
const FOLDER_TITLE = 'stbr-smoke folder'
const SUBFOLDER_TITLE = 'stbr-smoke subfolder'
const DUMMY_TITLE = 'stbr-smoke nudge'

// ---------------------------------------------------------------- CDP harness

async function pageTarget() {
  for (let i = 0; i < 30; i++) {
    try {
      const targets = await (await fetch(`http://127.0.0.1:${PORT}/json`)).json()
      const page = targets.find((t) => t.type === 'page')
      if (page) return page
    } catch {
      /* app not up yet */
    }
    await new Promise((r) => setTimeout(r, 1000))
  }
  throw new Error('No CDP page target after 30s')
}

let nextId = 1
function send(ws, method, params = {}) {
  return new Promise((resolve, reject) => {
    const id = nextId++
    const onMessage = (event) => {
      const msg = JSON.parse(event.data)
      if (msg.id !== id) return
      ws.removeEventListener('message', onMessage)
      if (msg.error) return reject(new Error(JSON.stringify(msg.error)))
      resolve(msg.result)
    }
    ws.addEventListener('message', onMessage)
    ws.send(JSON.stringify({ id, method, params }))
  })
}

async function evaluate(ws, expression) {
  const result = await send(ws, 'Runtime.evaluate', {
    expression,
    awaitPromise: true,
    returnByValue: true
  })
  const r = result.result
  if (r.subtype === 'error') throw new Error(r.description)
  return r.value
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

/** Poll `expression` (which returns JSON) until `ok(value)`; the last value either way. */
async function waitFor(ws, expression, ok, timeoutMs = 8000) {
  const deadline = Date.now() + timeoutMs
  let value
  do {
    value = JSON.parse(await evaluate(ws, expression))
    if (ok(value)) return value
    await sleep(150)
  } while (Date.now() < deadline)
  return value
}

const checks = []
function check(name, ok, detail = '') {
  checks.push({ name, ok })
  const n = String(checks.length).padStart(2, ' ')
  console.log(`${n}. ${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? ` — ${detail}` : ''}`)
}

// ---------------------------------------------------------------- git fixture

const GIT_ENV = {
  ...process.env,
  // Clones inherit nothing from a repo config, so long paths ride in the env too.
  GIT_CONFIG_COUNT: '1',
  GIT_CONFIG_KEY_0: 'core.longpaths',
  GIT_CONFIG_VALUE_0: 'true',
  GIT_TERMINAL_PROMPT: '0',
  GIT_AUTHOR_NAME: 'Smoke',
  GIT_AUTHOR_EMAIL: 'smoke@example.invalid',
  GIT_COMMITTER_NAME: 'Smoke',
  GIT_COMMITTER_EMAIL: 'smoke@example.invalid'
}

function git(cwd, ...args) {
  return execFileSync('git', args, { cwd, env: GIT_ENV, encoding: 'utf8', stdio: 'pipe' }).trim()
}

function commit(cwd, file, subject) {
  writeFileSync(join(cwd, file), `${subject}\n`)
  git(cwd, 'add', file)
  git(cwd, 'commit', '-q', '-m', subject)
}

const root = realpathSync.native(mkdtempSync(join(TMP, 'stbr-smoke-')))
const originBare = join(root, 'origin.git')
const backupBare = join(root, 'backup.git')
const wsDir = join(root, 'acme-workspace')
const primary = join(wsDir, 'acme-widget')
const other = join(root, 'other')
const loose = join(root, 'loose')
const wtDir = {
  long: join(root, 'wt', 'long'),
  sync: join(root, 'wt', 'sync'),
  pub: join(root, 'wt', 'publish')
}

function seed() {
  git(root, 'init', '-q', '--bare', '-b', 'main', originBare)
  git(root, 'init', '-q', '--bare', '-b', 'main', backupBare)
  // The long branch nears MAX_PATH under refs/; the app's own git needs this too.
  for (const bare of [originBare, backupBare]) git(bare, 'config', 'core.longpaths', 'true')
  mkdirSync(wsDir, { recursive: true })
  mkdirSync(loose, { recursive: true })
  mkdirSync(join(root, 'wt'), { recursive: true })
  git(wsDir, 'clone', '-q', originBare, primary)
  git(primary, 'config', 'core.autocrlf', 'false')
  git(primary, 'config', 'core.longpaths', 'true')
  git(primary, 'checkout', '-q', '-b', 'main')
  for (const f of ['modify-me.txt', 'delete-me.txt', 'rename-me.txt']) {
    writeFileSync(join(primary, f), `${f}\n`)
  }
  git(primary, 'add', '.')
  git(primary, 'commit', '-q', '-m', 'Initial widget')
  git(primary, 'push', '-q', '-u', 'origin', 'main')
  git(primary, 'remote', 'add', 'backup', backupBare)

  git(primary, 'worktree', 'add', '-q', '-b', LONG_BRANCH, wtDir.long, 'main')
  git(wtDir.long, 'push', '-q', '-u', 'origin', LONG_BRANCH)
  git(primary, 'worktree', 'add', '-q', '-b', SYNC_BRANCH, wtDir.sync, 'main')
  git(wtDir.sync, 'push', '-q', '-u', 'origin', SYNC_BRANCH)
  git(primary, 'worktree', 'add', '-q', '-b', PUBLISH_BRANCH, wtDir.pub, 'main')

  // Diverge the long branch: one local commit, one pushed from another clone.
  commit(wtDir.long, 'local.txt', 'Local tweak to the login endpoint')
  git(root, 'clone', '-q', originBare, other)
  git(other, 'config', 'core.autocrlf', 'false')
  git(other, 'config', 'core.longpaths', 'true')
  git(other, 'checkout', '-q', LONG_BRANCH)
  commit(other, 'remote.txt', 'Remote fix for the login redirect')
  git(other, 'push', '-q')
  git(other, 'checkout', '-q', SYNC_BRANCH)
  commit(other, 'down.txt', 'Remote change to sync down')
  git(other, 'push', '-q')

  // The primary checkout carries one change of each status (STBR-30).
  writeFileSync(join(primary, 'modify-me.txt'), 'changed\n')
  unlinkSync(join(primary, 'delete-me.txt'))
  git(primary, 'mv', 'rename-me.txt', 'renamed.txt')
  writeFileSync(join(primary, 'added.txt'), 'added\n')
  git(primary, 'add', 'added.txt')
  writeFileSync(join(primary, 'untracked.txt'), 'untracked\n')
}

// ---------------------------------------------------------------- page helpers

const J = JSON.stringify

/** Everything the checks read off the bar, as JSON. */
const BAR = `(() => {
  const bar = document.querySelector('footer.status-bar[role="status"]')
  if (!bar) return JSON.stringify({ present: false })
  const q = (s) => bar.querySelector(s)
  const head = q('.status-bar-branch-head')
  const branch = q('.status-bar-branch')
  const sync = q('.status-bar-sync')
  const r = bar.getBoundingClientRect()
  return JSON.stringify({
    present: true,
    empty: q('.status-bar-empty')?.textContent ?? null,
    repo: q('.status-bar-repo')?.textContent ?? null,
    branchTitle: branch?.getAttribute('title') ?? null,
    head: head?.textContent ?? null,
    tail: q('.status-bar-branch-tail')?.textContent ?? null,
    headTruncated: head ? head.scrollWidth > head.clientWidth : null,
    branchWidth: branch ? branch.getBoundingClientRect().width : null,
    headTailGap:
      head && q('.status-bar-branch-tail')
        ? q('.status-bar-branch-tail').getBoundingClientRect().left -
          head.getBoundingClientRect().right
        : null,
    barWidth: r.width,
    barTop: r.top,
    sync: sync?.textContent ?? null,
    syncTag: sync?.tagName ?? null,
    syncClass: sync?.className ?? null,
    changes: q('button.status-bar-changes')?.textContent ?? null,
    folder: q('.status-bar-folder-path')?.textContent ?? null,
    folderTitle: q('.status-bar-folder')?.getAttribute('title') ?? null,
    note: q('.status-bar-note')?.textContent ?? null
  })
})()`

const bar = async (ws) => JSON.parse(await evaluate(ws, BAR))
const waitBar = (ws, ok, timeoutMs) => waitFor(ws, BAR, ok, timeoutMs)

async function direction(ws, name) {
  await evaluate(
    ws,
    `(() => {
       const seg = [...document.querySelectorAll('.topbar-segment')].find((b) => b.textContent.trim() === ${J(name)})
       seg?.click()
       return Boolean(seg)
     })()`
  )
  await sleep(300)
}

async function refresh(ws) {
  await evaluate(ws, `(document.querySelector('.topbar-icon-btn[title="Refresh"]').click(), true)`)
  await sleep(700)
}

/** Click the temp workspace's sidebar row for `branch` (Tree direction). */
async function selectWorktree(ws, branch) {
  await direction(ws, 'Tree')
  const found = await evaluate(
    ws,
    `(() => {
       const wsEl = [...document.querySelectorAll('.sidebar-workspace')].find(
         (s) => s.querySelector('.sidebar-workspace-name')?.textContent === ${J(basename(wsDir))})
       const row = [...(wsEl?.querySelectorAll('.sidebar-worktree') ?? [])].find(
         (r) => r.querySelector('.sidebar-worktree-branch')?.textContent === ${J(branch)})
       row?.click()
       return Boolean(row)
     })()`
  )
  if (!found) throw new Error(`sidebar row for ${branch} not found`)
  await waitBar(ws, (b) => b.branchTitle === branch)
}

/** Click the rail row whose tooltip starts with `title` (Agents direction). */
async function selectSession(ws, title, index = 0) {
  await direction(ws, 'Agents')
  return evaluate(
    ws,
    `(() => {
       const rows = [...document.querySelectorAll('.rail-row')].filter((r) => (r.title || '').startsWith(${J(title)}))
       rows[${index}]?.click()
       return Boolean(rows[${index}])
     })()`
  )
}

async function openSync(ws) {
  // The section is a '…' span until the sync state loads; wait for the button.
  const ready = await waitFor(
    ws,
    `JSON.stringify(Boolean(document.querySelector('button.status-bar-sync')))`,
    (v) => v
  )
  if (!ready) throw new Error('the sync section never became a button')
  await evaluate(ws, `(document.querySelector('button.status-bar-sync').click(), true)`)
  return waitFor(ws, POP, (p) => p.open && p.listsLoaded !== false)
}

const POP = `(() => {
  const pop = document.querySelector('.sync-pop')
  if (!pop) return JSON.stringify({ open: false })
  const lists = [...pop.querySelectorAll('.sync-pop-list')].map((l) => ({
    title: l.querySelector('.section-label')?.textContent ?? null,
    commits: [...l.querySelectorAll('.sync-pop-commit')].map((c) => ({
      sha: c.querySelector('.sync-pop-sha')?.textContent ?? '',
      subject: c.querySelector('.sync-pop-subject')?.textContent ?? ''
    })),
    empty: l.querySelector('.sync-pop-empty')?.textContent ?? null
  }))
  const status = pop.querySelector('.sync-pop-status')
  const select = pop.querySelector('select.sync-pop-remote')
  return JSON.stringify({
    open: true,
    buttons: [...pop.querySelectorAll('.sync-pop-btn')].map((b) => ({ label: b.textContent, disabled: b.disabled })),
    fetched: pop.querySelector('.sync-pop-fetched')?.textContent ?? null,
    status: status?.textContent ?? null,
    failed: status?.classList.contains('failed') ?? false,
    select: select ? { value: select.value, options: [...select.options].map((o) => o.value) } : null,
    lists,
    listsLoaded: lists.every((l) => l.empty !== 'Loading…')
  })
})()`

/** Hit-test a 6x6 grid over a popover: how many points land on something else. */
const TOPMOST = (selector) => `(() => {
  const pop = document.querySelector(${J(selector)})
  const r = pop.getBoundingClientRect()
  let covered = 0
  const on = []
  for (let i = 1; i <= 6; i++) for (let j = 1; j <= 6; j++) {
    const x = r.left + (r.width * i) / 7, y = r.top + (r.height * j) / 7
    const el = document.elementFromPoint(x, y)
    if (!pop.contains(el)) { covered++; on.push(el?.className?.toString().slice(0, 40)) }
  }
  return JSON.stringify({ covered, on: [...new Set(on)], opacity: getComputedStyle(pop).opacity,
    bg: getComputedStyle(pop).backgroundColor, animations: pop.getAnimations().map((a) => a.playState) })
})()`

async function clickPopButton(ws, label) {
  const ok = await evaluate(
    ws,
    `(() => {
       const b = [...document.querySelectorAll('.sync-pop .sync-pop-btn')].find((x) => x.textContent === ${J(label)})
       b?.click()
       return Boolean(b)
     })()`
  )
  if (!ok) throw new Error(`popover button ${label} not found`)
}

/** Wait for the running operation to finish: its status line is no longer a busy one. */
const waitOutcome = async (ws) => {
  await sleep(150)
  return waitFor(
    ws,
    POP,
    (p) => !p.open || (p.status !== null && !/…$/.test(p.status) && p.listsLoaded),
    30000
  )
}

const closePopovers = (ws) => evaluate(ws, `(document.body.click(), true)`)

/** Let every running CSS animation (popIn, toastIn) finish before reading or shooting. */
const settle = (ws, selector = '.sync-pop, .changes-pop, .toast') =>
  evaluate(
    ws,
    `Promise.race([
       Promise.all([...document.querySelectorAll(${J(selector)})].flatMap((el) => el.getAnimations()).map((a) => a.finished)),
       new Promise((r) => setTimeout(r, 1500))
     ]).then(() => true)`
  )

async function shot(ws, name, { quick = false } = {}) {
  mkdirSync(SHOTS, { recursive: true })
  // A toast lives 2.2 s, so it cannot wait out the settle's worst case.
  if (!quick) await settle(ws)
  await sleep(quick ? 250 : 350)
  const { data } = await send(ws, 'Page.captureScreenshot', { format: 'png' })
  const file = join(SHOTS, name)
  writeFileSync(file, Buffer.from(data, 'base64'))
  console.log(`      saved ${file}`)
}

async function setTheme(ws, theme) {
  await evaluate(
    ws,
    `(() => {
       if (document.documentElement.dataset.theme !== ${J(theme)})
         document.querySelector('.topbar-icon-btn[title^="Switch to"]')?.click()
       return true
     })()`
  )
  await sleep(300)
}

/** Start a Fetch on the selected worktree and close the popover before it answers (STBR-26). */
async function toastFromClosedPopover(ws) {
  await openSync(ws)
  await evaluate(
    ws,
    `(() => {
       [...document.querySelectorAll('.sync-pop .sync-pop-btn')].find((x) => x.textContent === 'Fetch').click()
       document.body.click()
       return true
     })()`
  )
  return waitFor(
    ws,
    `(() => {
       const t = document.querySelector('.toast')
       const b = document.querySelector('footer.status-bar')
       return JSON.stringify(t ? { text: t.textContent, bottom: t.getBoundingClientRect().bottom, barTop: b.getBoundingClientRect().top } : null)
     })()`,
    (v) => v !== null,
    10000
  )
}

// ---------------------------------------------------------------- run

const target = await pageTarget()
const ws = new WebSocket(target.webSocketDebuggerUrl)
await new Promise((resolve, reject) => {
  ws.addEventListener('open', resolve)
  ws.addEventListener('error', reject)
})

// Owner snapshot, before anything changes.
const owner = JSON.parse(
  await evaluate(
    ws,
    `(async () => {
       const cfg = await window.api.invoke('config:get')
       const sel = document.querySelector('.rail-row.selected')
       const title = sel?.title ?? null
       const index = title === null ? 0 : [...document.querySelectorAll('.rail-row')].filter((r) => r.title === title).indexOf(sel)
       return JSON.stringify({ ui: cfg.ui, workspaces: cfg.workspaces, rail: title, railIndex: index })
     })()`
  )
)
const mine = [] // session ids this script spawned
let ownerTreeSelection = null
let registered = false

async function spawn(cwd, title) {
  const id = await evaluate(
    ws,
    `(async () => {
       const v = await window.api.invoke('sessions:spawn', { agentName: 'Ad-hoc', cwd: ${J(cwd)}, adhocCommand: 'pwsh -NoLogo' })
       await window.api.invoke('sessions:rename', { id: v.id, title: ${J(title)} })
       return v.id
     })()`
  )
  mine.push(id)
  return id
}

async function main() {
  seed()
  console.log(`fixture: ${root}`)

  // Register the temp workspace alongside the owner's.
  const entry = { id: wsDir.toLowerCase(), path: wsDir, displayName: basename(wsDir) }
  await evaluate(
    ws,
    `(async () => { await window.api.invoke('config:patch', { workspaces: ${J([...owner.workspaces, entry])} }); return true })()`
  )
  registered = true

  // Remember the owner's tree selection (only visible in Tree).
  await direction(ws, 'Tree')
  ownerTreeSelection = JSON.parse(
    await evaluate(
      ws,
      `(() => {
         const row = document.querySelector('.sidebar-worktree.selected')
         if (!row) return JSON.stringify(null)
         return JSON.stringify({
           workspace: row.closest('.sidebar-workspace')?.querySelector('.sidebar-workspace-name')?.textContent,
           repo: row.closest('.sidebar-repo')?.querySelector('.sidebar-repo-name')?.textContent,
           branch: row.querySelector('.sidebar-worktree-branch')?.textContent
         })
       })()`
    )
  )
  await refresh(ws)

  const tree = JSON.parse(
    await evaluate(
      ws,
      `(async () => {
         const node = (await window.api.invoke('tree:get')).find((w) => w.id === ${J(entry.id)})
         return JSON.stringify(node?.repos?.[0]?.worktrees ?? [])
       })()`
    )
  )
  const pathOf = (branch) => tree.find((w) => w.branch === branch)?.path
  check(
    'the temp workspace lists its four worktrees',
    [LONG_BRANCH, SYNC_BRANCH, PUBLISH_BRANCH, 'main'].every(pathOf),
    tree.map((w) => w.branch.slice(0, 40)).join(', ')
  )

  // --- The long branch in every non-Agents direction (STBR-01, 02, 06) ---
  await selectWorktree(ws, LONG_BRANCH)
  for (const dir of ['Tree', 'Board', 'Workflows']) {
    await direction(ws, dir)
    const b = await waitBar(ws, (v) => v.branchTitle === LONG_BRANCH)
    check(
      `${dir}: the bar describes the tree selection (STBR-01, 02)`,
      b.present && b.repo === 'acme-widget' && b.branchTitle === LONG_BRANCH,
      `${b.repo} · ${b.head?.slice(0, 20)}…${b.tail}`
    )
  }
  await direction(ws, 'Tree')
  const long = await bar(ws)
  check(
    'a long branch is truncated in the middle, full name in title (STBR-06)',
    long.headTruncated === true &&
      long.head + long.tail === LONG_BRANCH &&
      long.tail === '12345-endpoint-with-a-long-name'.slice(-24) &&
      long.branchTitle === LONG_BRANCH,
    `tail "${long.tail}", head truncated ${long.headTruncated}`
  )
  check(
    'the branch element is no wider than half the bar (STBR-06)',
    long.branchWidth <= long.barWidth / 2 + 0.5,
    `${long.branchWidth.toFixed(1)}px of ${long.barWidth.toFixed(1)}px`
  )
  check(
    'the head and tail spans touch, so the name reads without a gap (STBR-06)',
    Math.abs(long.headTailGap) < 0.5,
    `${long.headTailGap.toFixed(1)}px between head and tail`
  )
  check(
    'before a fetch, only the local commit counts (STBR-09, 10)',
    long.sync === '↓0 ↑1',
    long.sync
  )

  // --- Fetch → ↓1 ↑1, both lists (STBR-09, 15, 16, 21, 22) ---
  let pop = await openSync(ws)
  check(
    'a never-fetched repo reads "never" in the popover (STBR-22)',
    pop.fetched === 'Last fetched: never',
    pop.fetched
  )
  await clickPopButton(ws, 'Fetch')
  pop = await waitOutcome(ws)
  const counts = await waitBar(ws, (b) => b.sync === '↓1 ↑1')
  check(
    'a commit pushed from another clone shows ↓1 ↑1 after Fetch (STBR-09, 21)',
    counts.sync === '↓1 ↑1' && pop.status === 'Done.',
    `${counts.sync}; popover "${pop.status}"`
  )
  pop = await waitFor(ws, POP, (p) => p.lists.every((l) => l.commits.length > 0))
  const [toPull, toPush] = pop.lists
  check(
    'the popover lists the commit to pull and the commit to push (STBR-15, 16)',
    toPull?.title === 'To pull' &&
      toPull.commits.map((c) => c.subject).join() === 'Remote fix for the login redirect' &&
      toPush?.title === 'To push' &&
      toPush.commits.map((c) => c.subject).join() === 'Local tweak to the login endpoint',
    JSON.stringify(pop.lists.map((l) => [l.title, l.commits.map((c) => c.subject)]))
  )
  await settle(ws)
  const layer = JSON.parse(await evaluate(ws, TOPMOST('.sync-pop')))
  check(
    'the sync popover is the topmost layer across its whole box, fully opaque',
    layer.covered === 0 && layer.opacity === '1',
    JSON.stringify(layer)
  )
  check(
    'the fetch age now reads a recent time (STBR-22)',
    pop.fetched !== 'Last fetched: never' && /^Last fetched: /.test(pop.fetched ?? ''),
    pop.fetched
  )

  // --- Diverged: Sync refuses with git's fatal line, HEAD unchanged (STBR-18) ---
  const headBefore = git(wtDir.long, 'rev-parse', 'HEAD')
  await clickPopButton(ws, 'Sync')
  pop = await waitOutcome(ws)
  const headAfter = git(wtDir.long, 'rev-parse', 'HEAD')
  check(
    "a diverged Sync shows git's fatal: line inline and keeps the popover open (STBR-18)",
    pop.open && pop.failed && /^fatal: /.test(pop.status ?? ''),
    pop.status ?? '(no status)'
  )
  check(
    'the diverged worktree HEAD is unchanged (STBR-18)',
    headBefore === headAfter,
    headAfter.slice(0, 10)
  )
  await closePopovers(ws)

  // --- Sync both ways on the sync branch (STBR-17, 25) ---
  await selectWorktree(ws, SYNC_BRANCH)
  await openSync(ws)
  await clickPopButton(ws, 'Fetch')
  await waitOutcome(ws)
  let b = await waitBar(ws, (v) => v.sync === '↓1 ↑0')
  check('the sync branch is one behind after Fetch', b.sync === '↓1 ↑0', b.sync)
  await clickPopButton(ws, 'Sync')
  pop = await waitOutcome(ws)
  b = await waitBar(ws, (v) => v.sync === '↓0 ↑0')
  check(
    'Sync pulls the incoming commit, counts back to ↓0 ↑0 (STBR-17, 25)',
    b.sync === '↓0 ↑0' &&
      pop.status === 'Done.' &&
      git(wtDir.sync, 'log', '-1', '--format=%s') === 'Remote change to sync down',
    `${b.sync}; ${pop.status}`
  )
  await closePopovers(ws)
  commit(wtDir.sync, 'up.txt', 'Local change to sync up')
  await refresh(ws)
  b = await waitBar(ws, (v) => v.sync === '↓0 ↑1')
  check('a local commit shows ↓0 ↑1 after a refresh (STBR-11)', b.sync === '↓0 ↑1', b.sync)
  await openSync(ws)
  await clickPopButton(ws, 'Sync')
  pop = await waitOutcome(ws)
  b = await waitBar(ws, (v) => v.sync === '↓0 ↑0')
  const remoteTip = git(root, '--git-dir', originBare, 'rev-parse', `refs/heads/${SYNC_BRANCH}`)
  check(
    'Sync pushes the outgoing commit, counts back to ↓0 ↑0 and the bare remote has it (STBR-17)',
    b.sync === '↓0 ↑0' && remoteTip === git(wtDir.sync, 'rev-parse', 'HEAD'),
    `${b.sync}; remote ${remoteTip.slice(0, 10)}`
  )
  await closePopovers(ws)

  // --- Toast from an operation whose popover closed (STBR-26) ---
  const toast = await toastFromClosedPopover(ws)
  check(
    'an operation finishing after its popover closed reports in a toast (STBR-26)',
    toast !== null && /Fetch finished in sync/.test(toast.text),
    toast?.text ?? '(no toast)'
  )
  check(
    "the toast's bottom sits above the bar's top (STBR-26)",
    toast !== null && toast.bottom <= toast.barTop,
    toast ? `toast bottom ${toast.bottom.toFixed(1)} / bar top ${toast.barTop.toFixed(1)}` : ''
  )

  // --- Publish with two remotes (STBR-12, 19, 20) ---
  await selectWorktree(ws, PUBLISH_BRANCH)
  b = await waitBar(ws, (v) => v.sync === 'no upstream')
  check(
    'a branch without upstream reads "no upstream" as a button (STBR-12)',
    b.sync === 'no upstream' && b.syncTag === 'BUTTON',
    `${b.sync} <${b.syncTag}>`
  )
  pop = await openSync(ws)
  const publishBtn = (p) => p.buttons.find((x) => x.label === 'Publish')
  check(
    'with two remotes Publish is disabled until a remote is chosen (STBR-20)',
    pop.select?.value === '' &&
      pop.select.options.join() === ',backup,origin' &&
      publishBtn(pop)?.disabled === true,
    JSON.stringify({ select: pop.select, publish: publishBtn(pop) })
  )
  await evaluate(
    ws,
    `(() => {
       const s = document.querySelector('select.sync-pop-remote')
       Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, 'value').set.call(s, 'backup')
       s.dispatchEvent(new Event('change', { bubbles: true }))
       return true
     })()`
  )
  pop = await waitFor(ws, POP, (p) => publishBtn(p)?.disabled === false)
  check('choosing a remote enables Publish (STBR-20)', publishBtn(pop)?.disabled === false)
  await clickPopButton(ws, 'Publish')
  pop = await waitOutcome(ws)
  b = await waitBar(ws, (v) => v.sync === '↓0 ↑0')
  let upstream = ''
  try {
    upstream = git(wtDir.pub, 'rev-parse', '--abbrev-ref', '@{upstream}')
  } catch (err) {
    upstream = String(err.stderr ?? err.message).trim()
  }
  check(
    'Publish sets the upstream on the chosen remote and the bar shows counts (STBR-19, 20)',
    pop.status === 'Done.' && upstream === `backup/${PUBLISH_BRANCH}` && b.sync === '↓0 ↑0',
    `${pop.status}; upstream ${upstream}; bar ${b.sync}`
  )
  await closePopovers(ws)

  // --- Changes popover: all five statuses (STBR-29, 30) ---
  await selectWorktree(ws, 'main')
  b = await bar(ws)
  check('the primary checkout counts five changed files (STBR-29)', b.changes === '5', b.changes)
  await evaluate(ws, `(document.querySelector('button.status-bar-changes').click(), true)`)
  const rows = await waitFor(
    ws,
    `JSON.stringify([...document.querySelectorAll('.changes-pop .changes-pop-row')].map((r) => {
       const pill = r.querySelector('.changes-pop-pill')
       return { label: pill?.textContent, cls: pill?.className, path: r.querySelector('.changes-pop-path')?.textContent }
     }))`,
    (v) => v.length > 0
  )
  await settle(ws)
  const changesLayer = JSON.parse(await evaluate(ws, TOPMOST('.changes-pop')))
  check(
    'the changes popover is the topmost layer across its whole box, fully opaque',
    changesLayer.covered === 0 && changesLayer.opacity === '1',
    JSON.stringify(changesLayer)
  )
  const labels = rows.map((r) => r.label).sort()
  check(
    'the changes popover shows Modified, Added, Deleted, Renamed and Untracked (STBR-30)',
    labels.join() === 'Added,Deleted,Modified,Renamed,Untracked' &&
      rows.every((r) => r.cls.includes(r.label.toLowerCase())),
    rows.map((r) => `${r.label}:${r.path}`).join(', ')
  )
  await closePopovers(ws)

  // --- Agents: the session target wins over the tree selection (STBR-03) ---
  await selectWorktree(ws, LONG_BRANCH)
  await spawn(pathOf(SYNC_BRANCH), TARGET_TITLE)
  await spawn(loose, FOLDER_TITLE)
  const subfolder = join(pathOf(SYNC_BRANCH), 'src', 'main')
  mkdirSync(subfolder, { recursive: true })
  await spawn(subfolder, SUBFOLDER_TITLE)
  // A direct-IPC spawn pushes no event; stopping a throwaway session does, and
  // the renderer re-fetches the list (with the renamed titles) on it.
  const dummy = await spawn(loose, DUMMY_TITLE)
  await evaluate(
    ws,
    `(async () => { await window.api.invoke('sessions:stop', { id: ${J(dummy)} }); return true })()`
  )
  await sleep(800)
  const picked = await selectSession(ws, TARGET_TITLE)
  b = await waitBar(ws, (v) => v.branchTitle === SYNC_BRANCH)
  check(
    "Agents: the bar describes the selected session's worktree, not the tree selection (STBR-03)",
    picked && b.branchTitle === SYNC_BRANCH && b.repo === 'acme-widget',
    `${b.branchTitle}`
  )

  // --- Agents: a session outside every worktree (STBR-04) ---
  await selectSession(ws, FOLDER_TITLE)
  b = await waitBar(ws, (v) => v.folder !== null)
  check(
    'a session outside every worktree shows its path, no sync, no counter (STBR-04)',
    b.folder === loose &&
      b.folderTitle === loose &&
      b.note === 'not a worktree' &&
      b.sync === null &&
      b.changes === null,
    JSON.stringify({ folder: b.folder, note: b.note, sync: b.sync, changes: b.changes })
  )

  // --- Agents: a session in a folder inside a worktree describes that worktree (STBR-04) ---
  await selectSession(ws, SUBFOLDER_TITLE)
  b = await waitBar(ws, (v) => v.branchTitle === SYNC_BRANCH)
  check(
    'a session in a folder inside a worktree describes that worktree (STBR-04)',
    b.branchTitle === SYNC_BRANCH && b.folder === null && b.sync !== null,
    JSON.stringify({ branch: b.branchTitle, folder: b.folder, sync: b.sync })
  )

  // --- Screenshots, light and dark ---
  for (const theme of ['light', 'dark']) {
    await setTheme(ws, theme)
    await selectWorktree(ws, LONG_BRANCH)
    await shot(ws, `bar-long-branch-counts-${theme}.png`)
    await openSync(ws)
    await waitFor(ws, POP, (p) => p.lists.every((l) => l.commits.length > 0))
    await shot(ws, `sync-popover-${theme}.png`)
    await closePopovers(ws)
    await selectWorktree(ws, 'main')
    await evaluate(ws, `(document.querySelector('button.status-bar-changes').click(), true)`)
    await waitFor(
      ws,
      `JSON.stringify(document.querySelectorAll('.changes-pop-row').length)`,
      (n) => n === 5
    )
    await shot(ws, `changes-popover-${theme}.png`)
    await closePopovers(ws)
    await selectWorktree(ws, SYNC_BRANCH)
    const t = await toastFromClosedPopover(ws)
    if (t) await shot(ws, `toast-above-bar-${theme}.png`, { quick: true })
    else console.log(`      no toast appeared for the ${theme} screenshot`)
    await sleep(2400)
  }
}

/** Stop and remove this script's sessions through the rail (so the renderer drops them). */
async function removeMySessions() {
  if (mine.length === 0) return
  await evaluate(
    ws,
    `(async () => {
       for (const id of ${J(mine)}) { try { await window.api.invoke('sessions:stop', { id }) } catch {} }
       return true
     })()`
  )
  await sleep(800)
  await direction(ws, 'Agents')
  for (const title of [TARGET_TITLE, FOLDER_TITLE, SUBFOLDER_TITLE, DUMMY_TITLE]) {
    await evaluate(
      ws,
      `(() => {
         const row = [...document.querySelectorAll('.rail-row')].find((r) => (r.title || '').startsWith(${J(title)}))
         row?.querySelector('.rail-row-btn.red')?.click()
         return true
       })()`
    )
    await sleep(400)
  }
  // Belt and braces: anything the rail did not remove goes by IPC.
  await evaluate(
    ws,
    `(async () => {
       const ids = new Set(${J(mine)})
       for (const s of await window.api.invoke('sessions:list')) if (ids.has(s.id)) { try { await window.api.invoke('sessions:remove', { id: s.id }) } catch {} }
       return true
     })()`
  )
}

try {
  await main()
} catch (err) {
  check(
    'the script ran to completion',
    false,
    err.stack?.split('\n').slice(0, 2).join(' ') ?? String(err)
  )
} finally {
  try {
    await closePopovers(ws)
    await removeMySessions()
    if (registered) {
      await evaluate(
        ws,
        `(async () => { await window.api.invoke('config:patch', { workspaces: ${J(owner.workspaces)} }); return true })()`
      )
      await refresh(ws)
    }

    // --- Empty state in every direction, nothing selected (STBR-05) ---
    // Holds only when the owner had no tree selection; the Agents session
    // selection was dropped when this script's selected session was removed.
    if (ownerTreeSelection === null) {
      for (const dir of ['Tree', 'Board', 'Agents', 'Workflows']) {
        await direction(ws, dir)
        const b = await waitBar(ws, (v) => v.empty !== null, 3000)
        check(
          `${dir}: with nothing selected the bar stays mounted and neutral (STBR-05)`,
          b.present && b.empty === 'No worktree selected',
          b.empty ?? JSON.stringify(b)
        )
      }
    } else {
      console.log('SKIP  empty-state checks — the owner had a tree selection to restore')
    }

    // --- Restore the owner's selection, direction and theme ---
    if (ownerTreeSelection) {
      await direction(ws, 'Tree')
      await evaluate(
        ws,
        `(() => {
           const s = ${J(ownerTreeSelection)}
           const wsEl = [...document.querySelectorAll('.sidebar-workspace')].find((w) => w.querySelector('.sidebar-workspace-name')?.textContent === s.workspace)
           const repo = [...(wsEl?.querySelectorAll('.sidebar-repo') ?? [])].find((r) => r.querySelector('.sidebar-repo-name')?.textContent === s.repo)
           const row = [...(repo?.querySelectorAll('.sidebar-worktree') ?? [])].find((r) => r.querySelector('.sidebar-worktree-branch')?.textContent === s.branch)
           row?.click()
           return Boolean(row)
         })()`
      )
    }
    if (owner.rail) await selectSession(ws, owner.rail, owner.railIndex)
    await setTheme(ws, owner.ui.theme)
    await direction(ws, owner.ui.direction[0].toUpperCase() + owner.ui.direction.slice(1))
    await evaluate(
      ws,
      `(async () => { await window.api.invoke('config:patch', { ui: ${J(owner.ui)} }); return true })()`
    )

    const after = JSON.parse(
      await evaluate(
        ws,
        `(async () => {
           const cfg = await window.api.invoke('config:get')
           const ids = new Set(${J(mine)})
           return JSON.stringify({
             ui: cfg.ui,
             workspaces: cfg.workspaces,
             leftover: (await window.api.invoke('sessions:list')).filter((s) => ids.has(s.id)).length,
             rail: document.querySelector('.rail-row.selected')?.title ?? null,
             theme: document.documentElement.dataset.theme
           })
         })()`
      )
    )
    check(
      "the owner's direction, theme, workspaces and Agents selection are restored; no smoke session left",
      after.ui.direction === owner.ui.direction &&
        after.ui.theme === owner.ui.theme &&
        after.theme === owner.ui.theme &&
        J(after.workspaces) === J(owner.workspaces) &&
        after.leftover === 0 &&
        (owner.rail === null || after.rail === owner.rail),
      JSON.stringify({
        direction: after.ui.direction,
        theme: after.ui.theme,
        workspaces: after.workspaces.length,
        leftover: after.leftover
      })
    )
  } catch (err) {
    check('the owner state was restored', false, String(err))
  }
  try {
    rmSync(root, { recursive: true, force: true, maxRetries: 5, retryDelay: 300 })
  } catch (err) {
    console.log(`WARN  could not delete ${root}: ${err.message}`)
  }
  const passed = checks.filter((c) => c.ok).length
  console.log(`\n${passed}/${checks.length} checks passed; screenshots in ${SHOTS}`)
  ws.close()
  process.exit(passed === checks.length ? 0 : 1)
}
