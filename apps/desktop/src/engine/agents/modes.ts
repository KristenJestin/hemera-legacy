/**
 * The permission mode a Session's agent stands on, as Hemera's own tools read it (issue #242).
 *
 * The user picks a mode in the composer, and the agent's own tools follow it: in Auto, Claude runs
 * a command without asking. Hemera's tools follow the same choice, or the user who picked Auto is
 * asked about every one-off line the agent sends through `commands_run`.
 *
 * A port of its own rather than the runtime itself, for the reason `HeldWords` is one: the tools
 * are a service the runtime is built on. The runtime hands its reader over once it exists — what
 * the agent last reported, which is what `current_mode_update` and a choice in the composer both
 * move — and until it does, or in a suite with no agent at all, no mode is known and every
 * question is asked.
 */

import { HEMERA_AUTO_MODE, modeBehaviour } from '@hemera/core'
import { Context, Effect, Layer } from 'effect'

/** The mode a Session's agent stands on now: whose it is, its identifier and its name. */
export interface StandingMode {
  readonly agent: string
  readonly mode: string
  /** The agent's own name for it, which the line in the thread says. */
  readonly name: string
}

/**
 * What a Session's running agent says it is and stands on, as the app tester records it (#300):
 * its version as it gave it at `initialize`, and the value of each option by its category.
 */
export interface StandingAgent {
  readonly version: string | null
  readonly options: readonly { readonly category: string | null; readonly value: string }[]
}

export interface SessionModesService {
  /** The mode this Session's agent stands on now, or null when no agent reports one. */
  readonly standing: (sessionId: string) => Effect.Effect<StandingMode | null>
  /** Hands over what reads it: the runtime's own, called once it is built. */
  readonly heldBy: (read: (sessionId: string) => StandingMode | null) => void
  /** What this Session's running agent is and stands on, or null when none runs. */
  readonly agent: (sessionId: string) => Effect.Effect<StandingAgent | null>
  /** Hands over what reads it, as `heldBy` does. */
  readonly agentHeldBy: (read: (sessionId: string) => StandingAgent | null) => void
}

export class SessionModes extends Context.Service<SessionModes, SessionModesService>()(
  'SessionModes',
) {}

export const sessionModesLayer = Layer.sync(SessionModes, () => {
  let read: ((sessionId: string) => StandingMode | null) | null = null
  let agent: ((sessionId: string) => StandingAgent | null) | null = null
  return {
    standing: (sessionId) => Effect.sync(() => (read === null ? null : read(sessionId))),
    heldBy: (next) => {
      read = next
    },
    agent: (sessionId) => Effect.sync(() => (agent === null ? null : agent(sessionId))),
    agentHeldBy: (next) => {
      agent = next
    },
  } satisfies SessionModesService
})

/**
 * Hemera Auto as a Session stands on it: the application's rule-based mode, one more row of the
 * table in `@hemera/core` (#59). Selected in App Settings, it is every Session's mode for
 * Hemera's tools, whatever the agent reports.
 */
export const HEMERA_AUTO: StandingMode = {
  agent: 'hemera',
  mode: HEMERA_AUTO_MODE,
  name: 'Hemera Auto',
}

/** The mode Hemera's tools follow for a Session: Hemera Auto when selected, else the agent's. */
export function effectiveMode(
  standing: StandingMode | null,
  classifier: 'agent-default' | 'hemera-auto',
): StandingMode | null {
  return classifier === 'hemera-auto' ? HEMERA_AUTO : standing
}

/** Whether a one-off inside the Workspace is asked about in this mode: yes, unless it runs. */
export function modeAsks(standing: StandingMode | null): boolean {
  return modeBehaviour(standing) !== 'runs'
}
