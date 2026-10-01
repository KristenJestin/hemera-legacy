import { AnimatePresence, motion } from 'motion/react'
import { type ReactNode, useId, useState } from 'react'

import { Disclosure } from '../activity/disclosure.tsx'
import { Button } from '../components/button/button.tsx'
import { StatusDot, type StatusTone } from '../components/status-dot/status-dot.tsx'
import { StatusMark } from '../components/status-mark/status-mark.tsx'
import {
  IconCheck,
  IconFileDescription,
  IconFlask,
  IconPlayerPause,
  IconPlayerPlay,
} from '../icons.ts'
import { AgentText } from '../message/agent-text.tsx'
import { check, useTransition } from '../motion.ts'
import type { StoryView } from '../spec/model.ts'
import { BlockerBlock } from './blocker-block.tsx'
import { BuildBar, BuildCounts, TASK_MARKS } from './build-progress.tsx'
import {
  type BuildBlockerView,
  type BuildReproductionView,
  type BuildStoryProgress,
  type BuildTaskView,
  type BuildViewData,
  PHASE_LABELS,
  STORY_PROGRESS_LABELS,
  lastAttempt,
  openBlockerOf,
  outsideOf,
  storyRowsOf,
  taskStateLabel,
} from './model.ts'
import { ReviewCard } from './review-card.tsx'
import { StopBuild } from './stop-build.tsx'
import { BuildTries, TaskStage } from './task-stage.tsx'
import { ago, taskTime, tryLabel } from './times.ts'
import { YoursBlock } from './yours-block.tsx'

/**
 * The build view: the Spec annotated with the build's progress (issue #116).
 *
 * The head is the Spec, where the build stands in words, and the one Stop build there is: the panel
 * is the only place a build is answered from, so its Stop is the only one, and a blocker carries
 * none of its own. Under it the stories of the Spec, in the Spec's own order, each with the words
 * it was written with, the criteria it is judged on, and where it stands — said by the tasks the
 * build split it into, and by nothing else. Those tasks are one unfold away, and a task unfolds the
 * stage 5a drew: its tries, the checks each try ran and their result, and the files it changed.
 * The tasks no story holds come after the stories, in a group of their own (issue #203). The checks
 * of the whole Spec come last, when the build reaches them.
 *
 * The chat says what is being done, the panel says what the Spec is now (D10-02): nothing here is
 * read from the chat — the story, its criteria and its progress are the frozen Spec's and the
 * build's own.
 */

const VIEW = 'flex h-full min-h-0 min-w-0 flex-col bg-surface-content'

const HEAD = 'flex flex-col gap-2 border-b border-border px-6 pt-5 pb-4'

const HEAD_LINE = 'flex min-w-0 items-center gap-3'

const KEY = 'shrink-0 font-mono text-xs text-muted-foreground'

const TITLE = 'min-w-0 truncate text-xl font-medium'

const ACTIONS = 'ml-auto flex shrink-0 items-center gap-2'

const STATE_LINE = 'flex min-w-0 flex-wrap items-center gap-x-3 gap-y-1 text-sm'

const PHASE = 'flex items-center gap-1.5 font-medium text-foreground'

const QUIET = 'text-muted-foreground'

/** Where the final checks stand, in the state line: the flask and the mark of the last try. */
const FINALS = 'flex items-center gap-1 text-muted-foreground'

const APPROACH = 'border-b border-border px-5 py-2'

/** The review card, first in the pane under the head: the decision the pane is opened for. */
const REVIEW = 'mx-6 mt-3'

const APPROACH_LINE = 'flex items-center gap-2 text-sm'

const APPROACH_BODY = 'max-h-48 overflow-y-auto pr-2'

const WAITING = 'flex items-center gap-2 px-1 py-0.5 text-sm text-muted-foreground'

const BODY =
  'flex min-h-0 min-w-0 flex-1 flex-col gap-6 overflow-y-auto px-6 py-5 outline-none focus-ring'

const STORIES = 'flex flex-col gap-6'

/** One story of the Spec, and under it what the build made of it. */
const STORY = 'flex min-w-0 flex-col gap-2'

const STORY_HEAD = 'flex min-w-0 items-center gap-2'

const STORY_KEY = 'shrink-0 font-mono text-xs text-muted-foreground'

const STORY_TITLE = 'min-w-0 text-base font-medium'

const NARRATIVE = 'text-sm text-muted-foreground'

const CRITERIA = 'flex list-disc flex-col gap-0.5 pl-5 text-sm'

/** The line that unfolds a story's tasks, and the tasks' owns. */
const TASKS = 'text-sm text-muted-foreground'

const TASK = 'flex min-w-0 flex-1 items-center gap-2'

const TASK_LABEL = 'shrink-0 font-mono text-xs'

const TASK_TITLE = 'min-w-0 flex-1 truncate'

/** A done task's title: quiet, and struck through. */
const TASK_TITLE_DONE = 'min-w-0 flex-1 truncate text-muted-foreground'

/** The stroke across a done task's title, drawn from its start. */
const STRIKE = 'absolute inset-0 flex origin-left items-center'

const TASK_META = 'shrink-0 text-xs text-muted-foreground'

/**
 * A task's title, struck through once it is done: the stroke draws itself across it on the beat
 * the mark's check draws on.
 */
export function TaskTitle({ done, children }: { done: boolean; children: ReactNode }): ReactNode {
  const drawing = useTransition(check.draw)
  return (
    <span className={done ? TASK_TITLE_DONE : TASK_TITLE}>
      <span className="relative">
        {children}
        <AnimatePresence initial={false}>
          {done && (
            <motion.span
              key="strike"
              aria-hidden="true"
              className={STRIKE}
              data-strike
              initial={{ scaleX: 0 }}
              animate={{ scaleX: 1 }}
              exit={{ scaleX: 0 }}
              transition={drawing}
            >
              <span className="w-full border-t border-current" />
            </motion.span>
          )}
        </AnimatePresence>
      </span>
    </span>
  )
}

/** Where a story stands, as the one dot its line wears. */
const PROGRESS_TONES: Record<BuildStoryProgress, StatusTone> = {
  todo: 'pending',
  in_progress: 'running',
  done: 'success',
  blocked: 'failure',
}

/** The head of the final checks, its mark before it while none has run. */
const FINALS_HEAD = 'flex items-center gap-2 text-lg font-medium'

const REPLAY_HEAD = 'flex items-center gap-2 text-sm font-medium'

/** What a task held by another's blocker waits on: the blocked mark, and the tasks it names. */
const WAITS = 'flex items-center gap-2 font-mono text-xs text-muted-foreground'

/** A state said as a word and the dot beside it. */
interface Standing {
  word: string
  tone: StatusTone
}

/** Where the build stands, as a dot and a word: paused wins over the phase it paused in. */
function phaseOf(build: BuildViewData): Standing {
  if (build.pausedAt !== null && !closed(build)) return { word: 'Paused', tone: 'pending' }
  // Everything is done and green, and nothing moves until the user accepts: the build is not
  // building any more, it is waiting for the review it is owed (issue #116).
  if (build.canAccept && !closed(build)) {
    return { word: 'Waiting for your review', tone: 'success' }
  }
  const tones: Record<BuildViewData['phase'], StatusTone> = {
    prepare: 'running',
    execute: 'running',
    verify: 'running',
    accepted: 'success',
    stopped: 'cancelled',
  }
  return { word: PHASE_LABELS[build.phase], tone: tones[build.phase] }
}

/** Whether the build is over: accepted or stopped, readable, and nothing runs in it any more. */
export function closed(build: BuildViewData): boolean {
  return build.phase === 'accepted' || build.phase === 'stopped'
}

/** The tasks that wait on `label`, directly or through another. */
export function dependantsOf(label: string, tasks: readonly BuildTaskView[]): string[] {
  const found: string[] = []
  const walk = (of: string) => {
    for (const task of tasks) {
      if (task.dependsOn.includes(of) && !found.includes(task.label)) {
        found.push(task.label)
        walk(task.label)
      }
    }
  }
  walk(label)
  return found
}

/**
 * What the view unfolds when nothing was chosen: what needs the user, then what is being worked
 * on, then the first task of the build. Nothing once the build is in its final checks — the
 * checks of the whole Spec are drawn under the stories, and they are the news then.
 */
export function firstShown(build: BuildViewData): string | null {
  if (closed(build)) return null
  const needs = build.tasks.find(
    (task) =>
      task.state === 'yours' ||
      (task.state === 'blocked' && openBlockerOf(task, build.blockers) !== undefined),
  )
  if (needs !== undefined) return needs.id
  const moving = build.tasks.find(
    (task) => task.state === 'in_progress' || task.state === 'checking',
  )
  if (moving !== undefined) return moving.id
  if (build.phase === 'verify' || build.endAttempts.length > 0) return null
  return build.tasks[0]?.id ?? null
}

/**
 * The one line under the title: the phase in words, how many tasks stand where and the bar of
 * them all (#77), and the final checks.
 */
function StateLine({ build, now }: { build: BuildViewData; now: string }): ReactNode {
  const { word, tone } = phaseOf(build)
  const final = lastAttempt(build.endAttempts)
  return (
    <div className={STATE_LINE}>
      <span className={PHASE}>
        <StatusDot status={tone} />
        {word}
      </span>
      {build.tasks.length > 0 && (
        <>
          <BuildCounts tasks={build.tasks} />
          <BuildBar tasks={build.tasks} label="Where each task stands" />
        </>
      )}
      {build.phase === 'verify' && final !== undefined && (
        <span className={FINALS}>
          <IconFlask size="sm" aria-hidden="true" />
          <StatusMark
            state={final.result === 'green' ? 'done' : 'progress'}
            label={
              final.result === 'green'
                ? 'Final checks green'
                : `Final checks on ${tryLabel(final.number).toLowerCase()}`
            }
          />
        </span>
      )}
      {build.pausedAt !== null && !closed(build) && (
        <span className={QUIET}>{`since ${ago(build.pausedAt, now)}`}</span>
      )}
      {build.phase === 'stopped' &&
        build.detail !== null && (
          // Why it stopped, in the engine's words.
          <span className={QUIET}>{build.detail}</span>
        )}
    </div>
  )
}

export interface BuildHeadProps {
  build: BuildViewData
  now: string
  /** Whether the frozen Spec is open, which its button says. */
  specOpen: boolean
  onToggleSpec: () => void
  onPause: () => void
  onResume: () => void
  onAccept: () => void
  onStop: () => void
}

/**
 * The head of the build, beside the chat and over it alike: the Spec, its actions — the frozen
 * Spec, Accept, Pause or Resume, and the one Stop build there is — and where the build stands.
 */
export function BuildHead({
  build,
  now,
  specOpen,
  onToggleSpec,
  onPause,
  onResume,
  onAccept,
  onStop,
}: BuildHeadProps): ReactNode {
  const over = closed(build)
  const paused = build.pausedAt !== null
  return (
    <header className={HEAD}>
      <div className={HEAD_LINE}>
        <span className={KEY}>{build.specKey}</span>
        <h1 className={TITLE}>{build.specTitle}</h1>
        <div className={ACTIONS}>
          <Button
            variant="ghost"
            size="sm"
            aria-pressed={specOpen}
            // What the page gives the keyboard back to once the Spec it opened is closed.
            data-spec-toggle
            onClick={onToggleSpec}
          >
            <IconFileDescription size="sm" />
            Spec
          </Button>
          {!over && build.canAccept && (
            <Button variant="primary" size="sm" onClick={onAccept}>
              <IconCheck size="sm" />
              Accept
            </Button>
          )}
          {!over && !build.canAccept && paused && (
            <Button variant="primary" size="sm" onClick={onResume}>
              <IconPlayerPlay size="sm" />
              Resume
            </Button>
          )}
          {!over && !build.canAccept && !paused && (
            <Button variant="secondary" size="sm" onClick={onPause}>
              <IconPlayerPause size="sm" />
              Pause
            </Button>
          )}
          {!over && <StopBuild specKey={build.specKey} onStop={onStop} />}
        </div>
      </div>
      <StateLine build={build} now={now} />
    </header>
  )
}

/**
 * The agent's approach, or its mark while the build waits for it (D10-02): a turning mark, its
 * words for the tooltip and the screen reader. Nothing once the build is over without one.
 */
export function Approach({ build }: { build: BuildViewData }): ReactNode {
  if (build.note === null) {
    if (closed(build)) return null
    return (
      <div className={APPROACH}>
        <p className={WAITING}>
          <StatusMark
            state="progress"
            label="Waiting for the agent's approach: no task starts before it"
          />
          Approach
        </p>
      </div>
    )
  }
  const started = build.tasks.some((task) => task.startedAt !== null)
  return (
    <div className={APPROACH}>
      <Disclosure defaultOpen={!started} summary={<span className={APPROACH_LINE}>Approach</span>}>
        <div className={APPROACH_BODY}>
          <AgentText text={build.note} />
        </div>
      </Disclosure>
    </div>
  )
}

export interface TaskAttentionProps {
  task: BuildTaskView
  build: BuildViewData
  now: string
  /**
   * Whether a blocker raised on the task itself is drawn here: beside the chat it stands on the
   * task's story, above its tasks; over it, on the task's own detail.
   */
  ownBlocker: boolean
  onTaskDone: (taskId: string) => void
  onTaskSkip: (taskId: string, reason: string, unblock: boolean) => void
  onDismissBlocker: (blockerId: string, note: string | null) => void
}

/**
 * What stands on top of a task's stage when it needs the user: the user's own task to do or skip,
 * the blocker the agent raised on it, or why it waits on a blocked one. Nothing once the build is
 * over.
 */
export function TaskAttention({
  task,
  build,
  now,
  ownBlocker,
  onTaskDone,
  onTaskSkip,
  onDismissBlocker,
}: TaskAttentionProps): ReactNode {
  if (closed(build)) return null
  if (task.state === 'yours') {
    return (
      <YoursBlock
        task={task}
        dependants={dependantsOf(task.label, build.tasks)}
        onDone={() => onTaskDone(task.id)}
        onSkip={(reason, unblock) => onTaskSkip(task.id, reason, unblock)}
      />
    )
  }
  if (task.state !== 'blocked') return null
  const own = openBlockerOf(task, build.blockers)
  if (own !== undefined) {
    if (!ownBlocker) return null
    return (
      <BlockerBlock
        blocker={own}
        now={now}
        suspended={dependantsOf(task.label, build.tasks)}
        onDismiss={(note) => onDismissBlocker(own.id, note)}
      />
    )
  }
  const holding = build.blockers
    .filter((one) => one.dismissedAt === null)
    .filter((one) => dependantsOf(one.label, build.tasks).includes(task.label))
    .map((one) => one.label)
  return (
    <p className={WAITS}>
      <StatusMark
        state="blocked"
        label={`Waits on ${holding.join(', ')}, which the agent says contradicts the Spec`}
      />
      {holding.join(', ')}
    </p>
  )
}

export interface BuildViewProps {
  build: BuildViewData
  /** The caller's now, which every time of the view is said from. */
  now: string
  /**
   * The stories of the frozen Spec, which the build's stories take their words from: what each
   * story was written to be, and the criteria it is judged on.
   */
  stories?: readonly StoryView[] | undefined
  /**
   * The task that is unfolded, by its build task id; for a caller that keeps it. Left out, the
   * view holds it, and opens on what needs the user first; `null` says nothing is unfolded.
   */
  selected?: string | null | undefined
  onSelect?: ((id: string | null) => void) | undefined
  /** Whether the frozen Spec is open beside the view, which its button says. */
  specOpen?: boolean | undefined
  /** Opens or closes the frozen Spec beside the view. */
  onToggleSpec: () => void
  onPause: () => void
  onResume: () => void
  onAccept: () => void
  onStop: () => void
  /** A task that was the user's is done. */
  onTaskDone: (taskId: string) => void
  /** A task that was the user's is skipped, with the reason and whether its dependants go on. */
  onTaskSkip: (taskId: string, reason: string, unblock: boolean) => void
  /** The Spec stands: the blocked task goes back to ready, with the note the user wrote. */
  onDismissBlocker: (blockerId: string, note: string | null) => void
  /** The build waits for the user's review: the panel asks for it where it is written. */
  onOpenChat: () => void
}

export function BuildView({
  build,
  now,
  stories = [],
  selected,
  onSelect,
  specOpen = false,
  onToggleSpec,
  onPause,
  onResume,
  onAccept,
  onStop,
  onTaskDone,
  onTaskSkip,
  onDismissBlocker,
  onOpenChat,
}: BuildViewProps): ReactNode {
  const [chosen, setChosen] = useState<string | null>(() => firstShown(build))
  const [unfolded, setUnfolded] = useState<readonly string[]>([])
  const shown = selected ?? chosen
  const over = closed(build)
  const storyIds = useId()
  const rows = storyRowsOf(build, stories)
  const outside = outsideOf(build, rows)
  const finals = build.phase === 'verify' || build.endAttempts.length > 0

  // The story of the task that is unfolded is unfolded too: a stage nobody can see is a stage
  // that was asked for and never shown. Folding the story folds what was unfolded in it.
  const held = rows.find((story) => story.tasks.some((one) => one.id === shown))
  if (held !== undefined && !unfolded.includes(held.id)) {
    setUnfolded((was) => [...was, held.id])
  }

  const choose = (id: string | null) => {
    setChosen(id)
    onSelect?.(id)
  }

  const unfold = (id: string, open: boolean) => {
    setUnfolded((was) => (open ? [...was, id] : was.filter((one) => one !== id)))
  }

  /** What stands on top of a task's stage when it needs the user. */
  function attentionOf(on: BuildTaskView): ReactNode {
    return (
      <TaskAttention
        task={on}
        build={build}
        now={now}
        ownBlocker={false}
        onTaskDone={onTaskDone}
        onTaskSkip={onTaskSkip}
        onDismissBlocker={onDismissBlocker}
      />
    )
  }

  /** The blockers still standing on some tasks, each with the task it holds. */
  function blockersOf(
    tasks: readonly BuildTaskView[],
  ): { task: BuildTaskView; blocker: BuildBlockerView }[] {
    return build.blockers
      .filter((blocker) => blocker.dismissedAt === null)
      .flatMap((blocker) => {
        const on = tasks.find((one) => one.id === blocker.taskId)
        return on === undefined ? [] : [{ task: on, blocker }]
      })
  }

  /** The blockers standing on some tasks, each where it can be answered. */
  function blockerBlocks(tasks: readonly BuildTaskView[]): ReactNode {
    return blockersOf(tasks).map(({ task: blocked, blocker }) => (
      <BlockerBlock
        key={blocker.id}
        blocker={blocker}
        now={now}
        suspended={dependantsOf(blocked.label, build.tasks)}
        onDismiss={(note) => onDismissBlocker(blocker.id, note)}
      />
    ))
  }

  /** Some tasks, each a line that unfolds its stage, one stage at a time. */
  function taskList(tasks: readonly BuildTaskView[]): ReactNode {
    return (
      <ul className="flex flex-col">
        {tasks.map((one) => (
          <li key={one.id}>
            <Disclosure
              open={shown === one.id}
              onOpenChange={(next) => choose(next ? one.id : null)}
              summary={
                <span className={TASK}>
                  <StatusMark state={TASK_MARKS[one.state]} />
                  <span className={TASK_LABEL}>{one.label}</span>
                  <span className="sr-only">{', '}</span>
                  <TaskTitle done={one.state === 'done'}>{one.title}</TaskTitle>
                  {/* Where it stands is its mark's to show; the words are for the screen reader. */}
                  <span className="sr-only">{`, ${taskStateLabel(one)}, `}</span>
                  <span className={TASK_META}>{taskTime(one, now)}</span>
                </span>
              }
            >
              <TaskStage task={one} now={now} attention={attentionOf(one)} />
            </Disclosure>
          </li>
        ))}
      </ul>
    )
  }

  return (
    <div className={VIEW}>
      <BuildHead
        build={build}
        now={now}
        specOpen={specOpen}
        onToggleSpec={onToggleSpec}
        onPause={onPause}
        onResume={onResume}
        onAccept={onAccept}
        onStop={onStop}
      />
      {!over && build.canAccept && <ReviewCard className={REVIEW} onOpenChat={onOpenChat} />}
      <Approach build={build} />
      <div className={BODY} role="region" tabIndex={0} aria-label={`The build of ${build.specKey}`}>
        {rows.length > 0 && (
          <ol aria-label={`Stories of ${build.specKey}`} className={STORIES}>
            {rows.map((story) => {
              const open = unfolded.includes(story.id)
              const heading = `${storyIds}-${story.id}`
              return (
                <li key={story.id} className="flex">
                  <article aria-labelledby={heading} className={STORY}>
                    <div className={STORY_HEAD}>
                      <StatusDot
                        status={PROGRESS_TONES[story.progress]}
                        label={STORY_PROGRESS_LABELS[story.progress]}
                      />
                      <span className={STORY_KEY}>{story.key}</span>
                      <h2 id={heading} className={STORY_TITLE}>
                        {story.title}
                      </h2>
                    </div>
                    {story.narrative !== '' && <p className={NARRATIVE}>{story.narrative}</p>}
                    {story.criteria.length > 0 && (
                      <ul aria-label={`Criteria of ${story.key}`} className={CRITERIA}>
                        {story.criteria.map((criterion) => (
                          <li key={criterion}>{criterion}</li>
                        ))}
                      </ul>
                    )}
                    {blockerBlocks(story.tasks)}
                    {story.tasks.length > 0 && (
                      <Disclosure
                        open={open}
                        onOpenChange={(next) => {
                          unfold(story.id, next)
                          if (!next && story.tasks.some((one) => one.id === shown)) choose(null)
                        }}
                        summary={
                          <span className={TASKS}>{`Tasks · ${String(story.tasks.length)}`}</span>
                        }
                      >
                        {taskList(story.tasks)}
                      </Disclosure>
                    )}
                  </article>
                </li>
              )
            })}
          </ol>
        )}
        {outside.length > 0 && (
          // The tasks no story holds (issue #203): after the stories, in a group of their own,
          // never folded, since nothing else of theirs stands above them to read first.
          <section
            aria-label={rows.length === 0 ? `Tasks of ${build.specKey}` : 'Outside any story'}
            className={STORY}
          >
            {rows.length > 0 && <h2 className={STORY_TITLE}>Outside any story</h2>}
            {blockerBlocks(outside)}
            {taskList(outside)}
          </section>
        )}
        {finals && <FinalChecks build={build} now={now} />}
      </div>
    </div>
  )
}

/** Where the replay of a bug's reproduction stands, as the dot beside it says it. */
function replayStanding(replay: BuildReproductionView | null | undefined): Standing {
  if (replay === null || replay === undefined) return { word: 'Not replayed', tone: 'pending' }
  return replay.gone ? { word: 'Gone', tone: 'success' } : { word: 'Still there', tone: 'failure' }
}

/**
 * The replay of a bug's reproduction (issue #203): the one the agent reported before the last final
 * checks, what it observed and whether the bug is gone. Accept waits for it.
 */
function Reproduction({ build }: { build: BuildViewData }): ReactNode {
  const replay = lastAttempt(build.endAttempts)?.reproduction
  const { word, tone } = replayStanding(replay)
  return (
    <section aria-label="Reproduction" className="flex flex-col gap-1">
      <h3 className={REPLAY_HEAD}>
        <StatusDot status={tone} label={word} />
        Reproduction
      </h3>
      {replay !== null && replay !== undefined && <p className={NARRATIVE}>{replay.observed}</p>}
    </section>
  )
}

/** The final checks of the whole Spec (D10-07): their tries, as a task's are drawn. */
export function FinalChecks({ build, now }: { build: BuildViewData; now: string }): ReactNode {
  return (
    <section aria-label="Final checks" className="flex flex-col gap-6">
      <h2 className={FINALS_HEAD}>
        {build.endAttempts.length === 0 && (
          <StatusMark state="todo" label="They run once every task is done" />
        )}
        Final checks
      </h2>
      {build.specType === 'bug' && build.endAttempts.length > 0 && <Reproduction build={build} />}
      {build.endAttempts.length === 0 ? null : (
        <BuildTries
          attempts={build.endAttempts}
          now={now}
          of="the final checks"
          unchecked="No final check is configured: nothing judged the whole Spec."
        />
      )}
    </section>
  )
}
