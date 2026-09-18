import { win32 as path } from 'node:path'
import type { PathKind, ProbeResult } from '../shared/links'

/** Every OS touch the opener makes, injected so the unit tests run on fakes (no spawn, no fs). */
export interface LinkOpenerDeps {
  homedir(): string
  stat(path: string): Promise<{ isDirectory(): boolean }>
  /** `shell.openPath`: resolves with '' on success, an error message otherwise. */
  openPath(path: string): Promise<string>
  openExternal(url: string): Promise<void>
  spawnDetached(command: string, args: string[]): Promise<boolean>
  /** Whether Windows associates an app with the extension (leading dot included). */
  hasAssociation(ext: string): Promise<boolean>
}

/** Candidates past this many in one probe are reported missing without a stat (design §Risks). */
export const PROBE_BATCH_LIMIT = 32

/**
 * Resolves, stats and opens what the terminal links point at — the only place
 * that validates URL schemes and touches the OS on a link's behalf (design
 * §LinkOpener). Renderer sends text; main decides.
 */
export class LinkOpener {
  constructor(private readonly deps: LinkOpenerDeps) {}

  /** `~/` → home, relative → against cwd; null unless the result is absolute (LINK-12, LINK-29). */
  resolveCandidate(cwd: string, pathText: string): string | null {
    const expanded = /^~[\\/]/.test(pathText)
      ? path.join(this.deps.homedir(), pathText.slice(2))
      : pathText
    const resolved = path.isAbsolute(expanded) ? path.normalize(expanded) : path.join(cwd, expanded)
    return path.isAbsolute(resolved) ? resolved : null
  }

  async probe(cwd: string, paths: string[]): Promise<ProbeResult[]> {
    return Promise.all(
      paths.map(async (pathText, index): Promise<ProbeResult> => {
        const absolutePath = index < PROBE_BATCH_LIMIT ? this.resolveCandidate(cwd, pathText) : null
        const kind = absolutePath ? await this.kindOf(absolutePath) : 'missing'
        return { pathText, absolutePath, kind }
      })
    )
  }

  private async kindOf(absolutePath: string): Promise<PathKind> {
    try {
      return (await this.deps.stat(absolutePath)).isDirectory() ? 'dir' : 'file'
    } catch {
      return 'missing'
    }
  }
}
