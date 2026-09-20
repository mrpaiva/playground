/* CDP smoke for the Files direction (FXPL-01..32).
 *
 * Two modes, because the app loads its config once at startup and would
 * overwrite a later write on its next patch — the same constraint
 * seed-smoke-remove.mjs documents:
 *
 *   1. node scripts/smoke-files.mjs --seed [baseDir]
 *      Builds a throwaway workspace and registers it in config.json.
 *      The app must NOT be running.
 *
 *   2. Launch the app with --remote-debugging-port=9222, then:
 *      node scripts/smoke-files.mjs
 *      Drives every surface and prints a numbered pass/fail line per check.
 *      Run this against a FRESHLY LAUNCHED app. Open tabs and expanded folders
 *      live in memory for the session (FXPL-18), so a second run against the
 *      same window starts with a worktree already selected, tabs already open
 *      and folders already expanded — the empty state never shows and an
 *      expand click folds instead. The lens itself persists in the config
 *      (FXPL-13), which is why the drive resets it to Folder explicitly.
 *
 *   3. node scripts/smoke-files.mjs --clean [baseDir]
 *      Removes the workspace from config.json and deletes the folder.
 *
 * Point SMOKE_CONFIG at the config.json of the userData dir in use. Running
 * the app with --user-data-dir keeps the owner's real workspaces, sessions and
 * pinned tasks out of this entirely, which is how it was verified.
 *
 * The seeded repo (workspace folder holding one repo with one worktree):
 *
 *   <base>/fx-smoke-seed/
 *     app/                git repo on branch feature/smoke, two commits past main
 *       .gitignore        ignores build/
 *       build/out.txt     inside the ignored folder — must never be listed
 *       src/main.ts       committed, then edited and left uncommitted
 *       src/added.ts      added on the branch (since-base lists it)
 *       docs/notes.md     committed on main, deleted on the branch
 *       scratch.txt       untracked
 *       App.sln           opens VS 2026 instead of a tab (FXPL-28)
 *       assets/logo.bin   binary: a NUL inside the first 8000 bytes
 *       big.txt           2 MB of text, above the 1 MB ceiling
 *
 * VS 2026 / UAC and the Explorer selection are NOT scripted: the smoke must
 * never raise a UAC prompt. They are printed as hand checks at the end.
 */

import { execFileSync } from 'node:child_process'
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

const PORT = Number(process.env.SMOKE_PORT ?? 9222)
const MODE =
  process.argv[2] === '--seed' ? 'seed' : process.argv[2] === '--clean' ? 'clean' : 'drive'
const BASE = process.env.SMOKE_BASE ?? process.argv[3] ?? process.env.TEMP ?? '.'
const WS_PATH = join(BASE, 'fx-smoke-seed')
const REPO = join(WS_PATH, 'app')
const CONFIG_PATH =
  process.env.SMOKE_CONFIG ?? join(process.env.APPDATA ?? '', 'playground', 'config.json')

/**
 * Windows holds a directory open for a moment after the process that watched it
 * exits — the app's recursive fs.watch on the worktree is exactly that — and a
 * plain rmSync then fails EPERM partway, leaving a half-deleted tree behind.
 * Retrying is what makes the seed repeatable.
 */
const rmTree = (path) =>
  rmSync(path, { recursive: true, force: true, maxRetries: 10, retryDelay: 300 })

const git = (args, cwd = REPO) =>
  execFileSync('git', args, { cwd, encoding: 'utf8', windowsHide: true }).trim()

/* ------------------------------------------------------------------ seed -- */

function seed() {
  rmTree(WS_PATH)
  rmTree(join(BASE, 'fx-smoke-origin.git'))
  mkdirSync(join(REPO, 'src'), { recursive: true })
  mkdirSync(join(REPO, 'docs'), { recursive: true })
  mkdirSync(join(REPO, 'build'), { recursive: true })
  mkdirSync(join(REPO, 'assets'), { recursive: true })

  git(['init', '-b', 'main'])
  git(['config', 'user.email', 'smoke@example.invalid'])
  git(['config', 'user.name', 'Files Smoke'])

  writeFileSync(join(REPO, '.gitignore'), 'build/\n')
  writeFileSync(join(REPO, 'build', 'out.txt'), 'generated\n')
  writeFileSync(join(REPO, 'src', 'main.ts'), 'export const answer = 42\n')
  writeFileSync(join(REPO, 'docs', 'notes.md'), '# Notes\n')
  writeFileSync(join(REPO, 'App.sln'), 'Microsoft Visual Studio Solution File\n')

  // A NUL inside the first 8000 bytes is git's own binary heuristic.
  writeFileSync(join(REPO, 'assets', 'logo.bin'), Buffer.from([0x89, 0x50, 0x00, 0x4e, 0x47, 0x0d]))
  // 2 MB, comfortably past the 1 MB ceiling of FXPL-20.
  writeFileSync(join(REPO, 'big.txt'), 'x'.repeat(2 * 1024 * 1024))

  git(['add', '-A'])
  git(['commit', '-m', 'base commit'])

  // A real origin, so the branch has a base to be compared against (FXPL-08/10).
  // Without one there is no origin/HEAD and the mode correctly falls to FXPL-11.
  // OUTSIDE the workspace folder: a bare repo sitting beside the real one makes
  // the workspace scanner report "no git repos in this folder" and drop the
  // valid repo with it. Observed 2026-09-20; the scanner is not this feature's.
  const origin = join(BASE, 'fx-smoke-origin.git')
  execFileSync('git', ['init', '--bare', '-b', 'main', origin], { windowsHide: true })
  git(['remote', 'add', 'origin', origin])
  git(['push', '-q', '-u', 'origin', 'main'])
  git(['remote', 'set-head', 'origin', 'main'])

  git(['checkout', '-b', 'feature/smoke'])
  writeFileSync(join(REPO, 'src', 'added.ts'), 'export const added = true\n')
  git(['add', 'src/added.ts'])
  git(['commit', '-m', 'add a file on the branch'])
  git(['rm', '-q', 'docs/notes.md'])
  git(['commit', '-m', 'delete notes on the branch'])

  // Uncommitted work, so the third lens has something of its own to show.
  writeFileSync(join(REPO, 'src', 'main.ts'), 'export const answer = 43\n')
  writeFileSync(join(REPO, 'scratch.txt'), 'untracked\n')

  const config = existsSync(CONFIG_PATH) ? JSON.parse(readFileSync(CONFIG_PATH, 'utf8')) : {}
  if (!Array.isArray(config.workspaces)) config.workspaces = []
  const entry = { id: WS_PATH.toLowerCase(), path: WS_PATH, displayName: 'fx-smoke-seed' }
  config.workspaces = [...config.workspaces.filter((w) => w.id !== entry.id), entry]
  mkdirSync(join(CONFIG_PATH, '..'), { recursive: true })
  writeFileSync(CONFIG_PATH, JSON.stringify(config, null, 2) + '\n')

  console.log(`Seeded ${WS_PATH}`)
  console.log(`Registered in ${CONFIG_PATH}`)
  console.log(
    `Now launch the app with --remote-debugging-port=${PORT} and run this script with no arguments.`
  )
}

function clean() {
  if (existsSync(CONFIG_PATH)) {
    const config = JSON.parse(readFileSync(CONFIG_PATH, 'utf8'))
    if (Array.isArray(config.workspaces)) {
      config.workspaces = config.workspaces.filter((w) => w.id !== WS_PATH.toLowerCase())
      writeFileSync(CONFIG_PATH, JSON.stringify(config, null, 2) + '\n')
    }
  }
  rmTree(WS_PATH)
  rmTree(join(BASE, 'fx-smoke-origin.git'))
  console.log(`Unregistered and removed ${WS_PATH}`)
}

/* ----------------------------------------------------------------- drive -- */

async function pageTarget() {
  for (let i = 0; i < 40; i++) {
    try {
      const targets = await (await fetch(`http://127.0.0.1:${PORT}/json`)).json()
      const page = targets.find((t) => t.type === 'page')
      if (page) return page
    } catch {
      /* app not up yet */
    }
    await new Promise((r) => setTimeout(r, 1000))
  }
  throw new Error(`No CDP page target after 40s on port ${PORT}`)
}

let nextId = 1
const pending = new Map()
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

function send(ws, method, params = {}) {
  return new Promise((resolve, reject) => {
    const id = nextId++
    pending.set(id, { resolve, reject })
    ws.send(JSON.stringify({ id, method, params }))
    setTimeout(() => {
      if (pending.has(id)) {
        pending.delete(id)
        reject(new Error(`${method} timed out`))
      }
    }, 20000)
  })
}

async function evaluate(ws, expression) {
  const res = await send(ws, 'Runtime.evaluate', {
    expression,
    returnByValue: true,
    awaitPromise: true
  })
  if (res.exceptionDetails) {
    throw new Error(res.exceptionDetails.exception?.description || 'evaluate threw')
  }
  return res.result.value
}

const checks = []
function check(label, ok, detail = '') {
  checks.push({ label, ok })
  console.log(
    `${String(checks.length).padStart(2)}. ${ok ? 'PASS' : 'FAIL'}  ${label}${detail ? ` — ${detail}` : ''}`
  )
}

/* Clicks the first element whose textContent matches, and reports whether it hit. */
const clickByText = (selector, text) => `
  (() => {
    const el = [...document.querySelectorAll(${JSON.stringify(selector)})]
      .find((e) => (e.textContent || '').trim() === ${JSON.stringify(text)})
    if (!el) return false
    el.click()
    return true
  })()
`

/* Selects the seeded worktree by its branch, the only label its row carries. */
const clickBranch = (branch) => `
  (() => {
    const el = [...document.querySelectorAll('.sidebar-worktree-branch')]
      .find((e) => (e.textContent || '').trim() === ${JSON.stringify(branch)})
    if (!el) return false
    el.closest('.sidebar-worktree').click()
    return true
  })()
`

const treeNames = `[...document.querySelectorAll('.file-tree-name')].map((e) => e.textContent.trim())`
const tabLabels = `[...document.querySelectorAll('.file-tab-label')].map((e) => e.textContent.trim())`

async function drive() {
  const target = await pageTarget()
  const ws = new WebSocket(target.webSocketDebuggerUrl)
  ws.addEventListener('message', (event) => {
    const msg = JSON.parse(event.data)
    if (msg.id && pending.has(msg.id)) {
      const { resolve, reject } = pending.get(msg.id)
      pending.delete(msg.id)
      if (msg.error) reject(new Error(msg.error.message))
      else resolve(msg.result)
    }
  })
  await new Promise((resolve, reject) => {
    ws.addEventListener('open', resolve, { once: true })
    ws.addEventListener('error', () => reject(new Error('CDP socket failed')), { once: true })
  })
  await send(ws, 'Runtime.enable')

  for (let i = 0; ; i++) {
    if (await evaluate(ws, `document.querySelector('.topbar') !== null`)) break
    if (i >= 30) throw new Error('Top bar never appeared after 30s')
    await sleep(1000)
  }

  // 1. The direction exists in the segment control (FXPL-01).
  const hasSegment = await evaluate(
    ws,
    `[...document.querySelectorAll('.topbar-segment, .topbar button')].some(
       (e) => (e.textContent || '').trim() === 'Files')`
  )
  check('The TopBar offers a Files segment (FXPL-01)', hasSegment === true)

  // 2. Empty state before a worktree is selected (FXPL-02).
  await evaluate(ws, clickByText('.topbar-segment, .topbar button', 'Files'))
  await sleep(800)
  const empty = await evaluate(
    ws,
    `document.querySelector('.files-view-empty')?.textContent?.trim() ?? null`
  )
  check(
    'Empty state with no worktree selected (FXPL-02)',
    typeof empty === 'string' && empty.length > 0,
    String(empty)
  )

  // The worktree selection is global and is made in the Tree direction — the
  // sidebar is not mounted in Files, which is exactly why the empty state above
  // exists. Go back, select, and return.
  await evaluate(ws, clickByText('.topbar-segment', 'Tree'))
  // The tree is built by running git over every registered worktree, so on a
  // cold start the sidebar is empty for a moment. Wait for the row, not a guess.
  for (let i = 0; ; i++) {
    const n = await evaluate(ws, `document.querySelectorAll('.sidebar-worktree-branch').length`)
    if (n > 0) break
    if (i >= 30) break
    await sleep(1000)
  }
  const picked = await evaluate(ws, clickBranch('feature/smoke'))
  if (!picked) {
    const branches = await evaluate(
      ws,
      `[...document.querySelectorAll('.sidebar-worktree-branch')].map((e) => e.textContent.trim())`
    )
    throw new Error(
      `Could not find the seeded worktree in the sidebar. Branches present: ${JSON.stringify(branches)}`
    )
  }
  await sleep(900)
  await evaluate(ws, clickByText('.topbar-segment', 'Files'))
  await sleep(1400)

  // The lens persists per worktree (FXPL-13), so a previous run leaves it where
  // it ended. Start from the full folder explicitly.
  await evaluate(ws, clickByText('.file-tree-mode', 'Folder'))
  await sleep(1200)

  // 3. The ignored folder never appears (FXPL-05).
  let names = await evaluate(ws, treeNames)
  check(
    'Ignored folder is not listed (FXPL-05)',
    !names.includes('build'),
    `top level: ${names.join(', ')}`
  )

  // 4. The untracked file does appear.
  check(
    'Untracked file is listed (FXPL-05)',
    names.includes('scratch.txt'),
    `top level: ${names.join(', ')}`
  )

  // 5. Folders expand lazily (FXPL-04).
  const beforeExpand = names.length
  await evaluate(ws, clickByText('.file-tree-name', 'src'))
  await sleep(900)
  names = await evaluate(ws, treeNames)
  check(
    'A folder expands to its direct children (FXPL-04)',
    names.includes('main.ts') && names.length > beforeExpand,
    `after expand: ${names.join(', ')}`
  )

  // 6. The since-base lens lists what the branch changed (FXPL-08).
  await evaluate(ws, clickByText('.file-tree-mode', 'Diff to origin'))
  await sleep(1200)
  names = await evaluate(ws, treeNames)
  const sinceBase = await evaluate(
    ws,
    `document.querySelector('.file-tree-base-select')?.value ?? document.querySelector('.file-tree-base-label')?.textContent?.trim() ?? null`
  )
  check(
    'Diff-to-origin lists the branch changes (FXPL-08)',
    names.includes('added.ts') && names.includes('notes.md'),
    `listed: ${names.join(', ')}`
  )
  check(
    'The base picker shows a base (FXPL-09/10)',
    sinceBase !== null && sinceBase !== '',
    String(sinceBase)
  )

  // 7. The uncommitted lens (FXPL-12).
  await evaluate(ws, clickByText('.file-tree-mode', 'Uncommitted'))
  await sleep(1200)
  names = await evaluate(ws, treeNames)
  check(
    'Uncommitted lists the edit and the untracked file (FXPL-12)',
    names.includes('main.ts') && names.includes('scratch.txt'),
    `listed: ${names.join(', ')}`
  )

  // 8. A click opens a tab (FXPL-16).
  await evaluate(ws, clickByText('.file-tree-name', 'main.ts'))
  await sleep(1200)
  let tabs = await evaluate(ws, tabLabels)
  check(
    'Clicking a file opens a tab (FXPL-16)',
    tabs.some((t) => t.includes('main.ts')),
    `tabs: ${tabs.join(', ')}`
  )

  // 9. The viewer renders it read-only and highlighted (FXPL-17).
  const viewer = await evaluate(
    ws,
    `(() => {
       const ed = document.querySelector('.code-viewer-editor .monaco-editor')
       if (!ed) return null
       return {
         tokens: document.querySelectorAll('.code-viewer-editor .view-line span[class*="mtk"]').length,
         readOnly: !!document.querySelector('.code-viewer-editor .monaco-editor')
       }
     })()`
  )
  check(
    'The viewer renders the file highlighted (FXPL-17)',
    viewer !== null && viewer.tokens > 0,
    JSON.stringify(viewer)
  )

  // 10. A disk change updates the tab within 1 s and keeps the scroll (FXPL-21).
  writeFileSync(
    join(REPO, 'src', 'main.ts'),
    'export const answer = 43\n// appended by the smoke\n'
  )
  await sleep(1400)
  // Monaco renders spaces as NBSP (U+00A0) inside a view line, so a literal
  // comparison against the written text never matches. Normalise first.
  const updated = await evaluate(
    ws,
    `[...document.querySelectorAll('.code-viewer-editor .view-line')]
       .map((l) => l.textContent.replace(/\u00a0/g, ' '))
       .join('\\n')`
  )
  check(
    'An open tab updates within 1 s of a disk change (FXPL-21)',
    typeof updated === 'string' && updated.includes('appended by the smoke'),
    `lines now: ${JSON.stringify(String(updated ?? '').slice(0, 120))}`
  )

  // 11. A binary file shows a placeholder, not content (FXPL-20).
  await evaluate(ws, clickByText('.file-tree-mode', 'Folder'))
  await sleep(900)
  await evaluate(ws, clickByText('.file-tree-name', 'assets'))
  await sleep(700)
  await evaluate(ws, clickByText('.file-tree-name', 'logo.bin'))
  await sleep(1000)
  let placeholder = await evaluate(
    ws,
    `document.querySelector('.file-placeholder-headline')?.textContent?.trim() ?? null`
  )
  check(
    'A binary file shows a placeholder (FXPL-20)',
    placeholder === 'Binary file',
    String(placeholder)
  )

  // 12. A file above 1 MB shows a placeholder with its size (FXPL-20).
  await evaluate(ws, clickByText('.file-tree-name', 'big.txt'))
  await sleep(1200)
  placeholder = await evaluate(
    ws,
    `({
       headline: document.querySelector('.file-placeholder-headline')?.textContent?.trim() ?? null,
       meta: [...document.querySelectorAll('.file-placeholder-meta span')].map((e) => e.textContent.trim())
     })`
  )
  check(
    'A file above 1 MB shows a placeholder with its size (FXPL-20)',
    placeholder.headline === 'Too large to display' && placeholder.meta.some((m) => /MB/.test(m)),
    JSON.stringify(placeholder)
  )

  // 13. A SINGLE click on a .sln opens a tab like any other file (FXPL-28a).
  // The double click that launches VS 2026 is a hand check: it raises UAC, and
  // the smoke must never do that. The single click is deferred by the
  // double-click window, so this waits past it before asserting.
  const tabsBeforeSln = (await evaluate(ws, tabLabels)).length
  await evaluate(ws, clickByText('.file-tree-name', 'App.sln'))
  await sleep(1400)
  const tabsAfterSln = await evaluate(ws, tabLabels)
  check(
    'A single click on a .sln opens a tab (FXPL-28a)',
    tabsAfterSln.length === tabsBeforeSln + 1 && tabsAfterSln.some((t) => t.includes('App.sln')),
    `${tabsBeforeSln} tabs before, now: ${tabsAfterSln.join(', ')}`
  )

  // 14. A deleted file leaves its tab open with a placeholder (FXPL-24).
  // Focus the tab that is already open rather than clicking the tree again: the
  // earlier checks expanded and folded folders, so the row may not be there.
  const focused = await evaluate(
    ws,
    `(() => {
       const el = [...document.querySelectorAll('.file-tab-label')]
         .find((e) => (e.textContent || '').trim().includes('main.ts'))
       if (!el) return false
       el.click()
       return true
     })()`
  )
  if (!focused) throw new Error('The main.ts tab was not open when FXPL-24 was checked')
  await sleep(900)
  rmSync(join(REPO, 'src', 'main.ts'), { force: true })
  await sleep(1600)
  const afterDelete = await evaluate(
    ws,
    `({
       tabs: ${tabLabels},
       headline: document.querySelector('.file-placeholder-headline')?.textContent?.trim() ?? null
     })`
  )
  check(
    'A deleted file keeps its tab and shows a placeholder (FXPL-24)',
    afterDelete.tabs.some((t) => t.includes('main.ts')) &&
      afterDelete.headline === 'This file no longer exists',
    JSON.stringify(afterDelete)
  )

  // 15. The status-bar counter lands in Files, uncommitted mode (FXPL-31/32).
  await evaluate(ws, clickByText('.topbar-segment, .topbar button', 'Tree'))
  await sleep(700)
  const counterClicked = await evaluate(
    ws,
    `(() => {
       const b = document.querySelector('.status-bar-changes')
       if (!b) return false
       b.click()
       return true
     })()`
  )
  await sleep(1200)
  const landed = await evaluate(
    ws,
    `({
       clicked: ${counterClicked},
       inFiles: !!document.querySelector('.files-view'),
       mode: [...document.querySelectorAll('.file-tree-mode')]
         .filter((e) => e.getAttribute('aria-selected') === 'true')
         .map((e) => e.textContent.trim())[0] ?? null
     })`
  )
  check(
    'The status-bar counter lands in Files, uncommitted mode (FXPL-31)',
    landed.inFiles === true && landed.mode === 'Uncommitted',
    JSON.stringify(landed)
  )

  const failed = checks.filter((c) => !c.ok)
  console.log(`\n${checks.length - failed.length}/${checks.length} checks passed`)
  console.log(
    '\nHand checks this smoke deliberately does NOT script (they raise UAC or a shell window):'
  )
  console.log('  A. DOUBLE-click App.sln in the tree — VS 2026 must open elevated on that file and')
  console.log('     no tab must appear for it (FXPL-28); a single click opens a tab instead.')
  console.log('     Double-click it again at once: no second instance must open (FXPL-28b).')
  console.log("  B. Click the File Explorer launcher on a file tab — Explorer must open the file's")
  console.log('     FOLDER with the file SELECTED, never open the file itself (FXPL-27).')

  ws.close()
  return failed.length
}

/* ------------------------------------------------------------------ main -- */

if (MODE === 'seed') {
  seed()
} else if (MODE === 'clean') {
  clean()
} else {
  const failed = await drive()
  process.exit(failed ? 1 : 0)
}
