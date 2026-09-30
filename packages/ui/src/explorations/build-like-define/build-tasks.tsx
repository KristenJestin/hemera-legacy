import { AnimatePresence, motion } from 'motion/react'
import { type ReactNode, useState } from 'react'

import { IconButton } from '../../components/button/button.tsx'
import { StatusDot, type StatusTone } from '../../components/status-dot/status-dot.tsx'
import { Tooltip } from '../../components/tooltip/tooltip.tsx'
import type { BuildAttemptView, BuildCheckView, BuildTaskState } from '../../build/model.ts'
import { TASK_STATE_LABELS, TASK_STATE_ORDER } from '../../build/model.ts'
import { tryLabel } from '../../build/times.ts'
import {
  IconChevronDown,
  IconCircleCheck,
  IconCircleDashed,
  IconFileDescription,
  IconFileDiff,
  IconFlask,
  IconHandStop,
  IconLayoutList,
  IconListTree,
  IconMessages,
  IconPlayerPause,
  IconPlayerSkipForward,
  IconPlayerStop,
  IconRobot,
  IconUser,
} from '../../icons.ts'
import { collapse, expand, fold, useTransition } from '../../motion.ts'
import { HelperIcon } from './helper-icons.tsx'
import { type BoardTask, type TaskReturn, TASK_STORIES } from './tasks-fixtures.ts'

/**
 * The build view's tasks, redone (maintainer's feedback on the exploration, 30 September).
 *
 * At rest it is almost empty: the Spec's key and title, and one line that says how far the build
 * is — how many tasks are done, in progress, waiting for the user and to do, each an icon and a
 * count, and a bar of one segment a task in its state's colour. Under it the tasks, one line each
 * and nothing unfolded, grouped as the user chooses: by story, as one list, or by state.
 *
 * A task unfolds on demand to what the build kept of it: its tries and the checks each ran, the
 * files it changed, and what came back on it — a helper's return, the user's feedback, the main
 * agent's word. States are dots and icons; their words are for the tooltip and the screen reader.
 *
 * It is a container of its own: wide, as when the panel lays itself over the chat, an unfolded
 * task sets its three parts side by side instead of one under the other, and every line uses the
 * whole width.
 */

export type Grouping = 'story' | 'list' | 'state'

/** Where a task stands, at the level the progress line counts it. */
type Bucket = 'done' | 'progress' | 'you' | 'todo'

const BUCKET_OF: Record<BuildTaskState, Bucket> = {
  done: 'done',
  skipped: 'done',
  in_progress: 'progress',
  checking: 'progress',
  yours: 'you',
  blocked: 'you',
  ready: 'todo',
  waiting: 'todo',
}

const BUCKETS: readonly { bucket: Bucket; word: string }[] = [
  { bucket: 'done', word: 'done' },
  { bucket: 'progress', word: 'in progress' },
  { bucket: 'you', word: 'waiting for you' },
  { bucket: 'todo', word: 'to do' },
]

/** A segment of the bar, in its bucket's colour. */
const SEGMENT: Record<Bucket, string> = {
  done: 'h-1.5 min-w-0 flex-1 rounded-full bg-success',
  progress: 'h-1.5 min-w-0 flex-1 rounded-full bg-warning',
  you: 'h-1.5 min-w-0 flex-1 rounded-full bg-destructive',
  todo: 'h-1.5 min-w-0 flex-1 rounded-full bg-border',
}

const VIEW = '@container flex h-full min-h-0 min-w-0 flex-col bg-surface-content'

const HEAD = 'flex shrink-0 flex-col gap-3 border-b border-border px-6 pt-4 pb-4'

const HEAD_LINE = 'flex min-w-0 items-center gap-3'

const KEY = 'shrink-0 font-mono text-xs text-muted-foreground'

const TITLE = 'min-w-0 truncate text-lg font-medium'

const ACTIONS = 'ml-auto flex shrink-0 items-center gap-1'

const PROGRESS = 'flex min-w-0 items-center gap-4'

const COUNTS = 'flex shrink-0 items-center gap-3 text-sm'

const COUNT = 'flex items-center gap-1 font-mono tabular-nums'

const BAR = 'flex min-w-0 flex-1 items-center gap-0.5'

const GROUPINGS = 'flex shrink-0 items-center gap-0.5 rounded-md border border-border p-0.5'

const BODY = 'flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto px-4 py-3'

const GROUP = 'flex flex-col'

const GROUP_HEAD = 'flex min-w-0 items-center gap-2 px-2 py-1.5 text-xs text-muted-foreground'

const GROUP_TITLE = 'min-w-0 truncate font-medium text-foreground'

const GROUP_BAR = 'ml-auto flex w-24 shrink-0 items-center gap-0.5'

const ROW =
  'flex w-full min-w-0 items-center gap-3 rounded-md px-2 py-1.5 text-left text-sm outline-none hover:bg-accent focus-ring aria-expanded:bg-accent'

const STATE = 'flex size-icon-md shrink-0 items-center justify-center'

const LABEL = 'w-8 shrink-0 font-mono text-xs text-muted-foreground'

const TASK_TITLE = 'min-w-0 flex-1 truncate'

const STORIES = 'shrink-0 font-mono text-xs text-muted-foreground'

const TRIES = 'flex w-12 shrink-0 items-center justify-end gap-1'

const CHEVRON =
  'flex shrink-0 text-muted-foreground transition-transform in-aria-expanded:rotate-180'

const DETAIL = 'grid grid-cols-1 gap-4 px-2 pt-2 pb-4 pl-12 @3xl:grid-cols-3 @3xl:gap-6'

const PART = 'flex min-w-0 flex-col gap-2'

const PART_HEAD = 'flex items-center gap-1.5 text-xs font-medium text-muted-foreground'

const LINE = 'flex min-w-0 items-center gap-2 text-sm'

const MONO = 'min-w-0 truncate font-mono text-xs'

const CHECK_LINE = 'flex min-w-0 items-center gap-2 pl-4 text-sm'

const QUIET = 'shrink-0 font-mono text-xs text-muted-foreground'

const RETURN = 'flex min-w-0 items-start gap-2 text-sm'

const RETURN_ICON = 'flex shrink-0 pt-0.5 text-muted-foreground'

export interface BuildTasksProps {
  specKey: string
  title: string
  tasks: readonly BoardTask[]
  defaultGrouping?: Grouping | undefined
  /** The task unfolded as the view is drawn. */
  defaultOpen?: string | null | undefined
  onSpec: () => void
}

export function BuildTasks({
  specKey,
  title,
  tasks,
  defaultGrouping = 'story',
  defaultOpen = null,
  onSpec,
}: BuildTasksProps): ReactNode {
  const [grouping, setGrouping] = useState<Grouping>(defaultGrouping)
  const [open, setOpen] = useState<string | null>(defaultOpen)
  const ordered = orderOf(tasks)
  return (
    <section aria-label={`Tasks of ${specKey}`} className={VIEW}>
      <header className={HEAD}>
        <div className={HEAD_LINE}>
          <span className={KEY}>{specKey}</span>
          <h3 className={TITLE}>{title}</h3>
          <StatusDot status="running" label="Building" />
          <span className={ACTIONS}>
            <Action label="The frozen Spec" icon={<IconFileDescription size="sm" />} on={onSpec} />
            <Action label="Pause the build" icon={<IconPlayerPause size="sm" />} on={() => {}} />
            <Action label="Stop the build" icon={<IconPlayerStop size="sm" />} on={() => {}} />
          </span>
        </div>
        <div className={PROGRESS}>
          <Counts tasks={tasks} />
          <div role="img" aria-label="Where each task stands" className={BAR}>
            {ordered.map((task) => (
              <span key={task.id} className={SEGMENT[BUCKET_OF[task.state]]} />
            ))}
          </div>
          <div role="group" aria-label="Group the tasks" className={GROUPINGS}>
            <Grouper
              value="story"
              label="By story"
              icon={<IconListTree size="sm" />}
              current={grouping}
              onPick={setGrouping}
            />
            <Grouper
              value="list"
              label="One list"
              icon={<IconLayoutList size="sm" />}
              current={grouping}
              onPick={setGrouping}
            />
            <Grouper
              value="state"
              label="By state"
              icon={<IconCircleCheck size="sm" />}
              current={grouping}
              onPick={setGrouping}
            />
          </div>
        </div>
      </header>
      <div className={BODY}>
        {groupsOf(tasks, grouping).map((group) => (
          <div key={group.id} role="group" aria-label={group.title} className={GROUP}>
            {group.title !== '' && (
              <div className={GROUP_HEAD}>
                {group.key !== '' && <span className="font-mono">{group.key}</span>}
                <span className={GROUP_TITLE}>{group.title}</span>
                <span className="font-mono tabular-nums">
                  {String(group.tasks.filter((one) => BUCKET_OF[one.state] === 'done').length)}/
                  {String(group.tasks.length)}
                </span>
                <span aria-hidden="true" className={GROUP_BAR}>
                  {group.tasks.map((task) => (
                    <span key={task.id} className={SEGMENT[BUCKET_OF[task.state]]} />
                  ))}
                </span>
              </div>
            )}
            {group.tasks.map((task) => (
              <TaskRow
                key={task.id}
                task={task}
                showStories={grouping !== 'story'}
                open={open === `${group.id}:${task.id}`}
                onToggle={() =>
                  setOpen(open === `${group.id}:${task.id}` ? null : `${group.id}:${task.id}`)
                }
              />
            ))}
          </div>
        ))}
      </div>
    </section>
  )
}

function Action({ label, icon, on }: { label: string; icon: ReactNode; on: () => void }) {
  return (
    <Tooltip label={label}>
      <IconButton variant="ghost" size="sm" icon={icon} aria-label={label} onClick={on} />
    </Tooltip>
  )
}

function Grouper({
  value,
  label,
  icon,
  current,
  onPick,
}: {
  value: Grouping
  label: string
  icon: ReactNode
  current: Grouping
  onPick: (value: Grouping) => void
}): ReactNode {
  return (
    <Tooltip label={label}>
      <IconButton
        variant={current === value ? 'secondary' : 'ghost'}
        size="sm"
        icon={icon}
        aria-label={label}
        aria-pressed={current === value}
        onClick={() => onPick(value)}
      />
    </Tooltip>
  )
}

/** How many tasks stand where: an icon and a number each, the words for the tooltip. */
function Counts({ tasks }: { tasks: readonly BoardTask[] }): ReactNode {
  return (
    <div className={COUNTS}>
      {BUCKETS.map(({ bucket, word }) => {
        const count = tasks.filter((task) => BUCKET_OF[task.state] === bucket).length
        if (bucket === 'you' && count === 0) return null
        const label = `${String(count)} ${word}`
        return (
          <span key={bucket} role="img" aria-label={label} className={COUNT}>
            <BucketIcon bucket={bucket} />
            {count}
          </span>
        )
      })}
    </div>
  )
}

function BucketIcon({ bucket }: { bucket: Bucket }): ReactNode {
  if (bucket === 'done') {
    return <IconCircleCheck size="sm" aria-hidden="true" className="text-success" />
  }
  if (bucket === 'progress') return <StatusDot status="running" />
  if (bucket === 'you') {
    return <IconHandStop size="sm" aria-hidden="true" className="text-destructive" />
  }
  return <IconCircleDashed size="sm" aria-hidden="true" className="text-muted-foreground" />
}

/** A task's state, drawn: a dot while it moves, an icon once it stands somewhere. */
function StateMark({ state }: { state: BuildTaskState }): ReactNode {
  const word = TASK_STATE_LABELS[state]
  const icons: Partial<Record<BuildTaskState, ReactNode>> = {
    done: <IconCircleCheck size="sm" aria-label={word} className="text-success" />,
    skipped: (
      <IconPlayerSkipForward size="sm" aria-label={word} className="text-muted-foreground" />
    ),
    checking: <IconFlask size="sm" aria-label={word} className="text-warning" />,
    yours: <IconUser size="sm" aria-label={word} className="text-destructive" />,
    blocked: <IconHandStop size="sm" aria-label={word} className="text-destructive" />,
    waiting: <IconCircleDashed size="sm" aria-label={word} className="text-muted-foreground" />,
  }
  const tones: Partial<Record<BuildTaskState, StatusTone>> = {
    in_progress: 'running',
    ready: 'pending',
  }
  const tone = tones[state]
  return (
    <span className={STATE}>
      {tone !== undefined ? <StatusDot status={tone} label={word} /> : icons[state]}
    </span>
  )
}

/** A try's result as its dot: running while it has none. */
function tryTone(attempt: BuildAttemptView): StatusTone {
  if (attempt.result === null) return 'running'
  if (attempt.result === 'green') return 'success'
  return attempt.result === 'red' ? 'failure' : 'pending'
}

const CHECK_TONES: Record<BuildCheckView['verdict'], StatusTone> = {
  green: 'success',
  red: 'failure',
  skipped: 'cancelled',
}

function TaskRow({
  task,
  showStories,
  open,
  onToggle,
}: {
  task: BoardTask
  showStories: boolean
  open: boolean
  onToggle: () => void
}): ReactNode {
  const transition = useTransition(fold)
  const stories = TASK_STORIES.filter((story) => task.storyIds.includes(story.id))
  return (
    <div className="flex flex-col">
      <button
        type="button"
        className={ROW}
        aria-expanded={open}
        data-task={task.label}
        onClick={onToggle}
      >
        <StateMark state={task.state} />
        <span className={LABEL}>{task.label}</span>
        <span className={TASK_TITLE}>{task.title}</span>
        {showStories && (
          <span className={STORIES}>{stories.map((story) => story.key).join(' ')}</span>
        )}
        <span className={TRIES}>
          {task.returns.length > 0 && (
            <IconMessages size="sm" aria-hidden="true" className="text-muted-foreground" />
          )}
          {task.attempts.map((attempt) => (
            <StatusDot
              key={attempt.id}
              status={tryTone(attempt)}
              size="sm"
              label={tryLabel(attempt.number)}
            />
          ))}
        </span>
        <span className={CHEVRON}>
          <IconChevronDown size="sm" aria-hidden="true" />
        </span>
      </button>
      <AnimatePresence initial={false}>
        {open && (
          <motion.div
            key="detail"
            className="overflow-hidden"
            initial={collapse}
            animate={expand}
            exit={collapse}
            transition={transition}
          >
            <TaskDetail task={task} />
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}

/** A task unfolded: its tries and their checks, the files, and what came back on it. */
function TaskDetail({ task }: { task: BoardTask }): ReactNode {
  const files =
    [...task.attempts].reverse().find((attempt) => attempt.files.length > 0)?.files ?? []
  return (
    <div className={DETAIL} role="region" aria-label={`${task.label} in detail`}>
      <div className={PART}>
        <span className={PART_HEAD}>
          <IconFlask size="sm" aria-hidden="true" />
          Tries
        </span>
        {task.attempts.length === 0 && <IconCircleDashed size="sm" aria-label="No try yet" />}
        {[...task.attempts].reverse().map((attempt) => (
          <div key={attempt.id} className="flex flex-col gap-1">
            <span className={LINE}>
              <StatusDot status={tryTone(attempt)} size="sm" />
              <span className="font-medium">{tryLabel(attempt.number)}</span>
            </span>
            {attempt.checks.map((check) => (
              <span key={check.id} className={CHECK_LINE}>
                <StatusDot status={CHECK_TONES[check.verdict]} size="sm" label={check.verdict} />
                <span className={MONO}>{check.name}</span>
                {check.detail !== null && <span className={QUIET}>{check.detail}</span>}
              </span>
            ))}
          </div>
        ))}
      </div>
      <div className={PART}>
        <span className={PART_HEAD}>
          <IconFileDiff size="sm" aria-hidden="true" />
          Files
        </span>
        {files.length === 0 && <IconCircleDashed size="sm" aria-label="No file yet" />}
        {files.map((file) => (
          <span key={`${file.repository}/${file.path}`} className={LINE}>
            <span className={QUIET}>{file.status}</span>
            <span className={MONO}>{file.path}</span>
            {file.added !== null && (
              <span className="shrink-0 font-mono text-xs text-success-muted-foreground">
                +{file.added}
              </span>
            )}
            {file.removed !== null && file.removed > 0 && (
              <span className="shrink-0 font-mono text-xs text-destructive-muted-foreground">
                −{file.removed}
              </span>
            )}
          </span>
        ))}
      </div>
      <div className={PART}>
        <span className={PART_HEAD}>
          <IconMessages size="sm" aria-hidden="true" />
          Returns
        </span>
        {task.returns.length === 0 && <IconCircleDashed size="sm" aria-label="Nothing yet" />}
        {task.returns.map((back) => (
          <div key={back.id} className={RETURN}>
            <span className={RETURN_ICON}>
              <ReturnIcon icon={back.icon} />
            </span>
            <span className="flex min-w-0 flex-col gap-0.5">
              <span className="flex items-center gap-1.5 text-xs font-medium">
                {back.from}
                {back.verdict !== 'note' && (
                  <StatusDot
                    status={back.verdict === 'green' ? 'success' : 'failure'}
                    size="sm"
                    label={back.verdict}
                  />
                )}
              </span>
              <span>{back.text}</span>
            </span>
          </div>
        ))}
      </div>
    </div>
  )
}

function ReturnIcon({ icon }: { icon: TaskReturn['icon'] }): ReactNode {
  if (icon === 'you') return <IconUser size="sm" aria-hidden="true" />
  if (icon === 'agent') return <IconRobot size="sm" aria-hidden="true" />
  return <HelperIcon name={icon} size="sm" />
}

/** The tasks in the order the view lists what needs the user first, then what moves. */
function orderOf(tasks: readonly BoardTask[]): BoardTask[] {
  const rank = (task: BoardTask): number => {
    const order: Record<Bucket, number> = { done: 0, progress: 1, you: 2, todo: 3 }
    return order[BUCKET_OF[task.state]]
  }
  return [...tasks].sort((a, b) => rank(a) - rank(b))
}

interface TaskGroup {
  id: string
  key: string
  title: string
  tasks: BoardTask[]
}

const STATE_GROUPS: readonly { id: Bucket; title: string }[] = [
  { id: 'you', title: 'Waiting for you' },
  { id: 'progress', title: 'In progress' },
  { id: 'todo', title: 'To do' },
  { id: 'done', title: 'Done' },
]

function groupsOf(tasks: readonly BoardTask[], grouping: Grouping): TaskGroup[] {
  if (grouping === 'list') return [{ id: 'all', key: '', title: '', tasks: [...tasks] }]
  if (grouping === 'story') {
    return TASK_STORIES.map((story) => ({
      id: story.id,
      key: story.key,
      title: story.title,
      tasks: tasks.filter((task) => task.storyIds.includes(story.id)),
    }))
  }
  return STATE_GROUPS.map((group) => ({
    id: group.id,
    key: '',
    title: group.title,
    tasks: tasks
      .filter((task) => BUCKET_OF[task.state] === group.id)
      .sort((a, b) => TASK_STATE_ORDER.indexOf(a.state) - TASK_STATE_ORDER.indexOf(b.state)),
  })).filter((group) => group.tasks.length > 0)
}
