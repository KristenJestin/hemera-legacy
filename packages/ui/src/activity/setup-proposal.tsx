import { cn } from 'cn'
import type { ReactNode } from 'react'

import { Badge } from '../components/badge/badge.tsx'
import { Button } from '../components/button/button.tsx'
import { IconCheck, IconListCheck, IconX } from '../icons.ts'

/**
 * A change to the Project's setup the agent proposes, and what the human decided (#218).
 *
 * The agent reads the setup freely and changes nothing of it: `setup_propose` leaves one of these
 * in the thread per change, and the change is applied only when a human presses Accept — through
 * the very use case the Project settings call. The card says exactly what would change: a title,
 * and each field it would write under it. A variable's value is never one of them: the card says
 * it would be set, and nothing more.
 *
 * The changes the agent proposed in one call are one batch, each its own card. The last card of
 * a batch that still has more than one change waiting offers Accept all, which accepts them in
 * the order they were proposed: setting a Project up is not a click per card.
 *
 * Once decided it says the outcome in words and offers nothing more.
 */

/** Where a proposal stands: waiting for the human, or answered. */
export type SetupProposalState = 'pending' | 'accepted' | 'declined'

/** One field the change would write, as the card lists it. */
export interface SetupProposalDetail {
  label: string
  value: string
}

export interface SetupProposalProps {
  /** The change in one line: "Declare the repository ./sources/api". */
  title: string
  /** Every field it would write, in the order the settings show them. */
  details: readonly SetupProposalDetail[]
  /** Why the agent proposes it, in its own words. */
  why: string
  state: SetupProposalState
  /** Applies the change, which is the human's to do. */
  onAccept?: (() => void) | undefined
  onDecline?: (() => void) | undefined
  /**
   * How many changes of this card's batch still wait, this one included: given to the last card
   * of a batch, it offers Accept all when more than one does.
   */
  waiting?: number | undefined
  /** Accepts every change of the batch still waiting, in the order proposed. */
  onAcceptAll?: (() => void) | undefined
  /** Where the block sits; never how it looks. */
  className?: string | undefined
}

const BLOCK = 'flex w-full min-w-0 flex-col gap-1 rounded-lg border border-border bg-card px-3 py-2'

const LEAD = 'text-xs text-muted-foreground'

/** The line that is read: what it is, the change itself, and the answer. */
const HEAD = 'flex min-w-0 flex-wrap items-center gap-2'

const MARK = 'flex shrink-0 text-muted-foreground'

const TITLE = 'min-w-0 text-sm text-foreground'

const ANSWER = 'ml-auto flex shrink-0 items-center gap-2'

/** The fields, one per line, the value read whole where it wraps. */
const DETAILS = 'flex flex-col gap-0.5'

const DETAIL = 'flex min-w-0 items-baseline gap-2'

const LABEL = 'w-24 shrink-0 text-xs text-muted-foreground'

const VALUE = 'min-w-0 font-mono text-xs break-all text-foreground'

const WHY = 'text-sm text-muted-foreground'

/** The batch's own answer, under the card that closes it. */
const BATCH = 'flex items-center justify-end gap-2 pt-1'

const BATCH_LEAD = 'text-xs text-muted-foreground'

export function SetupProposal({
  title,
  details,
  why,
  state,
  onAccept,
  onDecline,
  waiting,
  onAcceptAll,
  className,
}: SetupProposalProps): ReactNode {
  const batch = state === 'pending' && waiting !== undefined && waiting > 1
  return (
    <section aria-label={`Proposed change: ${title}`} className={cn(BLOCK, className)}>
      <p className={LEAD}>The agent proposes a change to the Project setup</p>
      <div className={HEAD}>
        <span className={MARK}>
          <IconListCheck size="sm" aria-hidden="true" />
        </span>
        <span className={TITLE}>{title}</span>
        <span className={ANSWER}>
          {state === 'pending' && (
            <>
              <Button variant="ghost" size="sm" onClick={onDecline}>
                <IconX size="sm" aria-hidden="true" />
                Decline
              </Button>
              <Button variant="primary" size="sm" onClick={onAccept}>
                <IconCheck size="sm" aria-hidden="true" />
                Accept
              </Button>
            </>
          )}
          {state === 'accepted' && <Badge tone="success">Applied</Badge>}
          {state === 'declined' && <Badge tone="neutral">Declined</Badge>}
        </span>
      </div>
      {details.length > 0 && (
        <dl className={DETAILS}>
          {details.map((detail) => (
            <div key={detail.label} className={DETAIL}>
              <dt className={LABEL}>{detail.label}</dt>
              <dd className={VALUE}>{detail.value}</dd>
            </div>
          ))}
        </dl>
      )}
      <p className={WHY}>{why}</p>
      {batch && (
        <div className={BATCH}>
          <span className={BATCH_LEAD}>{waiting} changes proposed together still wait</span>
          <Button variant="secondary" size="sm" onClick={onAcceptAll}>
            <IconCheck size="sm" aria-hidden="true" />
            Accept all {waiting}
          </Button>
        </div>
      )}
    </section>
  )
}
