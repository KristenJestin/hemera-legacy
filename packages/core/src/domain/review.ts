/**
 * A review round of a build, as the domain reasons about it (issue #278).
 *
 * A round is one wave of review of a `build` Session, numbered from one per build: the result of
 * the build frozen per repository when it opens, and the user's feedback on it. It is `open` while
 * the user reviews — the build's agent writes nothing in the Workspace then — `fixing` while the
 * feedback is being worked on, and `closed` once it is over; it never goes back.
 *
 * A round has a kind. `spec` is the review of the Spec's build: the user checks the result against
 * the stories and criteria of the frozen revision, and a feedback may point at one of them. `code`
 * is a review of the diff, whose feedback will point at lines; it exists in the type and the schema
 * so that the rows need no rewrite the day it is produced, and nothing opens one yet.
 *
 * What is here is pure — the rules. Every act on the database or on Git belongs to the engine.
 */

import type { AcceptanceCriterion, UserStory } from './spec.ts'
import type { ToolName } from './tools.ts'

/** Where a round stands: reviewed, being fixed, over. */
export const ROUND_STATES = ['open', 'fixing', 'closed'] as const

export type RoundState = (typeof ROUND_STATES)[number]

/** What a round reviews: the build against its Spec, or (later) the diff line by line. */
export const ROUND_KINDS = ['spec', 'code'] as const

export type RoundKind = (typeof ROUND_KINDS)[number]

/** What a feedback is: about the product, general, or a question. */
export const FEEDBACK_KINDS = ['product', 'general', 'question'] as const

export type FeedbackKind = (typeof FEEDBACK_KINDS)[number]

/** Which side of a diff a line of a `code` anchor is on. */
export const DIFF_SIDES = ['old', 'new'] as const

export type DiffSide = (typeof DIFF_SIDES)[number]

/**
 * What a feedback points at, or nothing.
 *
 * On a `spec` round, a story of the frozen revision, or one of its criteria by its index among the
 * story's criteria in rank order, from zero. On a `code` round, a file of a repository, with a
 * range of lines on one side of the diff or none.
 */
export type FeedbackAnchor =
  | { readonly kind: 'spec'; readonly storyId: string; readonly criterion: number | null }
  | {
      readonly kind: 'code'
      readonly repository: string
      readonly path: string
      readonly lines: { readonly start: number; readonly end: number } | null
      readonly side: DiffSide | null
    }

/**
 * The tools an open round refuses the build's agent: what writes in the Workspace or runs a
 * command there. Reading, listing and searching go on, and the build's own tools too.
 */
const HELD_WHILE_OPEN: ReadonlySet<ToolName> = new Set(['fs_write', 'fs_edit', 'commands_run'])

/**
 * Why the build's agent may not call a tool while its latest round stands where it does, or null
 * when it may: only an `open` round holds the Workspace, so what the user reviews stays what the
 * round froze.
 */
export function roundToolRefusal(state: RoundState | null, tool: ToolName): string | null {
  if (state !== 'open' || !HELD_WHILE_OPEN.has(tool)) return null
  return `a review round is open: the user is reviewing the build, and nothing is written or run in the Workspace until it ends (${tool} refused)`
}

/** A round as the user reads it: `Spec review · round 2`, `Code review · round 1`. */
export function roundName(kind: RoundKind, number: number): string {
  return `${kind === 'spec' ? 'Spec' : 'Code'} review · round ${number}`
}

/** What of a feedback says whether it waits for a fix. */
export interface FeedbackStanding {
  readonly kind: FeedbackKind
  readonly withdrawnAt: string | null
}

/**
 * Whether some of a round's feedback waits for a fix (issue #279): a product or a general one the
 * user did not withdraw. A question is answered, and never becomes a fix.
 */
export function waitsForFix(feedback: readonly FeedbackStanding[]): boolean {
  return feedback.some((one) => one.withdrawnAt === null && one.kind !== 'question')
}

/**
 * Why the user may not accept a build on its latest round, or null when the round allows it
 * (issue #279): only on a round that is open, whose result is still what is on disk, and whose
 * feedback waits for no fix. `round` is the build's round that is not closed, or null.
 */
export function roundAcceptRefusal(
  round: {
    readonly state: RoundState
    readonly stale: boolean
    readonly feedback: readonly FeedbackStanding[]
  } | null,
): string | null {
  if (round === null || round.state === 'closed') return 'No review round is open.'
  if (round.state === 'fixing') return 'The feedback of the round is being fixed.'
  if (round.stale) return 'The Workspace changed since the round opened.'
  if (waitsForFix(round.feedback)) return 'A feedback waits for a fix.'
  return null
}

/** Why a round may not move from one state to another, or null: forward only, never back. */
export function roundMoveRefusal(from: RoundState, to: RoundState): string | null {
  if (ROUND_STATES.indexOf(to) > ROUND_STATES.indexOf(from)) return null
  return `a round that is ${from} cannot become ${to}`
}

/**
 * Why a feedback may not be added to a round standing where it does, or null: only an open round
 * takes one, and never an empty one.
 */
export function feedbackRefusal(state: RoundState | null, body: string): string | null {
  if (state === null) return 'this build has no review round to leave feedback on'
  if (state === 'fixing') return 'this round is being fixed: it takes no more feedback'
  if (state === 'closed') return 'this round is closed: it takes no more feedback'
  if (body.trim() === '') return 'an empty feedback is not recorded'
  return null
}

/**
 * Why a feedback may not point at what it names, or null.
 *
 * No feedback has to point at anything, whatever its kind. One that does points at what its round
 * reviews: on a `spec` round, a story of the frozen revision or one of its criteria; a `code` anchor
 * belongs to a `code` round alone.
 */
export function anchorRefusal(
  round: RoundKind,
  anchor: FeedbackAnchor | null,
  revision: {
    readonly stories: readonly UserStory[]
    readonly criteria: readonly AcceptanceCriterion[]
  },
): string | null {
  if (anchor === null) return null
  if (anchor.kind !== round) return `a ${round} round takes no ${anchor.kind} anchor`
  if (anchor.kind === 'code') {
    if (
      anchor.lines !== null &&
      (anchor.lines.start < 1 || anchor.lines.end < anchor.lines.start)
    ) {
      return `the lines ${anchor.lines.start}–${anchor.lines.end} are no range`
    }
    return null
  }
  if (!revision.stories.some((story) => story.id === anchor.storyId)) {
    return 'the story named is not one of the frozen revision'
  }
  if (anchor.criterion === null) return null
  const count = revision.criteria.filter((one) => one.storyId === anchor.storyId).length
  if (!Number.isInteger(anchor.criterion) || anchor.criterion < 0 || anchor.criterion >= count) {
    return `the story has ${count} criteria: criterion ${anchor.criterion} is not one of them`
  }
  return null
}
