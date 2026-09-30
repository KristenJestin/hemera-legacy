/**
 * The permission modes each agent reports, and how Hemera's own tools follow them (issues #242,
 * #59): one table for Agent default and Hemera Auto alike.
 *
 * - `asks`: a permission mode in which a one-off inside the Workspace is asked about.
 * - `runs`: a permission mode in which the agent's own tools run a command without asking, and so
 *   do Hemera's.
 * - `rules`: Hemera Auto, the application's rule-based mode: its local rules and its judge decide,
 *   and what they cannot decide is asked.
 * - `unrelated`: a mode that is no permission — Claude's plan, or which OpenCode agent answers —
 *   left to the agent under either classifier; Hemera's tools ask in it.
 *
 * The identifiers are the agents' own, as their adapters announce them:
 *
 * - Claude (`claude-agent-acp`): Manual (`default`), Accept edits and `dontAsk` ask — `dontAsk`
 *   refuses what was not approved beforehand rather than running it, and Accept edits lets the
 *   agent's own file edits through, not its commands. Auto and Bypass permissions run. Plan is a
 *   way of working, not a permission.
 * - Codex (`codex-acp`): Ask for approval (`read-only`) asks; Approve for me (`agent`) and Full
 *   access run.
 * - OpenCode: offers no permission mode under Hemera (issue #128); its `build`, `plan` and
 *   `hemera` are which agent answers, listed so that saying so is a decision.
 *
 * Each agent's modes are listed with the one it asks in first: that is the mode Hemera Auto puts a
 * Session back on when it stands on another permission mode. A mode missing from this table — a
 * new one, or an agent this table does not know — asks.
 */

import type { AgentProvider } from './session.ts'

export type ModeBehaviour = 'asks' | 'runs' | 'rules' | 'unrelated'

/** Hemera Auto's identifier, under the `hemera` agent of the table. */
export const HEMERA_AUTO_MODE = 'hemera-auto'

const MODES = {
  claude: new Map([
    ['default', 'asks'],
    ['acceptEdits', 'asks'],
    ['plan', 'unrelated'],
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
    ['build', 'unrelated'],
    ['plan', 'unrelated'],
    ['hemera', 'unrelated'],
  ]),
  hemera: new Map([[HEMERA_AUTO_MODE, 'rules']]),
} satisfies Readonly<Record<AgentProvider | 'hemera', ReadonlyMap<string, ModeBehaviour>>>

function modesOf(agent: string): ReadonlyMap<string, ModeBehaviour> | undefined {
  return Object.entries(MODES).find(([known]) => known === agent)?.[1]
}

/** How Hemera's tools follow a mode: as the table says, and asking when it says nothing. */
export function modeBehaviour(
  standing: { readonly agent: string; readonly mode: string } | null,
): ModeBehaviour {
  if (standing === null) return 'asks'
  return modesOf(standing.agent)?.get(standing.mode) ?? 'asks'
}

/** Whether a value of an agent's mode is a permission mode, which Hemera Auto governs (D59-11). */
export function permissionMode(agent: string, mode: string): boolean {
  const behaviour = modesOf(agent)?.get(mode)
  return behaviour === 'asks' || behaviour === 'runs'
}

/** Whether it lets the agent's tools run without asking. */
export function permissiveMode(agent: string, mode: string): boolean {
  return modesOf(agent)?.get(mode) === 'runs'
}

/** The permission mode Hemera Auto puts an agent back on, and null for an agent with none. */
export function neutralMode(agent: string): string | null {
  const modes = modesOf(agent)
  if (modes === undefined) return null
  return [...modes].find(([, behaviour]) => behaviour === 'asks')?.[0] ?? null
}

/** An agent's option as Hemera Auto reads it: which option, its value, and what it offers. */
interface AgentOption {
  readonly id: string
  readonly category: string | null
}

/** Whether Hemera Auto governs this value of this option: a permission value of the mode. */
export function autoGoverns(agent: string, option: AgentOption, value: string): boolean {
  return (option.id === 'mode' || option.category === 'mode') && permissionMode(agent, value)
}

/**
 * What an agent must be set on before Hemera Auto hands it a prompt (D59-07, D59-11): each mode
 * option standing on a permission mode other than the agent's neutral one goes back to it. An
 * agent that does not offer its neutral mode cannot be put on it, and is refused rather than left
 * on a mode of its own.
 */
export function autoResets(
  agent: string,
  options: readonly (AgentOption & {
    readonly value: string
    readonly values: readonly { readonly id: string }[]
  })[],
):
  | { readonly kind: 'ready'; readonly resets: readonly { optionId: string; value: string }[] }
  | { readonly kind: 'refused' } {
  const neutral = neutralMode(agent)
  const resets: { optionId: string; value: string }[] = []
  for (const option of options) {
    if (!autoGoverns(agent, option, option.value) || option.value === neutral) continue
    if (neutral === null || !option.values.some((value) => value.id === neutral)) {
      return { kind: 'refused' }
    }
    resets.push({ optionId: option.id, value: neutral })
  }
  return { kind: 'ready', resets }
}
