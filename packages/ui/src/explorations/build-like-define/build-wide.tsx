import { AnimatePresence, motion } from 'motion/react'
import { type ReactNode, useMemo, useRef } from 'react'

import { IconButton } from '../../components/button/button.tsx'
import { StatusDot } from '../../components/status-dot/status-dot.tsx'
import { Tooltip } from '../../components/tooltip/tooltip.tsx'
import { IconFileDescription, IconLock, IconX } from '../../icons.ts'
import { CROSSFADE, crossfade, instant, swap, useTransition } from '../../motion.ts'
import { GOING_ON_TONES, GOING_ON_WORDS } from '../../session/going-on-details.tsx'
import type { GoingOnRun } from '../../session/going-on.ts'
import { goingOnStateOf } from '../../session/going-on.ts'
import type { SpecView } from '../../spec/model.ts'
import { SpecColumn } from '../../spec/spec-column.tsx'
import { phasesOf } from '../../spec/spec-phases.ts'
import {
  BUCKET_OF,
  SEGMENT,
  TaskDetail,
  TaskList,
  TasksHead,
  type TasksProps,
  taskOf,
} from './build-tasks.tsx'
import { HELPER_TONES, HELPER_WORDS, type Helper } from './fixtures.ts'
import { HelperIcon } from './helper-icons.tsx'
import { TASK_STORIES } from './tasks-fixtures.ts'

/**
 * The build laid over the chat (maintainer's feedback of 30 September on issue #77): the width
 * shows more, not the same spread out. Under the same head — the Spec, its actions, how far the
 * build is — three columns:
 *
 * - on the left, what the build is made of and who is at it: each story and how far it is, then
 *   the helpers and the runs at work, each with its last line; a helper opens its thread;
 * - in the middle, the tasks, grouped as the reader picks, one line each;
 * - on the right, the task picked, whole — its tries and their checks, its files, what came back
 *   on it — or the frozen Spec the build works from, read beside the tasks it produced.
 *
 * With nothing picked, the right shows the first task that needs the reader or is moving.
 */

const VIEW = 'flex h-full min-h-0 min-w-0 flex-col bg-surface-content'

const COLUMNS = 'flex min-h-0 flex-1'

const SIDE =
  'flex w-sidebar shrink-0 flex-col gap-6 overflow-y-auto border-r border-border px-4 py-4'

const LIST = 'flex min-w-0 flex-1 flex-col gap-4 overflow-y-auto border-r border-border px-3 py-3'

const PANE = 'relative flex min-w-0 flex-1 flex-col'

const LAYER = 'absolute inset-0 flex flex-col overflow-y-auto'

const PART_HEAD = 'text-xs font-medium text-muted-foreground'

const STORY = 'flex flex-col gap-1 text-sm'

const STORY_LINE = 'flex min-w-0 items-center gap-2'

const STORY_BAR = 'flex items-center gap-0.5'

const WORKER =
  'flex w-full min-w-0 flex-col gap-0.5 rounded-md px-2 py-1.5 text-left text-sm outline-none hover:bg-accent focus-ring'

const WORKER_LINE = 'flex min-w-0 items-center gap-1.5'

const LAST = 'line-clamp-2 text-xs text-muted-foreground'

const LAST_MONO = 'line-clamp-2 font-mono text-xs text-muted-foreground'

const SPEC_HEAD = 'flex shrink-0 items-center gap-2 border-b border-border px-6 py-2 text-sm'

export interface BuildWideProps extends TasksProps {
  helpers: readonly Helper[]
  runs: readonly GoingOnRun[]
  onHelper: (id: string) => void
  /** The frozen revision the build works from, read in the right pane. */
  frozen: SpecView
}

export function BuildWide(props: BuildWideProps): ReactNode {
  const { tasks, open, specShown = false, helpers, runs, onHelper, frozen, onSpec } = props
  const fade = useTransition(crossfade)
  // Nothing picked, the right shows what needs the reader first, or what moves.
  const first =
    tasks.find((task) => BUCKET_OF[task.state] === 'you') ??
    tasks.find((task) => BUCKET_OF[task.state] === 'progress')
  const picked = taskOf(tasks, open) ?? first
  const shown = open ?? (first === undefined ? null : `:${first.id}`)
  return (
    <section aria-label={`The build of ${props.specKey}`} className={VIEW}>
      <TasksHead {...props} />
      <div className={COLUMNS}>
        <aside aria-label="The build at work" className={SIDE}>
          <div className="flex flex-col gap-2">
            <span className={PART_HEAD}>Stories</span>
            {TASK_STORIES.map((story) => {
              const own = tasks.filter((task) => task.storyIds.includes(story.id))
              const done = own.filter((task) => BUCKET_OF[task.state] === 'done').length
              return (
                <div key={story.id} className={STORY}>
                  <span className={STORY_LINE}>
                    <span className="font-mono text-xs text-muted-foreground">{story.key}</span>
                    <span className="min-w-0 flex-1 truncate">{story.title}</span>
                    <span className="font-mono text-xs text-muted-foreground tabular-nums">
                      {done}/{own.length}
                    </span>
                  </span>
                  <span aria-hidden="true" className={STORY_BAR}>
                    {own.map((task) => (
                      <span key={task.id} className={SEGMENT[BUCKET_OF[task.state]]} />
                    ))}
                  </span>
                </div>
              )
            })}
          </div>
          <div className="flex flex-col gap-1">
            <span className={PART_HEAD}>At work</span>
            {helpers.map((helper) => (
              <button
                key={helper.id}
                type="button"
                className={WORKER}
                aria-label={`Open ${helper.name}, ${HELPER_WORDS[helper.state]}`}
                onClick={() => onHelper(helper.id)}
              >
                <span className={WORKER_LINE}>
                  <span className="flex shrink-0 text-muted-foreground">
                    <HelperIcon name={helper.icon} size="sm" />
                  </span>
                  <StatusDot status={HELPER_TONES[helper.state]} size="sm" />
                  <span className="truncate font-medium">{helper.name}</span>
                </span>
                <span className={LAST}>{helper.last}</span>
              </button>
            ))}
            {runs.map((run) => (
              <div key={run.id} className="flex min-w-0 flex-col gap-0.5 px-2 py-1.5 text-sm">
                <span className={WORKER_LINE}>
                  <StatusDot
                    status={GOING_ON_TONES[goingOnStateOf(run)]}
                    size="sm"
                    label={GOING_ON_WORDS[goingOnStateOf(run)]}
                  />
                  <span className="truncate font-mono text-xs">{run.name}</span>
                </span>
                <span className={LAST_MONO}>{lastLineOf(run)}</span>
              </div>
            ))}
          </div>
        </aside>
        <div className={LIST}>
          <TaskList {...props} open={shown} opening="select" />
        </div>
        <div className={PANE}>
          <AnimatePresence initial={false}>
            <motion.div
              key={specShown ? 'spec' : (picked?.id ?? 'none')}
              className={LAYER}
              initial={CROSSFADE.from}
              animate={CROSSFADE.to}
              exit={CROSSFADE.from}
              transition={fade}
            >
              {specShown ? (
                <FrozenSpec spec={frozen} onClose={onSpec} />
              ) : (
                picked !== undefined && (
                  <div className="@container">
                    <TaskDetail task={picked} stacked />
                  </div>
                )
              )}
            </motion.div>
          </AnimatePresence>
        </div>
      </div>
    </section>
  )
}

/** The frozen Spec, read beside the tasks it produced: its column, read only. */
function FrozenSpec({ spec, onClose }: { spec: SpecView; onClose: () => void }): ReactNode {
  const groups = useMemo(() => phasesOf(spec), [spec])
  const column = useRef<HTMLDivElement>(null)
  const still = useTransition(swap.move) === instant
  return (
    <section aria-label={`The frozen Spec ${spec.key}`} className="flex min-h-0 flex-1 flex-col">
      <header className={SPEC_HEAD}>
        <IconFileDescription size="sm" aria-hidden="true" />
        <span className="font-mono text-xs text-muted-foreground">{spec.key}</span>
        <span className="font-medium">revision {spec.revision}</span>
        <IconLock size="sm" aria-label="Frozen" className="text-muted-foreground" />
        <span className="ml-auto flex">
          <Tooltip label="Back to the task">
            <IconButton
              variant="ghost"
              size="sm"
              icon={<IconX size="sm" />}
              aria-label="Back to the task"
              onClick={onClose}
            />
          </Tooltip>
        </span>
      </header>
      <div className="relative flex min-h-0 flex-1 flex-col">
        <SpecColumn spec={spec} groups={groups} column={column} still={still} />
      </div>
    </section>
  )
}

/** The last line a run printed. */
function lastLineOf(run: GoingOnRun): string {
  const lines = run.output.split('\n').filter((line) => line.trim() !== '')
  return lines.at(-1) ?? run.command
}
