import type { StatusTone } from '../../components/status-dot/status-dot.tsx'

/**
 * The delivery rules of a Project, and a delivery at the end of a build Session, as it runs
 * (exploration of 30 September 2026, issue #76; second pass on 1 October after #288 and #290).
 *
 * The rules are one ordered list of steps for the whole Project, its base, set from a preset. Each
 * repository inherits the base and keeps only what it changes: a step left out, a step changed, a
 * step of its own. A repository can also deliver after another one, a library before the
 * application that uses it.
 */

/** Where a pull request goes, and the command line that speaks to it. `none` stays local. */
export type Forge = 'github' | 'bitbucket' | 'gitlab' | 'none'

/** The command line of each forge, which is what Hemera runs to open, follow and merge. */
export const FORGE_CLI: Record<Exclude<Forge, 'none'>, string> = {
  github: 'gh',
  bitbucket: 'bkt',
  gitlab: 'glab',
}

/** What the forge's command line is on this machine. */
export type CliState = 'ready' | 'missing' | 'signed-out'

export type MergeMethod = 'squash' | 'merge' | 'rebase'

/**
 * What a step does, with what it needs. `push` is Git's own; the pull request, the screenshots,
 * CI, the review and the merge go through the forge's command line; the rest are Hemera's.
 */
export type StepConfig =
  | { kind: 'push' }
  | { kind: 'pull-request'; into: string; draft: boolean; title: string; body: string }
  /** Screenshots put in the pull request's body as `{screenshots}`. */
  | { kind: 'screenshots'; source: 'round' | 'agent'; upload: 'comment' | 'branch' }
  /** Waits for the pull request's checks to be green. */
  | { kind: 'ci' }
  | { kind: 'review'; reviewers: readonly string[]; approvals: number }
  | { kind: 'merge'; method: MergeMethod }
  /** Waits for a version of another repository to be published. */
  | { kind: 'release'; of: string; detect: 'tag' | 'registry' | 'manual'; pattern: string }
  /** Moves a dependency to the version just published, then commits and pushes. */
  | { kind: 'bump'; dependency: string; how: 'command' | 'agent'; command: string }
  /** Something Hemera cannot see, done by hand. */
  | { kind: 'confirm'; what: string }
  /** A command of the catalogue. */
  | { kind: 'command'; command: string }
  /** A task for the Session's main agent. */
  | { kind: 'agent'; task: string }

export type StepKind = StepConfig['kind']

/**
 * How a step starts: by itself as soon as the one before it is done, or on a click (core.md,
 * "External actions and delivery"; a step left out of the list is the third mode, disabled).
 */
export type StepMode = 'auto' | 'ask'

export interface RuleStep {
  id: string
  mode: StepMode
  config: StepConfig
}

const BODY = '{summary}\n\n{screenshots}\n\nRefs {key}'

/** The default of each kind, as a new step of it is added. */
export function configOf(kind: StepKind): StepConfig {
  switch (kind) {
    case 'push':
      return { kind }
    case 'pull-request':
      return { kind, into: 'dev', draft: false, title: '{type}({scope}): {title}', body: BODY }
    case 'screenshots':
      return { kind, source: 'round', upload: 'comment' }
    case 'ci':
      return { kind }
    case 'review':
      return { kind, reviewers: ['@acme/web'], approvals: 1 }
    case 'merge':
      return { kind, method: 'squash' }
    case 'release':
      return { kind, of: 'kit', detect: 'registry', pattern: '@acme/kit' }
    case 'bump':
      return { kind, dependency: '@acme/kit', how: 'command', command: 'bump:kit' }
    case 'confirm':
      return { kind, what: 'done by hand' }
    case 'command':
      return { kind, command: 'changeset' }
    case 'agent':
      return { kind, task: 'Capture the changed screens' }
  }
}

/** Steps with no field: nothing to change for one repository but whether it runs. */
export function hasFields(kind: StepKind): boolean {
  return kind !== 'push' && kind !== 'ci'
}

const FORGE_KINDS: readonly StepKind[] = ['pull-request', 'screenshots', 'ci', 'review', 'merge']

/** Whether a step needs the forge's command line. */
export function needsForge(kind: StepKind): boolean {
  return FORGE_KINDS.includes(kind)
}

/** A step read as its two halves: what it is, and what it acts on, set in mono. */
export interface StepParts {
  what: string
  on: string
}

export function partsOf(config: StepConfig): StepParts {
  switch (config.kind) {
    case 'push':
      return { what: 'Push', on: 'origin' }
    case 'pull-request':
      return { what: 'Pull request', on: `→ ${config.into}${config.draft ? ' · draft' : ''}` }
    case 'screenshots':
      return { what: 'Screenshots', on: config.source === 'round' ? 'review round' : 'agent' }
    case 'ci':
      return { what: 'CI', on: 'checks green' }
    case 'review':
      return { what: 'Review', on: `${String(config.approvals)} · ${config.reviewers.join(' ')}` }
    case 'merge':
      return { what: 'Merge', on: config.method }
    case 'release':
      return {
        what: `Release of ${config.of}`,
        on: config.detect === 'manual' ? 'by hand' : config.pattern,
      }
    case 'bump':
      return { what: 'Bump', on: config.dependency }
    case 'confirm':
      return { what: 'Confirm', on: config.what }
    case 'command':
      return { what: 'Run', on: config.command }
    case 'agent':
      return { what: 'Agent', on: config.task }
  }
}

// ——— Presets ———

/** The five presets of #76, each the steps it amounts to. */
export type Policy = 'nothing' | 'push' | 'pull-request' | 'review' | 'merge'

export const POLICY_STEPS: Record<Policy, readonly StepKind[]> = {
  nothing: [],
  push: ['push'],
  'pull-request': ['push', 'pull-request'],
  review: ['push', 'pull-request', 'ci', 'review'],
  merge: ['push', 'pull-request', 'ci', 'review', 'merge'],
}

export const POLICIES: readonly Policy[] = ['nothing', 'push', 'pull-request', 'review', 'merge']

export const POLICY_LABELS: Record<Policy, string> = {
  nothing: 'Nothing',
  push: 'Push',
  'pull-request': 'Pull request',
  review: 'Team review',
  merge: 'Merge',
}

/** The preset a list of steps is, or null when it was changed into something else. */
export function policyOf(steps: readonly RuleStep[]): Policy | null {
  const kinds = steps.map((one) => one.config.kind).join(',')
  return POLICIES.find((policy) => POLICY_STEPS[policy].join(',') === kinds) ?? null
}

/** The steps of a preset; the merge waits for a click. */
export function stepsOf(policy: Policy): RuleStep[] {
  return POLICY_STEPS[policy].map((kind) => ({
    id: kind,
    mode: kind === 'merge' ? 'ask' : 'auto',
    config: configOf(kind),
  }))
}

// ——— The base, and what each repository changes ———

/** A step a repository has and the base does not, after the step it follows. */
export interface AddedStep {
  step: RuleStep
  /** The step it comes after, of the base or of its own, or null for the very first. */
  after: string | null
}

/** A repository of the Project, and what it changes from the base. */
export interface RepositoryRules {
  /** The repository's name, its folder's last segment. */
  name: string
  url: string
  remote: string
  remotes: readonly string[]
  /** The repository whose delivery this one waits for, a library before its application. */
  after: string | null
  /** The base steps it leaves out, by id. */
  off: readonly string[]
  /** The base steps it changes, by id: the step as it is here. */
  changed: Readonly<Record<string, RuleStep>>
  /** The steps of its own. */
  added: readonly AddedStep[]
}

export interface DeliveryRules {
  forge: Forge
  /** The Project's steps, which every repository inherits. */
  base: readonly RuleStep[]
  repositories: readonly RepositoryRules[]
  /** Whether the Workspace is offered for cleanup once the last step is done (always a click). */
  offerCleanup: boolean
}

/** Where a step of a repository comes from. */
export type Origin = 'inherited' | 'changed' | 'added' | 'off'

/** One row of the table of the rules: a step, and where it stands in each repository. */
export interface RuleRow {
  step: RuleStep
  /** The repository whose own step it is, or null for a base step. */
  owner: string | null
  /** Where it stands in each repository, in delivery order; a null origin: not there. */
  cells: readonly RuleCell[]
}

export interface RuleCell {
  repository: string
  origin: Origin | null
  /** The step as it runs there, or null where it does not. */
  step: RuleStep | null
}

/** The repositories in the order they deliver: each one after the one it waits for. */
export function inOrder(repositories: readonly RepositoryRules[]): RepositoryRules[] {
  const placed: RepositoryRules[] = []
  const place = (repository: RepositoryRules) => {
    if (placed.includes(repository)) return
    const first = repositories.find((one) => one.name === repository.after)
    if (first !== undefined) place(first)
    placed.push(repository)
  }
  for (const repository of repositories) place(repository)
  return placed
}

/** The cell of a base step in one repository. */
function baseCell(step: RuleStep, repository: RepositoryRules): RuleCell {
  if (repository.off.includes(step.id)) {
    return { repository: repository.name, origin: 'off', step: null }
  }
  const changed = repository.changed[step.id]
  return changed === undefined
    ? { repository: repository.name, origin: 'inherited', step }
    : { repository: repository.name, origin: 'changed', step: changed }
}

/** The base and every repository's own steps, as one table, its columns in delivery order. */
export function rowsOf(rules: DeliveryRules): RuleRow[] {
  const ordered = inOrder(rules.repositories)
  const cellsOf = (owner: RepositoryRules, step: RuleStep): RuleCell[] =>
    ordered.map((repository) =>
      repository.name === owner.name
        ? { repository: repository.name, origin: 'added', step }
        : { repository: repository.name, origin: null, step: null },
    )
  const ownRows = (anchor: string | null): RuleRow[] => {
    const rows: RuleRow[] = []
    for (const owner of ordered) {
      for (const one of owner.added) {
        if (one.after !== anchor) continue
        rows.push({ step: one.step, owner: owner.name, cells: cellsOf(owner, one.step) })
        rows.push(...ownRows(one.step.id))
      }
    }
    return rows
  }
  const known = new Set([
    ...rules.base.map((step) => step.id),
    ...ordered.flatMap((one) => one.added.map((added) => added.step.id)),
  ])
  // A step whose anchor left the base, for a new preset, goes last rather than nowhere.
  const lost = ordered.flatMap((one) =>
    one.added.filter((added) => added.after !== null && !known.has(added.after)),
  )
  const rows = ownRows(null)
  for (const step of rules.base) {
    rows.push({ step, owner: null, cells: ordered.map((repository) => baseCell(step, repository)) })
    rows.push(...ownRows(step.id))
  }
  for (const anchor of new Set(lost.map((one) => one.after))) rows.push(...ownRows(anchor))
  return rows
}

/** The steps one repository runs, in order: its column of the table, left-out steps dropped. */
export function stepsOfRepository(rules: DeliveryRules, name: string): RuleStep[] {
  return rowsOf(rules).flatMap((row) => {
    const cell = row.cells.find((one) => one.repository === name)
    return cell?.step === null || cell === undefined ? [] : [cell.step]
  })
}

/** How many things a repository changes from the base. */
export function changesOf(repository: RepositoryRules): number {
  return repository.off.length + Object.keys(repository.changed).length + repository.added.length
}

// ——— A delivery, at the end of a build Session ———

/** Where one reviewer stands on the pull request. */
export interface ReviewerLine {
  name: string
  state: 'approved' | 'waiting' | 'changes'
}

/** One step of a delivery, for one repository. */
export interface RunStep {
  id: string
  repository: string
  config: StepConfig
  mode: StepMode
  state: StatusTone
  /** What the step has to show for itself: `#97`, `2.4.0`, `1 of 2`. */
  outcome?: string | undefined
  /** The remote's or the command line's own words, on a failure. */
  message?: string | undefined
  reviewers?: readonly ReviewerLine[] | undefined
}

export interface DeliveryRun {
  specKey: string
  specTitle: string
  branch: string
  workspace: string
  forge: Forge
  cli: CliState
  /** The repositories in delivery order, each with the one it waits for. */
  repositories: readonly { name: string; after: string | null }[]
  steps: readonly RunStep[]
  closed: boolean
  cleaned: boolean
}

const OVER: readonly StatusTone[] = ['success', 'cancelled']

/** Whether every step of a delivery is done, which is what offers the closure. */
export function delivered(run: DeliveryRun): boolean {
  return run.steps.every((step) => OVER.includes(step.state))
}

/** Whether a repository's steps are all done. */
export function repositoryDone(run: DeliveryRun, name: string): boolean {
  return run.steps.filter((one) => one.repository === name).every((one) => OVER.includes(one.state))
}

/** A step on a click whose turn it is: everything before it, in its repository, is over. */
export function asksNow(run: DeliveryRun, step: RunStep): boolean {
  if (step.state !== 'pending' || step.mode !== 'ask') return false
  const mine = run.steps.filter((one) => one.repository === step.repository)
  return mine.slice(0, mine.indexOf(step)).every((one) => OVER.includes(one.state))
}

// ——— Fixtures: Atlas, its api, its kit, its front and its docs ———

/** The api: the base, as it is. */
const API: RepositoryRules = {
  name: 'api',
  url: 'github.com/acme/atlas-api',
  remote: 'origin',
  remotes: ['origin', 'upstream'],
  after: null,
  off: [],
  changed: {},
  added: [],
}

/** The kit: a library, pulled into `main`, with a changeset first and a release job by hand. */
const KIT: RepositoryRules = {
  name: 'kit',
  url: 'github.com/acme/atlas-kit',
  remote: 'origin',
  remotes: ['origin'],
  after: null,
  off: [],
  changed: {
    'pull-request': {
      id: 'pull-request',
      mode: 'auto',
      config: {
        kind: 'pull-request',
        into: 'main',
        draft: false,
        title: '{type}({scope}): {title}',
        body: BODY,
      },
    },
  },
  added: [
    { step: { id: 'changeset', mode: 'auto', config: configOf('command') }, after: null },
    {
      step: { id: 'release-job', mode: 'ask', config: { kind: 'confirm', what: 'release job' } },
      after: 'merge',
    },
  ],
}

/** The front: after the kit, on its published version, with screenshots in its pull request. */
const FRONT: RepositoryRules = {
  name: 'front',
  url: 'github.com/acme/atlas-front',
  remote: 'origin',
  remotes: ['origin'],
  after: 'kit',
  off: [],
  changed: {
    review: {
      id: 'review',
      mode: 'auto',
      config: { kind: 'review', reviewers: ['@acme/web', '@acme/design'], approvals: 2 },
    },
  },
  added: [
    { step: { id: 'release', mode: 'auto', config: configOf('release') }, after: null },
    { step: { id: 'bump', mode: 'auto', config: configOf('bump') }, after: 'release' },
    {
      step: { id: 'screenshots', mode: 'auto', config: configOf('screenshots') },
      after: 'pull-request',
    },
  ],
}

/** The docs: merged straight, with no CI and no review. */
const DOCS: RepositoryRules = {
  name: 'docs',
  url: 'github.com/acme/atlas-docs',
  remote: 'origin',
  remotes: ['origin'],
  after: null,
  off: ['ci', 'review'],
  changed: {},
  added: [],
}

export const RULES: DeliveryRules = {
  forge: 'github',
  base: stepsOf('merge'),
  repositories: [API, KIT, FRONT, DOCS],
  offerCleanup: true,
}

/** The same Project before any repository changed anything. */
export const RULES_PLAIN: DeliveryRules = {
  ...RULES,
  repositories: RULES.repositories.map((one) => ({
    ...one,
    after: null,
    off: [],
    changed: {},
    added: [],
  })),
}

export const BRANCH = 'atlas/ATL-42-export-csv'

export const REFUSED_PUSH = `To github.com:acme/atlas-api.git
 ! [rejected]        atlas/ATL-42-export-csv -> atlas/ATL-42-export-csv (fetch first)
error: failed to push some refs to 'github.com:acme/atlas-api.git'
hint: Updates were rejected because the remote contains work that you do not
hint: have locally.`

/** Atlas's delivery as its rules resolve, every step pending. */
function atlasSteps(): RunStep[] {
  return inOrder(RULES.repositories).flatMap((repository) =>
    stepsOfRepository(RULES, repository.name).map((step): RunStep => ({
      id: `${repository.name}-${step.id}`,
      repository: repository.name,
      config: step.config,
      mode: step.mode,
      state: 'pending',
    })),
  )
}

/** A delivery of Atlas with each step as `states` says, by id. */
export function atlasRun(
  states: Readonly<Record<string, Partial<RunStep>>> = {},
  extra: Partial<DeliveryRun> = {},
): DeliveryRun {
  return {
    specKey: 'ATL-42',
    specTitle: 'Export the ledger as CSV',
    branch: BRANCH,
    workspace: 'csv-export',
    forge: 'github',
    cli: 'ready',
    repositories: inOrder(RULES.repositories).map(({ name, after }) => ({ name, after })),
    closed: false,
    cleaned: false,
    ...extra,
    steps: atlasSteps().map((step) => Object.assign(step, states[step.id])),
  }
}

const DONE: Partial<RunStep> = { state: 'success' }

/** What each step of a repository has to show once it is done. */
function allDone(repository: string, pr: string): Record<string, Partial<RunStep>> {
  return Object.fromEntries(
    atlasSteps()
      .filter((step) => step.repository === repository)
      .map((step) => [step.id, OUTCOMES[step.config.kind] ?? { ...DONE, outcome: pr }]),
  )
}

const OUTCOMES: Partial<Record<StepKind, Partial<RunStep>>> = {
  push: DONE,
  ci: { state: 'success', outcome: '5 of 5' },
  review: { state: 'success', outcome: 'approved' },
  merge: DONE,
  command: DONE,
  confirm: DONE,
  release: { state: 'success', outcome: '2.4.0' },
  bump: { state: 'success', outcome: '2.3.1 → 2.4.0' },
  screenshots: { state: 'success', outcome: '4' },
}

const API_OPEN = {
  'api-push': DONE,
  'api-pull-request': { state: 'success', outcome: '#318' },
  'api-ci': { state: 'success', outcome: '5 of 5' },
} satisfies Record<string, Partial<RunStep>>

/** Nothing has run yet but the docs, delivered straight. */
export const RUN_START = atlasRun(allDone('docs', '#12'))

/** The kit's CI runs and the api waits for its review; the front waits for the kit. */
export const RUN_RUNNING = atlasRun({
  'kit-changeset': DONE,
  'kit-push': DONE,
  'kit-pull-request': { state: 'success', outcome: '#41' },
  'kit-ci': { state: 'running', outcome: '3 of 5' },
  ...API_OPEN,
  'api-review': {
    state: 'running',
    outcome: '0 of 1',
    reviewers: [{ name: '@acme/web', state: 'waiting' }],
  },
  ...allDone('docs', '#12'),
})

/** The kit is merged and its release job run; the front waits for the version it published. */
export const RUN_RELEASE = atlasRun({
  ...allDone('kit', '#41'),
  'front-release': { state: 'running' },
  ...API_OPEN,
  'api-review': { state: 'success', outcome: 'approved' },
  ...allDone('docs', '#12'),
})

/** Two things wait for you: the kit's release job, run by hand, and the api's merge. */
export const RUN_NEEDS_YOU = atlasRun({
  ...allDone('kit', '#41'),
  'kit-release-job': { state: 'pending' },
  ...API_OPEN,
  'api-review': { state: 'success', outcome: 'approved' },
  ...allDone('docs', '#12'),
})

/** The api's push is refused, and gh is signed out: what goes through the forge waits. */
export const RUN_FAILED = atlasRun(
  {
    'kit-changeset': DONE,
    'kit-push': DONE,
    'api-push': { state: 'failure', message: REFUSED_PUSH },
    'docs-push': DONE,
  },
  { cli: 'signed-out' },
)

/** The front's review asked for changes. */
export const RUN_CHANGES = atlasRun({
  ...allDone('kit', '#41'),
  ...allDone('api', '#318'),
  ...allDone('docs', '#12'),
  ...allDone('front', '#97'),
  'front-review': {
    state: 'failure',
    outcome: '1 of 2',
    reviewers: [
      { name: '@acme/web', state: 'approved' },
      { name: '@acme/design', state: 'changes' },
    ],
  },
  'front-merge': { state: 'pending' },
})

export const RUN_DELIVERED = atlasRun({
  ...allDone('kit', '#41'),
  ...allDone('api', '#318'),
  ...allDone('docs', '#12'),
  ...allDone('front', '#97'),
})

/** A Project whose rules are nothing: the branch stays in the Workspace. */
export const RUN_NOTHING: DeliveryRun = {
  specKey: 'NTS-3',
  specTitle: 'Tag each note with its week',
  branch: 'notes/NTS-3-week-tags',
  workspace: 'week-tags',
  forge: 'none',
  cli: 'ready',
  repositories: [{ name: 'notes', after: null }],
  steps: [],
  closed: false,
  cleaned: false,
}
