import { cn } from 'cn'
import { AnimatePresence, motion } from 'motion/react'
import { type ReactNode, useEffect, useRef, useState } from 'react'

import { Disclosure } from '../../activity/disclosure.tsx'
import { Composer } from '../../composer/composer.tsx'
import { Button, IconButton } from '../../components/button/button.tsx'
import { Dialog } from '../../components/dialog/dialog.tsx'
import { Input, Textarea } from '../../components/field/field.tsx'
import { StatusDot, type StatusTone } from '../../components/status-dot/status-dot.tsx'
import { Tooltip, TooltipProvider } from '../../components/tooltip/tooltip.tsx'
import {
  IconCheck,
  IconFlag,
  IconGitFork,
  IconListDetails,
  IconRoute,
  IconUser,
} from '../../icons.ts'
import { AgentText } from '../../message/agent-text.tsx'
import { fold, useTransition } from '../../motion.ts'
import { Reveal } from '../../reveal.tsx'
import { NoticeRow } from '../../session/notice-row.tsx'
import { type NoticeGroup, SessionNotices } from '../../session/session-notices.tsx'
import { SessionHeader } from '../../session/session.tsx'
import { TurnLine } from '../../session/turn-line.tsx'
import { Shell } from '../../shell/shell.tsx'
import {
  type DeliveryRules,
  type DeliveryRun,
  FORGE_CLI,
  type ReviewerLine,
  type RunStep,
  type StepParts,
  asksNow,
  delivered,
  inOrder,
  needsForge,
  partsOf,
  repositoryDone,
  stepsOfRepository,
} from './model.ts'
import { MARK, MONO, ModeMark, STEP_ICONS } from './parts.tsx'

/**
 * The end of a build Session, once the result is accepted: the user is still in the Session, so
 * the delivery shows where things already live.
 *
 * - The build panel beside the chat holds the delivery's view: each repository in delivery
 *   order, each step with its dot. It is a view body — a title, its actions, its body — so it
 *   can be stacked over the build view the way #333 will decide.
 * - What is being waited on is a live chip on the head line: CI, a review, a release.
 * - What happened is a quiet line in the thread: a pull request opened, a merge, a refusal.
 * - What needs the user — a step on a click, a confirmation, a refused push, a review asking for
 *   changes, a signed-out forge, then Close and Clean up — is in the notices pill.
 */

const STATE_WORDS: Record<StatusTone, string> = {
  pending: 'Pending',
  running: 'Running',
  success: 'Done',
  failure: 'Failed',
  cancelled: 'Skipped',
}

const REVIEWER_TONES: Record<ReviewerLine['state'], StatusTone> = {
  approved: 'success',
  waiting: 'pending',
  changes: 'failure',
}

const REVIEWER_WORDS: Record<ReviewerLine['state'], string> = {
  approved: 'approved',
  waiting: 'not yet',
  changes: 'changes requested',
}

/** Where a repository stands: failed, running, done or not begun. */
function toneOf(run: DeliveryRun, repository: string): StatusTone {
  const steps = run.steps.filter((one) => one.repository === repository)
  if (steps.some((one) => one.state === 'failure')) return 'failure'
  if (repositoryDone(run, repository)) return 'success'
  if (steps.some((one) => one.state !== 'pending')) return 'running'
  return 'pending'
}

/** What a step is said as, in a line: what it is, and its outcome once it has one. */
function wordsOf(step: RunStep): StepParts {
  const parts = partsOf(step.config)
  return { what: parts.what, on: step.outcome ?? parts.on }
}

// ——— The view in the build panel ———

const VIEW = 'flex flex-col'

const VIEW_HEAD = 'flex h-control-lg shrink-0 items-center gap-2 border-b border-border px-4'

const VIEW_TITLE = 'min-w-0 flex-1 truncate text-sm font-medium text-foreground'

const VIEW_BODY = 'flex flex-col gap-2 p-4'

const GROUP_HEAD = 'flex min-w-0 flex-1 items-center gap-2 text-sm text-foreground'

const LINE = 'flex min-h-control-sm min-w-0 items-center gap-2 rounded-md px-1 text-sm'

const WHAT = 'shrink-0 text-foreground'

const ON = cn(MONO, 'min-w-0 flex-1 truncate text-muted-foreground')

/** The remote's words, as they were said: every line, wrapped rather than cut. */
const MESSAGE =
  'ml-6 rounded-md border border-border bg-muted px-2 py-1.5 font-mono text-xs break-words whitespace-pre-wrap text-foreground'

const REVIEWERS =
  'ml-6 flex flex-wrap items-center gap-x-3 gap-y-1 pb-1 text-xs text-muted-foreground'

function StepLine({ step, held }: { step: RunStep; held: boolean }): ReactNode {
  const Icon = STEP_ICONS[step.config.kind]
  const { what, on } = wordsOf(step)
  return (
    <li className="flex flex-col gap-1">
      <div className={LINE}>
        <StatusDot status={step.state} label={STATE_WORDS[step.state]} />
        <span className={MARK}>
          <Icon size="sm" aria-hidden="true" />
        </span>
        <span className={WHAT}>{what}</span>
        <span className={ON} title={on}>
          {on}
        </span>
        {step.mode === 'ask' && step.state === 'pending' && !held && <ModeMark mode="ask" />}
      </div>
      <Reveal shown={step.state === 'failure' && step.message !== undefined}>
        <pre className={MESSAGE}>{step.message}</pre>
      </Reveal>
      <Reveal shown={step.reviewers !== undefined}>
        <ul className={REVIEWERS} aria-label="Reviewers">
          {(step.reviewers ?? []).map((one) => (
            <li key={one.name} className="flex items-center gap-1.5">
              <StatusDot
                size="sm"
                status={REVIEWER_TONES[one.state]}
                label={REVIEWER_WORDS[one.state]}
              />
              {one.name}
            </li>
          ))}
        </ul>
      </Reveal>
    </li>
  )
}

export interface DeliveryViewProps {
  run: DeliveryRun
  onOpenPlan?: (() => void) | undefined
}

/**
 * The delivery, as a view body: its title and its one action on the head, then each repository
 * in delivery order, a repository that waits for another one saying which.
 */
export function DeliveryView({ run, onOpenPlan }: DeliveryViewProps): ReactNode {
  const held = run.cli !== 'ready'
  const tone: StatusTone = delivered(run)
    ? 'success'
    : run.steps.some((one) => one.state === 'failure')
      ? 'failure'
      : 'running'
  return (
    <section aria-label="Delivery" className={VIEW}>
      <header className={VIEW_HEAD}>
        <StatusDot status={tone} label={STATE_WORDS[tone]} />
        <span className={MARK}>
          <IconRoute size="sm" aria-hidden="true" />
        </span>
        <h2 className={VIEW_TITLE}>Delivery</h2>
        {onOpenPlan !== undefined && (
          <Tooltip label="Plan">
            <IconButton
              variant="ghost"
              size="sm"
              icon={<IconListDetails size="sm" />}
              aria-label="Plan"
              onClick={onOpenPlan}
            />
          </Tooltip>
        )}
      </header>
      <div className={VIEW_BODY}>
        {run.steps.length === 0 && (
          <p className={cn(LINE, 'text-muted-foreground')}>
            <StatusDot status={run.closed ? 'success' : 'pending'} label="Local" />
            <span className={MARK}>
              <IconGitFork size="sm" aria-hidden="true" />
            </span>
            <span className={cn(MONO, 'truncate')}>{run.branch}</span>
          </p>
        )}
        {run.repositories.map((repository) => {
          const steps = run.steps.filter((one) => one.repository === repository.name)
          if (steps.length === 0) return null
          const waits = repository.after !== null && !repositoryDone(run, repository.after)
          const standing = toneOf(run, repository.name)
          const done = repositoryDone(run, repository.name)
          const pr = steps.find((one) => one.config.kind === 'pull-request')?.outcome
          return (
            <Disclosure
              key={repository.name}
              open={done ? undefined : true}
              summary={
                <span className={GROUP_HEAD}>
                  <StatusDot status={standing} label={STATE_WORDS[standing]} />
                  <span className={MARK}>
                    <IconGitFork size="sm" aria-hidden="true" />
                  </span>
                  <span className="shrink-0 font-medium">{repository.name}</span>
                  <span className={ON}>{done ? pr : undefined}</span>
                  {repository.after !== null && (
                    <span
                      className={cn(
                        'flex shrink-0 items-center gap-1 text-xs',
                        waits ? 'text-foreground' : 'text-muted-foreground',
                      )}
                      aria-label={`After ${repository.after}`}
                    >
                      <IconRoute size="sm" aria-hidden="true" />
                      {repository.after}
                    </span>
                  )}
                </span>
              }
            >
              <ol className="flex flex-col" aria-label={`Steps of ${repository.name}`}>
                {steps.map((step) => (
                  <StepLine key={step.id} step={step} held={held && needsForge(step.config.kind)} />
                ))}
              </ol>
            </Disclosure>
          )
        })}
      </div>
    </section>
  )
}

// ——— The head line: what is being waited on ———

const CHIP =
  'inline-flex h-control-sm max-w-menu-side min-w-0 items-center gap-1.5 rounded-md border border-border bg-card px-2 text-xs'

/** A step being waited on, as a chip of the head line. It arrives and leaves by its width. */
function LiveChip({ step }: { step: RunStep }): ReactNode {
  const transition = useTransition(fold)
  const Icon = STEP_ICONS[step.config.kind]
  const { what, on } = wordsOf(step)
  return (
    <motion.span
      className="flex overflow-hidden"
      initial={{ width: 0, opacity: 0 }}
      animate={{ width: 'auto', opacity: 1 }}
      exit={{ width: 0, opacity: 0 }}
      transition={transition}
    >
      <span className="pr-1.5">
        <span className={CHIP} aria-label={`${step.repository}: ${what}, ${on}`}>
          <StatusDot status="running" size="sm" label="Running" />
          <span className={MARK}>
            <Icon size="sm" aria-hidden="true" />
          </span>
          <span className="shrink-0 font-medium">{step.repository}</span>
          <span className="min-w-0 truncate font-mono text-muted-foreground">
            {step.outcome ?? what}
          </span>
        </span>
      </span>
    </motion.span>
  )
}

export function LiveLine({ run }: { run: DeliveryRun }): ReactNode {
  const live = run.steps.filter((one) => one.state === 'running')
  return (
    <div className="flex min-h-control-sm min-w-0 flex-wrap items-center">
      <AnimatePresence initial={false}>
        {live.map((step) => (
          <LiveChip key={step.id} step={step} />
        ))}
      </AnimatePresence>
    </div>
  )
}

// ——— The thread: what happened ———

/** A step worth a line in the thread once it is over: what changed something outside. */
const RECORDED = new Set(['pull-request', 'merge', 'release', 'bump', 'screenshots'])

function Record({ step }: { step: RunStep }): ReactNode {
  const Icon = STEP_ICONS[step.config.kind]
  const { what, on } = wordsOf(step)
  return (
    <div role="group" aria-label={`${step.repository}: ${what}, ${STATE_WORDS[step.state]}`}>
      <Disclosure
        summary={
          <span className="flex min-w-0 items-center gap-2">
            <span className={MARK}>
              <Icon size="sm" aria-hidden="true" />
            </span>
            <StatusDot status={step.state} size="sm" label={STATE_WORDS[step.state]} />
            <span className="shrink-0 text-muted-foreground">{what}</span>
            <span className="min-w-0 truncate">
              {step.repository} <span className={MONO}>{on}</span>
            </span>
          </span>
        }
      >
        {step.message === undefined ? undefined : <pre className={MESSAGE}>{step.message}</pre>}
      </Disclosure>
    </div>
  )
}

function Thread({ run }: { run: DeliveryRun }): ReactNode {
  const records = run.steps.filter(
    (one) => one.state === 'failure' || (one.state === 'success' && RECORDED.has(one.config.kind)),
  )
  const transition = useTransition(fold)
  return (
    <div className="flex flex-col gap-3">
      <AgentText text={SUMMARY} />
      <div role="log" aria-label="Delivery records" className="flex flex-col gap-1">
        <AcceptedRecord />
        <AnimatePresence initial={false}>
          {records.map((step) => (
            <motion.div
              key={step.id}
              className="overflow-hidden"
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: 'auto', opacity: 1 }}
              exit={{ height: 0, opacity: 0 }}
              transition={transition}
            >
              <Record step={step} />
            </motion.div>
          ))}
        </AnimatePresence>
      </div>
    </div>
  )
}

const SUMMARY =
  'Every task is done and the checks pass. The ledger exports what is on screen as CSV, named after its period; the kit gained the `ExportButton` the front now uses.'

function AcceptedRecord(): ReactNode {
  return (
    <div role="group" aria-label="Result accepted">
      <Disclosure
        summary={
          <span className="flex min-w-0 items-center gap-2">
            <span className={MARK}>
              <IconCheck size="sm" aria-hidden="true" />
            </span>
            <StatusDot status="success" size="sm" label="Done" />
            <span className="text-muted-foreground">Accepted</span>
          </span>
        }
      />
    </div>
  )
}

// ——— The notices pill: what needs the user ———

export interface DeliveryHandlers {
  /** Starts a step on a click, or says a confirmation is done. */
  onStart: (id: string) => void
  onRetry: (id: string) => void
  /** Hands a review's requested changes to the agent. */
  onHandOver: (id: string) => void
  onCheckCli: () => void
  onClose: () => void
  onCleanup: () => void
}

/** The accept word of a step on a click. */
function pressOf(step: RunStep): string {
  switch (step.config.kind) {
    case 'merge':
      return 'Merge'
    case 'confirm':
    case 'release':
      return 'Done'
    default:
      return 'Start'
  }
}

function groupsOf(run: DeliveryRun, handlers: DeliveryHandlers): NoticeGroup[] {
  const items = []
  if (run.cli !== 'ready' && run.forge !== 'none' && run.forge !== 'gitlab') {
    const name = FORGE_CLI[run.forge]
    items.push({
      id: 'cli',
      content: (
        <NoticeRow
          name={`${name} is not signed in`}
          head={`${name} auth login`}
          mono
          accept={{ label: 'Check again', onPress: handlers.onCheckCli }}
        />
      ),
    })
  }
  for (const step of run.steps) {
    const { what, on } = wordsOf(step)
    if (step.state === 'failure' && step.config.kind === 'review') {
      items.push({
        id: step.id,
        content: (
          <NoticeRow
            name={`Changes requested on ${step.repository}`}
            head={`${step.repository} · changes requested`}
            accept={{ label: 'Hand to the agent', onPress: () => handlers.onHandOver(step.id) }}
          />
        ),
      })
    } else if (step.state === 'failure') {
      items.push({
        id: step.id,
        content: (
          <NoticeRow
            name={`${what} refused on ${step.repository}`}
            head={`${step.repository} · ${what.toLowerCase()} refused`}
            title={what}
            line={step.message}
            accept={{ label: 'Retry', onPress: () => handlers.onRetry(step.id) }}
          />
        ),
      })
    } else if (asksNow(run, step) && !(run.cli !== 'ready' && needsForge(step.config.kind))) {
      items.push({
        id: step.id,
        content: (
          <NoticeRow
            name={`${what} on ${step.repository}`}
            head={`${step.repository} · ${what} · ${on}`}
            accept={{ label: pressOf(step), onPress: () => handlers.onStart(step.id) }}
          />
        ),
      })
    }
  }
  const done = delivered(run)
  const closure = []
  if (done && !run.closed) {
    closure.push({
      id: 'close',
      content: (
        <NoticeRow
          name={`Close ${run.specKey}`}
          head={`${run.specKey} · ${run.specTitle}`}
          accept={{ label: 'Close', onPress: handlers.onClose }}
        />
      ),
    })
  }
  if (done && !run.cleaned) {
    closure.push({
      id: 'cleanup',
      content: (
        <NoticeRow
          name="Clean up the Workspace"
          head={run.workspace}
          mono
          accept={{ label: 'Clean up', onPress: handlers.onCleanup }}
        />
      ),
    })
  }
  return [
    {
      kind: 'delivery',
      label: 'Delivery steps',
      title: 'Deliver',
      icon: <IconRoute size="md" aria-hidden="true" />,
      tone: 'build',
      urgent: run.steps.some((one) => one.state === 'failure'),
      items,
    },
    {
      kind: 'closure',
      label: 'Closure',
      title: 'Close and clean up',
      icon: <IconFlag size="md" aria-hidden="true" />,
      tone: 'success',
      items: closure,
    },
  ]
}

// ——— The Session, in the window ———

const SESSIONS = [
  { id: 'build', title: 'Export the ledger as CSV' },
  { id: 'define', title: 'Full-text search' },
  { id: 'chat', title: 'Migrate to Drizzle 1.0' },
]

/** The window around a build Session, the Session it ends. */
function Window({ children }: { children: ReactNode }): ReactNode {
  const [collapsed, setCollapsed] = useState(false)
  const [width, setWidth] = useState(256)
  return (
    <div className="h-screen">
      <Shell
        projects={[{ id: 'atlas', name: 'Atlas', tone: 'primary', pending: 1 }]}
        activeProjectId="atlas"
        onSelectProject={() => undefined}
        onAddProject={() => undefined}
        notifications={null}
        unseen={false}
        onOpenSettings={() => undefined}
        sessions={SESSIONS}
        activeEntryId="build"
        onSelectEntry={() => undefined}
        onOpenCommand={() => undefined}
        commandShortcut="Ctrl+K"
        collapseShortcut="Ctrl+B"
        collapsed={collapsed}
        onCollapsedChange={setCollapsed}
        width={width}
        onWidthChange={setWidth}
      >
        {children}
      </Shell>
    </div>
  )
}

export interface DeliverySessionProps {
  run: DeliveryRun
  handlers: DeliveryHandlers
  /** Whether the notices are open as the Session is drawn. */
  noticesOpen?: boolean | undefined
  onOpenPlan?: (() => void) | undefined
}

/**
 * The build Session at its end: the head line across the page, the thread and the composer with
 * its notices, and beside the chat the build panel, holding the delivery's view.
 */
export function DeliverySession({
  run,
  handlers,
  noticesOpen,
  onOpenPlan,
}: DeliverySessionProps): ReactNode {
  const [value, setValue] = useState('')
  const groups = groupsOf(run, handlers)
  const waiting = groups.some((one) => one.items.length > 0)
  return (
    <TooltipProvider>
      <Window>
        <div className="flex h-full min-h-0 flex-col">
          <div className="px-6 pt-4 pb-3">
            <SessionHeader title={run.specTitle} onOpenDetails={() => undefined}>
              <LiveLine run={run} />
            </SessionHeader>
          </div>
          <div className="flex min-h-0 flex-1">
            <div className="flex min-w-0 flex-1 flex-col">
              <div className="scroll-quiet flex min-h-0 flex-1 flex-col justify-end overflow-y-auto">
                <div className="mx-auto w-full max-w-3xl px-6 py-4">
                  <Thread run={run} />
                </div>
              </div>
              <div className="mx-auto flex w-full max-w-3xl flex-col gap-2 px-6 pt-4 pb-4">
                <TurnLine
                  activity={null}
                  usage={{ used: 84200, size: 200000, cost: { amount: 1.84, currency: 'EUR' } }}
                  notched={waiting}
                />
                <Composer
                  value={value}
                  onValueChange={setValue}
                  files={[]}
                  onFilesChange={() => undefined}
                  onSearchFiles={() => Promise.resolve([])}
                  variant="inline"
                  action="Send"
                  placeholder="Say something to claude…"
                  onSend={() => Promise.resolve(null)}
                  notices={<SessionNotices groups={groups} defaultOpen={noticesOpen} />}
                />
              </div>
            </div>
            <aside
              aria-label="Build"
              className="scroll-quiet w-spec-panel shrink-0 overflow-y-auto border-l border-border"
            >
              <DeliveryView run={run} onOpenPlan={onOpenPlan} />
            </aside>
          </div>
        </div>
      </Window>
    </TooltipProvider>
  )
}

// ——— What Accept opens: the plan of the delivery, for this build ———

/**
 * The plan Accept opens, as the plan of a Workspace is: each repository in delivery order and the
 * steps it will run, and this build's pull request, the Project's templates filled, changed here
 * for this build alone.
 */
export function DeliverDialog({
  open,
  onOpenChange,
  rules,
  onDeliver,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  rules: DeliveryRules
  onDeliver: () => void
}): ReactNode {
  const [title, setTitle] = useState('feat(ledger): export the ledger as CSV')
  const [body, setBody] = useState(
    'Adds an Export button to the ledger that writes the rows on screen as CSV.\n\n{screenshots}\n\nRefs ATL-42',
  )
  return (
    <Dialog
      title="Deliver ATL-42"
      size="wide"
      open={open}
      onOpenChange={onOpenChange}
      actions={
        <>
          <Button
            variant="primary"
            onClick={() => {
              onDeliver()
              onOpenChange(false)
            }}
          >
            <IconCheck size="sm" aria-hidden="true" />
            Accept and deliver
          </Button>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-4">
        <ul className="flex flex-col gap-1" aria-label="Repositories">
          {inOrder(rules.repositories).map((repository) => (
            <li
              key={repository.name}
              className="flex items-center gap-3 rounded-md border border-border bg-muted px-3 py-2 text-sm"
            >
              <span className={MARK}>
                <IconGitFork size="sm" aria-hidden="true" />
              </span>
              <span className="w-12 shrink-0">{repository.name}</span>
              <span className="flex w-16 shrink-0 items-center gap-1 text-xs text-muted-foreground">
                {repository.after !== null && (
                  <>
                    <IconRoute size="sm" aria-hidden="true" />
                    {repository.after}
                  </>
                )}
              </span>
              <span className="flex min-w-0 flex-1 flex-wrap items-center gap-2">
                {stepsOfRepository(rules, repository.name).map((step) => {
                  const Icon = STEP_ICONS[step.config.kind]
                  const { what, on } = partsOf(step.config)
                  return (
                    <Tooltip key={step.id} label={`${what} · ${on}`}>
                      <i
                        role="img"
                        tabIndex={0}
                        aria-label={`${what} · ${on}`}
                        className="flex items-center gap-0.5 rounded-sm not-italic text-muted-foreground focus-ring"
                      >
                        <Icon size="sm" aria-hidden="true" />
                        {step.mode === 'ask' && <IconUser size="sm" aria-hidden="true" />}
                      </i>
                    </Tooltip>
                  )
                })}
              </span>
            </li>
          ))}
        </ul>
        <Input label="Title" value={title} onValueChange={setTitle} />
        <Textarea label="Body" rows={5} value={body} onValueChange={setBody} />
      </div>
    </Dialog>
  )
}

// ——— Played ———

/** One beat of a script: what changes, and how long after the beat before. */
interface Beat {
  after: number
  step: string
  change: Partial<RunStep>
}

/** A step running, then done with what it has to show. */
function runs(step: string, outcome?: string, wait = 1100): Beat[] {
  return [
    { after: 200, step, change: { state: 'running' } },
    { after: wait, step, change: { state: 'success', outcome } },
  ]
}

/**
 * Atlas delivered from the start: the kit goes first, the api's push is refused; each click in
 * the notices plays what follows it.
 */
const START: Beat[] = [
  ...runs('kit-changeset'),
  ...runs('kit-push'),
  ...runs('kit-pull-request', '#41'),
  { after: 200, step: 'api-push', change: { state: 'running' } },
  { after: 600, step: 'api-push', change: { state: 'failure' } },
  { after: 200, step: 'kit-ci', change: { state: 'running', outcome: '1 of 5' } },
  { after: 1200, step: 'kit-ci', change: { outcome: '3 of 5' } },
  { after: 1200, step: 'kit-ci', change: { state: 'success', outcome: '5 of 5' } },
  { after: 200, step: 'kit-review', change: { state: 'running', outcome: '0 of 1' } },
  { after: 1600, step: 'kit-review', change: { state: 'success', outcome: 'approved' } },
]

const AFTER = new Map<string, Beat[]>([
  [
    'api-push',
    [
      { after: 900, step: 'api-push', change: { state: 'success' } },
      ...runs('api-pull-request', '#318'),
      { after: 200, step: 'api-ci', change: { state: 'running', outcome: '2 of 5' } },
      { after: 1500, step: 'api-ci', change: { state: 'success', outcome: '5 of 5' } },
      ...runs('api-review', 'approved', 1800),
    ],
  ],
  ['kit-merge', [{ after: 900, step: 'kit-merge', change: { state: 'success' } }]],
  [
    'kit-release-job',
    [
      { after: 300, step: 'kit-release-job', change: { state: 'success' } },
      { after: 200, step: 'front-release', change: { state: 'running' } },
      { after: 2200, step: 'front-release', change: { state: 'success', outcome: '2.4.0' } },
      ...runs('front-bump', '2.3.1 → 2.4.0'),
      ...runs('front-push'),
      ...runs('front-pull-request', '#97'),
      ...runs('front-screenshots', '4'),
      { after: 200, step: 'front-ci', change: { state: 'running', outcome: '1 of 5' } },
      { after: 1500, step: 'front-ci', change: { state: 'success', outcome: '5 of 5' } },
      ...runs('front-review', 'approved', 1800),
    ],
  ],
  ['api-merge', [{ after: 900, step: 'api-merge', change: { state: 'success' } }]],
  ['front-merge', [{ after: 900, step: 'front-merge', change: { state: 'success' } }]],
])

/** Plays scripts onto a delivery, beat after beat, from the moment each is handed over. */
interface Played {
  run: DeliveryRun
  play: (script: Beat[]) => void
  set: (change: (run: DeliveryRun) => DeliveryRun) => void
}

function usePlayed(start: DeliveryRun): Played {
  const [run, setRun] = useState(start)
  const [scripts, setScripts] = useState<Beat[][]>([])
  const timers = useRef<number[]>([])
  useEffect(() => {
    const script = scripts.at(-1)
    if (script === undefined) return
    let at = 0
    for (const beat of script) {
      at += beat.after
      timers.current.push(
        window.setTimeout(() => {
          setRun((was) => ({
            ...was,
            steps: was.steps.map((one) =>
              one.id === beat.step ? { ...one, ...beat.change } : one,
            ),
          }))
        }, at),
      )
    }
  }, [scripts])
  useEffect(() => {
    const mine = timers.current
    return () => {
      for (const one of mine) window.clearTimeout(one)
    }
  }, [])
  return {
    run,
    play: (script) => setScripts((was) => [...was, script]),
    set: (change) => setRun(change),
  }
}

/** A delivery the reader plays: every answer in the notices lands; `live` plays the script. */
export function HeldDelivery({
  run: start,
  live = false,
  noticesOpen,
  rules,
  planOpen = false,
}: {
  run: DeliveryRun
  live?: boolean | undefined
  noticesOpen?: boolean | undefined
  /** The rules the plan reads, when the story opens it. */
  rules?: DeliveryRules | undefined
  planOpen?: boolean | undefined
}): ReactNode {
  const { run, play, set } = usePlayed(start)
  const [played, setPlayed] = useState(false)
  const [plan, setPlan] = useState(planOpen)
  if (live && !played) {
    setPlayed(true)
    play(START)
  }
  const change = (id: string, next: Partial<RunStep>) =>
    set((was) => ({
      ...was,
      steps: was.steps.map((one) => (one.id === id ? { ...one, ...next } : one)),
    }))
  const next = (id: string, fallback: Partial<RunStep>) => {
    const script = AFTER.get(id)
    if (live && script !== undefined) {
      change(id, { state: 'running', message: undefined })
      play(script)
    } else {
      change(id, fallback)
    }
  }
  const shown = live
    ? {
        ...run,
        steps: run.steps.map((one) =>
          one.state === 'failure' && one.message === undefined
            ? { ...one, message: REFUSED_SHORT }
            : one,
        ),
      }
    : run
  return (
    <>
      <DeliverySession
        run={shown}
        noticesOpen={noticesOpen}
        onOpenPlan={rules === undefined ? undefined : () => setPlan(true)}
        handlers={{
          onStart: (id) => next(id, { state: 'success' }),
          onRetry: (id) => next(id, { state: 'success', message: undefined }),
          onHandOver: (id) => change(id, { state: 'running', reviewers: undefined }),
          onCheckCli: () => set((was) => ({ ...was, cli: 'ready' })),
          onClose: () => set((was) => ({ ...was, closed: true })),
          onCleanup: () => set((was) => ({ ...was, cleaned: true })),
        }}
      />
      {rules !== undefined && (
        <DeliverDialog
          open={plan}
          onOpenChange={setPlan}
          rules={rules}
          onDeliver={() => undefined}
        />
      )}
    </>
  )
}

const REFUSED_SHORT = `To github.com:acme/atlas-api.git
 ! [rejected]        atlas/ATL-42-export-csv -> atlas/ATL-42-export-csv (fetch first)
error: failed to push some refs to 'github.com:acme/atlas-api.git'`
