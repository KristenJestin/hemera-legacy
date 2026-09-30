import type { SessionEntry } from '@hemera/ipc'
import type { PermissionStanding } from '@hemera/ui'
import { z } from 'zod'

import { commandProposalOf, questionOpen, setupProposalOf } from './agent-tool-payloads.ts'
import { waitsForAnswer } from './spec-entries.ts'

/**
 * What waits for a human in a Session, and in which kind (issue #237): the Session's notices, the
 * pill on the composer's edge, hold every entry of the thread that waits for someone's decision,
 * grouped by kind, and the thread keeps a quiet record of each where it was asked.
 *
 * Pure, and free of what `@hemera/ui` runs when it loads, so it is tested on Node: the page asks
 * it which entries wait and how a permission was answered, and `agent-blocks.tsx` draws them.
 */

/**
 * The kinds of what waits, in the order the notices list them: what holds the turn first, and the
 * changes to the Project's setup the agent proposes last (#218).
 */
export const NOTICE_KINDS = ['permission', 'question', 'spec', 'proposal', 'setup'] as const

export type NoticeKind = (typeof NOTICE_KINDS)[number]

/**
 * The kind an entry waits for a human as, or null when it waits for nobody.
 *
 * A permission while the engine holds it open and its turn runs; a command the agent proposes while nobody answered
 * it; the Spec a `free` Session's agent proposes while it is proposed; a question of the Spec
 * neither answered nor left behind by a Rework; a change to the Project's setup while nobody
 * answered it.
 */
export function waitingAs(
  entry: SessionEntry,
  thread: readonly SessionEntry[],
  specId: string | null,
  asked: ReadonlySet<string> | null,
): NoticeKind | null {
  if (entry.kind === 'permission_request') {
    // Open, undecided, and in a turn that still runs: a request a turn left behind when it ended
    // — the agent gave up on the call, the engine never rewrote it — waits for nobody.
    const open = questionOpen(entry) && decisionOf(entry, thread) === null
    return open && !endedAfter(entry, thread) ? 'permission' : null
  }
  if (entry.kind === 'command_proposal') {
    return commandProposalOf(entry)?.state === 'pending' ? 'proposal' : null
  }
  if (entry.kind === 'spec_proposal') {
    return waitsForAnswer(entry, thread, specId, asked) ? 'spec' : null
  }
  if (entry.kind === 'setup_proposal') {
    return setupProposalOf(entry)?.state === 'pending' ? 'setup' : null
  }
  if (entry.kind === 'spec_question') {
    return waitsForAnswer(entry, thread, specId, asked) ? 'question' : null
  }
  return null
}

/**
 * The batches of setup changes that still wait, in the order they were first proposed: what the
 * setup's Accept all answers, one batch after the other (Decided 1 of #218).
 */
export function setupBatchesWaiting(thread: readonly SessionEntry[]): string[] {
  const batches: string[] = []
  for (const entry of thread) {
    if (entry.kind !== 'setup_proposal') continue
    const drawn = setupProposalOf(entry)
    if (drawn?.state === 'pending' && !batches.includes(drawn.batchId)) batches.push(drawn.batchId)
  }
  return batches
}

/** Whether a turn ended after this entry was written: what it belonged to is over. */
function endedAfter(entry: SessionEntry, thread: readonly SessionEntry[]): boolean {
  const at = thread.findIndex((one) => one.id === entry.id)
  return at !== -1 && thread.slice(at + 1).some((one) => one.kind === 'turn')
}

const requestSchema = z.object({
  toolCallId: z.string(),
  tool: z.string().optional(),
  options: z.array(z.object({ optionId: z.string(), kind: z.string() })),
})

const decisionSchema = z.object({ toolCallId: z.string(), optionId: z.string().nullable() })

function read<S extends z.ZodType>(schema: S, payload: string): z.infer<S> | null {
  try {
    const parsed = schema.safeParse(JSON.parse(payload))
    return parsed.success ? parsed.data : null
  } catch {
    return null
  }
}

/** The call a permission request or a decision is about, or null when its payload says none. */
export function toolCallOf(entry: SessionEntry): string | null {
  if (entry.kind === 'permission_request')
    return read(requestSchema, entry.payload)?.toolCallId ?? null
  if (entry.kind === 'permission_decision') {
    return read(decisionSchema, entry.payload)?.toolCallId ?? null
  }
  return null
}

/** The decision written about the call a request asks about, or null while there is none. */
export function decisionOf(
  request: SessionEntry,
  thread: readonly SessionEntry[],
): SessionEntry | null {
  const call = toolCallOf(request)
  if (call === null) return null
  return (
    thread.find((entry) => entry.kind === 'permission_decision' && toolCallOf(entry) === call) ??
    null
  )
}

/**
 * Whether a decision has a request of its own in the thread, which is where its record says it:
 * a decision without one — a one-off the Session's mode let through (#242) — keeps its own line.
 */
export function decidesARequest(decision: SessionEntry, thread: readonly SessionEntry[]): boolean {
  const call = toolCallOf(decision)
  return (
    call !== null &&
    thread.some((entry) => entry.kind === 'permission_request' && toolCallOf(entry) === call)
  )
}

/**
 * How a permission stands in the thread's record of it: still asked, allowed, refused, or left —
 * by a stop, or by an agent that died with the question open.
 */
export function permissionStandingOf(
  request: SessionEntry,
  thread: readonly SessionEntry[],
): PermissionStanding {
  const decision = decisionOf(request, thread)
  if (decision === null) return questionOpen(request) ? 'pending' : 'stopped'
  const optionId = read(decisionSchema, decision.payload)?.optionId ?? null
  if (optionId === null) return 'stopped'
  const kind = read(requestSchema, request.payload)?.options.find(
    (option) => option.optionId === optionId,
  )?.kind
  return kind === 'allow_once' || kind === 'allow_always' ? 'allowed' : 'refused'
}

/**
 * Whether a permission asks to run a line once — Hemera's `commands_run` for a one-off — which is
 * what the permissions' group says it is about ("Run once"); any other question is allowed once.
 */
export function asksToRunALine(request: SessionEntry): boolean {
  return read(requestSchema, request.payload)?.tool === 'commands_run'
}
