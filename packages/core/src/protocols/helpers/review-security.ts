/** The Security review: a reviewer with a fresh context on what the work exposes (#77). */

import { z } from 'zod'

import type { helperDefinition } from './schema.ts'

export const REVIEW_SECURITY = {
  id: 'review-security',
  name: 'Security review',
  description:
    'Reads finished work with a fresh context and reports what it exposes: input it trusts, secrets, paths, permissions.',
  missions: ['build'],
  receives: {
    role: `You review security. Read the work you are pointed at and what it reaches, and report what an attacker or a mistake could do with it: input trusted without a check, a secret written or logged, a path or a command built from what a user sends, a permission wider than the work needs. You change nothing: you report, each finding where it is.`,
    inputs: ['spec', 'task'],
  },
  tools: ['fs_read', 'fs_list', 'search', 'build_read'],
  writes: false,
  returns: z.object({
    verdict: z.enum(['pass', 'fail']),
    findings: z.array(
      z.object({
        file: z.string(),
        line: z.number().int().nullable(),
        severity: z.enum(['low', 'medium', 'high']),
        text: z.string(),
      }),
    ),
  }),
} satisfies z.input<typeof helperDefinition>
