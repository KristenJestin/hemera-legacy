import { AnimatePresence, motion, useIsPresent } from 'motion/react'
import { type ReactNode, useState } from 'react'

import { IconButton } from '../components/button/button.tsx'
import { StatusDot, type StatusTone } from '../components/status-dot/status-dot.tsx'
import { StatusMark } from '../components/status-mark/status-mark.tsx'
import { Tooltip } from '../components/tooltip/tooltip.tsx'
import { IconCircleCheck, IconFlask, IconLayoutList, IconListTree, IconRobot } from '../icons.ts'
import { CROSSFADE, crossfade, useTransition } from '../motion.ts'
import type { SpecView } from '../spec/model.ts'
import { BuildBar, BUCKET_OF, TASK_MARKS } from './build-progress.tsx'
import { BuildSpecPanel } from './build-spec-panel.tsx'
import {
  Approach,
  BuildHead,
  type BuildViewProps,
  FinalChecks,
  TaskAttention,
  TaskTitle,
  closed,
  firstShown,
} from './build-view.tsx'
import {
  type BuildAttemptView,
  type BuildTaskView,
  type BuildViewData,
  TASK_STATE_ORDER,
  lastAttempt,
  outsideOf,
  storyRowsOf,
  taskStateLabel,
} from './model.ts'
import { ReviewCard } from './review-card.tsx'
import { TaskStage } from './task-stage.tsx'
import { tryLabel } from './times.ts'

/**
 * The build laid over the chat (#77): the width is for showing more, not the same thing spread
 * out. Under the build's head — the Spec, its actions, and how far the build is in counts and a
 * bar — two columns:
 *
 * - on the left, the tasks in the grouping the reader picks — by story, as one list, or by state —
 *   one line each and nothing unfolded, each group headed by its count and a compact bar;
 * - on the right, the task picked, whole: what needs the user on it, what the Spec asks of it, its
 *   tries and the checks each ran, the files they changed, and what came back on it. Or the final
 *   checks, or the frozen Spec the build works from, read beside the tasks it produced.
 *
 * With nothing picked, the right shows what needs the reader first, then what moves.
 */

/** How the tasks of the list are grouped. */
export type Grouping = 'story' | 'list' | 'state'

const VIEW = 'flex h-full min-h-0 min-w-0 flex-col bg-surface-content'

/** The review card under the head, the decision the build waits for. */
const REVIEW = 'mx-6 mt-3'

const COLUMNS = 'flex min-h-0 flex-1'

/** The list, the detail beside it the same width. */
const LIST =
  'flex min-w-0 flex-1 flex-col gap-4 overflow-y-auto border-r border-border px-3 py-3 outline-none focus-ring'

const GROUPINGS =
  'flex shrink-0 items-center gap-0.5 self-end rounded-md border border-border p-0.5'

const GROUP = 'flex flex-col'

const GROUP_HEAD = 'flex min-w-0 items-center gap-2 px-2 py-1.5 text-xs text-muted-foreground'

const GROUP_TITLE = 'min-w-0 truncate font-medium text-foreground'

const GROUP_BAR = 'ml-auto flex w-16 shrink-0'

const ROW =
  'flex w-full min-w-0 items-center gap-2.5 rounded-md px-2 py-1.5 text-left text-sm outline-none hover:bg-accent focus-ring aria-pressed:bg-accent'

const LABEL = 'w-8 shrink-0 font-mono text-xs text-muted-foreground'

const STORY_KEYS = 'shrink-0 font-mono text-xs text-muted-foreground'

const TRIES = 'flex shrink-0 items-center justify-end gap-1'

/** The detail's place, which never moves: what it shows cross-fades in it. */
const PANE = 'relative flex min-w-0 flex-1 flex-col'

const LAYER = 'absolute inset-0 flex flex-col'

const DETAIL =
  'flex min-h-0 flex-1 flex-col gap-6 overflow-y-auto px-6 py-5 outline-none focus-ring'

const PART = 'flex min-w-0 flex-col gap-2'

const PART_HEAD = 'text-xs font-medium tracking-wide text-muted-foreground'

const RETURN = 'flex min-w-0 items-start gap-2 text-sm'

const RETURN_ICON = 'flex shrink-0 pt-0.5 text-muted-foreground'

export interface BuildWideProps extends BuildViewProps {
  /** The frozen revision the build works from, read in the detail's place. */
  spec: SpecView
  grouping: Grouping
  onGrouping: (grouping: Grouping) => void
}

/** A group of the list: a story, the tasks no story holds, the whole build, or a state. */
interface TaskGroup {
  id: string
  /** The story's key, for a story. */
  key: string
  /** Nothing for the one group of the whole build, which has no head. */
  title: string
  tasks: readonly BuildTaskView[]
}

/** The states, as the list groups them: what needs the user first, what is over last. */
const STATE_GROUPS = [
  { bucket: 'you', title: 'Waiting for you' },
  { bucket: 'progress', title: 'In progress' },
  { bucket: 'todo', title: 'To do' },
  { bucket: 'done', title: 'Done' },
] as const

function groupsOf(build: BuildViewData, spec: SpecView, grouping: Grouping): TaskGroup[] {
  if (grouping === 'list') return [{ id: 'all', key: '', title: '', tasks: build.tasks }]
  if (grouping === 'state') {
    return STATE_GROUPS.map(({ bucket, title }) => ({
      id: bucket,
      key: '',
      title,
      tasks: build.tasks
        .filter((task) => BUCKET_OF[task.state] === bucket)
        .toSorted(
          (one, other) =>
            TASK_STATE_ORDER.indexOf(one.state) - TASK_STATE_ORDER.indexOf(other.state),
        ),
    })).filter((group) => group.tasks.length > 0)
  }
  const rows = storyRowsOf(build, spec.stories)
  const outside = outsideOf(build, rows)
  const stories: TaskGroup[] = rows.map((row) => ({
    id: row.id,
    key: row.key,
    title: row.title,
    tasks: row.tasks,
  }))
  if (outside.length === 0) return stories
  const title = rows.length === 0 ? 'Tasks' : 'Outside any story'
  return [...stories, { id: 'outside', key: '', title, tasks: outside }]
}

/** A try's result, as its dot: running while it has none. */
function tryTone(attempt: BuildAttemptView): StatusTone {
  if (attempt.result === null) return 'running'
  if (attempt.result === 'green') return 'success'
  return attempt.result === 'red' ? 'failure' : 'cancelled'
}

export function BuildWide({
  spec,
  grouping,
  onGrouping,
  build,
  now,
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
}: BuildWideProps): ReactNode {
  const finals = build.phase === 'verify' || build.endAttempts.length > 0
  const [chosen, setChosen] = useState<string | null>(() => firstShown(build))
  // The final checks, picked as a line of their own; shown at first when nothing else is.
  const [onFinals, setOnFinals] = useState(() => finals && firstShown(build) === null)
  // A task picked elsewhere — a notice's Open — takes the detail back from the final checks.
  const [seen, setSeen] = useState(selected)
  if (seen !== selected) {
    setSeen(selected)
    setOnFinals(false)
  }
  const shown = selected ?? chosen
  const picked = onFinals ? undefined : build.tasks.find((task) => task.id === shown)
  const fade = useTransition(crossfade)

  function pick(id: string): void {
    setOnFinals(false)
    setChosen(id)
    onSelect?.(id)
  }

  const showing = specOpen ? 'spec' : onFinals ? 'finals' : (picked?.id ?? 'none')

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
      {!closed(build) && build.canAccept && (
        <ReviewCard className={REVIEW} onOpenChat={onOpenChat} />
      )}
      <Approach build={build} />
      <div className={COLUMNS}>
        <div role="region" aria-label={`Tasks of ${build.specKey}`} tabIndex={0} className={LIST}>
          <Groupings grouping={grouping} onGrouping={onGrouping} />
          {groupsOf(build, spec, grouping).map((group) => (
            <div
              key={group.id}
              role="group"
              aria-label={group.title === '' ? 'Tasks' : group.title}
              className={GROUP}
            >
              {group.title !== '' && <GroupHead group={group} counted={grouping !== 'state'} />}
              {group.tasks.map((task) => (
                <TaskLine
                  key={task.id}
                  task={task}
                  stories={grouping === 'story' ? [] : storyKeysOf(task, build)}
                  picked={!specOpen && picked?.id === task.id}
                  onPick={() => pick(task.id)}
                />
              ))}
            </div>
          ))}
          {finals && (
            <FinalsLine
              build={build}
              picked={!specOpen && onFinals}
              onPick={() => setOnFinals(true)}
            />
          )}
        </div>
        <div className={PANE}>
          <AnimatePresence initial={false}>
            <motion.div
              key={showing}
              className={LAYER}
              initial={CROSSFADE.from}
              animate={CROSSFADE.to}
              exit={CROSSFADE.from}
              transition={fade}
            >
              <Leaving>
                {specOpen ? (
                  <BuildSpecPanel spec={spec} onClose={onToggleSpec} />
                ) : onFinals ? (
                  <div className={DETAIL}>
                    <FinalChecks build={build} now={now} />
                  </div>
                ) : (
                  picked !== undefined && (
                    <div
                      role="region"
                      aria-label={`${picked.label} in detail`}
                      tabIndex={0}
                      className={DETAIL}
                    >
                      <TaskStage
                        task={picked}
                        now={now}
                        attention={
                          <TaskAttention
                            task={picked}
                            build={build}
                            now={now}
                            ownBlocker
                            onTaskDone={onTaskDone}
                            onTaskSkip={onTaskSkip}
                            onDismissBlocker={onDismissBlocker}
                          />
                        }
                      />
                      <Returns task={picked} build={build} />
                    </div>
                  )
                )}
              </Leaving>
            </motion.div>
          </AnimatePresence>
        </div>
      </div>
    </div>
  )
}

/** What leaves the detail's place, out of reach from the moment it starts leaving. */
function Leaving({ children }: { children: ReactNode }): ReactNode {
  const present = useIsPresent()
  return (
    <div
      className="flex min-h-0 flex-1 flex-col"
      inert={!present}
      aria-hidden={present ? undefined : true}
    >
      {children}
    </div>
  )
}

/** The keys of the stories a task realises, for the lists that do not group it under them. */
function storyKeysOf(task: BuildTaskView, build: BuildViewData): string[] {
  return build.stories.filter((story) => task.storyIds.includes(story.id)).map((one) => one.key)
}

/** The three groupings of the list, an icon each, the words for the tooltip. */
function Groupings({
  grouping,
  onGrouping,
}: {
  grouping: Grouping
  onGrouping: (grouping: Grouping) => void
}): ReactNode {
  const choices = [
    { value: 'story', label: 'By story', icon: <IconListTree size="sm" /> },
    { value: 'list', label: 'One list', icon: <IconLayoutList size="sm" /> },
    { value: 'state', label: 'By state', icon: <IconCircleCheck size="sm" /> },
  ] as const
  return (
    <div role="group" aria-label="Group the tasks" className={GROUPINGS}>
      {choices.map((choice) => (
        <Tooltip key={choice.value} label={choice.label}>
          <IconButton
            variant={grouping === choice.value ? 'secondary' : 'ghost'}
            size="sm"
            icon={choice.icon}
            aria-label={choice.label}
            aria-pressed={grouping === choice.value}
            onClick={() => onGrouping(choice.value)}
          />
        </Tooltip>
      ))}
    </div>
  )
}

/** A group's head: its story's key, its title, how many of its tasks are done, and its bar. */
function GroupHead({ group, counted }: { group: TaskGroup; counted: boolean }): ReactNode {
  const done = group.tasks.filter((task) => BUCKET_OF[task.state] === 'done').length
  return (
    <div className={GROUP_HEAD}>
      {group.key !== '' && <span className="font-mono">{group.key}</span>}
      <span className={GROUP_TITLE}>{group.title}</span>
      <span className="font-mono tabular-nums">
        {counted ? `${String(done)}/${String(group.tasks.length)}` : String(group.tasks.length)}
      </span>
      {counted && (
        <span className={GROUP_BAR}>
          <BuildBar tasks={group.tasks} />
        </span>
      )}
    </div>
  )
}

/** A task, one line: its mark, its label and title, its stories, and a dot a try. */
function TaskLine({
  task,
  stories,
  picked,
  onPick,
}: {
  task: BuildTaskView
  stories: readonly string[]
  picked: boolean
  onPick: () => void
}): ReactNode {
  return (
    <button
      type="button"
      className={ROW}
      aria-pressed={picked}
      data-task={task.label}
      onClick={onPick}
    >
      <StatusMark state={TASK_MARKS[task.state]} />
      <span className={LABEL}>{task.label}</span>
      <span className="sr-only">{', '}</span>
      <TaskTitle done={task.state === 'done'}>{task.title}</TaskTitle>
      <span className="sr-only">{`, ${taskStateLabel(task)}`}</span>
      {stories.length > 0 && <span className={STORY_KEYS}>{stories.join(' ')}</span>}
      {task.attempts.length > 0 && (
        <span className={TRIES}>
          {task.attempts.map((attempt) => (
            <StatusDot
              key={attempt.id}
              status={tryTone(attempt)}
              size="sm"
              label={tryLabel(attempt.number)}
            />
          ))}
        </span>
      )}
    </button>
  )
}

/** The final checks of the whole Spec, as one more line of the list once the build reaches them. */
function FinalsLine({
  build,
  picked,
  onPick,
}: {
  build: BuildViewData
  picked: boolean
  onPick: () => void
}): ReactNode {
  const last = lastAttempt(build.endAttempts)
  const state = last === undefined ? 'todo' : last.result === 'green' ? 'done' : 'progress'
  return (
    <button type="button" className={ROW} aria-pressed={picked} onClick={onPick}>
      <StatusMark state={state} />
      <span className={LABEL}>
        <IconFlask size="sm" aria-hidden="true" />
      </span>
      <span className="min-w-0 flex-1 truncate">Final checks</span>
      {build.endAttempts.length > 0 && (
        <span className={TRIES}>
          {build.endAttempts.map((attempt) => (
            <StatusDot
              key={attempt.id}
              status={tryTone(attempt)}
              size="sm"
              label={tryLabel(attempt.number)}
            />
          ))}
        </span>
      )}
    </button>
  )
}

/**
 * What came back on a task that nothing else of the detail still says: each blocker the agent
 * raised on it and the user dismissed, in the agent's words. A blocker still standing is the
 * block on top of the detail, where it is answered.
 */
function Returns({ task, build }: { task: BuildTaskView; build: BuildViewData }): ReactNode {
  const dismissed = build.blockers.filter(
    (blocker) => blocker.taskId === task.id && blocker.dismissedAt !== null,
  )
  if (dismissed.length === 0) return null
  return (
    <section aria-label={`Returns on ${task.label}`} className={PART}>
      <h3 className={PART_HEAD}>Returns</h3>
      {dismissed.map((blocker) => (
        <div key={blocker.id} className={RETURN}>
          <span className={RETURN_ICON}>
            <IconRobot size="sm" role="img" aria-label="The agent" />
          </span>
          <StatusDot status="cancelled" size="sm" label="Dismissed" />
          <span className="min-w-0">{blocker.reason}</span>
        </div>
      ))}
    </section>
  )
}
