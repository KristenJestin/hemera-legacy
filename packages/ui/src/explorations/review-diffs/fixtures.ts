import { parseDiffFromFile } from '@pierre/diffs'

import { STORIES } from '../../spec/spec-fixtures.ts'
import type {
  CriterionVerdict,
  GitLetter,
  ReviewRound,
  RoundFeedback,
  RoundFile,
  RoundRepository,
} from './model.ts'
import * as source from './sources.ts'

/**
 * Round 1 of `ATL-7`, the CSV export of Atlas, once its build is done: the same build, Spec and
 * repositories the build panel's stories and the first review exploration draw, now with the
 * content of every file, so that the diff is the real one.
 */

export const NOW = '2026-09-25T10:52:00.000Z'

/** How many lines a change adds and removes, as the diff itself counts them. */
function counted(path: string, before: string | null, after: string | null) {
  const diff = parseDiffFromFile(
    before === null ? null : { name: path, contents: before },
    after === null ? null : { name: path, contents: after },
  )
  let added = 0
  let removed = 0
  for (const hunk of diff.hunks) {
    added += hunk.additionLines
    removed += hunk.deletionLines
  }
  return { added, removed }
}

/** A text file of the round, its counts drawn from its two sides. */
function text(
  path: string,
  before: string | null,
  after: string | null,
  extra: { untracked?: boolean; generated?: boolean } = {},
): RoundFile {
  const status: GitLetter = before === null ? 'A' : after === null ? 'D' : 'M'
  return {
    path,
    status,
    ...counted(path, before, after),
    untracked: extra.untracked ?? false,
    binary: null,
    generated: extra.generated ?? false,
    before,
    after,
  }
}

/** A file whose content is not text: its sizes, in bytes, and nothing to compare. */
function binary(
  path: string,
  before: number | null,
  after: number | null,
  untracked = false,
): RoundFile {
  return {
    path,
    status: before === null ? 'A' : after === null ? 'D' : 'M',
    added: null,
    removed: null,
    untracked,
    binary: { before, after },
    generated: false,
    before: null,
    after: null,
  }
}

export const API: RoundRepository = {
  name: 'api',
  path: 'sources/api',
  remote: 'git@github.com:atlas-billing/api.git',
  branch: 'atl-7-csv-export',
  head: '9c41e07',
  base: '3f2a9d1',
  stale: false,
  files: [
    text('src/billing/export.query.ts', null, source.QUERY_AFTER),
    text('src/billing/export.controller.ts', source.CONTROLLER_BEFORE, source.CONTROLLER_AFTER),
    text('src/billing/export.query.test.ts', null, source.QUERY_TEST_AFTER),
    text('src/billing/credit-notes.test.ts', null, source.CREDIT_TEST_AFTER),
    text('src/shared/csv.ts', source.CSV_BEFORE, source.CSV_AFTER),
    text('docs/billing/export.md', null, source.EXPORT_DOC_AFTER),
    text('README.md', source.API_README_BEFORE, source.API_README_AFTER),
    binary('fixtures/ledger-sample.xlsx', null, 18_432, true),
  ],
}

export const FRONT: RoundRepository = {
  name: 'front',
  path: 'sources/front',
  remote: 'git@github.com:atlas-billing/front.git',
  branch: 'atl-7-csv-export',
  head: 'b07d9e2',
  base: 'a81c4f0',
  stale: false,
  files: [
    text('src/billing/ExportButton.tsx', null, source.BUTTON_AFTER),
    text('src/billing/BillingPage.tsx', source.PAGE_BEFORE, source.PAGE_AFTER),
    text('src/billing/export-csv.test.ts', null, source.FRONT_TEST_AFTER),
    text('src/api/generated/client.ts', source.CLIENT_BEFORE, source.CLIENT_AFTER, {
      generated: true,
    }),
    binary('public/billing/export-icon.png', 1_204, 1_391),
    text('README.md', source.FRONT_README_BEFORE, source.FRONT_README_AFTER),
  ],
}

/** What the build showed for each criterion: the test that holds it, or why nothing does. */
const VERDICTS = new Map<string, readonly CriterionVerdict[]>([
  [
    'story-export-a-month',
    [
      {
        met: true,
        evidence: 'export.query.test.ts › every line issued in the month, by issue date',
      },
      { met: true, evidence: 'export-csv.test.ts › the header follows the ledger' },
      { met: false, evidence: 'Only the query is tested empty: no test downloads an empty month.' },
    ],
  ],
  [
    'story-credit-notes',
    [
      { met: true, evidence: 'export.query.test.ts › a credit note is a negative row' },
      {
        met: true,
        evidence: 'credit-notes.test.ts › the file total equals the billing page total',
      },
    ],
  ],
])

/** Round 1 of `ATL-7`, as it opened. */
export const ROUND: ReviewRound = {
  number: 1,
  state: 'open',
  specKey: 'ATL-7',
  specTitle: 'CSV invoice export',
  repositories: [API, FRONT],
  stories: STORIES,
  verdicts: VERDICTS,
}

/** The same round once `ExportButton.tsx` was saved in an editor: the front is stale. */
export const STALE_ROUND: ReviewRound = {
  ...ROUND,
  repositories: [API, { ...FRONT, stale: true }],
}

/** What the user left before any fix pass: on lines, on a story, and without an anchor. */
export const FEEDBACK: readonly RoundFeedback[] = [
  {
    id: 'fb-1',
    kind: 'product',
    body: 'Two Export CSV buttons on the billing page: keep the one in the head.',
    anchor: {
      kind: 'code',
      repository: 'front',
      path: 'src/billing/BillingPage.tsx',
      lines: { start: 17, end: 18 },
      side: 'new',
    },
    createdAt: '2026-09-25T10:46:00.000Z',
    withdrawnAt: null,
  },
  {
    id: 'fb-2',
    kind: 'general',
    body: 'Say which month was sent in the 400: "month is YYYY-MM" does not.',
    anchor: {
      kind: 'code',
      repository: 'api',
      path: 'src/billing/export.controller.ts',
      lines: { start: 23, end: 23 },
      side: 'new',
    },
    createdAt: '2026-09-25T10:47:00.000Z',
    withdrawnAt: null,
  },
  {
    id: 'fb-3',
    kind: 'question',
    body: 'Does the export include the invoices cancelled in the month?',
    anchor: { kind: 'spec', storyId: 'story-export-a-month', criterion: 0 },
    createdAt: '2026-09-25T10:48:00.000Z',
    withdrawnAt: null,
  },
  {
    id: 'fb-4',
    kind: 'product',
    body: 'An empty month must download the header row: nothing shows it yet.',
    anchor: { kind: 'spec', storyId: 'story-export-a-month', criterion: 2 },
    createdAt: '2026-09-25T10:49:00.000Z',
    withdrawnAt: null,
  },
  {
    id: 'fb-5',
    kind: 'general',
    body: 'The readme of the front could point at the API page on the export.',
    anchor: null,
    createdAt: '2026-09-25T10:50:00.000Z',
    withdrawnAt: null,
  },
]

/** Only a question left: nothing waits for a fix, so the round can be accepted. */
export const ONLY_A_QUESTION: readonly RoundFeedback[] = FEEDBACK.filter(
  (one) => one.kind === 'question',
)

/* ---- A large round: thousands of lines in dozens of files ---- */

/** A small generator that gives the same numbers on every run, so the screenshots agree. */
function seeded(seed: number): () => number {
  let state = seed
  return () => {
    state = (state * 1_103_515_245 + 12_345) % 2_147_483_648
    return state / 2_147_483_648
  }
}

/** A module of `count` functions, each a few lines, in the house style of the API. */
function moduleOf(name: string, count: number): string {
  const lines = [`import { sql } from '../db/sql'`, '']
  for (let index = 0; index < count; index += 1) {
    lines.push(
      `/** Reads the ${name} rows of page ${String(index)}. */`,
      `export async function ${name}Page${String(index)}(after: string | null) {`,
      `  const rows = await sql\`select * from ${name} where id > \${after} limit 50\``,
      `  return rows.map((row) => ({ ...row, page: ${String(index)} }))`,
      '}',
      '',
    )
  }
  return lines.join('\n')
}

/** The same module after a build that renamed, added and removed a little everywhere. */
function reworked(before: string, random: () => number): string {
  const out: string[] = []
  for (const line of before.split('\n')) {
    const roll = random()
    if (roll < 0.06) continue
    if (roll < 0.14) {
      out.push(line.replace('select *', 'select id, number, issued_on').replace('50', '100'))
      continue
    }
    out.push(line)
    if (roll > 0.97) out.push('  // The page size follows the ledger import, which reads 100 rows.')
  }
  return out.join('\n')
}

const DOMAINS = [
  'invoices',
  'credit_notes',
  'clients',
  'payments',
  'ledger_lines',
  'vat_rates',
  'currencies',
  'reminders',
  'receipts',
  'refunds',
  'discounts',
  'contracts',
  'subscriptions',
  'plans',
  'taxes',
  'exports',
  'imports',
  'audits',
  'users',
  'roles',
]

/** A repository of `count` modules, each reworked by the build. */
function largeRepository(base: RoundRepository, folder: string, seed: number): RoundRepository {
  const random = seeded(seed)
  const files = DOMAINS.map((domain) => {
    const before = moduleOf(domain, 40 + Math.floor(random() * 40))
    return text(`${folder}/${domain}.ts`, before, reworked(before, random))
  })
  return { ...base, files: [...base.files, ...files] }
}

/** The same round with a build that touched forty modules more: thousands of lines to read. */
export const LARGE_ROUND: ReviewRound = {
  ...ROUND,
  repositories: [largeRepository(API, 'src/pages', 7), largeRepository(FRONT, 'src/store', 11)],
}
