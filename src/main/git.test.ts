import { tmpdir } from 'node:os'
import { describe, expect, it } from 'vitest'
import { git, gitFailureLine, isTimeout } from './git'

/** The rejection `git()` produces, so the helpers are exercised against execFile's real error shape. */
async function rejectionOf(promise: Promise<unknown>): Promise<unknown> {
  try {
    await promise
  } catch (err) {
    return err
  }
  throw new Error('expected the git call to fail')
}

describe('gitFailureLine', () => {
  it("returns git's first non-empty stderr line, trimmed", () => {
    const err = Object.assign(new Error('Command failed: git pull'), {
      stderr: '\r\n  fatal: Not possible to fast-forward, aborting.\r\nhint: second line\r\n'
    })
    expect(gitFailureLine(err)).toBe('fatal: Not possible to fast-forward, aborting.')
  })

  it("falls back to the Error message's first line when stderr is empty", () => {
    const err = Object.assign(new Error('spawn git ENOENT\n    at stack'), { stderr: '  \n' })
    expect(gitFailureLine(err)).toBe('spawn git ENOENT')
  })

  it('stringifies a thrown value that is not an Error', () => {
    expect(gitFailureLine('plain failure')).toBe('plain failure')
  })
})

describe('isTimeout', () => {
  it('is true when git() kills the process because timeoutMs elapsed', async () => {
    // `hash-object --stdin` waits on a stdin execFile never closes, so only the timeout ends it.
    const err = await rejectionOf(git(tmpdir(), ['hash-object', '--stdin'], { timeoutMs: 200 }))
    expect(isTimeout(err)).toBe(true)
  })

  it('is false for a plain non-zero git exit', async () => {
    const err = await rejectionOf(git(tmpdir(), ['rev-parse', '--verify', 'no-such-ref']))
    expect(isTimeout(err)).toBe(false)
  })

  it('is false for a value that is not an error object', () => {
    expect(isTimeout('timed out')).toBe(false)
    expect(isTimeout(null)).toBe(false)
  })
})
