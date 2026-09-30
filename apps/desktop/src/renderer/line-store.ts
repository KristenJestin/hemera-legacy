/**
 * What the reader did to the line of each Session (issue #237): the chips they took out. Held by
 * the window for as long as it is open, so a Session opened again keeps what was taken out of its
 * line; nothing of it is written anywhere.
 */

interface Marks {
  readonly removed: ReadonlySet<string>
}

const NONE: Marks = { removed: new Set() }

let marks: ReadonlyMap<string, Marks> = new Map()
const listeners = new Set<() => void>()

function change(sessionId: string, next: (before: Marks) => Marks): void {
  const updated = new Map(marks)
  updated.set(sessionId, next(marks.get(sessionId) ?? NONE))
  marks = updated
  for (const listener of listeners) listener()
}

export function subscribeToLines(listener: () => void): () => void {
  listeners.add(listener)
  return () => listeners.delete(listener)
}

export function linesSnapshot(): ReadonlyMap<string, Marks> {
  return marks
}

/** What the reader did to one Session's line. */
export function marksOf(sessionId: string, from: ReadonlyMap<string, Marks> = marks): Marks {
  return from.get(sessionId) ?? NONE
}

/** The reader took this chip out of the line; the run stays in the history. */
export function removeFromLine(sessionId: string, id: string): void {
  change(sessionId, (before) => ({ removed: new Set([...before.removed, id]) }))
}
