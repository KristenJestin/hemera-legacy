import type { EngineEvent, HelperView, SessionEntry } from '@hemera/ipc'

import { threadOf } from './sessions-store.ts'

/**
 * The helpers of the build Session on screen (issue #77), as the engine answers them: read when
 * the Session opens, again whenever the engine pushes `helpers.changed` for it, and as the user's
 * × leaves them. A helper's thread is read when its dialog opens; what its agent says after that
 * arrives as any Session's entries do, in the agent store.
 *
 * The window never launches a helper and never talks to one: it reads them, and stops one.
 */
export interface HelpersState {
  /** The build Session whose helpers these are, or null while none is open. */
  sessionId: string | null
  helpers: readonly HelperView[]
  /** The threads read back, by helper, oldest first. */
  threads: ReadonlyMap<string, readonly SessionEntry[]>
}

const EMPTY: HelpersState = { sessionId: null, helpers: [], threads: new Map() }

const listeners = new Set<() => void>()

let state: HelpersState = EMPTY

export function subscribeToHelpers(listener: () => void): () => void {
  listeners.add(listener)
  return () => listeners.delete(listener)
}

export function helpersSnapshot(): HelpersState {
  return state
}

function replace(next: HelpersState): void {
  state = next
  for (const listener of listeners) listener()
}

/** How many reads were started: a read overtaken by a later one never lands. */
let started = 0

async function read(sessionId: string): Promise<void> {
  started += 1
  const ticket = started
  try {
    const answered = await window.hemera.invoke('helpers.list', { sessionId })
    if (ticket !== started || state.sessionId !== sessionId) return
    replace({ ...state, helpers: answered.helpers })
  } catch {
    // A list that cannot be read now is read again at the next change.
  }
}

/** The helpers of a build Session, put on screen. */
export async function openHelpers(sessionId: string): Promise<void> {
  replace({ sessionId, helpers: [], threads: new Map() })
  await read(sessionId)
}

export function closeHelpers(): void {
  replace(EMPTY)
}

/** Reads a helper's thread, for its dialog. */
export async function readHelperThread(helperId: string): Promise<void> {
  try {
    const entries = await threadOf(helperId)
    const threads = new Map(state.threads)
    threads.set(helperId, entries)
    replace({ ...state, threads })
  } catch {
    // Its dialog draws what this window heard of it since it opened.
  }
}

/** The user's ×: the helper is stopped and the main agent told; the line reads what it left. */
export async function stopHelper(helperId: string): Promise<void> {
  try {
    const answered = await window.hemera.invoke('helpers.stop', { sessionId: helperId })
    replace({ ...state, helpers: answered.helpers })
  } catch {
    // The next change reads them again.
  }
}

/** Listens for `helpers.changed`, once for the whole window. */
export function listenToHelpers(): () => void {
  return window.hemera.on((event: EngineEvent) => {
    if (event.event !== 'helpers.changed') return
    if (event.sessionId === state.sessionId) void read(event.sessionId)
  })
}
