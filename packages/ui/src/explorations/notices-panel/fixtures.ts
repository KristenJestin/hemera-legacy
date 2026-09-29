import type { CommandType } from '../../activity/command-type.ts'

/**
 * What waits in every variant of the exploration (review of #250): the same five things, so the
 * variants differ by their shape and nothing else.
 */

export type Kind = 'permission' | 'proposal' | 'question'

export interface Choice {
  id: string
  label: string
}

export type Waiting =
  | { id: string; kind: 'permission'; line: string; place: string }
  | { id: string; kind: 'proposal'; name: string; line: string; type: CommandType; place?: string }
  | { id: string; kind: 'question'; question: string; choices: readonly Choice[] }

export const PERMISSION: Waiting = {
  id: 'ask',
  kind: 'permission',
  line: 'pnpm --filter @atlas/api vitest run src/invoices/csv.stream.spec.ts --reporter=verbose --coverage.enabled=false',
  place: 'api',
}

export const PROPOSALS: Waiting[] = [
  { id: 'dev', kind: 'proposal', name: 'dev', line: 'pnpm dev', type: 'serve' },
  {
    id: 'format',
    kind: 'proposal',
    name: 'format:check',
    line: 'bun run format:check',
    type: 'lint',
    place: 'v2',
  },
  { id: 'test', kind: 'proposal', name: 'test', line: 'pnpm vitest run', type: 'test' },
]

export const QUESTION: Waiting = {
  id: 'credit-notes',
  kind: 'question',
  question: 'Credit notes: negative rows in the same file, or left out of the export?',
  choices: [
    { id: 'negative', label: 'Negative rows in the same file' },
    { id: 'separate', label: 'A second file for credit notes' },
    { id: 'omitted', label: 'Left out of the export' },
  ],
}

/** The whole set: one permission, three proposals, one question. */
export const EVERYTHING: Waiting[] = [PERMISSION, ...PROPOSALS, QUESTION]

/** One permission alone. */
export const ONE: Waiting[] = [PERMISSION]
