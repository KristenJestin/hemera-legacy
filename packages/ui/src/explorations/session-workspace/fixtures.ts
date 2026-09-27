import type { CommandRunProps } from '../../activity/command-run.tsx'
import type { CommandType } from '../../activity/command-type.ts'
import type { ContextViewProps } from '../../session/context-view.tsx'
import type { PlanEntry } from '../../session/plan-panel.tsx'
import type { TouchedFile } from '../../session/session-details.tsx'
import type { PreparationStepLine, WorkspaceState } from '../../workspace/model.ts'

/**
 * What the three variants of the Session workspace exploration are handed (issue #219).
 *
 * One Session's working surroundings, in the four cases every variant draws: its Workspace being
 * prepared, ready, failed, and a Session with no Workspace at all. Nothing is wired: these are the
 * shapes the page would map the engine's answers onto.
 */

/** The four cases each variant is drawn in. */
export type WorkspaceCase = 'preparing' | 'ready' | 'failed' | 'none'

/** The three Sessions each variant is drawn in. */
export type Mission = 'free' | 'define' | 'build'

/** What a Session works with, one place each, in the order every variant lists them. */
export type Place = 'workspace' | 'commands' | 'services' | 'activity' | 'context'

export const PLACES: readonly Place[] = ['workspace', 'commands', 'services', 'activity', 'context']

export const PLACE_WORDS: Record<Place, string> = {
  workspace: 'Workspace',
  commands: 'Commands',
  services: 'Services',
  activity: 'Activity',
  context: 'Context',
}

/** One repository of the Workspace, with what Git said of it when it was read. */
export interface RepositoryFact {
  path: string
  branch: string
  changes: string
}

/** The Workspace of the Session, as the variants say it. */
export interface WorkspaceFact {
  name: string
  state: Exclude<WorkspaceState, 'cleaned'>
  folder: string
  repositories: readonly RepositoryFact[]
  steps: readonly PreparationStepLine[]
}

/** A command of the Project's catalogue, and whether it is running in this Session. */
export interface CatalogueCommand {
  name: string
  type: CommandType
  command: string
  running: boolean
}

/** A run of this Session, as the thread's block draws it. */
export type SessionRun = Omit<CommandRunProps, 'onOpenUrl' | 'onStop' | 'className'> & {
  id: string
}

/** A service up in this Session's Workspace. */
export interface ServiceFact {
  id: string
  name: string
  url: string
}

/** Everything a Session works with, in one of the four cases. */
export interface SessionFacts {
  workspace: WorkspaceFact | null
  catalogue: readonly CatalogueCommand[]
  runs: readonly SessionRun[]
  services: readonly ServiceFact[]
  plan: readonly PlanEntry[]
  files: readonly TouchedFile[]
  context: ContextViewProps | null
}

const RECIPE: PreparationStepLine[] = [
  { id: 'worktree-api', kind: 'worktree', target: './sources/api', state: 'done' },
  { id: 'worktree-front', kind: 'worktree', target: './sources/front', state: 'done' },
  { id: 'copy-env', kind: 'copy', target: '.env in repositories', state: 'done' },
  { id: 'link-claude', kind: 'link', target: 'CLAUDE.md at root', state: 'done' },
  { id: 'run-install', kind: 'run', target: 'install', state: 'done' },
]

const INSTALL_FAILED = [
  'install exited with code 1',
  '',
  ' ERR_PNPM_OUTDATED_LOCKFILE  Cannot install with "frozen-lockfile" because pnpm-lock.yaml is not up to date with sources/api/package.json',
].join('\n')

function stepsWith(last: PreparationStepLine['state'], message?: string): PreparationStepLine[] {
  return RECIPE.map((step, index) => {
    if (index < 3) return step
    if (index === 3) return { ...step, state: last === 'failed' ? 'done' : last }
    return {
      ...step,
      state: last === 'failed' ? 'failed' : 'pending',
      message: last === 'failed' ? message : undefined,
    }
  })
}

const REPOSITORIES: RepositoryFact[] = [
  { path: './sources/api', branch: 'atl-7-csv-export', changes: '2 unstaged' },
  { path: './sources/front', branch: 'atl-7-csv-export', changes: 'clean' },
]

const WORKSPACE: Omit<WorkspaceFact, 'state' | 'steps'> = {
  name: 'csv-export',
  folder: '~/.local/share/hemera/workspaces/atlas/csv-export',
  repositories: REPOSITORIES,
}

const CATALOGUE: CatalogueCommand[] = [
  { name: 'dev', type: 'serve', command: 'pnpm dev', running: false },
  { name: 'test', type: 'test', command: 'pnpm test', running: false },
  { name: 'lint', type: 'lint', command: 'pnpm lint', running: false },
]

const DEV_OUTPUT = [
  'vite v7.1.4 building for development...',
  '',
  '  Local:   http://localhost:5173/',
  '  press h + enter to show help',
].join('\n')

const TEST_OUTPUT = [
  '> atlas@0.0.0 test',
  '> vitest run --project api',
  '',
  ' ✓ export.service.test.ts (6)',
  ' ✓ invoices.query.test.ts (4)',
  ' ❯ csv.stream.test.ts (3)',
].join('\n')

const RUNS: SessionRun[] = [
  {
    id: 'run-dev',
    name: 'dev',
    command: 'pnpm dev',
    type: 'serve',
    state: 'running',
    folder: 'sources/front',
    output: DEV_OUTPUT,
    url: 'http://localhost:5173/',
    readiness: 'ready',
  },
  {
    id: 'run-test',
    name: 'test',
    command: 'pnpm test',
    type: 'test',
    state: 'running',
    folder: 'sources/api',
    output: TEST_OUTPUT,
  },
]

const PLAN: PlanEntry[] = [
  { content: 'Read the invoice query in export.service.ts', priority: 'high', status: 'completed' },
  { content: 'Stream the rows of one month as CSV', priority: 'high', status: 'in_progress' },
  { content: 'Credit notes as negative rows', priority: 'medium', status: 'pending' },
]

const FILES: TouchedFile[] = [
  { path: 'sources/api/src/export/export.service.ts', added: 42, removed: 7 },
  { path: 'sources/api/src/export/csv.stream.ts', added: 88, removed: 0 },
]

const CONTEXT: ContextViewProps = {
  workspace: { name: 'csv-export', path: WORKSPACE.folder },
  instructions: [
    { label: 'AGENTS.md', file: true, detail: 'given at the start of the Session', at: '10:31' },
    { label: 'The base', detail: 'as a resource of the first prompt', at: '10:31' },
  ],
  tools: [
    { name: 'fs_read', bound: '256 KiB a page, inside the Workspace root' },
    { name: 'commands_run', bound: 'the catalogue, or a one-off line the user allows' },
    { name: 'commands_output', bound: 'the last 64 KiB a run printed' },
  ],
  lentAt: '10:31',
  commands: CATALOGUE.map(({ name, command }) => ({ name, command })),
}

/** The Session's surroundings in each of the four cases. */
export const FACTS: Record<WorkspaceCase, SessionFacts> = {
  ready: {
    workspace: { ...WORKSPACE, state: 'ready', steps: RECIPE },
    catalogue: CATALOGUE.map((one) => ({
      ...one,
      running: one.name === 'dev' || one.name === 'test',
    })),
    runs: RUNS,
    services: [{ id: 'run-dev', name: 'dev', url: 'http://localhost:5173/' }],
    plan: PLAN,
    files: FILES,
    context: CONTEXT,
  },
  preparing: {
    workspace: { ...WORKSPACE, state: 'preparing', steps: stepsWith('running') },
    catalogue: CATALOGUE,
    runs: [],
    services: [],
    plan: [],
    files: [],
    context: CONTEXT,
  },
  failed: {
    workspace: { ...WORKSPACE, state: 'failed', steps: stepsWith('failed', INSTALL_FAILED) },
    catalogue: CATALOGUE,
    runs: [],
    services: [],
    plan: [],
    files: [],
    context: CONTEXT,
  },
  none: {
    workspace: null,
    catalogue: CATALOGUE,
    runs: [],
    services: [],
    plan: PLAN.slice(0, 1),
    files: [],
    context: { ...CONTEXT, workspace: undefined },
  },
}

/** What the Session is called in each mission. */
export const TITLES: Record<Mission, string> = {
  free: 'Blank page after the merge',
  define: 'Spec CSV',
  build: 'Build ATL-7',
}

/** One step of the build's stand-in, drawn after the build panel of lot 5. */
export interface BuildTask {
  key: string
  label: string
  state: 'done' | 'running' | 'pending' | 'yours'
}

export const BUILD_TASKS: readonly BuildTask[] = [
  { key: 'T1', label: "Query the month's invoices", state: 'done' },
  { key: 'T2', label: 'Stream the rows as CSV', state: 'running' },
  { key: 'T3', label: 'Credit notes as negative rows', state: 'pending' },
  { key: 'T4', label: 'Check the file imports into the ledger', state: 'yours' },
]
