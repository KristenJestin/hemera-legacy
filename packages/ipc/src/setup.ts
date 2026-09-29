/**
 * A change to a Project's setup an agent proposed, as its entry in the thread carries it (#218).
 *
 * The engine writes it when the agent proposes, and writes it again in its outcome when a human
 * decides; the window reads it to draw the card. One schema for both readers, so what the engine
 * applies is what the card showed. A variable's value is never in it (Decided 2 of #218).
 */

import { z } from 'zod'

import { commandScopeSchema, commandTypeSchema } from './tools.ts'
import { recipeKindSchema } from './workspaces.ts'

export const setupChangeSchema = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('repository'), path: z.string() }),
  z.object({
    kind: z.literal('command'),
    name: z.string(),
    line: z.string(),
    lineWindows: z.string().nullable(),
    lineLinux: z.string().nullable(),
    type: commandTypeSchema,
    repository: z.string().nullable(),
    folder: z.string().nullable(),
    scope: commandScopeSchema,
    portless: z.boolean(),
    portlessName: z.string().nullable(),
    runAtOpen: z.boolean(),
    replaces: z.boolean(),
  }),
  z.object({
    kind: z.literal('step'),
    step: recipeKindSchema,
    repository: z.string().nullable(),
    path: z.string().nullable(),
    command: z.string().nullable(),
    line: z.string().nullable(),
    lineWindows: z.string().nullable(),
    lineLinux: z.string().nullable(),
  }),
  z.object({
    kind: z.literal('variable'),
    name: z.string(),
    workspace: z.string().nullable(),
    replaces: z.boolean(),
  }),
  z.object({ kind: z.literal('workspace_create'), name: z.string() }),
  z.object({
    kind: z.enum(['workspace_prepare', 'workspace_resume', 'workspace_cleanup']),
    workspace: z.string(),
  }),
])

export type SetupChange = z.infer<typeof setupChangeSchema>

/** Where a proposal stands: waiting for the human, or answered. */
export const setupProposalStateSchema = z.enum(['pending', 'accepted', 'declined'])

export type SetupProposalState = z.infer<typeof setupProposalStateSchema>

/**
 * The payload of a `setup_proposal` entry: the change, the batch it was proposed in — every
 * change of one call — and why the agent proposed it.
 */
export const setupProposalSchema = z.object({
  proposalId: z.string(),
  batchId: z.string(),
  change: setupChangeSchema,
  why: z.string(),
  state: setupProposalStateSchema,
})

export type SetupProposal = z.infer<typeof setupProposalSchema>
