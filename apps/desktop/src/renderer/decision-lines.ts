/**
 * Hemera Auto's decisions, as the Developer section lists them (#294).
 *
 * Read from the stored `permission_decision` entries the engine hands back through
 * `classifier.decisions`, already masked, and never from `diagnostic.log`: the entry says who
 * decided, the verdict, the policy, the model and the scores. The round trip to Jev is shown when
 * the record carries it.
 */

import { z } from 'zod'

import type { SessionEntry } from '@hemera/ipc'
import type { DecisionLine } from '@hemera/ui'

const bySchema = z.enum(['rules', 'judge', 'human', 'expired', 'nobody'])

const decisionSchema = z.object({
  tool: z.string().optional(),
  named: z.string().optional(),
  resolved: z.string().optional(),
  line: z.string().nullable().optional(),
  answer: z.string().optional(),
  by: bySchema,
  judged: bySchema.optional(),
  model: z.string().optional(),
  scores: z
    .object({ risk: z.number(), approval: z.number(), userRequested: z.number() })
    .optional(),
  roundTripMs: z.number().optional(),
})

/** What the engine answers for each decision: the entry, and the Session it was taken in. */
export interface StoredDecision {
  entry: SessionEntry
  session: { id: string; title: string }
}

function read(payload: string): z.infer<typeof decisionSchema> | null {
  try {
    const parsed = decisionSchema.safeParse(JSON.parse(payload))
    return parsed.success ? parsed.data : null
  } catch {
    return null
  }
}

/** Whether a thread entry is one of Hemera Auto's decisions, which is what a live row follows. */
export function isDecision(entry: SessionEntry): boolean {
  return entry.kind === 'permission_decision' && read(entry.payload) !== null
}

/** A verdict as the row's dot says it: allowed, refused, or neither. */
function verdictOf(answer: string | undefined): DecisionLine['verdict'] {
  if (answer === 'allowed') return 'allowed'
  if (answer === 'refused') return 'refused'
  return 'cancelled'
}

/**
 * One row, or null for an entry that is not one of Hemera Auto's decisions. `at` writes the time
 * it was taken for the platform.
 */
export function decisionLineOf(
  { entry, session }: StoredDecision,
  at: (ms: number) => string,
): DecisionLine | null {
  const decision = read(entry.payload)
  if (decision === null) return null
  let record = entry.payload
  try {
    record = JSON.stringify(JSON.parse(entry.payload), null, 2)
  } catch {
    // Read above, so it parses; kept as stored otherwise.
  }
  return {
    id: entry.id,
    at: at(entry.createdAt),
    sessionId: session.id,
    session: session.title,
    tool: decision.tool ?? '',
    call: decision.line ?? decision.resolved ?? decision.named ?? '',
    by: decision.by,
    judged: decision.judged,
    verdict: verdictOf(decision.answer),
    scores: decision.scores,
    model: decision.model,
    roundTripMs: decision.roundTripMs,
    record,
  }
}
