import type { GoingOnAgent, GoingOnItem, GoingOnRun, GoingOnShell } from './going-on.ts'

/**
 * What goes on in the Session the line's stories are drawn in (issue #219): a server and a test
 * Hemera runs, a check that failed, a one-off, the agent's own shell commands, and helpers.
 */

/** The moment the stories are drawn from, which the runs' seconds count from. */
const NOW = Date.now()

/** A run that started `seconds` ago and still runs. */
function since(seconds: number): Pick<GoingOnRun, 'startedAt' | 'endedAt'> {
  return { startedAt: NOW - seconds * 1000, endedAt: null }
}

/** A run that started `ago` seconds ago and took `seconds`. */
function took(seconds: number, ago: number): Pick<GoingOnRun, 'startedAt' | 'endedAt'> {
  return { startedAt: NOW - ago * 1000, endedAt: NOW - (ago - seconds) * 1000 }
}

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
  ...since(9 * 60),
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
  ...since(84),
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
  ...took(6, 300),
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
  ...took(12, 60),
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
  ...since(20),
}

/** The same one-off, over and well: what a glance offers to run again or keep (issue #237). */
export const ONE_OFF_DONE: GoingOnRun = {
  ...ONE_OFF,
  id: 'run-one-off-done',
  state: 'finished',
  exitCode: 0,
  output: '✓ csv.stream (3 tests)',
  ...took(18, 40),
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
  ...since(31),
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
  ...since(2),
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

/** A free helper on a task, at work. */
const READER: GoingOnAgent = {
  kind: 'agent',
  id: 'helper-reader',
  name: 'Write the reader',
  state: 'running',
  step: 'Editing a file',
  last: 'The reader streams the rows; now the `currency` column.',
  face: 'writing',
  at: '10:41',
  ...since(126),
}

/** A defined helper that has finished. */
const REVIEW: GoingOnAgent = {
  kind: 'agent',
  id: 'helper-review',
  name: 'Test review',
  state: 'finished',
  last: 'Every criterion of T1 has a test named after it.',
  face: 'done',
  at: '10:37',
  ...took(48, 300),
}

/** A helper whose agent died. */
const SECURITY: GoingOnAgent = {
  kind: 'agent',
  id: 'helper-security',
  name: 'Security review',
  state: 'failed',
  last: null,
  face: 'error',
  at: '10:38',
  ...took(12, 200),
}

/** A helper the reader stopped. */
const DOCUMENTER: GoingOnAgent = {
  kind: 'agent',
  id: 'helper-documenter',
  name: 'Documenter',
  state: 'stopped',
  last: 'Reading the README.',
  face: 'asleep',
  at: '10:39',
  ...took(30, 150),
}

/** A helper whose initial another one shares: `Write the reader` and `Wire them`. */
const WIRING: GoingOnAgent = {
  kind: 'agent',
  id: 'helper-wiring',
  name: 'Wire them',
  state: 'running',
  step: 'Reading a file',
  last: 'Reading how the exporter is called.',
  face: 'reading',
  at: '10:42',
  ...since(40),
}

/** A free helper whose brief is its name, long. */
const LONG: GoingOnAgent = {
  kind: 'agent',
  id: 'helper-long',
  name: 'Find every place that reads an invoice’s currency as a string and list them',
  state: 'running',
  last: 'Found 12 reads of `currency` in 7 files.',
  face: 'reading',
  at: '10:43',
  ...since(9),
}

/** Helpers alone, at work and over. */
export const HELPERS: Record<
  'running' | 'ended' | 'sharedInitials' | 'longName' | 'crowded',
  readonly GoingOnItem[]
> = {
  running: [READER],
  crowded: [DEV, TEST, READER, VITEST, WIRING, REVIEW, RG],
  ended: [REVIEW, SECURITY, DOCUMENTER],
  sharedInitials: [READER, WIRING],
  longName: [LONG],
}

/** The cases the line is drawn in, each in the order its items began. */
export const GOING_ON: Record<
  'few' | 'many' | 'failed' | 'oneOff' | 'places',
  readonly GoingOnItem[]
> = {
  few: [DEV, TEST, VITEST],
  many: [DEV, TEST, LINT, VITEST, RG, GIT, READER, REVIEW],
  failed: [DEV, TYPECHECK, VITEST, READER],
  oneOff: [DEV, ONE_OFF],
  places: [IN_REPOSITORY, IN_FOLDER],
}
