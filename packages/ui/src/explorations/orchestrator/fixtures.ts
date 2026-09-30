import type { FaceState } from '../../components/face/states.ts'
import type { GoingOnAgent } from '../../session/going-on.ts'
import type { HelperIconName } from './helper-icons.tsx'

/**
 * The build of `ATL-7` (the build view's own fixtures, `BUILDING`: T1 done, T2 on its second try,
 * T3 being checked, T4 the user's) at one moment, with the helper agents its main agent launched.
 *
 * The main agent is the one the user talks to. It launched a free helper on T2 and one on T3 to go
 * faster, a test reviewer on T1 once it was done, and the documenter; the helper on T2 launched one
 * of its own to read the ledger's sample file. The helper on T3 has said nothing for seven minutes.
 */

/** A helper written in advance: what it is, what it is given, what it may do and what it returns. */
export interface HelperDefinition {
  id: string
  /** What the main agent launches it by, and what its chip says. */
  name: string
  icon: HelperIconName
  description: string
  /** Its brief and its inputs. */
  receives: string
  /** Its tools, and whether it may write. */
  may: string
  writes: boolean
  /** The shape of its result, which the main agent and Hemera read. */
  returns: string
  /** The protocol and phase it is launched in. */
  where: string
}

export const DEFINITIONS: readonly HelperDefinition[] = [
  {
    id: 'review-tests',
    name: 'Test review',
    icon: 'reviewer',
    description:
      'Reads a finished task with a fresh context and says whether its tests prove its criteria.',
    receives: 'The task, its criteria, its files and its checks',
    may: 'Read files, search, run the Project’s test commands',
    writes: false,
    returns: 'A verdict and findings, each on a file and a line',
    where: 'build · review',
  },
  {
    id: 'review-security',
    name: 'Security review',
    icon: 'reviewer',
    description: 'Reads the diff of the build for what an input could make it do.',
    receives: 'The diff of the build and the Spec',
    may: 'Read files, search',
    writes: false,
    returns: 'A verdict and findings, each on a file and a line',
    where: 'build · review',
  },
  {
    id: 'documenter',
    name: 'Documenter',
    icon: 'documenter',
    description: 'Writes what the build changed into the Project’s documentation.',
    receives: 'The Spec, the build’s tasks and their files',
    may: 'Read files, write under the documentation folders',
    writes: true,
    returns: 'The files it wrote, and one line each',
    where: 'build · document',
  },
  {
    id: 'prototyper',
    name: 'Prototyper',
    icon: 'prototyper',
    description: 'Draws a throwaway prototype of a story, to settle a question of the Spec.',
    receives: 'The Spec being defined and the question',
    may: 'Read files, write in a scratch folder of its own',
    writes: true,
    returns: 'Where the prototype runs, and what it answered',
    where: 'define · prototype',
  },
]

/** How a helper stands: `stuck` is running, and silent for too long. */
export type HelperState = 'running' | 'stuck' | 'finished' | 'failed'

/**
 * A helper agent at work: a child Session of the build Session. `GoingOnAgent` is what the line's
 * Details already say of a sub-agent; this adds what the chip and the session need.
 */
export interface Helper {
  id: string
  /** A defined helper's id, or `null` for a free one. */
  definition: string | null
  /** A free helper's name, as the main agent wrote it in its brief; a defined one is its name. */
  name: string
  /** The task it works on, when it works on one. */
  task: string | null
  /** What it is doing now, the tool it is in. */
  doing: string
  /** The last thing it said. */
  last: string
  face: FaceState
  state: HelperState
  /** How long it has been silent, when it is stuck. */
  quiet?: string | undefined
  /** Who launched it: another helper's id, or `null` for the main agent. */
  parent: string | null
  steps: readonly string[]
  at: string
  seed: number
}

export const HELPERS: readonly Helper[] = [
  {
    id: 'helper-t2',
    definition: null,
    name: 'T2',
    task: 'T2',
    doing: 'Editing src/billing/export-csv.ts',
    last: 'The ledger wants the number before the client. Moving it, then the test again.',
    face: 'writing',
    state: 'running',
    parent: null,
    steps: [
      'Read the build of ATL-7, T2',
      'Read src/billing/export-csv.ts',
      'Launched Ledger sample',
      'Edit src/billing/export-csv.ts',
    ],
    at: '10:33',
    seed: 11,
  },
  {
    id: 'helper-sample',
    definition: null,
    name: 'Ledger sample',
    task: 'T2',
    doing: 'Reading fixtures/ledger-sample.csv',
    last: 'The sample’s header: date, number, client, net, VAT, gross, currency.',
    face: 'reading',
    state: 'running',
    parent: 'helper-t2',
    steps: ['Search ledger in fixtures/', 'Read fixtures/ledger-sample.csv'],
    at: '10:36',
    seed: 23,
  },
  {
    id: 'helper-t3',
    definition: null,
    name: 'T3',
    task: 'T3',
    doing: 'Running pnpm vitest run src/billing/credit-notes.test.ts',
    last: 'Credit notes are negative rows of type `credit`. Running their test.',
    face: 'running',
    state: 'stuck',
    quiet: '7 min',
    parent: null,
    steps: [
      'Read the build of ATL-7, T3',
      'Edit src/billing/export.query.ts',
      'Run pnpm vitest run src/billing/credit-notes.test.ts',
    ],
    at: '10:31',
    seed: 37,
  },
  {
    id: 'helper-review',
    definition: 'review-tests',
    name: 'Test review',
    task: 'T1',
    doing: 'Done',
    last: 'T1’s tests prove both criteria: an empty month returns no line, and 10 000 lines stream in 1.2 s.',
    face: 'done',
    state: 'finished',
    parent: null,
    steps: ['Read T1 and its criteria', 'Read src/billing/export.query.test.ts', 'Verdict: green'],
    at: '10:30',
    seed: 41,
  },
  {
    id: 'helper-docs',
    definition: 'documenter',
    name: 'Documenter',
    task: null,
    doing: 'Writing docs/billing/export.md',
    last: 'The export page: what the file holds, and its column order.',
    face: 'writing',
    state: 'running',
    parent: null,
    steps: ['Read the Spec of ATL-7', 'Read docs/billing/', 'Write docs/billing/export.md'],
    at: '10:38',
    seed: 53,
  },
]

export function definitionOf(helper: Helper): HelperDefinition | undefined {
  return DEFINITIONS.find((one) => one.id === helper.definition)
}

export function iconOf(helper: Helper): HelperIconName {
  return definitionOf(helper)?.icon ?? 'free'
}

const GOING_ON_STATES: Record<HelperState, GoingOnAgent['state']> = {
  running: 'running',
  stuck: 'running',
  finished: 'finished',
  failed: 'failed',
}

/** What the line's Details already take for a sub-agent: a stuck helper is still running. */
export function goingOnOf(helper: Helper): GoingOnAgent {
  return {
    kind: 'agent',
    id: helper.id,
    name: helper.name,
    task: helper.doing,
    state: GOING_ON_STATES[helper.state],
    last: helper.last,
    steps: helper.steps,
    at: helper.at,
  }
}

/** The helpers the main agent launched itself, each followed by the ones it launched. */
export function familyOf(helpers: readonly Helper[]): { helper: Helper; children: Helper[] }[] {
  return helpers
    .filter((helper) => helper.parent === null)
    .map((helper) => ({
      helper,
      children: helpers.filter((child) => child.parent === helper.id),
    }))
}

/**
 * Where a helper stands in the build, in the quiet words after its name: the task a helper of the
 * main agent is on, and for a helper launched by another, which one launched it.
 */
export function placeOf(helper: Helper, helpers: readonly Helper[]): string {
  if (helper.parent === null) {
    if (helper.definition === null) return helper.task === helper.name ? 'free helper' : ''
    return helper.task ?? ''
  }
  const launcher = helpers.find((one) => one.id === helper.parent)
  return `by ${launcher?.name ?? 'the main agent'}`
}
