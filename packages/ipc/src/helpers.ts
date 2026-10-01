/**
 * Helper agents as the window reads them (issue #77): what makes a Session a helper, each helper
 * of a build as the line of what goes on lists it, and the use cases that carry both.
 *
 * Zod mirrors of the domain's closed sets in `packages/core/src/domain/helpers.ts`, field for
 * field and with the same names; every time here is an ISO string, as the engine writes it.
 */

import { z } from 'zod'

/** Where a helper stands: running, then done, stopped or failed. */
export const helperStateSchema = z.enum(['running', 'done', 'stopped', 'failed'])

export type HelperState = z.infer<typeof helperStateSchema>

/** What makes a Session a helper: who launched it, what it runs, how deep it stands. */
export const helperPlaceSchema = z.object({
  parentSessionId: z.string(),
  /** The defined helper it runs, by id, or null for a free one. */
  definition: z.string().nullable(),
  depth: z.number(),
  /** The build task it was launched on, by its label (T2), or null. */
  task: z.string().nullable(),
})

export type HelperPlace = z.infer<typeof helperPlaceSchema>

/** One helper of a build, as the line of what goes on reads it. */
export const helperViewSchema = z.object({
  id: z.string(),
  /** The Session that launched it: the build Session, or another helper. */
  parentSessionId: z.string(),
  name: z.string(),
  definition: z.string().nullable(),
  depth: z.number(),
  task: z.string().nullable(),
  state: helperStateSchema,
  /** The last line it said, or null while it has said nothing. */
  lastLine: z.string().nullable(),
  startedAt: z.string(),
  endedAt: z.string().nullable(),
})

export type HelperView = z.infer<typeof helperViewSchema>

const helpersSchema = z.object({ helpers: z.array(helperViewSchema) })

/**
 * The helper use cases of the process that holds the database, spread into `ENGINE_REQUESTS`.
 *
 * The window launches no helper and never talks to one: it reads the helpers of a build, and the
 * user's × stops one — the main agent is told (issue #77). Both answer the build's helpers.
 */
export const HELPER_REQUESTS = {
  // Every helper under a build Session, at any depth, in the order they were launched.
  'helpers.list': {
    arguments: z.object({ sessionId: z.string() }),
    response: helpersSchema,
  },
  // A helper stopped by the user: `sessionId` is the helper's own.
  'helpers.stop': {
    arguments: z.object({ sessionId: z.string() }),
    response: helpersSchema,
  },
} as const
