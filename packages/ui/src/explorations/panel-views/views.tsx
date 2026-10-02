import { type ReactNode, useMemo, useRef } from 'react'

import { Disclosure } from '../../activity/disclosure.tsx'
import { TaskAttention } from '../../build/build-view.tsx'
import type { BuildViewData } from '../../build/model.ts'
import { SaidMark, TaskStage } from '../../build/task-stage.tsx'
import { Button, IconButton } from '../../components/button/button.tsx'
import { StatusDot, type StatusTone } from '../../components/status-dot/status-dot.tsx'
import { Tooltip } from '../../components/tooltip/tooltip.tsx'
import {
  IconChecklist,
  IconFileDescription,
  IconGitBranch,
  IconGitFork,
  IconLock,
  IconPackage,
} from '../../icons.ts'
import { instant, swap, useTransition } from '../../motion.ts'
import type { SpecView } from '../../spec/model.ts'
import { SpecColumn } from '../../spec/spec-column.tsx'
import { phasesOf } from '../../spec/spec-phases.ts'
import type { PanelView } from './model.ts'

/**
 * The four views the exploration opens on the build, each built from what the design system already
 * has where it has it: the frozen Spec is the Spec panel's column, a task is the build's own stage.
 * The review round and the delivery are drawn from their explorations (#320, the delivery rules)
 * as plain bodies, without the panel either of them had drawn for itself.
 */

/** A view's body that scrolls, the frame's body being the one place it is laid. */
const SCROLLER = 'flex min-h-0 flex-1 flex-col overflow-y-auto bg-surface-content'

const PAD = 'flex flex-col gap-5 px-6 py-5'

const MUTED = 'text-muted-foreground'

const KEY = 'shrink-0 font-mono text-xs text-muted-foreground'

/** What the views are handed to draw, and how they open another one. */
export interface ViewContext {
  build: BuildViewData
  spec: SpecView
  now: string
  /** Opens the frozen Spec over what is shown. */
  onOpenSpec: () => void
}

/** The ids of the views a frame can open, a task's carrying its build task id. */
export type ViewId = 'spec' | 'review' | 'delivery' | `task:${string}`

/** Every view, by its id: one contract, whatever it shows. */
export function viewOf(id: string, context: ViewContext): PanelView | null {
  if (id === 'spec') return specView(context)
  if (id === 'review') return reviewView(context)
  if (id === 'delivery') return deliveryView()
  if (id.startsWith('task:')) return taskView(id.slice('task:'.length), context)
  return null
}

/** The button a view puts in the head to open the frozen Spec. */
function OpenSpec({ onOpen }: { onOpen: () => void }): ReactNode {
  return (
    <Tooltip label="Spec">
      <IconButton
        variant="ghost"
        size="sm"
        icon={<IconFileDescription size="sm" />}
        aria-label="Open the Spec"
        onClick={onOpen}
      />
    </Tooltip>
  )
}

// ——— The frozen Spec ———

function specView({ spec }: ViewContext): PanelView {
  return {
    title: 'Spec',
    icon: <IconFileDescription size="sm" aria-hidden="true" />,
    width: 'over',
    actions: (
      <SaidMark label="Read only">
        <IconLock size="sm" aria-hidden="true" />
      </SaidMark>
    ),
    body: <FrozenSpec spec={spec} />,
  }
}

/** The revision the build works from, read as the Spec panel reads it, with no edit anywhere. */
function FrozenSpec({ spec }: { spec: SpecView }): ReactNode {
  const column = useRef<HTMLDivElement>(null)
  const still = useTransition(swap.move) === instant
  const groups = useMemo(() => phasesOf(spec), [spec])
  return (
    <div className="flex min-h-0 flex-1 flex-col bg-surface-content">
      <SpecColumn spec={spec} groups={groups} column={column} still={still} />
    </div>
  )
}

// ——— A task ———

function taskView(taskId: string, context: ViewContext): PanelView | null {
  const { build, now, onOpenSpec } = context
  const task = build.tasks.find((one) => one.id === taskId)
  if (task === undefined) return null
  return {
    title: task.label,
    icon: <IconChecklist size="sm" aria-hidden="true" />,
    width: 'beside',
    actions: <OpenSpec onOpen={onOpenSpec} />,
    body: (
      <div
        className={SCROLLER}
        role="region"
        tabIndex={0}
        aria-label={`${task.label} ${task.title}`}
      >
        <div className="px-6 py-5">
          <TaskStage
            task={task}
            now={now}
            attention={
              <TaskAttention
                task={task}
                build={build}
                now={now}
                ownBlocker
                onTaskDone={() => undefined}
                onTaskSkip={() => undefined}
                onDismissBlocker={() => undefined}
              />
            }
          />
        </div>
      </div>
    ),
  }
}

// ——— A Spec review round ———

/** Whether one criterion is shown met, and the test or check that shows it. */
interface Verdict {
  met: boolean
  evidence: string
}

/** Per story of the frozen Spec, by id, a verdict per criterion in the story's order. */
const VERDICTS = new Map<string, readonly Verdict[]>([
  [
    'story-export-a-month',
    [
      { met: true, evidence: 'export-csv.test.ts › one row per invoice line' },
      { met: false, evidence: 'export-csv.test.ts › header order' },
      { met: true, evidence: 'export-csv.test.ts › an empty month' },
    ],
  ],
  [
    'story-credit-notes',
    [
      { met: true, evidence: 'credit-notes.test.ts › negative rows' },
      { met: true, evidence: 'Final checks · try 2' },
    ],
  ],
])

function reviewView({ spec, onOpenSpec }: ViewContext): PanelView {
  return {
    title: 'Review · round 1',
    icon: <IconGitFork size="sm" aria-hidden="true" />,
    width: 'over',
    actions: (
      <>
        <StatusDot status="running" label="Round open" />
        <OpenSpec onOpen={onOpenSpec} />
      </>
    ),
    body: <ReviewRound spec={spec} />,
  }
}

/** The Spec review, story by story: each criterion with its dot and what shows it. */
function ReviewRound({ spec }: { spec: SpecView }): ReactNode {
  return (
    <div className={SCROLLER} role="region" tabIndex={0} aria-label="Review · round 1">
      <div className={PAD}>
        {spec.stories.map((story) => {
          const verdicts = VERDICTS.get(story.id) ?? []
          const met = verdicts.every((one) => one.met)
          return (
            <Disclosure
              key={story.id}
              defaultOpen
              summary={
                <span className="flex min-w-0 items-center gap-2">
                  <StatusDot
                    status={met ? 'success' : 'failure'}
                    label={met ? 'Every criterion shown met' : 'A criterion not shown met'}
                  />
                  <span className={KEY}>{story.key}</span>
                  <span className="min-w-0 truncate font-medium">{story.title}</span>
                </span>
              }
            >
              <ol className="flex flex-col gap-1 pl-6">
                {story.criteria.map((criterion, index) => {
                  const verdict = verdicts[index]
                  return (
                    <li key={criterion} className="flex items-start gap-2.5 py-1">
                      <span className="mt-1.5 flex">
                        <StatusDot
                          status={verdict?.met === true ? 'success' : 'failure'}
                          label={verdict?.met === true ? 'Shown met' : 'Not shown met'}
                        />
                      </span>
                      <span className="flex min-w-0 flex-col gap-0.5">
                        <span className="text-sm">{criterion}</span>
                        {verdict !== undefined && (
                          <span className="font-mono text-xs text-muted-foreground">
                            {verdict.evidence}
                          </span>
                        )}
                      </span>
                    </li>
                  )
                })}
              </ol>
            </Disclosure>
          )
        })}
      </div>
    </div>
  )
}

// ——— A delivery at the end of a build ———

interface Step {
  id: string
  icon: ReactNode
  verb: string
  target: string
  state: StatusTone
  link?: string
}

const STEP_WORDS: Record<StatusTone, string> = {
  pending: 'Pending',
  running: 'Running',
  success: 'Done',
  failure: 'Failed',
  cancelled: 'Skipped',
}

/** The steps of the delivery, repository by repository: committed, pushed, a pull request open. */
const STEPS: readonly { repository: string; steps: readonly Step[] }[] = [
  {
    repository: 'billing-api',
    steps: [
      {
        id: 'api-commit',
        icon: <IconGitBranch size="sm" aria-hidden="true" />,
        verb: 'Commit',
        target: 'feat(billing): export a month as CSV',
        state: 'success',
      },
      {
        id: 'api-push',
        icon: <IconGitBranch size="sm" aria-hidden="true" />,
        verb: 'Push',
        target: 'atl-7/csv-export',
        state: 'success',
      },
      {
        id: 'api-pr',
        icon: <IconGitFork size="sm" aria-hidden="true" />,
        verb: 'Pull request',
        target: 'into main',
        state: 'running',
        link: '#412',
      },
    ],
  },
  {
    repository: 'billing-web',
    steps: [
      {
        id: 'web-commit',
        icon: <IconGitBranch size="sm" aria-hidden="true" />,
        verb: 'Commit',
        target: 'feat(billing): the export button',
        state: 'success',
      },
      {
        id: 'web-push',
        icon: <IconGitBranch size="sm" aria-hidden="true" />,
        verb: 'Push',
        target: 'atl-7/csv-export',
        state: 'running',
      },
      {
        id: 'web-pr',
        icon: <IconGitFork size="sm" aria-hidden="true" />,
        verb: 'Pull request',
        target: 'into main',
        state: 'pending',
      },
    ],
  },
]

function deliveryView(): PanelView {
  return {
    title: 'Delivery',
    icon: <IconPackage size="sm" aria-hidden="true" />,
    width: 'beside',
    actions: <StatusDot status="running" label="Delivering" />,
    body: <Delivery />,
  }
}

/**
 * The end of a build, after Accept: the steps in order, repository by repository, each with its
 * dot. Closing the Spec and cleaning up the Workspace are not drawn while a step still runs: they
 * cannot be done yet, so this moment has neither.
 */
function Delivery(): ReactNode {
  return (
    <div className={SCROLLER} role="region" tabIndex={0} aria-label="Delivery">
      <div className={PAD}>
        {STEPS.map((repository) => (
          <Disclosure
            key={repository.repository}
            defaultOpen
            summary={
              <span className="flex items-center gap-2">
                <span className={MUTED}>
                  <IconGitBranch size="sm" aria-hidden="true" />
                </span>
                <span className="font-mono text-sm">{repository.repository}</span>
              </span>
            }
          >
            <ul className="flex flex-col gap-1 pl-6">
              {repository.steps.map((step) => (
                <li key={step.id} className="flex min-h-control-sm items-center gap-2.5">
                  <StatusDot status={step.state} label={STEP_WORDS[step.state]} />
                  <span className={MUTED}>{step.icon}</span>
                  <span className="shrink-0 text-sm">{step.verb}</span>
                  <span className="min-w-0 truncate font-mono text-xs text-muted-foreground">
                    {step.target}
                  </span>
                  {step.link !== undefined && (
                    <Button variant="link" size="sm" aria-label={`Open pull request ${step.link}`}>
                      {step.link}
                    </Button>
                  )}
                </li>
              ))}
            </ul>
          </Disclosure>
        ))}
      </div>
    </div>
  )
}
