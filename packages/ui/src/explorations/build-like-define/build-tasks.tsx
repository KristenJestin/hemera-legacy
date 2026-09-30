import { AnimatePresence, motion } from 'motion/react'
import type { ReactNode } from 'react'

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
  IconLayoutList,
  IconListTree,
  IconMessages,
  IconPlayerPause,
  IconPlayerStop,
  IconRobot,
  IconUser,
} from '../../icons.ts'
import { check as checkKind, collapse, expand, fold, useTransition } from '../../motion.ts'
import { Face } from '../../components/face/face.tsx'
import { type MarkState, StatusMark } from './status-mark.tsx'
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
export type Bucket = 'done' | 'progress' | 'you' | 'todo'

export const BUCKET_OF: Record<BuildTaskState, Bucket> = {
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
export const SEGMENT: Record<Bucket, string> = {
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
  'flex w-full min-w-0 items-center gap-3 rounded-md px-2 py-1.5 text-left text-sm outline-none hover:bg-accent focus-ring aria-expanded:bg-accent aria-pressed:bg-accent'

const STATE = 'flex size-icon-md shrink-0 items-center justify-center'

const LABEL = 'w-8 shrink-0 font-mono text-xs text-muted-foreground'

const TASK_TITLE = 'min-w-0 flex-1 truncate'

const TASK_TITLE_DONE = 'min-w-0 flex-1 truncate text-muted-foreground'

/** The stroke across a done task's title, drawn from its start. */
const STRIKE = 'absolute inset-0 flex origin-left items-center'

const STORIES = 'shrink-0 font-mono text-xs text-muted-foreground'

const TRIES = 'flex w-12 shrink-0 items-center justify-end gap-1'

const CHEVRON =
  'flex shrink-0 text-muted-foreground transition-transform in-aria-expanded:rotate-180'

const DETAIL = 'grid grid-cols-1 gap-4 px-2 pt-2 pb-4 pl-12 @3xl:grid-cols-3 @3xl:gap-6'

/** The detail in a pane of its own: its parts one under the other. */
const STACKED = 'flex flex-col gap-6 px-6 py-5'

const PART = 'flex min-w-0 flex-col gap-2'

const PART_HEAD = 'flex items-center gap-1.5 text-xs font-medium text-muted-foreground'

const LINE = 'flex min-w-0 items-center gap-2 text-sm'

const MONO = 'min-w-0 truncate font-mono text-xs'

const CHECK_LINE = 'flex min-w-0 items-center gap-2 pl-4 text-sm'

const QUIET = 'shrink-0 font-mono text-xs text-muted-foreground'

const RETURN = 'flex min-w-0 items-start gap-2 text-sm'

const RETURN_ICON = 'flex shrink-0 pt-0.5 text-muted-foreground'

/** How a list's tasks open: unfolded in place beside the chat, or picked for a pane beside. */
export type TaskOpening = 'unfold' | 'select'

export interface TasksProps {
  specKey: string
  title: string
  tasks: readonly BoardTask[]
  grouping: Grouping
  onGrouping: (grouping: Grouping) => void
  /** The task open, as `group:task`, since a task of two stories is listed twice. */
  open: string | null
  onOpen: (open: string | null) => void
  /** Whether the frozen Spec is shown, which its button says. */
  specShown?: boolean | undefined
  onSpec: () => void
}

/** The build's tasks as they stand beside the chat: the head, and the list unfolding in place. */
export function BuildTasks(props: TasksProps): ReactNode {
  return (
    <section aria-label={`Tasks of ${props.specKey}`} className={VIEW}>
      <TasksHead {...props} />
      <div className={BODY}>
        <TaskList {...props} opening="unfold" />
      </div>
    </section>
  )
}

/** The head: the Spec, its actions, and how far the build is at a glance. */
export function TasksHead({
  specKey,
  title,
  tasks,
  grouping,
  onGrouping,
  specShown = false,
  onSpec,
}: TasksProps): ReactNode {
  const ordered = orderOf(tasks)
  return (
    <header className={HEAD}>
      <div className={HEAD_LINE}>
        <span className={KEY}>{specKey}</span>
        <h3 className={TITLE}>{title}</h3>
        <StatusDot status="running" label="Building" />
        <span className={ACTIONS}>
          <Tooltip label="The frozen Spec">
            <IconButton
              variant={specShown ? 'secondary' : 'ghost'}
              size="sm"
              icon={<IconFileDescription size="sm" />}
              aria-label="The frozen Spec"
              aria-pressed={specShown}
              onClick={onSpec}
            />
          </Tooltip>
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
            onPick={onGrouping}
          />
          <Grouper
            value="list"
            label="One list"
            icon={<IconLayoutList size="sm" />}
            current={grouping}
            onPick={onGrouping}
          />
          <Grouper
            value="state"
            label="By state"
            icon={<IconCircleCheck size="sm" />}
            current={grouping}
            onPick={onGrouping}
          />
        </div>
      </div>
    </header>
  )
}

/** The tasks, grouped as asked; each one unfolds in place, or is picked for the pane beside. */
export function TaskList({
  tasks,
  grouping,
  open,
  onOpen,
  opening,
}: TasksProps & { opening: TaskOpening }): ReactNode {
  return (
    <>
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
          {group.tasks.map((task) => {
            const key = `${group.id}:${task.id}`
            return (
              <TaskRow
                key={task.id}
                task={task}
                showStories={grouping !== 'story'}
                opening={opening}
                open={opening === 'select' ? taskOf(tasks, open)?.id === task.id : open === key}
                onToggle={() => onOpen(open === key && opening === 'unfold' ? null : key)}
              />
            )
          })}
        </div>
      ))}
    </>
  )
}

/** The task a `group:task` key names. */
export function taskOf(tasks: readonly BoardTask[], open: string | null): BoardTask | undefined {
  const id = open?.split(':')[1]
  return tasks.find((task) => task.id === id)
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
            <StatusMark state={BUCKET_MARKS[bucket]} label={word} />
            {count}
          </span>
        )
      })}
    </div>
  )
}

const BUCKET_MARKS: Record<Bucket, MarkState> = {
  done: 'done',
  progress: 'progress',
  you: 'yours',
  todo: 'todo',
}

/** A task's state as the mark that changes in place with it. */
const TASK_MARKS: Record<BuildTaskState, MarkState> = {
  done: 'done',
  skipped: 'skipped',
  in_progress: 'progress',
  checking: 'progress',
  yours: 'yours',
  blocked: 'blocked',
  ready: 'todo',
  waiting: 'todo',
}

/** How far a task being checked is: its checks over, out of the checks its last try runs. */
function progressOf(task: BoardTask): number | undefined {
  if (task.state !== 'checking') return undefined
  const checks = task.attempts.at(-1)?.checks ?? []
  if (checks.length === 0) return undefined
  return Math.max(
    0.15,
    checks.filter((one) => one.verdict !== 'skipped').length / (checks.length + 1),
  )
}

/** A task's title, struck through as it is done: the stroke draws itself across it. */
function Title({ done, children }: { done: boolean; children: ReactNode }): ReactNode {
  const drawing = useTransition(checkKind.draw)
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
  opening,
  open,
  onToggle,
}: {
  task: BoardTask
  showStories: boolean
  opening: TaskOpening
  open: boolean
  onToggle: () => void
}): ReactNode {
  const unfolds = opening === 'unfold'
  const transition = useTransition(fold)
  const stories = TASK_STORIES.filter((story) => task.storyIds.includes(story.id))
  return (
    <div className="flex flex-col">
      <button
        type="button"
        className={ROW}
        aria-expanded={unfolds ? open : undefined}
        aria-pressed={unfolds ? undefined : open}
        data-task={task.label}
        onClick={onToggle}
      >
        <span className={STATE}>
          <StatusMark
            state={TASK_MARKS[task.state]}
            progress={progressOf(task)}
            label={TASK_STATE_LABELS[task.state]}
          />
        </span>
        <span className={LABEL}>{task.label}</span>
        <Title done={task.state === 'done'}>{task.title}</Title>
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
        {unfolds && (
          <span className={CHEVRON}>
            <IconChevronDown size="sm" aria-hidden="true" />
          </span>
        )}
      </button>
      <AnimatePresence initial={false}>
        {unfolds && open && (
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
export function TaskDetail({
  task,
  stacked = false,
}: {
  task: BoardTask
  /** Its parts one under the other, in a pane of its own. */
  stacked?: boolean | undefined
}): ReactNode {
  const files =
    [...task.attempts].reverse().find((attempt) => attempt.files.length > 0)?.files ?? []
  return (
    <div
      className={stacked ? STACKED : DETAIL}
      role="region"
      aria-label={`${task.label} in detail`}
    >
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
  // A helper's return: an agent, so its face, at rest now it has returned.
  return <Face state="done" size="icon" label={icon} />
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
