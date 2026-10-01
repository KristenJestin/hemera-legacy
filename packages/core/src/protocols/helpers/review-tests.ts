/** The Test review: a reviewer with a fresh context on whether the tests prove the work (#77). */

import { z } from 'zod'

import type { helperDefinition } from './schema.ts'

export const REVIEW_TESTS = {
  id: 'review-tests',
  name: 'Test review',
  description:
    'Reads finished work with a fresh context and judges whether its tests prove what the Spec asks of it.',
  missions: ['build'],
  receives: {
    role: `You review tests. Read the work you are pointed at and the tests that cover it, run the tests, and judge whether they prove what the Spec asks: every criterion covered by a test named after it, failures that would show, no test that passes whatever the code does. You change nothing: you report.`,
    inputs: ['spec', 'task'],
  },
  tools: [
    'fs_read',
    'fs_list',
    'search',
    'commands_list',
    'commands_run',
    'commands_output',
    'build_read',
  ],
  writes: false,
  returns: z.object({
    verdict: z.enum(['pass', 'fail']),
    findings: z.array(
      z.object({ file: z.string(), line: z.number().int().nullable(), text: z.string() }),
    ),
  }),
} satisfies z.input<typeof helperDefinition>
