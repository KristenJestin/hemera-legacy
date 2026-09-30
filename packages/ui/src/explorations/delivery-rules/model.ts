import type { StatusTone } from '../../components/status-dot/status-dot.tsx'

/**
 * The delivery rules of a Project, as the three variants of the settings draw them, and a
 * delivery at the end of a build, as it runs (exploration of 30 September 2026, issue #76).
 *
 * One shape for the three variants: the variants differ in how the rules are set, never in what
 * the rules are. The rules are an ordered list of steps, the way the preparation of a Workspace is,
 * each with how it starts (by itself, or on a click), and the settings every step reads — the
 * forge, the remote of each repository, the pull request, the review and the merge.
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

/** What a step of the delivery does. `push` is Git's own; the three others are the forge's. */
export type StepKind = 'push' | 'pull-request' | 'review' | 'merge'

/**
 * How a step starts: by itself as soon as the one before it is done, or on a click in the build
 * (core.md, "External actions and delivery": automatic, or with human confirmation; a step left
 * out of the list is the third mode, disabled).
 */
export type StepMode = 'auto' | 'ask'

export interface RuleStep {
  id: string
  kind: StepKind
  mode: StepMode
}

/** A repository of the Project and the remote its branch is pushed to. */
export interface RepositoryRemote {
  /** The repository's path relative to `main`, named by its last segment on screen. */
  path: string
  /** The remote Git knows, `origin` unless said otherwise. */
  remote: string
  /** Where that remote points, as Git reads it. */
  url: string
  /** The remotes the repository has, to choose from. */
  remotes: readonly string[]
}

export type MergeMethod = 'squash' | 'merge' | 'rebase'

export interface DeliveryRules {
  forge: Forge
  repositories: readonly RepositoryRemote[]
  steps: readonly RuleStep[]
  /** The branch a pull request goes into, and a merge lands on. */
  base: string
  draft: boolean
  titleTemplate: string
  bodyTemplate: string
  /** Logins and teams, as the forge names them. */
  reviewers: readonly string[]
  /** How many approvals the review waits for. */
  approvals: number
  method: MergeMethod
  /** Whether the Workspace is offered for cleanup once the last step is done (always on a click). */
  offerCleanup: boolean
}

/** The five policies of #76, each the steps it amounts to. */
export type Policy = 'nothing' | 'push' | 'pull-request' | 'review' | 'merge'

export const POLICY_STEPS: Record<Policy, readonly StepKind[]> = {
  nothing: [],
  push: ['push'],
  'pull-request': ['push', 'pull-request'],
  review: ['push', 'pull-request', 'review'],
  merge: ['push', 'pull-request', 'review', 'merge'],
}

export const POLICIES: readonly Policy[] = ['nothing', 'push', 'pull-request', 'review', 'merge']

export const POLICY_LABELS: Record<Policy, string> = {
  nothing: 'Nothing',
  push: 'Push',
  'pull-request': 'Pull request',
  review: 'Team review',
  merge: 'Merge',
}

/** The policy a list of steps is, or null when it was changed by hand into something else. */
export function policyOf(steps: readonly RuleStep[]): Policy | null {
  const kinds = steps.map((one) => one.kind).join(',')
  const found = POLICIES.find((policy) => POLICY_STEPS[policy].join(',') === kinds)
  return found ?? null
}

/** The steps of a policy, each starting by itself. */
export function stepsOf(policy: Policy, mode: StepMode = 'auto'): RuleStep[] {
  return POLICY_STEPS[policy].map((kind) => ({ id: kind, kind, mode }))
}

/** Whether a step needs the forge's command line: every step but a push. */
export function needsForge(kind: StepKind): boolean {
  return kind !== 'push'
}

/** A step of the rules read as the sentence it is. */
export function ruleSentence(step: RuleStep, rules: DeliveryRules): string {
  switch (step.kind) {
    case 'push':
      return rules.repositories.length === 1
        ? `push to ${rules.repositories[0]?.remote ?? 'origin'}`
        : 'push each branch to its remote'
    case 'pull-request':
      return `open a ${rules.draft ? 'draft ' : ''}pull request into ${rules.base}`
    case 'review':
      return rules.approvals === 1
        ? 'wait for 1 approval'
        : `wait for ${String(rules.approvals)} approvals`
    case 'merge':
      return `merge into ${rules.base} by ${rules.method}`
  }
}

// ——— A delivery, at the end of a build ———

/** Where one reviewer stands on the pull request. */
export interface ReviewerLine {
  name: string
  state: 'approved' | 'waiting' | 'changes'
}

/** One step of a delivery, for one repository. */
export interface RunStep {
  id: string
  kind: StepKind
  /** The repository it acts on, by its last segment. */
  repository: string
  state: StatusTone
  /** What it does, as a sentence; the monospaced part is `target`. */
  verb: string
  target: string
  /** The remote's or the CLI's own message, as it was said, on a failure. */
  message?: string | undefined
  /** The pull request, once there is one. */
  link?: { label: string; url: string } | undefined
  reviewers?: readonly ReviewerLine[] | undefined
  /** A step set to start on a click, and whose turn it is. */
  asks?: boolean | undefined
}

export interface DeliveryRun {
  specKey: string
  specTitle: string
  forge: Forge
  cli: CliState
  steps: readonly RunStep[]
  /** Whether the Spec was closed, on its click. */
  closed: boolean
  /** Whether the Workspace was cleaned up, on its click. */
  cleaned: boolean
}

/** Whether every step of a delivery is done, which is what offers the closure. */
export function delivered(run: DeliveryRun): boolean {
  return run.steps.every((step) => step.state === 'success' || step.state === 'cancelled')
}

// ——— Fixtures ———

export const ATLAS_REPOSITORIES: readonly RepositoryRemote[] = [
  {
    path: './sources/api',
    remote: 'origin',
    url: 'github.com/acme/atlas-api',
    remotes: ['origin', 'upstream'],
  },
  {
    path: './sources/front',
    remote: 'origin',
    url: 'github.com/acme/atlas-front',
    remotes: ['origin'],
  },
]

export const RULES: DeliveryRules = {
  forge: 'github',
  repositories: ATLAS_REPOSITORIES,
  steps: stepsOf('review'),
  base: 'dev',
  draft: false,
  titleTemplate: 'feat({scope}): {title}',
  bodyTemplate: '{summary}\n\n{stories}\n\nRefs {key}',
  reviewers: ['@acme/web', 'lea-m'],
  approvals: 2,
  method: 'squash',
  offerCleanup: true,
}

export const BITBUCKET_REPOSITORIES: readonly RepositoryRemote[] = [
  {
    path: '.',
    remote: 'origin',
    url: 'bitbucket.org/acme/ledger',
    remotes: ['origin'],
  },
]

/** The last segment of a path, which is the name a repository goes by. */
export function nameOf(path: string): string {
  return path.split(/[\\/]/).findLast((segment) => segment !== '' && segment !== '.') ?? path
}

const BRANCH = 'atlas/ATL-42-export-csv'

/** The steps of Atlas's delivery for its two repositories, all pending. */
function atlasSteps(): RunStep[] {
  return ['api', 'front'].flatMap((repository) => [
    {
      id: `${repository}-push`,
      kind: 'push' as const,
      repository,
      state: 'pending' as const,
      verb: 'push',
      target: `${BRANCH} → origin`,
    },
    {
      id: `${repository}-pr`,
      kind: 'pull-request' as const,
      repository,
      state: 'pending' as const,
      verb: 'open a pull request into',
      target: 'dev',
    },
    {
      id: `${repository}-review`,
      kind: 'review' as const,
      repository,
      state: 'pending' as const,
      verb: 'wait for',
      target: '2 approvals',
    },
  ])
}

/** A delivery of Atlas with each step as `states` says, by id. */
export function atlasRun(
  states: Record<string, Partial<RunStep>> = {},
  extra: Partial<DeliveryRun> = {},
): DeliveryRun {
  return {
    specKey: 'ATL-42',
    specTitle: 'Export the ledger as CSV',
    forge: 'github',
    cli: 'ready',
    closed: false,
    cleaned: false,
    ...extra,
    steps: atlasSteps().map((step) => Object.assign(step, states[step.id])),
  }
}

export const REFUSED_PUSH = `To github.com:acme/atlas-front.git
 ! [rejected]        atlas/ATL-42-export-csv -> atlas/ATL-42-export-csv (fetch first)
error: failed to push some refs to 'github.com:acme/atlas-front.git'
hint: Updates were rejected because the remote contains work that you do not
hint: have locally. This is usually caused by another repository pushing to
hint: the same ref. If you want to integrate the remote changes, use
hint: 'git pull' before pushing again.`

const PR_API = { label: '#318', url: 'https://github.com/acme/atlas-api/pull/318' }
const PR_FRONT = { label: '#97', url: 'https://github.com/acme/atlas-front/pull/97' }

export const RUN_RUNNING = atlasRun({
  'api-push': { state: 'success' },
  'api-pr': { state: 'running' },
})

export const RUN_REFUSED = atlasRun({
  'api-push': { state: 'success' },
  'api-pr': { state: 'success', verb: 'pull request', target: 'into dev', link: PR_API },
  'api-review': {
    state: 'running',
    verb: 'review',
    target: '0 of 2 approvals',
    reviewers: [
      { name: '@acme/web', state: 'waiting' },
      { name: 'lea-m', state: 'waiting' },
    ],
  },
  'front-push': { state: 'failure', message: REFUSED_PUSH },
})

export const RUN_REVIEW = atlasRun({
  'api-push': { state: 'success' },
  'api-pr': { state: 'success', verb: 'pull request', target: 'into dev', link: PR_API },
  'api-review': {
    state: 'running',
    verb: 'review',
    target: '1 of 2 approvals',
    reviewers: [
      { name: 'lea-m', state: 'approved' },
      { name: '@acme/web', state: 'waiting' },
    ],
  },
  'front-push': { state: 'success' },
  'front-pr': { state: 'success', verb: 'pull request', target: 'into dev', link: PR_FRONT },
  'front-review': {
    state: 'failure',
    verb: 'changes requested',
    target: '0 of 2 approvals',
    reviewers: [
      { name: 'lea-m', state: 'changes' },
      { name: '@acme/web', state: 'waiting' },
    ],
  },
})

export const RUN_DELIVERED = atlasRun({
  'api-push': { state: 'success' },
  'api-pr': { state: 'success', verb: 'pull request', target: 'into dev', link: PR_API },
  'api-review': {
    state: 'success',
    verb: 'review',
    target: '2 of 2 approvals',
    reviewers: [
      { name: 'lea-m', state: 'approved' },
      { name: '@acme/web', state: 'approved' },
    ],
  },
  'front-push': { state: 'success' },
  'front-pr': { state: 'success', verb: 'pull request', target: 'into dev', link: PR_FRONT },
  'front-review': {
    state: 'success',
    verb: 'review',
    target: '2 of 2 approvals',
    reviewers: [
      { name: 'lea-m', state: 'approved' },
      { name: '@acme/web', state: 'approved' },
    ],
  },
})

export const RUN_SIGNED_OUT = atlasRun(
  {
    'api-push': { state: 'success' },
    'front-push': { state: 'success' },
  },
  { cli: 'signed-out' },
)

export const RUN_MISSING = atlasRun(
  {
    'api-push': { state: 'success' },
    'front-push': { state: 'success' },
  },
  { cli: 'missing' },
)

/** A one-repository Project on Bitbucket whose steps wait for a click, then merge. */
export const RUN_ASKS: DeliveryRun = {
  specKey: 'LED-7',
  specTitle: 'Round the totals at the cent',
  forge: 'bitbucket',
  cli: 'ready',
  closed: false,
  cleaned: false,
  steps: [
    {
      id: 'push',
      kind: 'push',
      repository: 'ledger',
      state: 'success',
      verb: 'push',
      target: 'ledger/LED-7-round-totals → origin',
    },
    {
      id: 'pr',
      kind: 'pull-request',
      repository: 'ledger',
      state: 'success',
      verb: 'pull request',
      target: 'into main',
      link: { label: '#12', url: 'https://bitbucket.org/acme/ledger/pull-requests/12' },
    },
    {
      id: 'merge',
      kind: 'merge',
      repository: 'ledger',
      state: 'pending',
      verb: 'merge into',
      target: 'main by squash',
      asks: true,
    },
  ],
}

/** A Project whose policy is nothing: the branch stays in the Workspace. */
export const RUN_NOTHING: DeliveryRun = {
  specKey: 'NTS-3',
  specTitle: 'Tag each note with its week',
  forge: 'none',
  cli: 'ready',
  closed: false,
  cleaned: false,
  steps: [],
}
