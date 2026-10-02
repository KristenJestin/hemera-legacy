import type { CommandState } from '../activity/command-run.tsx'
import type { CommandType } from '../activity/command-type.ts'
import type { FaceState } from '../components/face/states.ts'
import type { LiveState } from '../components/live-chip/live-chip.tsx'
import type { Readiness } from '../workspace/services-model.ts'
import type { RunRepository } from './run-place.tsx'

/**
 * What goes on in a Session, as the line under its title says it (issue #219): three kinds of
 * thing, told apart at a glance because what the reader can do with each is not the same.
 *
 * - `run` · a command Hemera runs, from the catalogue or a one-off: its output, its address, and
 *   Stop, because Hemera holds the process.
 * - `shell` · a command the agent ran in its own shell, through its own tool: Hemera only has what
 *   the tool call reported, and holds nothing it could stop.
 * - `agent` · a helper the Session's agent launched (issue #77): its name, where it stands, what it
 *   is doing and the last thing it said; its live thread is one press away, read-only.
 *
 * Times are the page's to write (`at`, "10:42"): the design system draws them as it is given them.
 */

/** How a thing stands, which is all its dot says. */
export type GoingOnState = 'running' | 'finished' | 'failed'

export interface GoingOnRun {
  kind: 'run'
  id: string
  /** The catalogue's name, or the line itself for a one-off. */
  name: string
  command: string
  type: CommandType
  state: CommandState
  /**
   * The Project's repository it runs in, said as one with its mark (issue #239); undefined for a
   * folder that is none of the Project's repositories.
   */
  repository?: RunRepository | undefined
  /** Under the repository when it is in one, `.` for the repository itself; else the folder. */
  folder: string
  /** The Workspace it runs in, named. */
  workspace: string
  output: string
  url?: string | undefined
  readiness?: Readiness | undefined
  exitCode?: number | undefined
  /** Whether the line was run without being in the catalogue. */
  oneOff?: boolean | undefined
  startedBy: 'agent' | 'user'
  /** The variables Hemera gave the run, on top of the machine's environment. */
  environment: Readonly<Record<string, string>>
  /** When it was started. */
  at: string
  /** When it was started and when it ended, in milliseconds, which its chip counts seconds from. */
  startedAt: number
  endedAt: number | null
}

export interface GoingOnShell {
  kind: 'shell'
  id: string
  command: string
  folder: string
  workspace: string
  state: GoingOnState
  output: string
  exitCode?: number | undefined
  /** When the agent's tool call began. */
  at: string
}

export interface GoingOnAgent {
  kind: 'agent'
  id: string
  name: string
  /** Running, then done, failed, or stopped — by its launcher or by the reader. */
  state: LiveState
  /** What it is doing now, in a few words; undefined when nothing says. */
  step?: string | undefined
  /** The last thing it said, or null while it has said nothing. */
  last: string | null
  /** The face it wears now, which leads its dialog. */
  face: FaceState
  /** When it was launched. */
  at: string
  /** When it was launched and when it ended, in milliseconds, which its chip counts seconds from. */
  startedAt: number
  endedAt: number | null
}

export type GoingOnItem = GoingOnRun | GoingOnShell | GoingOnAgent

/** How one item stands, whatever its kind: a run the reader stopped is over. */
export function goingOnStateOf(item: GoingOnItem): GoingOnState {
  if (item.kind === 'shell') return item.state
  if (item.state === 'running') return 'running'
  return item.state === 'failed' ? 'failed' : 'finished'
}

/** How many chips the line shows before the rest go behind its `+N`. */
export const GOING_ON_SHOWN = 4

const RANK: Record<GoingOnState, number> = { failed: 0, running: 1, finished: 2 }

/**
 * The items in the order the line shows them: what failed first, then what runs, then what is
 * over — the reader is told what went wrong before anything else — and in each, the newest first,
 * so what was just started is a chip and never behind the `+N`. A count and not a width decides how
 * many are chips: the design system never measures text. `items` is in the order they began.
 */
export function rankedGoingOn(items: readonly GoingOnItem[]): GoingOnItem[] {
  return items
    .map((item, at) => ({ item, at }))
    .toSorted(
      (one, other) =>
        RANK[goingOnStateOf(one.item)] - RANK[goingOnStateOf(other.item)] || other.at - one.at,
    )
    .map(({ item }) => item)
}
