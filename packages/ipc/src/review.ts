/**
 * The review rounds of a build as the window reads them, and the feedback the user leaves on one
 * (issue #278).
 *
 * Zod mirrors of the domain's closed sets in `packages/core/src/domain/review.ts`, with the same
 * names. The window adds and withdraws feedback; nothing here opens, moves or closes a round, or
 * clears a stale mark: those are the build's.
 */

import { z } from 'zod'

/** Where a round stands: reviewed, being fixed, over. */
export const roundStateSchema = z.enum(['open', 'fixing', 'closed'])

/** What a round reviews: the build against its Spec, or (not produced yet) the diff. */
export const roundKindSchema = z.enum(['spec', 'code'])

/** What a feedback is about. */
export const feedbackKindSchema = z.enum(['product', 'general', 'question'])

export type FeedbackKind = z.infer<typeof feedbackKindSchema>

/**
 * What a feedback points at: on a Spec review, a story of the frozen revision or one of its
 * criteria by its index from zero; on a code review, a file, lines on one side of the diff.
 */
export const feedbackAnchorSchema = z.discriminatedUnion('kind', [
  z.object({
    kind: z.literal('spec'),
    storyId: z.string(),
    criterion: z.number().int().nullable(),
  }),
  z.object({
    kind: z.literal('code'),
    repository: z.string(),
    path: z.string(),
    lines: z.object({ start: z.number().int(), end: z.number().int() }).nullable(),
    side: z.enum(['old', 'new']).nullable(),
  }),
])

export type FeedbackAnchor = z.infer<typeof feedbackAnchorSchema>

/** One file of a round, from its repository's base to the round's tree. */
export const roundFileSchema = z.object({
  path: z.string(),
  status: z.string(),
  /** Lines added and removed; null for a binary file. */
  added: z.number().nullable(),
  removed: z.number().nullable(),
  untracked: z.boolean(),
})

/** The checkpoint of one repository when its round opened, and whether it went stale since. */
export const roundRepositorySchema = z.object({
  /** Its path under the Workspace root, `''` for one at the root. */
  repository: z.string(),
  head: z.string(),
  tree: z.string(),
  base: z.string().nullable(),
  baseCommit: z.string(),
  /** When its working tree was first found to differ from the round's; null while it matches. */
  staleAt: z.string().nullable(),
  files: z.readonly(z.array(roundFileSchema)),
})

/** One feedback of the user's on a round. */
export const feedbackViewSchema = z.object({
  id: z.string(),
  kind: feedbackKindSchema,
  body: z.string(),
  anchor: feedbackAnchorSchema.nullable(),
  createdAt: z.string(),
  withdrawnAt: z.string().nullable(),
})

/** A review round: round 1, 2… of a build, its checkpoints, its stale mark and its feedback. */
export const reviewRoundViewSchema = z.object({
  id: z.string(),
  number: z.number(),
  kind: roundKindSchema,
  state: roundStateSchema,
  openedAt: z.string(),
  fixingAt: z.string().nullable(),
  closedAt: z.string().nullable(),
  stale: z.boolean(),
  repositories: z.readonly(z.array(roundRepositorySchema)),
  feedback: z.readonly(z.array(feedbackViewSchema)),
})

export type ReviewRoundView = z.infer<typeof reviewRoundViewSchema>

/**
 * The review use cases of the process that holds the database, spread into `ENGINE_REQUESTS`.
 * `review.read` answers the rounds of a build, the open one checked against its repositories
 * first; adding or withdrawing a feedback answers the round it changed, and starts nothing.
 */
export const REVIEW_REQUESTS = {
  'review.read': {
    arguments: z.object({ sessionId: z.string() }),
    response: z.readonly(z.array(reviewRoundViewSchema)),
  },
  'review.addFeedback': {
    arguments: z.object({
      sessionId: z.string(),
      kind: feedbackKindSchema,
      body: z.string(),
      anchor: feedbackAnchorSchema.nullable(),
    }),
    response: reviewRoundViewSchema,
  },
  'review.withdrawFeedback': {
    arguments: z.object({ sessionId: z.string(), feedbackId: z.string() }),
    response: reviewRoundViewSchema,
  },
} as const
