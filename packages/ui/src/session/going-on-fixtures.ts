import type { GoingOnAgent, GoingOnItem, GoingOnRun, GoingOnShell } from './going-on.ts'

/**
 * What goes on in the Session the line's stories are drawn in (issue #219): a server and a test
 * Hemera runs, a check that failed, a one-off, the agent's own shell commands, and two sub-agents.
 */

const DEV: GoingOnRun = {
  kind: 'run',
  id: 'run-dev',
  name: 'dev',
  command: 'pnpm dev',
  type: 'serve',
  state: 'running',
  folder: 'sources/front',
  workspace: 'csv-export',
  output:
    'vite v7.1.4 building for development...\n\n  Local:   http://localhost:5173/\n  press h + enter to show help',
  url: 'http://localhost:5173/',
  readiness: 'ready',
  startedBy: 'user',
  environment: { PORT: '5173' },
  at: '10:31',
}

const TEST: GoingOnRun = {
  kind: 'run',
  id: 'run-test',
  name: 'test',
  command: 'pnpm test',
  type: 'test',
  state: 'running',
  folder: 'sources/api',
  workspace: 'csv-export',
  output:
    '> atlas@0.0.0 test\n> vitest run --project api\n\n ✓ export.service.test.ts (6)\n ✓ invoices.query.test.ts (4)\n ❯ csv.stream.test.ts (3)',
  startedBy: 'agent',
  environment: {},
  at: '10:36',
}

const LINT: GoingOnRun = {
  kind: 'run',
  id: 'run-lint',
  name: 'lint',
  command: 'pnpm lint',
  type: 'lint',
  state: 'finished',
  folder: 'sources/api',
  workspace: 'csv-export',
  output: '> atlas@0.0.0 lint\n> oxlint\n\nFound 0 warnings and 0 errors.',
  exitCode: 0,
  startedBy: 'agent',
  environment: {},
  at: '10:40',
}

const TYPECHECK: GoingOnRun = {
  kind: 'run',
  id: 'run-typecheck',
  name: 'typecheck',
  command: 'pnpm typecheck',
  type: 'lint',
  state: 'failed',
  folder: 'sources/api',
  workspace: 'csv-export',
  output:
    "> atlas@0.0.0 typecheck\n> tsc -p sources/api\n\nsrc/export/csv.stream.ts(42,17): error TS2322:\n  Type 'string | null' is not assignable to type 'string'.",
  exitCode: 2,
  startedBy: 'agent',
  environment: {},
  at: '10:44',
}

const ONE_OFF: GoingOnRun = {
  kind: 'run',
  id: 'run-one-off',
  name: 'pnpm vitest run csv.stream --reporter verbose',
  command: 'pnpm vitest run csv.stream --reporter verbose',
  type: 'script',
  state: 'running',
  folder: '.',
  workspace: 'csv-export',
  output: '',
  oneOff: true,
  startedBy: 'user',
  environment: {},
  at: '10:46',
}

/** The same one-off, over and well: what a glance offers to run again or keep (issue #237). */
export const ONE_OFF_DONE: GoingOnRun = {
  ...ONE_OFF,
  id: 'run-one-off-done',
  state: 'finished',
  exitCode: 0,
  output: '✓ csv.stream (3 tests)',
}

/** A run in `v2`, which the Project declares as one of its repositories, at its base (#239). */
const IN_REPOSITORY: GoingOnRun = {
  kind: 'run',
  id: 'run-in-repository',
  name: 'build',
  command: 'pnpm build',
  type: 'build',
  state: 'running',
  repository: { path: 'v2', icon: null },
  folder: '.',
  workspace: 'csv-export',
  output: '> v2@0.0.0 build\n> vite build',
  startedBy: 'user',
  environment: {},
  at: '10:47',
}

/** A run in `tools`, a folder of the Workspace that is none of the Project's repositories. */
const IN_FOLDER: GoingOnRun = {
  kind: 'run',
  id: 'run-in-folder',
  name: 'seed',
  command: 'node seed.ts',
  type: 'script',
  state: 'running',
  folder: 'tools',
  workspace: 'csv-export',
  output: 'Seeding 120 invoices…',
  startedBy: 'user',
  environment: {},
  at: '10:48',
}

const VITEST: GoingOnShell = {
  kind: 'shell',
  id: 'shell-vitest',
  command: 'pnpm vitest run csv.stream',
  folder: 'sources/api',
  workspace: 'csv-export',
  state: 'running',
  output:
    ' RUN  v3.2.4 sources/api\n\n ❯ csv.stream.test.ts (3)\n   ✓ writes the header row\n   ❯ streams a month of rows',
  at: '10:42',
}

const RG: GoingOnShell = {
  kind: 'shell',
  id: 'shell-rg',
  command: 'rg -n "currency" src',
  folder: 'sources/api',
  workspace: 'csv-export',
  state: 'finished',
  output:
    'src/invoice.ts:14:  currency?: string\nsrc/export/csv.stream.ts:42:    row.currency,\nsrc/list/invoice-list.tsx:31:  const code = invoice.currency.toUpperCase()',
  exitCode: 0,
  at: '10:39',
}

const GIT: GoingOnShell = {
  kind: 'shell',
  id: 'shell-git',
  command: 'git log --oneline -5',
  folder: 'sources/api',
  workspace: 'csv-export',
  state: 'finished',
  output:
    '9c1e2f0 make currency optional on invoices\n4b7a311 list invoices by month\n0d2c9e8 export service skeleton',
  exitCode: 0,
  at: '10:33',
}

const EXPLORE: GoingOnAgent = {
  kind: 'agent',
  id: 'agent-explore',
  name: 'Explore',
  task: 'Find every place that reads an invoice’s currency as a string.',
  state: 'running',
  last: 'Found 12 reads of `currency` in 7 files; checking which ones render it.',
  steps: [
    'Searched currency in sources/api',
    'Read src/invoice.ts',
    'Read src/list/invoice-list.tsx',
    'Searched toUpperCase() in sources/front',
  ],
  at: '10:41',
}

const REVIEW: GoingOnAgent = {
  kind: 'agent',
  id: 'agent-review',
  name: 'Review',
  task: 'Review the CSV stream for rows that could be written twice.',
  state: 'finished',
  last: 'No row is written twice: the cursor advances after each flush.',
  steps: ['Read src/export/csv.stream.ts', 'Read src/export/export.service.ts'],
  at: '10:37',
}

/** The cases the line is drawn in, each in the order its items began. */
export const GOING_ON: Record<
  'few' | 'many' | 'failed' | 'oneOff' | 'places',
  readonly GoingOnItem[]
> = {
  few: [DEV, TEST, VITEST],
  many: [DEV, TEST, LINT, VITEST, RG, GIT, EXPLORE, REVIEW],
  failed: [DEV, TYPECHECK, VITEST, EXPLORE],
  oneOff: [DEV, ONE_OFF],
  places: [IN_REPOSITORY, IN_FOLDER],
}
