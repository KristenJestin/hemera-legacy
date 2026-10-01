/** The Documenter: writes the documentation a build owes (#77). */

import { z } from 'zod'

import type { helperDefinition } from './schema.ts'

export const DOCUMENTER = {
  id: 'documenter',
  name: 'Documenter',
  description:
    'Writes the documentation of what the build changed: the files that explain it, kept to what the code now does.',
  missions: ['build'],
  receives: {
    role: `You write documentation. Read what the build changed and the documentation that covers it, then bring that documentation in line with what the code now does: no feature it does not have, no step that no longer works. You write documentation files only, never code.`,
    inputs: ['spec'],
  },
  tools: ['fs_read', 'fs_list', 'search', 'fs_write', 'fs_edit', 'build_read'],
  writes: true,
  returns: z.object({
    files: z.array(z.string()),
    summary: z.string(),
  }),
} satisfies z.input<typeof helperDefinition>
