import { type ReactNode, useState } from 'react'

import { StatusDot, type StatusTone } from '../components/status-dot/status-dot.tsx'
import { IconTool } from '../icons.ts'
import { Disclosure } from './disclosure.tsx'

/**
 * The tool calls of a turn between two things the agent said, folded into one row (recette of 26
 * September 2026, issue #149).
 *
 * A turn reads a dozen files and runs a few commands before it answers, and a thread that drew a
 * row for each of them was a column of plumbing with the answer at the end of it. So a run of
 * calls is one line — how many actions, `12 actions`, and no more: the kinds were noise (issue
 * #159) — folded by default, which unfolds to the rows it holds, each the row it always was and folding
 * on its own. Whatever the tools are: the agent's and Hemera's alike.
 *
 * The line is drawn as a call's is, in the colour of a caption: a mark, the count, and a dot
 * saying where the run stands — running while one of its calls runs, failed when
 * one failed, done otherwise — so a failure folded away is still seen.
 *
 * Folded, the line also names the run's latest action, muted and cut short on one line — `12
 * actions · Read src/menu.html` — and follows it while the turn runs (issue #180): a count alone
 * said nothing of what the agent was doing. Unfolded, the rows say it and the line is the count
 * again.
 *
 * What the group holds is counted by its caller: the design system does not read an agent's calls.
 */

/** Where a run of calls stands: one running, one failed, or all done. */
export type ActionGroupStatus = 'in_progress' | 'failed' | 'completed'

const STATUS: Record<ActionGroupStatus, { word: string; tone: StatusTone }> = {
  in_progress: { word: 'Running', tone: 'running' },
  failed: { word: 'One failed', tone: 'failure' },
  completed: { word: 'Done', tone: 'success' },
}

/** The line that is read: the mark, the count, and where the run stands. */
const SUMMARY = 'flex min-w-0 items-center gap-2'

/** The count, which is never the part cut short. */
const COUNT = 'shrink-0 text-muted-foreground'

/** The latest action, folded: muted, and the part of the line cut short when it runs out. */
const LATEST = 'min-w-0 truncate text-muted-foreground'

/** The rows it holds, unfolded: the thread's own rows, closer together than blocks of a thread. */
const ROWS = 'flex flex-col gap-1'

export interface ActionGroupProps {
  /** How many calls the run holds: the line says `12 actions`. */
  count: number
  /** Where the run stands, as a dot at the end of the line. */
  status: ActionGroupStatus
  /** What the latest call of the run is doing, in its own words: the folded line names it. */
  latest?: string | undefined
  /** The rows of the calls, and the thoughts and diffs between them, in the order they came. */
  children: ReactNode
  /** Whether it starts unfolded; folded unless a caller asks. */
  defaultOpen?: boolean | undefined
  /** Where the group sits; never how it looks. */
  className?: string | undefined
}

export function ActionGroup({
  count,
  status,
  latest,
  children,
  defaultOpen = false,
  className,
}: ActionGroupProps): ReactNode {
  const { word, tone } = STATUS[status]
  // Followed rather than held: the disclosure keeps the fold, the line only needs to know it.
  const [open, setOpen] = useState(defaultOpen)
  return (
    <Disclosure
      className={className}
      defaultOpen={defaultOpen}
      onOpenChange={setOpen}
      summary={
        <span className={SUMMARY}>
          <span className="flex shrink-0 text-muted-foreground">
            <IconTool size="sm" aria-hidden="true" />
          </span>
          <span className={COUNT}>{`${String(count)} actions`}</span>
          {!open && latest !== undefined && <span className={LATEST}>{`· ${latest}`}</span>}
          <StatusDot status={tone} size="sm" label={word} />
        </span>
      }
    >
      <div className={ROWS}>{children}</div>
    </Disclosure>
  )
}
