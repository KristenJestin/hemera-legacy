import type {
  DeliveryStep,
  Feedback,
  FixGroup,
  RepositoryResult,
  ReviewResult,
  StaleFile,
} from './model.ts'
import twoExports from './two-exports.png'

/**
 * The review of `ATL-7`, the CSV export of Atlas, once its build is done: the same build the
 * build panel's stories draw, two repositories under the Workspace, the final checks green.
 */

export const NOW = '2026-09-25T10:52:00.000Z'

const API = 'sources/api'
const FRONT = 'sources/front'

const API_RESULT: RepositoryResult = {
  path: API,
  branch: 'atl-7-csv-export',
  head: '9c41e07',
  commits: [
    { sha: '9c41e07', subject: 'docs(billing): say how a month is exported' },
    { sha: '4be2d13', subject: 'fix(billing): keep the ledger header order' },
    { sha: 'e18a5f0', subject: 'feat(billing): credit notes as negative rows' },
    { sha: '71c03aa', subject: 'feat(billing): stream the invoice lines of a month' },
  ],
  files: [
    { path: 'src/billing/export.query.ts', status: 'A', added: 62, removed: 0 },
    { path: 'src/billing/export.controller.ts', status: 'M', added: 12, removed: 3 },
    { path: 'src/billing/export.query.test.ts', status: 'A', added: 61, removed: 0 },
    { path: 'src/billing/credit-notes.test.ts', status: 'A', added: 38, removed: 0 },
    { path: 'src/shared/csv.ts', status: 'M', added: 9, removed: 2 },
    { path: 'docs/billing/export.md', status: 'A', added: 41, removed: 0 },
    { path: 'README.md', status: 'M', added: 6, removed: 1 },
  ],
  untracked: ['fixtures/ledger-sample.xlsx'],
  stale: [],
}

const FRONT_RESULT: RepositoryResult = {
  path: FRONT,
  branch: 'atl-7-csv-export',
  head: 'b07d9e2',
  commits: [
    { sha: 'b07d9e2', subject: 'docs(billing): the export button in the readme' },
    { sha: '5a1f6c8', subject: 'feat(billing): an export button on the billing page' },
  ],
  files: [
    { path: 'src/billing/ExportButton.tsx', status: 'A', added: 34, removed: 0 },
    { path: 'src/billing/BillingPage.tsx', status: 'M', added: 4, removed: 1 },
    { path: 'src/billing/export-csv.test.ts', status: 'A', added: 52, removed: 0 },
    { path: 'README.md', status: 'M', added: 3, removed: 0 },
  ],
  untracked: [],
  stale: [],
}

/** Round 1 of `ATL-7`, as it opened. */
export const RESULT: ReviewResult = {
  specKey: 'ATL-7',
  specTitle: 'CSV export',
  round: 1,
  git: true,
  folder: '~/Hemera/workspaces/atl-7',
  repositories: [API_RESULT, FRONT_RESULT],
  checks: [
    { id: 'types', name: 'types', place: API, line: 'pnpm tsc --noEmit' },
    { id: 'lint', name: 'lint', place: API, line: 'pnpm oxlint src/billing' },
    { id: 'tests', name: 'tests', place: API, line: 'pnpm vitest run' },
    { id: 'tests-front', name: 'tests', place: FRONT, line: 'pnpm vitest run' },
    { id: 'build', name: 'build', place: '', line: 'pnpm build' },
    { id: 'e2e', name: 'e2e', place: '', line: 'pnpm e2e' },
  ],
  findings: [
    {
      id: 'f1',
      reviewer: 'Contract',
      text: 'Credit notes were written after the invoices of their month, not in date order.',
      repository: API,
      fixedIn: 'e18a5f0',
    },
    {
      id: 'f2',
      reviewer: 'Tests',
      text: 'No test held the header order the ledger reads.',
      repository: API,
      fixedIn: '4be2d13',
    },
    {
      id: 'f3',
      reviewer: 'Security',
      text: 'The export read the month from the query string without a bound.',
      repository: API,
      fixedIn: '4be2d13',
    },
  ],
  docs: [
    {
      id: 'readme',
      recipe: 'Readme',
      files: [
        { repository: API, path: 'README.md' },
        { repository: FRONT, path: 'README.md' },
      ],
      unchanged: null,
    },
    {
      id: 'usage',
      recipe: 'Usage',
      files: [{ repository: API, path: 'docs/billing/export.md' }],
      unchanged: null,
    },
    {
      id: 'contract',
      recipe: 'Interface contract',
      files: [],
      unchanged: 'The export is a new route; no contract of the API changed.',
    },
  ],
}

/** A file of the result touched in an editor since the round was taken. */
const EDITED: StaleFile = { path: 'src/billing/ExportButton.tsx', at: '2026-09-25T10:49:00.000Z' }

/** The same round, once `ExportButton.tsx` was saved in an editor. */
export const STALE: ReviewResult = {
  ...RESULT,
  repositories: [API_RESULT, { ...FRONT_RESULT, stale: [EDITED] }],
}

/** A Project without Git: the folder, the checks and the documentation, and nothing else. */
export const NO_GIT: ReviewResult = {
  specKey: 'SITE-3',
  specTitle: 'Opening hours page',
  round: 1,
  git: false,
  folder: '~/Sites/bakery',
  repositories: [],
  checks: [
    { id: 'html', name: 'html', place: '', line: 'npx html-validate "**/*.html"' },
    { id: 'links', name: 'links', place: '', line: 'npx linkinator . --recurse' },
  ],
  findings: [],
  docs: [
    {
      id: 'readme',
      recipe: 'Readme',
      files: [{ repository: '', path: 'README.md' }],
      unchanged: null,
    },
  ],
}

/** The screenshot the user pasted: the billing page with its two Export buttons. */
export const SHOT = { id: 'shot-1', name: 'billing-page.png', src: twoExports }

/** What the user left before any fix pass: two remarks, one with a screenshot, and a question. */
export const FEEDBACK: Feedback[] = [
  {
    id: 'fb-1',
    text: 'Two Export CSV buttons on the billing page: keep the primary one.',
    shots: [SHOT],
    question: false,
    answer: null,
  },
  {
    id: 'fb-2',
    text: 'Name the file after the month: atlas-2026-09.csv, not export.csv.',
    shots: [],
    question: false,
    answer: null,
  },
  {
    id: 'fb-3',
    text: 'Does the export include the invoices cancelled in the month?',
    shots: [],
    question: true,
    answer: 'No: a cancelled invoice is left out, and its credit note is exported instead.',
  },
]

/** What the user left on the bakery's page: a remark and a question, without any Git to anchor them. */
export const NO_GIT_FEEDBACK: Feedback[] = [
  {
    id: 'fb-site-1',
    text: 'On a phone the Sunday line wraps under the table: keep it on one line.',
    shots: [],
    question: false,
    answer: null,
  },
  {
    id: 'fb-site-2',
    text: 'Are the bank holidays of 2027 in the table already?',
    shots: [],
    question: true,
    answer: 'Yes: the eleven of 2027, from the list the Spec links to.',
  },
]

/** The batches the main agent made of the feedback, once "Fix these" was pressed. */
export const FIX_GROUPS: FixGroup[] = [
  { id: 'fix-1', title: 'One export button on the billing page', sources: ['fb-1'] },
  { id: 'fix-2', title: 'The file named after its month', sources: ['fb-2'] },
]

/** The delivery rules of Atlas: the branch pushed on confirmation, no forge integration. */
export const DELIVERY: DeliveryStep[] = [
  { id: 'push', label: 'Push atl-7-csv-export', mode: 'confirm' },
  { id: 'pr', label: 'Pull request', mode: 'off' },
  { id: 'cleanup', label: 'Clean the Workspace', mode: 'off' },
]
