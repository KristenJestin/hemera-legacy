import type { ReactNode } from 'react'

import { type MarkState, StatusMark } from '../components/status-mark/status-mark.tsx'
import type { BuildTaskState, BuildTaskView } from './model.ts'

/**
 * How far a build is, at a glance (#77): how many of its tasks are done, in progress, waiting for
 * the user and to do — each the mark of its state and a count — and a bar of one segment a task,
 * in its state's colour. The words are the screen reader's; the eye reads marks and numbers.
 */

/** Where a task stands, at the level the build's progress counts it. */
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

/** Where a task stands, as the mark that leads its line and changes in place with it (#77). */
export const TASK_MARKS: Record<BuildTaskState, MarkState> = {
  waiting: 'todo',
  ready: 'todo',
  in_progress: 'progress',
  checking: 'progress',
  done: 'done',
  yours: 'yours',
  blocked: 'blocked',
  skipped: 'skipped',
}

/** The buckets in the order they are counted and drawn, with their mark and their words. */
const BUCKETS = [
  { bucket: 'done', mark: 'done', word: 'done' },
  { bucket: 'progress', mark: 'progress', word: 'in progress' },
  { bucket: 'you', mark: 'yours', word: 'waiting for you' },
  { bucket: 'todo', mark: 'todo', word: 'to do' },
] as const

/** A segment of the bar, in its bucket's colour. */
const SEGMENT: Record<Bucket, string> = {
  done: 'h-1.5 min-w-0 flex-1 rounded-full bg-success',
  progress: 'h-1.5 min-w-0 flex-1 rounded-full bg-warning',
  you: 'h-1.5 min-w-0 flex-1 rounded-full bg-destructive',
  todo: 'h-1.5 min-w-0 flex-1 rounded-full bg-border',
}

const COUNTS = 'flex shrink-0 items-center gap-3'

const COUNT = 'flex items-center gap-1 font-mono text-sm tabular-nums'

const BAR = 'flex min-w-0 flex-1 items-center gap-0.5'

/** How many tasks stand where: a mark and a number each; waiting for you only when some do. */
export function BuildCounts({ tasks }: { tasks: readonly BuildTaskView[] }): ReactNode {
  return (
    <span className={COUNTS}>
      {BUCKETS.map(({ bucket, mark, word }) => {
        const count = tasks.filter((task) => BUCKET_OF[task.state] === bucket).length
        if (bucket === 'you' && count === 0) return null
        return (
          <span key={bucket} role="img" aria-label={`${String(count)} ${word}`} className={COUNT}>
            <StatusMark state={mark} />
            {count}
          </span>
        )
      })}
    </span>
  )
}

/**
 * One segment a task, done first and to do last, in its bucket's colour. Named for a screen reader
 * when it stands alone; a group's bar beside its count is decoration.
 */
export function BuildBar({
  tasks,
  label,
}: {
  tasks: readonly BuildTaskView[]
  label?: string | undefined
}): ReactNode {
  const order = BUCKETS.map((one) => one.bucket)
  const ordered = tasks.toSorted(
    (one, other) => order.indexOf(BUCKET_OF[one.state]) - order.indexOf(BUCKET_OF[other.state]),
  )
  return (
    <span
      role={label === undefined ? undefined : 'img'}
      aria-label={label}
      aria-hidden={label === undefined ? true : undefined}
      className={BAR}
    >
      {ordered.map((task) => (
        <span key={task.id} className={SEGMENT[BUCKET_OF[task.state]]} />
      ))}
    </span>
  )
}
