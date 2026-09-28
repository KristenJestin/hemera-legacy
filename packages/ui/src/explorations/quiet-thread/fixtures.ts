import type { CommandType } from '../../activity/command-type.ts'
import type { PermissionOption } from '../../approval/permission-request.tsx'
import type { CommandLine, RepositoryLine } from '../../project/model.ts'
import type { GoingOnRun, GoingOnShell } from '../../session/going-on.ts'

/**
 * What the Sessions of the exploration hold (issue #237): the runs Hemera holds, the lines the
 * agent ran in its own shell, the six commands it proposes while it sets a Project up, the one-off
 * it asks permission for, and the Project's catalogue.
 */

/** A run, and what the line knows of it beyond the run itself. */
export interface Held {
  run: GoingOnRun
  /** Whether the reader has looked at it since it ended: its glance or its thread entry opened. */
  seen: boolean
  /**
   * Whether it ended long enough ago for the line to be done with it. A run that ends while the
   * Session is looked at is not settled yet; one that ended before is.
   */
  settled: boolean
  /** Whether the reader took it out of the line by hand. It stays in the history. */
  removed: boolean
  /** Whether it ended before the Session was opened, which is a Session opened again. */
  before: boolean
}

export type ProposalAnswer = 'pending' | 'accepted' | 'declined'

/** A command the agent proposes for the catalogue. */
export interface Proposal {
  id: string
  name: string
  line: string
  type: CommandType
  folder: string
  why: string
}

export interface Proposed {
  proposal: Proposal
  answer: ProposalAnswer
}

/** How a permission question stands. */
export type AskedAnswer = 'pending' | 'allowed' | 'refused'

/** A permission the agent asks for: one of its one-offs, which waits for the reader. */
export interface Asked {
  id: string
  /** What a reader calls the tool, as the call's line says it. */
  label: string
  /** The line it would run. */
  subject: string
  intent: string
  folder: string
  options: readonly PermissionOption[]
  answer: AskedAnswer
  at: string
}

const BASE = { workspace: 'csv-export', environment: {}, startedBy: 'agent' } as const

export const DEV: GoingOnRun = {
  ...BASE,
  kind: 'run',
  id: 'run-dev',
  name: 'dev',
  command: 'pnpm dev',
  type: 'serve',
  state: 'running',
  folder: 'sources/front',
  output: 'vite v7.1.4  ready in 412 ms\n\n  Local:   http://localhost:5173/\n',
  url: 'http://localhost:5173/',
  readiness: 'ready',
  startedBy: 'user',
  environment: { PORT: '5173' },
  at: '10:31',
}

export const TEST_RUNNING: GoingOnRun = {
  ...BASE,
  kind: 'run',
  id: 'run-test',
  name: 'test',
  command: 'pnpm test',
  type: 'test',
  state: 'running',
  folder: 'sources/api',
  output:
    '> atlas@0.0.0 test\n> vitest run --project api\n\n ✓ export.service.test.ts (6)\n ✓ invoices.query.test.ts (4)\n ❯ csv.stream.test.ts (3)',
  at: '10:36',
}

export const LINT: GoingOnRun = {
  ...BASE,
  kind: 'run',
  id: 'run-lint',
  name: 'lint',
  command: 'pnpm lint',
  type: 'lint',
  state: 'finished',
  folder: 'sources/api',
  output: '> atlas@0.0.0 lint\n> oxlint\n\nFound 0 warnings and 0 errors.',
  exitCode: 0,
  at: '10:28',
}

export const SLEEP: GoingOnRun = {
  ...BASE,
  kind: 'run',
  id: 'run-sleep',
  name: 'sleep 120',
  command: 'sleep 120',
  type: 'script',
  state: 'finished',
  folder: '.',
  output: '',
  exitCode: 0,
  oneOff: true,
  startedBy: 'user',
  at: '10:12',
}

export const V2_CHECK: GoingOnRun = {
  ...BASE,
  kind: 'run',
  id: 'run-v2-check',
  name: 'v2 check',
  command: 'pnpm --filter v2 check',
  type: 'test',
  state: 'failed',
  folder: 'sources/v2',
  output:
    "> v2@0.0.0 check\n> tsc -p . && vitest run\n\nsrc/export/csv.stream.ts(42,17): error TS2322:\n  Type 'string | null' is not assignable to type 'string'.\n\nFound 1 error in src/export/csv.stream.ts:42",
  exitCode: 1,
  at: '10:44',
}

export const ONE_OFF: GoingOnRun = {
  ...BASE,
  kind: 'run',
  id: 'run-one-off',
  name: 'pnpm vitest run csv.stream',
  command: 'pnpm vitest run csv.stream',
  type: 'script',
  state: 'finished',
  folder: '.',
  output: ' RUN  v3.2.4\n\n ✓ csv.stream.test.ts (3)\n\n Test Files  1 passed (1)',
  exitCode: 0,
  oneOff: true,
  at: '10:41',
}

/** The six commands the agent proposes as it sets the Project up. */
export const PROPOSALS: readonly Proposal[] = [
  {
    id: 'proposed-dev',
    name: 'dev',
    line: 'pnpm dev',
    type: 'serve',
    folder: 'sources/front',
    why: 'Starts the front on Vite; its output names the address.',
  },
  {
    id: 'proposed-test',
    name: 'test',
    line: 'pnpm test',
    type: 'test',
    folder: '.',
    why: 'Runs every Vitest project of the repository.',
  },
  {
    id: 'proposed-lint',
    name: 'lint',
    line: 'pnpm lint',
    type: 'lint',
    folder: '.',
    why: 'oxlint over the repository, as CI runs it.',
  },
  {
    id: 'proposed-typecheck',
    name: 'typecheck',
    line: 'pnpm typecheck',
    type: 'lint',
    folder: '.',
    why: 'tsc per package, which CI runs before the tests.',
  },
  {
    id: 'proposed-build',
    name: 'build',
    line: 'pnpm build',
    type: 'build',
    folder: '.',
    why: 'The production bundles of the front and the API.',
  },
  {
    id: 'proposed-migrate',
    name: 'migrate',
    line: 'pnpm --filter api db:migrate',
    type: 'configure',
    folder: 'sources/api',
    why: 'Applies the Drizzle migrations to the local database.',
  },
]

/** A command of the catalogue, as the Project's settings hold it. */
export function entryOf(name: string, command: string, type: CommandType, base = ''): CommandLine {
  return {
    id: name,
    name,
    command,
    lineWindows: null,
    lineLinux: null,
    type,
    scope: 'workspace',
    portless: false,
    portlessName: null,
    runAtOpen: false,
    folderBase: base === '' ? null : base,
    folder: '',
  }
}

export const CATALOGUE: readonly CommandLine[] = [
  entryOf('dev', 'pnpm dev', 'serve', './sources/front'),
  entryOf('test', 'pnpm test', 'test', './sources/api'),
  entryOf('lint', 'pnpm lint', 'lint', './sources/api'),
  entryOf('v2 check', 'pnpm --filter v2 check', 'test', './sources/v2'),
]

export const REPOSITORIES: readonly RepositoryLine[] = [
  { path: './sources/api', branch: 'main', exists: true, includedByDefault: true, icon: null },
  { path: './sources/front', branch: 'main', exists: true, includedByDefault: true, icon: null },
  { path: './sources/v2', branch: 'v2', exists: true, includedByDefault: true, icon: null },
]

/** What the agent ran in its own shell, which Hemera only knows from its tool calls. */
export const SHELLS: readonly GoingOnShell[] = [
  {
    kind: 'shell',
    id: 'shell-status',
    command: 'git status --short',
    folder: '.',
    workspace: 'csv-export',
    state: 'finished',
    output: ' M sources/api/src/export/csv.stream.ts\n?? sources/api/src/export/csv.stream.test.ts',
    exitCode: 0,
    at: '10:14',
  },
  {
    kind: 'shell',
    id: 'shell-grep',
    command: 'rg -n "currency" sources/api/src/export',
    folder: '.',
    workspace: 'csv-export',
    state: 'finished',
    output: 'sources/api/src/export/csv.stream.ts:42:    row.currency ?? defaultCurrency,',
    exitCode: 0,
    at: '10:33',
  },
]

/** The one-off the agent asks to run, which waits for the reader in the `permission` scene. */
export const ASKED: Asked = {
  id: 'ask-vitest',
  label: 'Run command',
  subject: 'pnpm vitest run csv.stream --reporter=verbose',
  intent: 'asks to run a line that is not in the catalogue',
  folder: 'sources/api',
  options: [
    { optionId: 'refuse', kind: 'reject_once', name: 'Refuse' },
    { optionId: 'allow', kind: 'allow_once', name: 'Allow once' },
  ],
  answer: 'pending',
  at: '10:47',
}

/** Held runs, in the order they began. */
export function held(runs: readonly GoingOnRun[], settled = true): Held[] {
  return runs.map((run) => ({ run, seen: false, settled, removed: false, before: settled }))
}

export function pending(): Proposed[] {
  return PROPOSALS.map((proposal) => ({ proposal, answer: 'pending' }))
}
