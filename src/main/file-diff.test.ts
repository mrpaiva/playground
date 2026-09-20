import { describe, expect, it } from 'vitest'
import { lineEndingChanges } from './file-diff'

describe('lineEndingChanges', () => {
  it('reports every line of a whole-file CRLF to LF flip', () => {
    // FDIF-15 / spike finding 1: Monaco's diff calls this "no changes", so main
    // must name every line, or the flip is invisible to the user.
    const original = 'alpha\r\nbeta\r\ngamma\r\n'
    const modified = 'alpha\nbeta\ngamma\n'

    expect(lineEndingChanges(original, modified)).toEqual({
      lines: [1, 2, 3],
      from: 'CRLF',
      to: 'LF'
    })
  })

  it('reports only the 4 CRLF lines of a mixed file flipped to pure LF', () => {
    const texts = Array.from({ length: 719 }, (_, i) => `line ${i + 1}`)
    const crlfLines = new Set([100, 200, 300, 400])
    const original = texts.map((t, i) => t + (crlfLines.has(i + 1) ? '\r\n' : '\n')).join('')
    const modified = texts.map((t) => `${t}\n`).join('')

    expect(lineEndingChanges(original, modified).lines).toEqual([100, 200, 300, 400])
  })

  it('reports nothing when the endings match, even where the text changed', () => {
    const original = 'alpha\nbeta\ngamma\n'
    const modified = 'alpha\nBETA rewritten\ngamma\n'

    expect(lineEndingChanges(original, modified).lines).toEqual([])
  })

  it('names a CR-only side as CR', () => {
    const original = 'alpha\rbeta\rgamma\r'
    const modified = 'alpha\nbeta\ngamma\n'

    const changes = lineEndingChanges(original, modified)

    expect(changes.from).toBe('CR')
    expect(changes.lines).toEqual([1, 2, 3])
  })

  it('counts a last line that gained a terminator as changed', () => {
    const original = 'alpha\nbeta'
    const modified = 'alpha\nbeta\n'

    expect(lineEndingChanges(original, modified).lines).toEqual([2])
  })

  it('leaves out a line the text change added, and keeps the surviving ones', () => {
    // The inserted line exists on one side only, so it has no terminator to
    // have changed; the three lines that survive the edit all flipped.
    const original = 'alpha\r\nbeta\r\ngamma\r\n'
    const modified = 'alpha\ninserted\nbeta\ngamma\n'

    expect(lineEndingChanges(original, modified).lines).toEqual([1, 3, 4])
  })
})
