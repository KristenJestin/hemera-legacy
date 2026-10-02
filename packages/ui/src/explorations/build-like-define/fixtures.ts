import type { StatusTone } from '../../components/status-dot/status-dot.tsx'
import type { HelperIconName } from './helper-icons.tsx'

/**
 * The build of `ATL-7` (the build view's own fixtures, `BUILDING`) at one moment, with the three
 * helper agents its main agent launched: two defined ones, a test review and the documenter, each
 * with its own icon, and one free helper with the common icon.
 *
 * What a helper was handed and who launched it are the main agent's business: nothing here says
 * them. A helper is its icon, its name, how it stands, its last line and its thread.
 */

/** How a helper stands: `stuck` is running, and silent for too long. */
export type HelperState = 'running' | 'stuck' | 'finished' | 'failed' | 'stopped'

export const HELPER_TONES: Record<HelperState, StatusTone> = {
  running: 'running',
  stuck: 'pending',
  finished: 'success',
  failed: 'failure',
  stopped: 'cancelled',
}

/** What a screen reader hears after the helper's name. */
export const HELPER_WORDS: Record<HelperState, string> = {
  running: 'running',
  stuck: 'silent',
  finished: 'done',
  failed: 'failed',
  stopped: 'stopped',
}

export interface Helper {
  id: string
  /** A defined helper's name, or the one the main agent gave a free helper. */
  name: string
  icon: HelperIconName
  state: HelperState
  /** The last thing it said, which is what its glance shows. */
  last: string
  /** Its thread so far, one line a step, the last one the step it is in. */
  steps: readonly string[]
  at: string
  /** How long it has been running, or ran. */
  for: string
}

export const REVIEW: Helper = {
  id: 'helper-review',
  name: 'Test review',
  icon: 'reviewer',
  state: 'running',
  last: 'T1’s first criterion is proved: an empty month returns no line. Reading the streaming test.',
  steps: [
    'Read the task T1 and its criteria',
    'Read src/billing/export.query.test.ts',
    'Run pnpm vitest run src/billing/export.query.test.ts',
  ],
  at: '10:34',
  for: '6 min',
}

export const DOCUMENTER: Helper = {
  id: 'helper-docs',
  name: 'Documenter',
  icon: 'documenter',
  state: 'running',
  last: 'The export page: what the file holds, and its column order.',
  steps: ['Read the Spec of ATL-7', 'Read docs/billing/', 'Write docs/billing/export.md'],
  at: '10:38',
  for: '2 min',
}

export const WORKER: Helper = {
  id: 'helper-credit',
  name: 'Credit notes',
  icon: 'free',
  state: 'running',
  last: 'Credit notes are negative rows of type credit. Running their test.',
  steps: [
    'Read src/billing/export.query.ts',
    'Edit src/billing/export.query.ts',
    'Run pnpm vitest run src/billing/credit-notes.test.ts',
  ],
  at: '10:31',
  for: '9 min',
}

/** The three helpers of a build going well. */
export const HELPERS: readonly Helper[] = [REVIEW, DOCUMENTER, WORKER]

/** The same build, its free helper silent for seven minutes in its test run. */
export const STUCK: readonly Helper[] = [REVIEW, DOCUMENTER, { ...WORKER, state: 'stuck' }]

/** What a chip is called to a screen reader. */
export function helperName(helper: Helper): string {
  return `Helper ${helper.name}, ${HELPER_WORDS[helper.state]}`
}

/** A free Session's helpers: one reading the code for the agent, one reviewing what it wrote. */
export const FREE_HELPERS: readonly Helper[] = [
  {
    id: 'helper-explore',
    name: 'Explore',
    icon: 'free',
    state: 'running',
    last: 'Three places build a CSV today; only shared/csv.ts escapes quotes.',
    steps: ['Search csv in src/', 'Read src/shared/csv.ts', 'Read src/reports/export.ts'],
    at: '09:12',
    for: '4 min',
  },
  {
    ...REVIEW,
    state: 'finished',
    last: 'The rounding fix is proved by its test: green.',
    for: '3 min',
  },
]

/** A `define` Session's helper: the prototyper, drawing a throwaway page to settle a question. */
export const DEFINE_HELPERS: readonly Helper[] = [
  {
    id: 'helper-prototype',
    name: 'Prototyper',
    icon: 'prototyper',
    state: 'running',
    last: 'The month picker as a select and as a calendar, side by side on one page.',
    steps: ['Read the Spec of ATL-7', 'Write scratch/month-picker.html', 'Serve scratch/'],
    at: '10:52',
    for: '3 min',
  },
]
