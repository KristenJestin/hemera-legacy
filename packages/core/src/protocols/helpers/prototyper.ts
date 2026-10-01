/** The Prototyper: drafts a prototype in `define`'s `prototype` phase (#77). */

import { z } from 'zod'

import type { helperDefinition } from './schema.ts'

export const PROTOTYPER = {
  id: 'prototyper',
  name: 'Prototyper',
  description:
    'Drafts a throwaway prototype of what the Spec describes, so the user can see it before the contract is frozen.',
  missions: ['define'],
  receives: {
    role: `You draft a prototype. Read the Spec and the code it will touch, then write the smallest throwaway prototype that shows what the Spec describes: what the user will see and do, not how it will be built. It is a sketch to decide on, never the code a build will keep.`,
    inputs: ['spec'],
  },
  tools: ['fs_read', 'fs_list', 'search', 'fs_write'],
  writes: true,
  returns: z.object({
    files: z.array(z.string()),
    summary: z.string(),
  }),
} satisfies z.input<typeof helperDefinition>
