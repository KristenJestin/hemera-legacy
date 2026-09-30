import { cn } from 'cn'
import type { FunctionComponent, ReactNode } from 'react'

import { Button } from '../../components/button/button.tsx'
import { Card, CardRow } from '../../components/card/card.tsx'
import { Checkbox } from '../../components/checkbox/checkbox.tsx'
import { Input, Textarea } from '../../components/field/field.tsx'
import { Select } from '../../components/select/select.tsx'
import { StatusDot } from '../../components/status-dot/status-dot.tsx'
import { Tooltip } from '../../components/tooltip/tooltip.tsx'
import {
  IconArrowUp,
  IconBolt,
  IconChecklist,
  IconCopy,
  IconEye,
  IconFlag,
  IconFolders,
  IconGitBranch,
  IconGitCompare,
  IconGitFork,
  IconHammer,
  IconLock,
  type IconProps,
  IconRefresh,
  IconRoute,
  IconSettings,
  IconTerminal2,
  IconTrash,
  IconUser,
  IconVariable,
  IconWorld,
} from '../../icons.ts'
import {
  type CliState,
  type DeliveryRules,
  FORGE_CLI,
  type Forge,
  type MergeMethod,
  type StepKind,
  type StepMode,
  nameOf,
} from './model.ts'

export const STEP_ICONS: Record<StepKind, FunctionComponent<IconProps>> = {
  push: IconArrowUp,
  'pull-request': IconGitCompare,
  review: IconEye,
  merge: IconGitBranch,
}

export const STEP_LABELS: Record<StepKind, string> = {
  push: 'Push the branch',
  'pull-request': 'Open a pull request',
  review: 'Wait for a team review',
  merge: 'Merge',
}

export const NOTE = 'text-sm text-muted-foreground'

export const MONO = 'font-mono text-xs'

export const FORM = 'flex flex-col gap-4'

export const ROW_LINE = 'flex flex-wrap items-end gap-3'

export const GROW = 'min-w-0 flex-1'

export const SENTENCE = 'min-w-0 flex-1 truncate text-sm text-foreground'

export const MARK = 'flex shrink-0 text-muted-foreground'

/** A visible label over a select, whose own name is for what reads the page. */
export function Labelled({
  label,
  className,
  children,
}: {
  label: string
  className?: string | undefined
  children: ReactNode
}): ReactNode {
  return (
    <div className={cn('flex flex-col gap-1', className)}>
      <span aria-hidden="true" className="text-sm font-medium text-foreground">
        {label}
      </span>
      {children}
    </div>
  )
}

/** A quiet mark with its tooltip, reachable by the keyboard as by the pointer. */
export function QuietMark({
  label,
  icon: Icon,
}: {
  label: string
  icon: FunctionComponent<IconProps>
}): ReactNode {
  return (
    <Tooltip label={label}>
      <i
        role="img"
        tabIndex={0}
        aria-label={label}
        className="flex shrink-0 rounded-sm text-muted-foreground focus-ring"
      >
        <Icon size="sm" aria-hidden="true" />
      </i>
    </Tooltip>
  )
}

/** How a step starts, as the one mark on its row. */
export function ModeMark({ mode }: { mode: StepMode }): ReactNode {
  return mode === 'auto' ? (
    <QuietMark label="Starts by itself" icon={IconBolt} />
  ) : (
    <QuietMark label="Waits for your click" icon={IconUser} />
  )
}

export const MODE_ITEMS: { value: StepMode; label: string; icon: ReactNode }[] = [
  { value: 'auto', label: 'By itself', icon: <IconBolt size="sm" /> },
  { value: 'ask', label: 'On a click', icon: <IconUser size="sm" /> },
]

/** The two last things of every delivery, which only a click does (core.md, D8-14). */
export function ClosureRows({
  specWord = 'the Spec',
  offerCleanup,
  onOfferCleanup,
}: {
  specWord?: string
  offerCleanup: boolean
  onOfferCleanup?: ((offer: boolean) => void) | undefined
}): ReactNode {
  return (
    <ul className="flex flex-col gap-2" aria-label="After the last step">
      <li>
        <CardRow>
          <span className={MARK}>
            <IconFlag size="sm" aria-hidden="true" />
          </span>
          <span className={SENTENCE}>close {specWord}</span>
          <QuietMark label="Always on your click" icon={IconLock} />
        </CardRow>
      </li>
      <li>
        <CardRow>
          <span className={MARK}>
            <IconTrash size="sm" aria-hidden="true" />
          </span>
          {onOfferCleanup === undefined ? (
            <span className={SENTENCE}>offer the Workspace for cleanup</span>
          ) : (
            <Checkbox
              className="min-w-0 flex-1"
              label="offer the Workspace for cleanup"
              checked={offerCleanup}
              onCheckedChange={onOfferCleanup}
            />
          )}
          <QuietMark label="Always on your click" icon={IconLock} />
        </CardRow>
      </li>
    </ul>
  )
}

// ——— The forge ———

const FORGE_ITEMS: { value: Forge; label: string; disabled?: boolean }[] = [
  { value: 'github', label: 'GitHub · gh' },
  { value: 'bitbucket', label: 'Bitbucket · bkt' },
  { value: 'gitlab', label: 'GitLab · glab', disabled: true },
  { value: 'none', label: 'None' },
]

/** Where the forge's command line stands, said once, with the one way to fix it. */
export function CliLine({
  forge,
  cli,
  account,
  onCheck,
}: {
  forge: Exclude<Forge, 'none'>
  cli: CliState
  /** Who the command line is signed in as. */
  account?: string | undefined
  onCheck?: (() => void) | undefined
}): ReactNode {
  const name = FORGE_CLI[forge]
  if (cli === 'ready') {
    return (
      <p className="flex items-center gap-2 text-sm text-muted-foreground">
        <StatusDot status="success" label={`${name} ready`} />
        <span className={MONO}>{name}</span>
        {account !== undefined && <span>{account}</span>}
      </p>
    )
  }
  const fix = cli === 'missing' ? `${name} not found` : `${name} auth login`
  return (
    <div role="alert" className="flex flex-wrap items-center gap-2 text-sm">
      <StatusDot
        status="failure"
        label={cli === 'missing' ? `${name} is not installed` : `${name} is not signed in`}
      />
      <span className="text-foreground">
        {cli === 'missing' ? `${name} is not installed` : `${name} is not signed in`}
      </span>
      <code className={cn(MONO, 'rounded-sm bg-muted px-1.5 py-0.5 text-foreground')}>{fix}</code>
      {cli === 'signed-out' && (
        <Button
          variant="ghost"
          size="sm"
          aria-label={`Copy ${fix}`}
          onClick={() => void navigator.clipboard.writeText(fix).catch(() => undefined)}
        >
          <IconCopy size="sm" aria-hidden="true" />
        </Button>
      )}
      {cli === 'missing' && (
        <Button variant="link" size="sm">
          {forge === 'github' ? 'cli.github.com' : 'Install bkt'}
        </Button>
      )}
      <Button variant="secondary" size="sm" className="ml-auto" onClick={onCheck}>
        <IconRefresh size="sm" aria-hidden="true" />
        Check again
      </Button>
    </div>
  )
}

/** The forge of the Project, its command line, and the remote of each repository. */
export function ForgeCard({
  rules,
  cli,
  onChange,
}: {
  rules: DeliveryRules
  cli: CliState
  onChange: (next: Partial<DeliveryRules>) => void
}): ReactNode {
  return (
    <Card title="Forge">
      <div className={cn(ROW_LINE, 'max-w-sm')}>
        <Labelled label="Forge" className={GROW}>
          <Select
            label="Forge"
            mark={<IconWorld size="sm" />}
            value={rules.forge}
            onValueChange={(forge) => onChange({ forge })}
            items={FORGE_ITEMS}
          />
        </Labelled>
      </div>
      {rules.forge !== 'none' && rules.forge !== 'gitlab' && (
        <CliLine forge={rules.forge} cli={cli} account="kris" />
      )}
      <ul className="flex flex-col gap-2" aria-label="Remotes">
        {rules.repositories.map((repository) => (
          <li key={repository.path}>
            <CardRow>
              <span className={MARK}>
                <IconGitFork size="sm" aria-hidden="true" />
              </span>
              <span className="w-24 shrink-0 truncate text-sm text-foreground">
                {nameOf(repository.path) === '.' ? 'root' : nameOf(repository.path)}
              </span>
              <span className={cn(MONO, 'min-w-0 flex-1 truncate text-muted-foreground')}>
                {repository.url}
              </span>
              <Select
                label={`Remote of ${nameOf(repository.path)}`}
                className="w-24"
                value={repository.remote}
                onValueChange={(remote) =>
                  onChange({
                    repositories: rules.repositories.map((one) =>
                      one.path === repository.path ? { ...one, remote } : one,
                    ),
                  })
                }
                items={repository.remotes.map((one) => ({ value: one, label: one }))}
              />
            </CardRow>
          </li>
        ))}
      </ul>
    </Card>
  )
}

// ——— The fields of each step ———

const METHOD_ITEMS: { value: MergeMethod; label: string }[] = [
  { value: 'squash', label: 'Squash' },
  { value: 'merge', label: 'Merge commit' },
  { value: 'rebase', label: 'Rebase' },
]

const APPROVAL_ITEMS = ['1', '2', '3'].map((value) => ({ value, label: value }))

/** What a pull request is opened with. */
export function PullRequestFields({
  rules,
  onChange,
}: {
  rules: DeliveryRules
  onChange: (next: Partial<DeliveryRules>) => void
}): ReactNode {
  return (
    <div className={FORM}>
      <div className={ROW_LINE}>
        <Input
          label="Base branch"
          className="w-24"
          value={rules.base}
          onValueChange={(base) => onChange({ base })}
        />
        <Input
          label="Title"
          className={GROW}
          value={rules.titleTemplate}
          onValueChange={(titleTemplate) => onChange({ titleTemplate })}
        />
      </div>
      <Textarea
        label="Body"
        rows={3}
        value={rules.bodyTemplate}
        onValueChange={(bodyTemplate) => onChange({ bodyTemplate })}
      />
      <Checkbox
        label="Open as a draft"
        checked={rules.draft}
        onCheckedChange={(draft) => onChange({ draft })}
      />
    </div>
  )
}

/** Who reviews, and how many approvals the review waits for. */
export function ReviewFields({
  rules,
  onChange,
}: {
  rules: DeliveryRules
  onChange: (next: Partial<DeliveryRules>) => void
}): ReactNode {
  return (
    <div className={ROW_LINE}>
      <Input
        label="Reviewers"
        className={GROW}
        placeholder="@team, login"
        value={rules.reviewers.join(', ')}
        onValueChange={(typed) =>
          onChange({
            reviewers: typed
              .split(',')
              .map((one) => one.trim())
              .filter((one) => one !== ''),
          })
        }
      />
      <Labelled label="Approvals" className="w-24">
        <Select
          label="Approvals"
          value={String(rules.approvals)}
          onValueChange={(value) => onChange({ approvals: Number(value) })}
          items={APPROVAL_ITEMS}
        />
      </Labelled>
    </div>
  )
}

/** How the branch is merged. */
export function MergeFields({
  rules,
  onChange,
}: {
  rules: DeliveryRules
  onChange: (next: Partial<DeliveryRules>) => void
}): ReactNode {
  return (
    <div className={cn(ROW_LINE, 'max-w-sm')}>
      <Labelled label="Method" className={GROW}>
        <Select
          label="Method"
          value={rules.method}
          onValueChange={(method) => onChange({ method })}
          items={METHOD_ITEMS}
        />
      </Labelled>
    </div>
  )
}

// ——— The page the section sits in ———

const NAV = 'flex w-menu-side shrink-0 flex-col gap-1'

const NAV_ITEM =
  'flex h-control-md w-full items-center gap-2 rounded-md px-3 text-sm text-muted-foreground'

const NAV_HERE = 'bg-accent text-foreground'

const NAV_ENTRIES: { label: string; icon: FunctionComponent<IconProps> }[] = [
  { label: 'General', icon: IconSettings },
  { label: 'Repositories', icon: IconFolders },
  { label: 'Workspaces', icon: IconGitFork },
  { label: 'Commands', icon: IconTerminal2 },
  { label: 'Preparation', icon: IconChecklist },
  { label: 'Variables', icon: IconVariable },
  { label: 'Build', icon: IconHammer },
  { label: 'Delivery', icon: IconRoute },
]

/**
 * The Project settings drawn around the Delivery section, which sits last, after Build: the
 * navigation is a picture of the page's own, not its tabs.
 */
export function SettingsPage({ children }: { children: ReactNode }): ReactNode {
  return (
    <div className="min-h-screen bg-surface-content p-8">
      <div className="mx-auto flex max-w-5xl flex-col gap-6">
        <div className="flex flex-col gap-1">
          <h1 className="text-2xl font-medium">Project settings</h1>
          <p className={NOTE}>Atlas · 2 repositories</p>
        </div>
        <div className="flex items-start gap-8">
          <nav aria-label="Project settings" className={NAV}>
            {NAV_ENTRIES.map((one) => (
              <span
                key={one.label}
                aria-current={one.label === 'Delivery' ? 'page' : undefined}
                className={cn(NAV_ITEM, one.label === 'Delivery' && NAV_HERE)}
              >
                <one.icon size="sm" aria-hidden="true" />
                {one.label}
              </span>
            ))}
          </nav>
          <section aria-label="Delivery" className="flex min-w-0 flex-1 flex-col gap-4">
            {children}
          </section>
        </div>
      </div>
    </div>
  )
}
