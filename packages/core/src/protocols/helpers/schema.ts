/**
 * The one schema every defined helper is written against (issue #77): one file per helper in this
 * folder, each exporting a definition this schema parses, so what a helper is, receives, may do and
 * returns is written down in one place and checked by one rule.
 */

import { z } from 'zod'

import { MISSIONS } from '../../domain/session.ts'
import { BUILDING, HELPING, TOOL_NAMES } from '../../domain/tools.ts'

/** The tools that change a file of the Workspace: what a read-only helper never holds. */
export const WRITING_TOOLS = ['fs_write', 'fs_edit'] as const

/**
 * What Hemera assembles for a helper beside its launcher's brief: the frozen Spec, and the task it
 * was launched on as the build's briefs define it.
 */
export const HELPER_INPUTS = ['spec', 'task'] as const

export const helperDefinition = z
  .object({
    /** Stable, what the main agent names it by in `helper_launch`. */
    id: z.string().regex(/^[a-z]+(-[a-z]+)*$/, 'an id is lowercase words joined by hyphens'),
    /** What a reader calls it. */
    name: z.string().trim().min(1).max(40),
    /** One sentence, given to the main agent with the list of helpers it may launch. */
    description: z.string().trim().min(1),
    /** The missions whose Sessions may launch it. */
    missions: z.array(z.enum(MISSIONS)).min(1),
    /** What it receives: its role, which opens its brief, and what Hemera assembles beside it. */
    receives: z.object({
      role: z.string().trim().min(1),
      inputs: z.array(z.enum(HELPER_INPUTS)),
    }),
    /**
     * The Hemera tools it holds. The three helper tools are not listed here: whether a helper may
     * launch its own is the depth's to say, not the definition's.
     */
    tools: z.array(z.enum(TOOL_NAMES)).min(1),
    /** Whether it may change a file of the Workspace; a read-only helper holds no write tool. */
    writes: z.boolean(),
    /** The shape of its result, which Hemera reads its answer against before its launcher does. */
    returns: z.custom<z.ZodObject>((value) => value instanceof z.ZodObject, 'a Zod object'),
  })
  .superRefine((definition, context) => {
    for (const tool of definition.tools) {
      if (HELPING.has(tool)) {
        context.addIssue({
          code: 'custom',
          path: ['tools'],
          message: `${tool} is given by the depth a helper stands at, never by its definition`,
        })
      }
      if (BUILDING.has(tool) && !definition.missions.includes('build')) {
        context.addIssue({
          code: 'custom',
          path: ['tools'],
          message: `${tool} is a build's own, and this helper is launched in no build`,
        })
      }
    }
    if (!definition.writes) {
      for (const tool of WRITING_TOOLS) {
        if (definition.tools.includes(tool)) {
          context.addIssue({
            code: 'custom',
            path: ['tools'],
            message: `a read-only helper holds no ${tool}`,
          })
        }
      }
    }
    if (new Set(definition.tools).size !== definition.tools.length) {
      context.addIssue({ code: 'custom', path: ['tools'], message: 'a tool is listed twice' })
    }
  })

export type HelperDefinition = z.infer<typeof helperDefinition>
