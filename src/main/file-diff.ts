import type { Eol } from '../shared/files'

/** What `lineEndingChanges` found: which modified lines flipped, and each side's dominant ending. */
export interface EolChanges {
  /** Modified-side line numbers, 1-based, whose terminator differs from the matching original line. */
  lines: number[]
  /** The original side's dominant terminator; absent when that side has none at all. */
  from?: Eol
  /** The modified side's dominant terminator; absent when that side has none at all. */
  to?: Eol
}

/** One line as the raw bytes carry it: its text, and the terminator that ended it. */
interface RawLine {
  text: string
  /** `'\r\n'`, `'\n'`, `'\r'`, or `''` for a last line that ends with the file. */
  eol: string
}

/**
 * Which lines changed line ending between the two sides of a diff (FDIF-15).
 *
 * This exists because Monaco cannot answer it. Its models keep their own
 * terminators, but its *diff* normalizes: a CRLF side against a byte-identical
 * LF side reports zero changes (F2 spike, finding 1). So a whole-file flip
 * would read as "nothing changed" unless main compares the raw text itself.
 *
 * Pure. `originalRaw` and `modifiedRaw` are the sides as they were read —
 * `git show`'s or the disk's own bytes, decoded but never normalized.
 *
 * Lines are matched by the run of identical text at the top and at the bottom
 * of the two sides. Whatever the text change itself added or removed sits
 * between those runs and is never reported: a line that is not on both sides
 * has no terminator to have changed.
 */
export function lineEndingChanges(originalRaw: string, modifiedRaw: string): EolChanges {
  const original = splitLines(originalRaw)
  const modified = splitLines(modifiedRaw)
  const lines: number[] = []

  let prefix = 0
  while (
    prefix < original.length &&
    prefix < modified.length &&
    original[prefix].text === modified[prefix].text
  ) {
    if (original[prefix].eol !== modified[prefix].eol) lines.push(prefix + 1)
    prefix += 1
  }

  let suffix = 0
  while (
    suffix < original.length - prefix &&
    suffix < modified.length - prefix &&
    original[original.length - 1 - suffix].text === modified[modified.length - 1 - suffix].text
  ) {
    suffix += 1
  }
  // Counting down keeps the reported numbers ascending, and every one of them
  // is past `prefix`, so no line is reported twice.
  for (let back = suffix; back >= 1; back -= 1) {
    if (original[original.length - back].eol !== modified[modified.length - back].eol) {
      lines.push(modified.length - back + 1)
    }
  }

  return { lines, from: dominantEol(original), to: dominantEol(modified) }
}

/**
 * Splits raw text into lines, keeping each line's own terminator. A trailing
 * terminator ends the last line rather than starting an empty one, so `'a\n'`
 * is one line and `'a\nb'` is two.
 */
function splitLines(raw: string): RawLine[] {
  const lines: RawLine[] = []
  let start = 0
  let i = 0
  while (i < raw.length) {
    const ch = raw[i]
    if (ch === '\n') {
      lines.push({ text: raw.slice(start, i), eol: '\n' })
      i += 1
    } else if (ch === '\r') {
      const crlf = raw[i + 1] === '\n'
      lines.push({ text: raw.slice(start, i), eol: crlf ? '\r\n' : '\r' })
      i += crlf ? 2 : 1
    } else {
      i += 1
      continue
    }
    start = i
  }
  if (start < raw.length) lines.push({ text: raw.slice(start), eol: '' })
  return lines
}

/** The terminator most of a side's lines use — what the strip names (FDIF-15). */
function dominantEol(lines: RawLine[]): Eol | undefined {
  let crlf = 0
  let lf = 0
  let cr = 0
  for (const line of lines) {
    if (line.eol === '\r\n') crlf += 1
    else if (line.eol === '\n') lf += 1
    else if (line.eol === '\r') cr += 1
  }
  if (crlf === 0 && lf === 0 && cr === 0) return undefined
  if (crlf >= lf && crlf >= cr) return 'CRLF'
  if (lf >= cr) return 'LF'
  return 'CR'
}
