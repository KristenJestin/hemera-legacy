import { cn } from 'cn'
import { type ReactNode, useEffect, useRef, useState } from 'react'

import { Button } from '../../components/button/button.tsx'
import { Dialog } from '../../components/dialog/dialog.tsx'
import { Input, Textarea } from '../../components/field/field.tsx'
import { StatusDot, type StatusTone } from '../../components/status-dot/status-dot.tsx'
import {
  IconCheck,
  IconFileDescription,
  IconFlag,
  IconGitFork,
  IconPlayerPlay,
  IconRefresh,
  IconTrash,
} from '../../icons.ts'
import { Reveal } from '../../reveal.tsx'
import {
  type DeliveryRules,
  type DeliveryRun,
  type ReviewerLine,
  type RunStep,
  delivered,
  nameOf,
  needsForge,
  ruleSentence,
} from './model.ts'
import { CliLine, MARK, ModeMark, MONO, NOTE, STEP_ICONS } from './parts.tsx'

/**
 * The end of a build, after Accept: the delivery's steps in order, repository by repository, each
 * with its dot; a failure keeps the remote's own words under its line and offers Retry; the pull
 * request shows its link and each reviewer's dot. The closure of the Spec and the cleanup of the
 * Workspace are the two last rows, each its own click, offered once every step is done.
 */

const VIEW = 'flex min-h-screen flex-col bg-surface-content'

const HEAD = 'flex flex-col gap-2 border-b border-border px-6 pt-5 pb-4'

const HEAD_LINE = 'flex min-w-0 items-center gap-3'

const KEY = 'shrink-0 font-mono text-xs text-muted-foreground'

const TITLE = 'min-w-0 truncate text-xl font-medium'

const BODY = 'mx-auto flex w-full max-w-3xl flex-col gap-5 px-6 py-5'

const SECTION_TITLE = 'flex items-center gap-2 text-sm font-medium text-foreground'

const GROUP = 'flex flex-col gap-1'

const GROUP_HEAD = 'flex items-center gap-2 px-1 pb-1 text-xs text-muted-foreground'

const LINE = 'flex min-h-control-sm items-center gap-3 rounded-md px-2 py-1'

const WHAT = 'flex min-w-0 flex-1 items-center gap-1.5 truncate text-sm text-foreground'

const TARGET = 'truncate font-mono text-xs text-muted-foreground'

/** The remote's words, as they were said: every line, wrapped rather than cut. */
const MESSAGE =
  'ml-12 rounded-md border border-border bg-muted px-2 py-1.5 font-mono text-xs break-words whitespace-pre-wrap text-foreground'

const REVIEWERS = 'ml-12 flex flex-wrap items-center gap-x-3 gap-y-1 pb-1 text-xs'

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

const STATE_WORDS: Record<StatusTone, string> = {
  pending: 'Pending',
  running: 'Running',
  success: 'Done',
  failure: 'Failed',
  cancelled: 'Skipped',
}

export interface DeliveryRunProps {
  run: DeliveryRun
  onRetry: (id: string) => void
  onStart: (id: string) => void
  onClose: () => void
  onCleanup: () => void
  onCheckCli?: (() => void) | undefined
}

function StepLine({
  step,
  held,
  onRetry,
  onStart,
}: {
  step: RunStep
  /** Held by a forge command line that cannot run: it waits, and says nothing of its own. */
  held: boolean
  onRetry: () => void
  onStart: () => void
}): ReactNode {
  const Icon = STEP_ICONS[step.kind]
  const sentence = `${step.verb} ${step.target}`
  return (
    <li className="flex flex-col gap-1">
      <div className={LINE}>
        <StatusDot status={step.state} label={STATE_WORDS[step.state]} />
        <span className={MARK}>
          <Icon size="sm" aria-hidden="true" />
        </span>
        <span className={WHAT}>
          <span className="shrink-0">{step.verb}</span>
          <span className={TARGET}>{step.target}</span>
        </span>
        {step.link !== undefined && (
          <Button variant="link" size="sm" aria-label={`Open pull request ${step.link.label}`}>
            {step.link.label}
          </Button>
        )}
        {step.state === 'failure' && step.kind !== 'review' && (
          <Button variant="secondary" size="sm" aria-label={`Retry: ${sentence}`} onClick={onRetry}>
            <IconRefresh size="sm" aria-hidden="true" />
            Retry
          </Button>
        )}
        {step.asks === true && step.state === 'pending' && !held && (
          <Button variant="primary" size="sm" aria-label={`Start: ${sentence}`} onClick={onStart}>
            <IconPlayerPlay size="sm" aria-hidden="true" />
            {step.kind === 'merge' ? 'Merge' : 'Start'}
          </Button>
        )}
      </div>
      <Reveal shown={step.state === 'failure' && step.message !== undefined}>
        <pre className={MESSAGE}>{step.message}</pre>
      </Reveal>
      <Reveal shown={step.reviewers !== undefined}>
        <ul className={REVIEWERS} aria-label={`Reviewers of ${step.repository}`}>
          {(step.reviewers ?? []).map((one) => (
            <li key={one.name} className="flex items-center gap-1.5 text-muted-foreground">
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

/** The two last rows: a click each, offered once every step is done. */
function ClosureLine({
  icon: Icon,
  done,
  offered,
  what,
  press,
  onPress,
  primary,
}: {
  icon: typeof IconFlag
  done: boolean
  offered: boolean
  what: string
  press: string
  onPress: () => void
  primary?: boolean
}): ReactNode {
  return (
    <li className={LINE}>
      <StatusDot status={done ? 'success' : 'pending'} label={done ? 'Done' : 'Pending'} />
      <span className={MARK}>
        <Icon size="sm" aria-hidden="true" />
      </span>
      <span className={WHAT}>{what}</span>
      {!done && (
        <Button
          variant={primary === true ? 'primary' : 'secondary'}
          size="sm"
          disabled={!offered}
          onClick={onPress}
        >
          {press}
        </Button>
      )}
    </li>
  )
}

export function DeliveryRunView({
  run,
  onRetry,
  onStart,
  onClose,
  onCleanup,
  onCheckCli,
}: DeliveryRunProps): ReactNode {
  const repositories = [...new Set(run.steps.map((step) => step.repository))]
  const done = delivered(run)
  const held = run.cli !== 'ready'
  return (
    <div className={VIEW}>
      <header className={HEAD}>
        <div className={HEAD_LINE}>
          <StatusDot status="success" label="Accepted" />
          <span className={KEY}>{run.specKey}</span>
          <h1 className={TITLE}>{run.specTitle}</h1>
          <div className="ml-auto flex shrink-0 items-center gap-2">
            <Button variant="ghost" size="sm">
              <IconFileDescription size="sm" aria-hidden="true" />
              Spec
            </Button>
          </div>
        </div>
      </header>
      <div className={BODY}>
        <section aria-label="Delivery" className="flex flex-col gap-3">
          <h2 className={SECTION_TITLE}>Delivery</h2>
          {run.forge !== 'none' && run.forge !== 'gitlab' && held && (
            <CliLine forge={run.forge} cli={run.cli} onCheck={onCheckCli} />
          )}
          {repositories.map((repository) => (
            <div key={repository} className={GROUP}>
              {repositories.length > 1 && (
                <p className={GROUP_HEAD}>
                  <IconGitFork size="sm" aria-hidden="true" />
                  {repository}
                </p>
              )}
              <ol className="flex flex-col gap-1" aria-label={`Steps of ${repository}`}>
                {run.steps
                  .filter((step) => step.repository === repository)
                  .map((step) => (
                    <StepLine
                      key={step.id}
                      step={step}
                      held={held && needsForge(step.kind)}
                      onRetry={() => onRetry(step.id)}
                      onStart={() => onStart(step.id)}
                    />
                  ))}
              </ol>
            </div>
          ))}
          <ol className="flex flex-col gap-1 border-t border-border pt-3" aria-label="Closure">
            <ClosureLine
              icon={IconFlag}
              done={run.closed}
              offered={done}
              what={`close ${run.specKey}`}
              press="Close"
              primary
              onPress={onClose}
            />
            <ClosureLine
              icon={IconTrash}
              done={run.cleaned}
              offered={done}
              what="clean up the Workspace"
              press="Clean up"
              onPress={onCleanup}
            />
          </ol>
        </section>
      </div>
    </div>
  )
}

// ——— What Accept opens: the plan of the delivery, for this build ———

/**
 * The plan Accept opens, as the plan of a Workspace is: every step that will run, and the fields
 * of this build's pull request, which are the Project's templates filled and can be changed here
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
    'Adds an Export button to the ledger that writes the rows on screen as CSV.\n\n- ATL-42-1 Export what is on screen\n- ATL-42-2 Name the file after the period\n\nRefs ATL-42',
  )
  const [reviewers, setReviewers] = useState(rules.reviewers.join(', '))
  const opens = rules.steps.some((one) => one.kind === 'pull-request')
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
        <ul className="flex flex-col gap-1" aria-label="Branches">
          {rules.repositories.map((one) => (
            <li
              key={one.path}
              className="flex items-center gap-3 rounded-md border border-border bg-muted px-3 py-2 text-sm"
            >
              <span className={MARK}>
                <IconGitFork size="sm" aria-hidden="true" />
              </span>
              <span className="w-16 shrink-0">{nameOf(one.path)}</span>
              <span className={cn(MONO, 'min-w-0 flex-1 truncate text-muted-foreground')}>
                atlas/ATL-42-export-csv → {one.remote}/{rules.base}
              </span>
            </li>
          ))}
        </ul>
        <ol className="flex flex-col gap-1" aria-label="Steps">
          {rules.steps.map((step) => {
            const Icon = STEP_ICONS[step.kind]
            return (
              <li key={step.id} className={LINE}>
                <StatusDot status="pending" />
                <span className={MARK}>
                  <Icon size="sm" aria-hidden="true" />
                </span>
                <span className={WHAT}>{ruleSentence(step, rules)}</span>
                <ModeMark mode={step.mode} />
              </li>
            )
          })}
        </ol>
        {opens && (
          <>
            <Input label="Title" value={title} onValueChange={setTitle} />
            <Textarea label="Body" rows={5} value={body} onValueChange={setBody} />
            <Input label="Reviewers" value={reviewers} onValueChange={setReviewers} />
          </>
        )}
        {!opens && rules.steps.length === 0 && (
          <p className={NOTE}>The branch stays in the Workspace.</p>
        )}
      </div>
    </Dialog>
  )
}

// ——— Played live ———

/** One beat of the script: what changes, and how long after the beat before. */
interface Beat {
  after: number
  step: string
  change: Partial<RunStep>
}

/**
 * A delivery of Atlas played through: the api pushes and opens its pull request, the front's push
 * is refused, and its Retry — pressed by the reader — goes through; then the reviews arrive.
 */
const SCRIPT: Beat[] = [
  { after: 600, step: 'api-push', change: { state: 'running' } },
  { after: 1200, step: 'api-push', change: { state: 'success' } },
  { after: 100, step: 'api-pr', change: { state: 'running' } },
  {
    after: 1400,
    step: 'api-pr',
    change: {
      state: 'success',
      verb: 'pull request',
      target: 'into dev',
      link: { label: '#318', url: '' },
    },
  },
  {
    after: 100,
    step: 'api-review',
    change: {
      state: 'running',
      verb: 'review',
      target: '0 of 2 approvals',
      reviewers: [
        { name: 'lea-m', state: 'waiting' },
        { name: '@acme/web', state: 'waiting' },
      ],
    },
  },
  { after: 300, step: 'front-push', change: { state: 'running' } },
  { after: 1200, step: 'front-push', change: { state: 'failure' } },
]

const AFTER_RETRY: Beat[] = [
  { after: 1200, step: 'front-push', change: { state: 'success' } },
  { after: 100, step: 'front-pr', change: { state: 'running' } },
  {
    after: 1400,
    step: 'front-pr',
    change: {
      state: 'success',
      verb: 'pull request',
      target: 'into dev',
      link: { label: '#97', url: '' },
    },
  },
  {
    after: 100,
    step: 'front-review',
    change: {
      state: 'running',
      verb: 'review',
      target: '0 of 2 approvals',
      reviewers: [
        { name: 'lea-m', state: 'waiting' },
        { name: '@acme/web', state: 'waiting' },
      ],
    },
  },
  {
    after: 1500,
    step: 'api-review',
    change: {
      verb: 'review',
      target: '1 of 2 approvals',
      reviewers: [
        { name: 'lea-m', state: 'approved' },
        { name: '@acme/web', state: 'waiting' },
      ],
    },
  },
  {
    after: 1500,
    step: 'api-review',
    change: {
      state: 'success',
      verb: 'review',
      target: '2 of 2 approvals',
      reviewers: [
        { name: 'lea-m', state: 'approved' },
        { name: '@acme/web', state: 'approved' },
      ],
    },
  },
  {
    after: 1200,
    step: 'front-review',
    change: {
      state: 'success',
      verb: 'review',
      target: '2 of 2 approvals',
      reviewers: [
        { name: 'lea-m', state: 'approved' },
        { name: '@acme/web', state: 'approved' },
      ],
    },
  },
]

/** Plays a script onto a delivery, beat after beat, from the moment it is handed one. */
function usePlayed(
  start: DeliveryRun,
): [DeliveryRun, (script: Beat[]) => void, (next: DeliveryRun) => void] {
  const [run, setRun] = useState(start)
  const [script, setScript] = useState<Beat[]>([])
  const timers = useRef<number[]>([])
  useEffect(() => {
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
    const mine = timers.current
    return () => {
      for (const one of mine) window.clearTimeout(one)
    }
  }, [script])
  return [run, setScript, setRun]
}

/** A delivery the reader plays: its own Retry, Close and Clean up, and a live script. */
export function HeldDeliveryRun({
  run: start,
  live = false,
}: {
  run: DeliveryRun
  live?: boolean
}): ReactNode {
  const [run, play, setRun] = usePlayed(start)
  const [played, setPlayed] = useState(false)
  if (live && !played) {
    setPlayed(true)
    play(SCRIPT)
  }
  const change = (id: string, next: Partial<RunStep>) =>
    setRun({ ...run, steps: run.steps.map((one) => (one.id === id ? { ...one, ...next } : one)) })
  return (
    <DeliveryRunView
      run={live ? { ...run, steps: run.steps.map(withRefusal) } : run}
      onRetry={(id) => {
        change(id, { state: 'running' })
        if (live) play(AFTER_RETRY)
      }}
      onStart={(id) => change(id, { state: 'success', verb: 'merged into', asks: false })}
      onClose={() => setRun({ ...run, closed: true })}
      onCleanup={() => setRun({ ...run, cleaned: true })}
      onCheckCli={() => setRun({ ...run, cli: 'ready' })}
    />
  )
}

/** A refused push in the live script carries the remote's own words. */
function withRefusal(step: RunStep): RunStep {
  if (step.state !== 'failure' || step.message !== undefined) return step
  return {
    ...step,
    message: `To github.com:acme/atlas-front.git
 ! [rejected]        atlas/ATL-42-export-csv -> atlas/ATL-42-export-csv (fetch first)
error: failed to push some refs to 'github.com:acme/atlas-front.git'`,
  }
}
