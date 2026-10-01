/**
 * What the reader did to the line of each Session (issue #237): the chips they took out. Held by
 * the window for as long as it is open, so a Session opened again keeps what was taken out of its
 * line; nothing of it is written anywhere.
 *
 * And what leaves it on its own (issue #321): an agent's one-off, 30 s after it ended, as if its ×
 * had been pressed — unless it was taken out meanwhile, and once its glance is closed when it is
 * open. The timers live as long as the window and survive nothing: a Session opened again finds
 * an ended one-off gone already (#237).
 */

import { ONE_OFF_LINGERS_MS } from './session-details.ts'

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

/** The runs whose leaving is set, by Session and run: set once, whatever renders after. */
const leaving = new Set<string>()
/** The glances open, by Session and chip. */
const glancing = new Set<string>()
/** What came due while its glance was open: it leaves when the glance closes. */
const due = new Set<string>()

const keyOf = (sessionId: string, id: string) => `${sessionId}\u0000${id}`

/** A chip leaves the line on its own, unless the reader took it out first. */
function leave(sessionId: string, id: string): void {
  if (marksOf(sessionId).removed.has(id)) return
  removeFromLine(sessionId, id)
}

/**
 * Each ended one-off of the agent leaves this Session's line 30 s after its end (#321). Called with
 * what the line holds every time it is drawn: a run already set is not set again, so a render
 * never starts its 30 s over.
 */
export function leaveOnTheirOwn(
  sessionId: string,
  ended: readonly { readonly id: string; readonly endedAt: number }[],
): void {
  for (const { id, endedAt } of ended) {
    const key = keyOf(sessionId, id)
    if (leaving.has(key) || marksOf(sessionId).removed.has(id)) continue
    leaving.add(key)
    setTimeout(
      () => {
        if (glancing.has(key)) due.add(key)
        else leave(sessionId, id)
      },
      Math.max(0, endedAt + ONE_OFF_LINGERS_MS - Date.now()),
    )
  }
}

/** The reader opened a chip's glance: it is not taken from under them. */
export function glanceOpened(sessionId: string, id: string): void {
  glancing.add(keyOf(sessionId, id))
}

/** The reader closed a chip's glance: what came due meanwhile leaves now. */
export function glanceClosed(sessionId: string, id: string): void {
  const key = keyOf(sessionId, id)
  glancing.delete(key)
  if (due.delete(key)) leave(sessionId, id)
}
