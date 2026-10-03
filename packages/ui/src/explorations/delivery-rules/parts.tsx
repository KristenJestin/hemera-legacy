import { cn } from 'cn'
import type { FunctionComponent, ReactNode } from 'react'

import { Button } from '../../components/button/button.tsx'
import { Card, CardRow } from '../../components/card/card.tsx'
import { Checkbox } from '../../components/checkbox/checkbox.tsx'
import { Select } from '../../components/select/select.tsx'
import { StatusDot } from '../../components/status-dot/status-dot.tsx'
import { Tooltip } from '../../components/tooltip/tooltip.tsx'
import {
  IconArrowUp,
  IconBolt,
  IconBrowser,
  IconChecklist,
  IconCircleCheck,
  IconCopy,
  IconEye,
  IconFlag,
  IconFolders,
  IconGitBranch,
  IconGitCompare,
  IconGitFork,
  IconHammer,
  IconListCheck,
  IconLock,
  IconPackage,
  type IconProps,
  IconRefresh,
  IconRobot,
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
  type RepositoryRules,
  type StepKind,
  type StepMode,
} from './model.ts'

export const STEP_ICONS: Record<StepKind, FunctionComponent<IconProps>> = {
  push: IconArrowUp,
  'pull-request': IconGitCompare,
  screenshots: IconBrowser,
  ci: IconListCheck,
  review: IconEye,
  merge: IconGitBranch,
  release: IconPackage,
  bump: IconRefresh,
  confirm: IconCircleCheck,
  command: IconTerminal2,
  agent: IconRobot,
}

export const STEP_LABELS: Record<StepKind, string> = {
  push: 'Push the branch',
  'pull-request': 'Open a pull request',
  screenshots: 'Screenshots in the pull request',
  ci: 'Wait for CI',
  review: 'Wait for a review',
  merge: 'Merge',
  release: 'Wait for a published version',
  bump: 'Bump a dependency',
  confirm: 'Confirm by hand',
  command: 'Run a command',
  agent: 'Ask the agent',
}

/** The kinds as the Add menu groups them: Git and the forge, the waits, and custom steps. */
export const KIND_GROUPS: readonly (readonly StepKind[])[] = [
  ['push', 'pull-request', 'screenshots', 'ci', 'review', 'merge'],
  ['release', 'bump', 'confirm'],
  ['command', 'agent'],
]

export const NOTE = 'text-sm text-muted-foreground'

export const MONO = 'font-mono text-xs'

export const FORM = 'flex flex-col gap-4'

export const ROW_LINE = 'flex flex-wrap items-end gap-3'

export const GROW = 'min-w-0 flex-1'

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
  offerCleanup,
  onOfferCleanup,
}: {
  offerCleanup: boolean
  onOfferCleanup: (offer: boolean) => void
}): ReactNode {
  return (
    <ul className="flex flex-col gap-2" aria-label="After the last step">
      <li>
        <CardRow>
          <span className={MARK}>
            <IconFlag size="sm" aria-hidden="true" />
          </span>
          <span className="min-w-0 flex-1 truncate text-sm text-foreground">Close the Spec</span>
          <QuietMark label="Always on your click" icon={IconLock} />
        </CardRow>
      </li>
      <li>
        <CardRow>
          <span className={MARK}>
            <IconTrash size="sm" aria-hidden="true" />
          </span>
          <Checkbox
            className="min-w-0 flex-1"
            label="Clean up the Workspace"
            checked={offerCleanup}
            onCheckedChange={onOfferCleanup}
          />
          <QuietMark label="Always on your click" icon={IconLock} />
        </CardRow>
      </li>
    </ul>
  )
}

// ——— The forge, and the repositories ———

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
      <Button variant="secondary" size="sm" className="ml-auto" onClick={onCheck}>
        <IconRefresh size="sm" aria-hidden="true" />
        Check again
      </Button>
    </div>
  )
}

const FIRST = '—'

/**
 * The forge of the Project, its command line, and its repositories: each one's remote, and the
 * repository it delivers after.
 */
export function ForgeCard({
  rules,
  cli,
  onChange,
}: {
  rules: DeliveryRules
  cli: CliState
  onChange: (next: Partial<DeliveryRules>) => void
}): ReactNode {
  const change = (name: string, next: Partial<RepositoryRules>) =>
    onChange({
      repositories: rules.repositories.map((one) =>
        one.name === name ? { ...one, ...next } : one,
      ),
    })
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
      <ul className="flex flex-col gap-2" aria-label="Repositories">
        {rules.repositories.map((repository) => (
          <li key={repository.name}>
            <CardRow>
              <span className={MARK}>
                <IconGitFork size="sm" aria-hidden="true" />
              </span>
              <span className="w-16 shrink-0 truncate text-sm text-foreground">
                {repository.name}
              </span>
              <span className={cn(MONO, 'min-w-0 flex-1 truncate text-muted-foreground')}>
                {repository.url}
              </span>
              <Select
                label={`Remote of ${repository.name}`}
                className="w-24"
                value={repository.remote}
                onValueChange={(remote) => change(repository.name, { remote })}
                items={repository.remotes.map((one) => ({ value: one, label: one }))}
              />
              <Select
                label={`${repository.name} delivers after`}
                className="w-24"
                mark={<IconRoute size="sm" />}
                value={repository.after ?? FIRST}
                onValueChange={(after) =>
                  change(repository.name, { after: after === FIRST ? null : after })
                }
                items={[
                  { value: FIRST, label: FIRST },
                  ...rules.repositories
                    .filter((one) => one.name !== repository.name && one.after !== repository.name)
                    .map((one) => ({ value: one.name, label: one.name })),
                ]}
              />
            </CardRow>
          </li>
        ))}
      </ul>
    </Card>
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
      <div className="mx-auto flex max-w-6xl flex-col gap-6">
        <div className="flex flex-col gap-1">
          <h1 className="text-2xl font-medium">Project settings</h1>
          <p className={NOTE}>Atlas · 4 repositories</p>
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
