/**
 * Helper agents (issue #77): the agents a build Session's main agent launches, stops and reads
 * through Hemera's tools. A helper is a child Session — hidden from the sidebar, read-only for the
 * user, attached to the Session that launched it — and runs one piece of work: a defined helper
 * with a role written in advance (`protocols/helpers/`), or a free helper with the brief its
 * launcher wrote.
 */

/**
 * How deep helpers go: the main agent's helpers, and their own (#77). A helper at this depth is
 * offered no `helper_launch`, so a runaway chain cannot fill the pool.
 */
export const HELPER_DEPTH = 2

/**
 * How many helpers of one build may run at once, at any depth, as the Project's setting takes it:
 * the least and the most it accepts, and what a Project holds until the user changes it. A launch
 * above it is refused, never queued: the main agent decides what to do instead.
 */
export const HELPERS_AT_ONCE = { least: 1, most: 6, initial: 3 } as const

/**
 * Where a helper stands: `running` from its launch until its work settles, then `done` with its
 * result, `stopped` by its launcher or the user, or `failed` when its agent died or its turn
 * failed.
 */
export const HELPER_STATES = ['running', 'done', 'stopped', 'failed'] as const

export type HelperState = (typeof HELPER_STATES)[number]

/** What makes a Session a helper: who launched it, what it runs, how deep it stands. */
export interface HelperPlace {
  /** The Session that launched it: the build Session, or another helper. */
  readonly parentSessionId: string
  /** The definition it runs, by its id (`review-tests`), or null for a free helper. */
  readonly definition: string | null
  /** 1 for a helper of the main agent, 2 for a helper of a helper. */
  readonly depth: number
  /** The build task it was launched on, by its label (T2), or null for a helper tied to none. */
  readonly task: string | null
}

/**
 * A message written into a helper's Session: refused, because a helper is read-only for the user
 * (issue #77). What the user has to say goes to the main agent, which dispatches it.
 */
export class HelperReadOnlyError extends Error {
  constructor() {
    super('A helper is read-only: write to the main agent instead.')
    this.name = 'HelperReadOnlyError'
  }
}

export class InvalidHelpersAtOnceError extends Error {
  constructor(value: number) {
    super(
      `Helpers at once takes a whole number from ${HELPERS_AT_ONCE.least} to ${HELPERS_AT_ONCE.most}, not ${value}.`,
    )
    this.name = 'InvalidHelpersAtOnceError'
  }
}

/** The number of helpers a Project lets run at once, refusing what the setting does not take. */
export function helpersAtOnce(value: number): number {
  if (!Number.isInteger(value) || value < HELPERS_AT_ONCE.least || value > HELPERS_AT_ONCE.most) {
    throw new InvalidHelpersAtOnceError(value)
  }
  return value
}
