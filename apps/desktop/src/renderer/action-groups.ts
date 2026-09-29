import { hemeraToolNamed } from '@hemera/core'
import type { SessionEntry } from '@hemera/ipc'
import type { ToolKind } from '@hemera/ui'
import { z } from 'zod'

import { hemeraToolCallOf, hemeraToolLabelOf, subjectOf } from './agent-tool-payloads.ts'

/**
 * The tool calls of a turn, folded into one group between two things the agent said (recette of
 * 26 September 2026, issue #149).
 *
 * A turn reads twelve files, lists five folders and runs two commands before it answers, and each
 * of those was a row of the thread: the answer was found at the end of a column of plumbing. So
 * every run of calls between two pieces of the agent's text is one row, folded — `12 actions`, no
 * more (issue #159) — which unfolds to the rows it holds, as they were. Whatever the tools are:
 * the agent's own and Hemera's alike.
 *
 * A thought or a diff inside such a run goes into the group with the calls around it: they are
 * part of the work, not something said, and a thought between two reads would otherwise cut one
 * run of work into two groups. They are not counted: an action is a call. The quiet records of
 * what waited for the reader — a permission, a proposal, a question, the Spec proposed — and a run
 * go into the group too, at its ends as well (review of #250); a call's own permission, run and
 * proposal are drawn with the call and are not rows at all. Anything else — the agent's text, the
 * user's message, Hemera's own line — ends the run, and a run of a single call stays the row it is.
 *
 * Folded, the group also names its latest call, in the words that call's own row says it — the
 * agent's title, or Hemera's label and what it is about (issue #180) — so the line says what the
 * agent is doing while the turn runs, and follows it as calls arrive.
 *
 * Pure and free of what `@hemera/ui` runs when it loads, so it is tested on Node; the page draws
 * the group.
 */

/** What a call is counted as: one of ACP's kinds, or a call to one of Hemera's own tools. */
export type ActionKind = ToolKind | 'hemera'

/** Where a call stands, as the group's dot says it: one running, one failed, or all done. */
export type ActionStatus = 'in_progress' | 'failed' | 'completed'

/** One call of a run. */
export interface Action {
  kind: ActionKind
  status: ActionStatus
  /** What the call is doing, in the words its own row says it: `Read src/menu.html`. */
  label: string
}

/**
 * What a drawn block of the thread is to a run of calls: a call, a companion of the calls around
 * it (a thought, a diff), a member of the run (what waited for the reader and was answered, or a
 * run, review of #250), or `null` for anything else, which ends the run. A member is not counted,
 * and, unlike a companion, stays in the group at either end of it.
 */
/** A run the reader started, as a member of a run of work: how it stands, and its name. */
export interface RunMember {
  member: 'run'
  status: ActionStatus
  label: string
}

export type Grouping = Action | 'companion' | 'member' | RunMember | null

/** What the agent's report of a call says of it, as far as counting it goes. */
const reportSchema = z.object({
  call: z.object({
    title: z.string(),
    kind: z.string().nullable(),
    status: z.string().nullable(),
    rawInput: z.object({ text: z.string() }).nullish(),
  }),
})

const KINDS: readonly ToolKind[] = [
  'read',
  'edit',
  'delete',
  'move',
  'search',
  'execute',
  'think',
  'fetch',
  'other',
]

function parsed<S extends z.ZodType>(schema: S, payload: string): z.infer<S> | null {
  try {
    const read = schema.safeParse(JSON.parse(payload))
    return read.success ? read.data : null
  } catch {
    return null
  }
}

/** Where a call stands, told in the three words the group has: the rest are done. */
function statusOf(said: string | null): ActionStatus {
  if (said === 'pending' || said === 'in_progress') return 'in_progress'
  if (said === 'failed' || said === 'refused') return 'failed'
  return 'completed'
}

/** One of Hemera's calls named as its row names it: its label, and what it is about. */
function hemeraLabelOf(label: string, subject: string | undefined): string {
  return subject === undefined ? label : `${label} ${subject}`
}

/** What a run's entry says of it, as far as grouping goes. */
const runSchema = z.object({
  name: z.string(),
  state: z.enum(['running', 'exited', 'failed', 'stopped']),
})

/** A run's state, in the words the group's status reads. */
const RUN_STATES = {
  running: 'in_progress',
  failed: 'failed',
  exited: 'completed',
  stopped: 'completed',
} as const satisfies Record<z.infer<typeof runSchema>['state'], ActionStatus>

/** The quiet records of the thread, which fold into the work around them (review of #250). */
const MEMBERS: readonly SessionEntry['kind'][] = [
  'permission_request',
  'permission_decision',
  'command_proposal',
  'command_run',
  'spec_proposal',
  'spec_question',
]

/**
 * What an entry of the thread is to a run of calls, read off the entry the page draws — Hemera's
 * own answer in place of the agent's report of it, where the thread holds both.
 */
export function groupingOf(entry: SessionEntry): Grouping {
  if (entry.kind === 'thought' || entry.kind === 'diff') return 'companion'
  if (entry.kind === 'command_run') {
    const run = parsed(runSchema, entry.payload)
    if (run !== null) return { member: 'run', status: RUN_STATES[run.state], label: run.name }
  }
  if (MEMBERS.includes(entry.kind)) return 'member'
  if (entry.kind === 'hemera_tool_call') {
    const drawn = hemeraToolCallOf(entry)
    return drawn === null
      ? null
      : {
          kind: 'hemera',
          status: statusOf(drawn.status),
          label: hemeraLabelOf(drawn.label, drawn.subject?.text),
        }
  }
  if (entry.kind !== 'tool_call') return null
  const report = parsed(reportSchema, entry.payload)
  if (report === null) return null
  const { title, kind, status, rawInput } = report.call
  const hemera = hemeraToolNamed(title)
  if (hemera !== null) {
    const subject = subjectOf(hemera, rawInput?.text ?? '')?.text
    return {
      kind: 'hemera',
      status: statusOf(status),
      label: hemeraLabelOf(hemeraToolLabelOf(hemera).label, subject),
    }
  }
  return {
    kind: KINDS.find((one) => one === kind) ?? 'other',
    status: statusOf(status),
    label: title,
  }
}

/** Whether a block is a call, which is what a group of work counts. */
function isAction(grouping: Grouping): grouping is Action {
  return (
    grouping !== null && grouping !== 'companion' && grouping !== 'member' && 'kind' in grouping
  )
}

/** Whether a block is a run the reader started. */
function isRun(grouping: Grouping): grouping is RunMember {
  return (
    grouping !== null && grouping !== 'companion' && grouping !== 'member' && 'member' in grouping
  )
}

/** Where a group stands: running while one of its calls runs, failed if one failed, else done. */
export function groupStatusOf(actions: readonly { status: ActionStatus }[]): ActionStatus {
  if (actions.some((one) => one.status === 'in_progress')) return 'in_progress'
  if (actions.some((one) => one.status === 'failed')) return 'failed'
  return 'completed'
}

/** A piece of the thread once the runs are folded: a block as it was, or a group of them. */
export type Piece<T> =
  | { kind: 'one'; item: T }
  | {
      kind: 'group'
      items: T[]
      count: number
      status: ActionStatus
      latest: string
      /** What it counts: the calls of a turn, or runs the reader started (review of #250). */
      unit: 'actions' | 'runs'
    }

/**
 * The blocks of a thread with every run of two calls or more folded into one group.
 *
 * `blocks` are the ones the thread draws, in order, each with what it is to a run. Companions at
 * either end of a run stay outside it — a thought before the first call is what the agent thought
 * before it began, and a diff after the last is read with what follows — and a run left with
 * fewer than two calls is not a group.
 */
export function groupActions<T>(blocks: readonly { item: T; grouping: Grouping }[]): Piece<T>[] {
  const pieces: Piece<T>[] = []
  let run: { item: T; grouping: Grouping }[] = []
  const close = (): void => {
    const first = run.findIndex((one) => one.grouping !== 'companion')
    const last = run.findLastIndex((one) => one.grouping !== 'companion')
    const actions = run.flatMap((one) => (isAction(one.grouping) ? [one.grouping] : []))
    const runs = run.flatMap((one) => (isRun(one.grouping) ? [one.grouping] : []))
    // Runs the reader started one after the other, no call among them, are a group of runs.
    const byRuns = actions.length === 0 && runs.length >= 2
    if (actions.length < 2 && !byRuns) {
      for (const one of run) pieces.push({ kind: 'one', item: one.item })
    } else {
      const counted = byRuns ? runs : actions
      for (const one of run.slice(0, first)) pieces.push({ kind: 'one', item: one.item })
      pieces.push({
        kind: 'group',
        items: run.slice(first, last + 1).map((one) => one.item),
        count: counted.length,
        status: groupStatusOf(counted),
        latest: counted.at(-1)?.label ?? '',
        unit: byRuns ? 'runs' : 'actions',
      })
      for (const one of run.slice(last + 1)) pieces.push({ kind: 'one', item: one.item })
    }
    run = []
  }
  for (const block of blocks) {
    if (block.grouping === null) {
      close()
      pieces.push({ kind: 'one', item: block.item })
      continue
    }
    run.push(block)
  }
  close()
  return pieces
}
