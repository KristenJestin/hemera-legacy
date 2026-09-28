import { MAIN_WORKSPACE, PHASE_IDS } from '@hemera/core'
import type { CommandRun, ContextView, Provided } from '@hemera/ipc'
import type {
  ContextCommand,
  ContextEntry,
  ContextTool,
  ContextWorkspace,
  GoingOnItem,
  GoingOnRun,
  GoingOnShell,
  SessionDetailsTab,
} from '@hemera/ui'

import { type AgentShellCall, runFactsOf } from './agent-tool-payloads.ts'

/**
 * What the line under a Session's title and the Session's details draw (design D6-10, D6-12,
 * issue #219).
 *
 * The line is what goes on in the Session: its runs, the same runs the thread's blocks read, and
 * the commands the agent ran in its own shell, as its calls reported them. The details are what
 * the agent has been doing and what it works from. All of it is read as it came: nothing here
 * decides what a run is or what was provided, it only says it in the words the blocks take.
 *
 * Kept apart from the page, which imports the design system's components, so a test can read it
 * without a theme or a DOM.
 */

/** Where a run ran, relative to the Workspace root when it is inside it and the root is known. */
function folderOf(cwd: string, root: string | null): string {
  if (root === null) return cwd
  const inside = cwd.replaceAll('\\', '/')
  const base = root.replaceAll('\\', '/').replace(/\/$/, '')
  if (inside === base) return '.'
  if (inside.startsWith(`${base}/`)) return inside.slice(base.length + 1)
  return cwd
}

/** When something began, `HH:MM`, in the one reading the whole window uses. */
function clockOf(at: number): string {
  return new Date(at).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })
}

function runOf(run: CommandRun, root: string | null): GoingOnRun {
  const facts = runFactsOf(run)
  return {
    kind: 'run',
    id: run.id,
    name: run.name,
    command: run.line,
    type: run.type,
    state: run.state === 'exited' ? 'finished' : run.state,
    folder: folderOf(run.cwd, root),
    workspace: run.workspaceName,
    output: run.output,
    url: run.url ?? undefined,
    readiness: facts.readiness,
    exitCode: run.exitCode ?? undefined,
    oneOff: run.commandId === null,
    startedBy: run.startedBy,
    environment: facts.environment,
    at: clockOf(Date.parse(run.startedAt)),
  }
}

/**
 * A command of the agent's own shell: it runs where the agent runs, at the Workspace's root, which
 * its call does not say and which the Session's Workspace names.
 */
function shellOf(call: AgentShellCall, workspace: string): GoingOnShell {
  return {
    kind: 'shell',
    id: call.id,
    command: call.command,
    folder: '.',
    workspace,
    state: call.state,
    output: call.output,
    exitCode: undefined,
    at: clockOf(call.at),
  }
}

/**
 * What goes on in a Session, as the line under its title lists it: its runs and the agent's own
 * shell commands, in the order they began, which is the order the line ranks from.
 */
export function goingOnOf(
  runs: readonly CommandRun[],
  shells: readonly AgentShellCall[],
  root: string | null,
  workspace: string = MAIN_WORKSPACE,
): GoingOnItem[] {
  const began = [
    ...runs.map((run) => ({ at: Date.parse(run.startedAt), item: runOf(run, root) })),
    ...shells.map((call) => ({ at: call.at, item: shellOf(call, workspace) })),
  ]
  return began.toSorted((one, other) => one.at - other.at).map(({ item }) => item)
}

/**
 * Which of the two tabs has something to show (D6-10), which is what the details open on.
 *
 * Activity has a plan or a file the turn touched; Context has a delivery — a change of `AGENTS.md`
 * handed to the agent between two turns. The base, the file given at the start and the tools are
 * there in every Session its agent has been asked anything, so they make no tab one to open on by
 * themselves. What the Session runs is on the line under its title, and no tab of the details.
 *
 * Nothing here opens the details: they are a dialog only the reader opens, from the Session's head
 * (second review of #18). What arrives while they are open changes what a tab holds.
 */
export interface DetailsTabs {
  activity: boolean
  context: boolean
}

export function detailsTabsOf(plan: number, files: number, view: ContextView | null): DetailsTabs {
  return {
    activity: plan > 0 || files > 0,
    context: view?.provided.some((one) => one.kind === 'instructions') ?? false,
  }
}

/**
 * The tab the details open on: what the agent has been doing when it has done anything, and the
 * Context otherwise, which is what the agent works from.
 */
export function openingTabOf(tabs: DetailsTabs): SessionDetailsTab {
  return tabs.activity ? 'activity' : 'context'
}

/** How a source reached the agent, in the words the Context view says it with. */
const REACHED: Record<ContextView['provided'][number]['reached'], string> = {
  system_prompt: 'through its system prompt',
  embedded_resource: 'as a resource of the first prompt',
  read_natively: 'read by the agent',
  session_start: 'given at the start of the Session',
  delivery_prompt: 'delivered between two turns',
}

/** When a source was provided, `DD Mon HH:MM`, in the one reading the whole window uses. */
function atOf(iso: string): string {
  const at = new Date(iso)
  const day = at.toLocaleDateString('en-GB', { day: '2-digit', month: 'short' })
  const time = at.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })
  return `${day} ${time}`
}

/**
 * What the Context view draws: the Workspace, the lines of the instructions, the tools with the
 * moment they were lent, and the catalogue.
 */
export interface ContextLists {
  workspace: ContextWorkspace
  instructions: ContextEntry[]
  handed: ContextEntry[]
  tools: ContextTool[]
  lentAt: string | undefined
  commands: ContextCommand[]
}

/**
 * The instructions of a Session in three lines (trial of 23 September 2026): how `AGENTS.md`
 * reached the agent, the last change delivered since, and the base — each with the time it
 * reached the agent (recette 5 of 24 September 2026).
 *
 * Nothing is listed before anything has gone to the agent, which is a Session before its first
 * message. A Workspace without the file says so in a sentence; one whose file appeared during the
 * Session had none at its start, and its delivery is the last change. The file is named by its
 * path from the Workspace root, as the engine recorded it, and says when it last changed once a
 * change was delivered. Fingerprints are left out: the time of the change is what tells a reader
 * the file moved under the Session.
 */
function instructionsOf(provided: ContextView['provided']): ContextEntry[] {
  if (provided.length === 0) return []
  const file = provided.find((one) => one.kind === 'native' || one.kind === 'provided')
  const change = provided.findLast((one) => one.kind === 'instructions')
  const base = provided.find((one) => one.kind === 'base')
  const lines = [fileLineOf(file, change)]
  if (change !== undefined) {
    lines.push({
      label: 'Last change',
      detail: REACHED[change.reached],
      at: atOf(change.deliveredAt),
    })
  }
  if (base !== undefined) {
    lines.push({ label: 'The base', detail: REACHED[base.reached], at: atOf(base.deliveredAt) })
  }
  return lines
}

/** The line of `AGENTS.md` itself: its path, how and when it reached the agent, or that there was none. */
function fileLineOf(file: Provided | undefined, change: Provided | undefined): ContextEntry {
  const changed = change === undefined ? undefined : atOf(change.deliveredAt)
  if (file !== undefined) {
    return {
      label: file.path,
      file: true,
      detail: REACHED[file.reached],
      at: atOf(file.deliveredAt),
      changed,
    }
  }
  if (change !== undefined) {
    return { label: change.path, file: true, detail: 'none at the start of the Session', changed }
  }
  return { label: 'This Workspace has no AGENTS.md' }
}

/** The phases a brief can be composed for. */
const PHASES: ReadonlySet<string> = new Set(PHASE_IDS)

/** A section or a phase as the Spec names it: `expected_outcome` is `Expected outcome`. */
function titled(name: string): string {
  const words = name.replaceAll('_', ' ')
  return `${words.charAt(0).toUpperCase()}${words.slice(1)}`
}

/**
 * What a `define` Session handed its agent besides its instructions (#74), one line each, oldest
 * first, in the reader's words and never the engine's: the instructions of each phase, the human's
 * edits and answers, the results of sub-agents, and what Hemera said to it of its own. The engine names what each was — the key a
 * brief was composed for, the sections an edit touched, the question an answer answered — and a
 * row written before it did is said without it.
 */
function handedOf(provided: ContextView['provided']): ContextEntry[] {
  return provided.flatMap((one): ContextEntry[] => {
    const at = atOf(one.deliveredAt)
    switch (one.kind) {
      case 'brief': {
        // `shape · revision 2 · writer`, or `no phase · …` for a Spec with no phase open.
        const [phase = '', revision = ''] = one.path.split(' · ')
        const named = PHASES.has(phase) ? `the ${titled(phase)} phase` : 'the Spec'
        // The revision is said once there is more than one: after a Rework.
        const number = Number(revision.replace('revision ', ''))
        const again = number > 1 ? ` of revision ${number}` : ''
        return [{ label: `The instructions for ${named}${again} went to the agent`, at }]
      }
      case 'edit': {
        const sections = one.path.split(',').filter((name) => name !== '')
        const named = sections.length === 0 ? 'the Spec' : sections.map(titled).join(', ')
        return [{ label: `Your edits to ${named} went to the agent`, at }]
      }
      case 'answer':
        return [
          {
            label:
              one.path === ''
                ? 'Your answers went to the agent'
                : `Your answer to “${one.path}” went to the agent`,
            at,
          },
        ]
      case 'internal':
        return [{ label: 'The result of a sub-agent went to the agent', at }]
      // Hemera's own words: the only notice it sends is that the user declined a proposal.
      case 'notice':
        return [{ label: 'Hemera told the agent you declined its proposal', at }]
      case 'request':
        return [{ label: 'The New Spec request went to the agent', at }]
      default:
        return []
    }
  })
}

/**
 * The Context view of a Session, in the words the view draws it with (D6-10).
 *
 * The Workspace is the Session's own, `main` unless the composer chose another (D8-08), at the
 * root the page already reads its runs from. The tools were lent when the agent's session was
 * opened, which is the moment the base was recorded: the engine provides a session the instant it
 * opens it, with the tools already in its hands. Before that there is no time to give.
 */
export function contextListsOf(
  view: ContextView,
  root: string,
  workspace = MAIN_WORKSPACE,
): ContextLists {
  const base = view.provided.find((one) => one.kind === 'base')
  return {
    workspace: { name: workspace, path: root },
    instructions: instructionsOf(view.provided),
    handed: handedOf(view.provided),
    tools: view.tools.map((tool) => ({ name: tool.name, bound: tool.bound })),
    lentAt: base === undefined ? undefined : atOf(base.deliveredAt),
    commands: view.commands.map((command) => ({ name: command.name, command: command.line })),
  }
}
