import {
  phaseIdSchema,
  specQuestionOptionSchema,
  specTypeSchema,
  type SessionEntry,
  type SpecType,
} from '@hemera/ipc'
import type { ProposalState, SpecAnswer, SpecQuestionView } from '@hemera/ui'
import { z } from 'zod'

/**
 * What the Spec entries of a thread are drawn from (design D7-01, D7-07, D7-09).
 *
 * A `define` step writes four kinds into a Session's thread: the brief a turn rode on, a
 * question of the Spec asked in the chat, the answer given beside it, and — in a `free`
 * Session — the Spec its agent proposes. `agent-blocks.tsx` draws the question and the proposal;
 * this reads them, pure
 * and free of what `@hemera/ui` runs when it loads, so it is tested on Node. A payload that does
 * not parse is an entry this version does not draw, as everywhere in the thread.
 */

/** A question as its entry carries it: the question view, open when it was asked. */
const questionSchema = z.object({
  id: z.string(),
  body: z.string(),
  blocking: z.boolean(),
  phase: phaseIdSchema.nullable(),
  options: z.array(specQuestionOptionSchema),
})

/** The answer written beside it: one of its options, or a text. */
const answerSchema = z.object({
  questionId: z.string(),
  optionId: z.string().optional(),
  text: z.string().optional(),
})

/**
 * What the agent of a `free` Session proposed, through `spec_propose`: a Spec to create, or one
 * that exists, named by its id and its key (issue #198). In a New Spec Session, a Spec to create
 * is created at once, and the entry carries the key it was given (issue #205).
 */
const proposalSchema = z.object({
  title: z.string(),
  type: specTypeSchema,
  specId: z.string().optional(),
  key: z.string().optional(),
  createdKey: z.string().optional(),
})

function parsed<S extends z.ZodType>(schema: S, payload: string): z.infer<S> | null {
  try {
    const read = schema.safeParse(JSON.parse(payload))
    return read.success ? read.data : null
  } catch {
    return null
  }
}

/**
 * Whether a Spec entry draws a row in the thread. The brief a turn rode on does not (issue #205):
 * it is long and of no interest while the conversation is read, and the Session details' Context
 * tab lists every brief handed to the agent. Nor does an answer, which its question's card draws
 * where it was given (issue #199).
 */
export function drawnInThread(entry: SessionEntry): boolean {
  return entry.kind !== 'mission_brief' && entry.kind !== 'spec_answer'
}

/** A question as its block draws it, and whether it was left behind by a Rework. */
export interface QuestionBlock {
  question: SpecQuestionView
  cancelled: boolean
}

/**
 * A question asked in the thread, answered once the `spec_answer` entry written beside it is in
 * the thread too: the two share the question's id. A question tied to no phase is drawn under
 * `shape`, as the register draws it.
 *
 * `asked` is the questions of the Spec's current revision, null until it is read. A question
 * without an answer that is not among them was left behind by a Rework, which asks the open
 * questions again under new ids (D7-05): its block is `cancelled` — it stays open in the Spec,
 * asked again further down — and never offers an answer the engine would refuse.
 */
export function questionEntryOf(
  entry: SessionEntry,
  thread: readonly SessionEntry[],
  asked: ReadonlySet<string> | null,
): QuestionBlock | null {
  const question = parsed(questionSchema, entry.payload)
  if (question === null) return null
  const answer = answeredIn(question.id, thread)
  return {
    question: {
      id: question.id,
      body: question.body,
      blocking: question.blocking,
      phase: question.phase ?? 'shape',
      options: question.options,
      answer,
    },
    cancelled: answer === null && asked !== null && !asked.has(question.id),
  }
}

/** The answer given to a question in this thread, or null while it has none. */
function answeredIn(questionId: string, thread: readonly SessionEntry[]): SpecAnswer | null {
  for (const entry of thread) {
    if (entry.kind !== 'spec_answer') continue
    const answer = parsed(answerSchema, entry.payload)
    if (answer?.questionId === questionId) {
      return { optionId: answer.optionId, text: answer.text }
    }
  }
  return null
}

/**
 * What an answered question is marked by on the rail, as the reader's messages are (issue #149):
 * the label of the choice made, or the words typed under `Other`. The answer is drawn by the
 * question's own card (issue #199), so the mark is the card's; an open question marks nothing.
 */
export function questionMarkOf(
  entry: SessionEntry,
  thread: readonly SessionEntry[],
  asked: ReadonlySet<string> | null,
): string | undefined {
  const question = questionEntryOf(entry, thread, asked)?.question
  if (question === undefined || question.answer === null) return undefined
  const { optionId, text } = question.answer
  return question.options.find((option) => option.id === optionId)?.label ?? text
}

/** What the thread finds a question's block by: the page scrolls to it from the register. */
export function questionAnchor(questionId: string): string {
  return `ask-${questionId}`
}

/** The Spec a `define` Session defines, as a proposal would have named it: its first revision. */
export interface DefinedSpec {
  key: string
  title: string
  type: SpecType
}

/** A proposal as its block draws it. */
export interface ProposalView {
  title: string
  type: SpecType
  state: ProposalState
  /** The Spec it points to, when it is one that exists rather than one to create (#198). */
  existing?: { specId: string; key: string } | undefined
  /** The key of the Spec Hemera created from it at once, in a New Spec Session (#205). */
  createdAtOnce?: string | undefined
}

/**
 * Which proposal of the thread the Spec was created from: the one whose title and type are the
 * Spec's first revision's, or — the title edited in the card before `Create` — the last one the
 * thread holds.
 */
function createdFrom(thread: readonly SessionEntry[], spec: DefinedSpec): string | null {
  const proposals = thread.filter((entry) => entry.kind === 'spec_proposal')
  // A proposal that points to an existing Spec never created one.
  const creating = proposals.filter((entry) => {
    const said = parsed(proposalSchema, entry.payload)
    return said?.specId === undefined && said?.createdKey === undefined
  })
  const same = creating.find((entry) => {
    const said = parsed(proposalSchema, entry.payload)
    return said?.title === spec.title && said.type === spec.type
  })
  return (same ?? creating.at(-1))?.id ?? null
}

/**
 * A proposal of the agent, and where it stands (D7-07). While the Session is `free`, `proposed`,
 * or `declined` once `Not now` was pressed, which the engine keeps on the entry (issue #130).
 * Once it defines a Spec, the proposal the Spec came from is `created` and every other one
 * `declined`; until that Spec is read, `spec` is null and the proposal is not drawn, rather than
 * drawn as a guess.
 */
export function proposalOf(
  entry: SessionEntry,
  thread: readonly SessionEntry[],
  specId: string | null,
  spec: DefinedSpec | null,
): ProposalView | null {
  const proposal = parsed(proposalSchema, entry.payload)
  if (proposal === null) return null
  const { title, type } = proposal
  // Created at once (issue #205): nothing was asked, and nothing waits for an answer.
  if (proposal.createdKey !== undefined) {
    return { title, type, state: 'created', createdAtOnce: proposal.createdKey }
  }
  const existing =
    proposal.specId === undefined || proposal.key === undefined
      ? undefined
      : { specId: proposal.specId, key: proposal.key }
  const view = existing === undefined ? { title, type } : { title, type, existing }
  if (specId === null) {
    return { ...view, state: entry.state === 'declined' ? 'declined' : 'proposed' }
  }
  // The Spec pointed to is continued once the Session defines it, whatever else it defines.
  if (existing !== undefined) {
    return { ...view, state: specId === existing.specId ? 'created' : 'declined' }
  }
  if (spec === null) return null
  return { ...view, state: createdFrom(thread, spec) === entry.id ? 'created' : 'declined' }
}

/** What the engine names a proposal by: its entry's correlation, without the prefix. */
export function proposalIdOf(entry: SessionEntry): string {
  return (entry.correlationId ?? '').replace(/^proposal:/, '')
}

/**
 * Whether a Spec entry waits for the reader's answer (issue #130): a proposal of a `free` Session
 * still proposed, a question neither answered nor left behind by a Rework. The page draws it among
 * the Session's notices, on the composer's edge, while it waits — the agent's words go on under it
 * and would scroll it out of sight — and the thread keeps its record (issue #237).
 */
export function waitsForAnswer(
  entry: SessionEntry,
  thread: readonly SessionEntry[],
  specId: string | null,
  asked: ReadonlySet<string> | null,
): boolean {
  if (entry.kind === 'spec_proposal') {
    return specId === null && proposalOf(entry, thread, null, null)?.state === 'proposed'
  }
  if (entry.kind === 'spec_question') {
    const block = questionEntryOf(entry, thread, asked)
    return block !== null && block.question.answer === null && !block.cancelled
  }
  return false
}

/**
 * The Sessions the list still says are `free` whose thread holds a Spec Hemera created at once
 * (issue #205): the Session turned `define` during the agent's turn, with nothing pressed on this
 * side, so the list is read again and the Spec takes the provisional one's place in the panel.
 */
export function definedAtOnceOf(
  sessions: readonly { readonly id: string; readonly mission: string }[],
  pushed: ReadonlyMap<string, { readonly entries: readonly SessionEntry[] }>,
): string[] {
  return sessions
    .filter((one) => one.mission === 'free')
    .filter((one) =>
      (pushed.get(one.id)?.entries ?? []).some(
        (entry) =>
          entry.kind === 'spec_proposal' &&
          parsed(proposalSchema, entry.payload)?.createdKey !== undefined,
      ),
    )
    .map((one) => one.id)
}
