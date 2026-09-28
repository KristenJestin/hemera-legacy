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

import type { AgentProvider } from '@hemera/core'
import { Context, Effect, Layer } from 'effect'

/** The mode a Session's agent stands on now: whose it is, its identifier and its name. */
export interface StandingMode {
  readonly agent: string
  readonly mode: string
  /** The agent's own name for it, which the line in the thread says. */
  readonly name: string
}

export interface SessionModesService {
  /** The mode this Session's agent stands on now, or null when no agent reports one. */
  readonly standing: (sessionId: string) => Effect.Effect<StandingMode | null>
  /** Hands over what reads it: the runtime's own, called once it is built. */
  readonly heldBy: (read: (sessionId: string) => StandingMode | null) => void
}

export class SessionModes extends Context.Service<SessionModes, SessionModesService>()(
  'SessionModes',
) {}

export const sessionModesLayer = Layer.sync(SessionModes, () => {
  let read: ((sessionId: string) => StandingMode | null) | null = null
  return {
    standing: (sessionId) => Effect.sync(() => (read === null ? null : read(sessionId))),
    heldBy: (next) => {
      read = next
    },
  } satisfies SessionModesService
})

/**
 * Every mode each agent reports, and whether a one-off inside the Workspace is asked about in it.
 *
 * `runs` is a mode in which the agent's own tools run a command without asking; every other mode
 * asks. The identifiers are the agents' own, as their adapters announce them:
 *
 * - Claude (`claude-agent-acp`): Manual (`default`), Accept edits and Plan ask, and so does
 *   `dontAsk`, which refuses what was not approved beforehand rather than running it. Accept edits
 *   lets the agent's own file edits through, not its commands. Auto and Bypass permissions run.
 * - Codex (`codex-acp`): Ask for approval (`read-only`) asks; Approve for me (`agent`) and Full
 *   access run.
 * - OpenCode: offers no mode of its own under Hemera (issue #128), so there is nothing to follow
 *   and it asks; its `build`, `plan` and `hemera` are listed so that saying so is a decision.
 *
 * A mode missing from this table — a new one, or an agent this table does not know — asks.
 */
const MODES: Readonly<Record<AgentProvider, ReadonlyMap<string, 'asks' | 'runs'>>> = {
  claude: new Map([
    ['default', 'asks'],
    ['acceptEdits', 'asks'],
    ['plan', 'asks'],
    ['dontAsk', 'asks'],
    ['auto', 'runs'],
    ['bypassPermissions', 'runs'],
  ]),
  codex: new Map([
    ['read-only', 'asks'],
    ['agent', 'runs'],
    ['agent-full-access', 'runs'],
  ]),
  opencode: new Map([
    ['build', 'asks'],
    ['plan', 'asks'],
    ['hemera', 'asks'],
  ]),
}

/** Whether a one-off inside the Workspace is asked about in this mode: yes, unless it is known. */
export function modeAsks(standing: StandingMode | null): boolean {
  if (standing === null) return true
  const known = Object.entries(MODES).find(([agent]) => agent === standing.agent)?.[1]
  return known?.get(standing.mode) !== 'runs'
}
