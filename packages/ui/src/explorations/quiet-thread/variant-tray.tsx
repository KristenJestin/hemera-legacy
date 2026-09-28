import { AnimatePresence, motion } from 'motion/react'
import { type ReactNode, useState } from 'react'

import { Disclosure } from '../../activity/disclosure.tsx'
import { Button } from '../../components/button/button.tsx'
import { StatusDot } from '../../components/status-dot/status-dot.tsx'
import { IconBookmarkPlus, IconChevronDown } from '../../icons.ts'
import { arrival, useTransition } from '../../motion.ts'
import type { Asked, Proposed } from './fixtures.ts'
import { AnswerControls, AskedRow, FoldItem, ProposalRow, tallyOf } from './parts.tsx'

/**
 * A · Tray. Whatever waits for the reader waits in one tray docked on the composer, which grows
 * out of it and pushes the thread up. A permission is a row of its own at the top, answered right
 * there, since the turn waits on it. The proposals are one line — how many wait, Review, Add all —
 * and Review unfolds their rows in place, each answered by a mark and folding away once it is. In
 * the thread the six proposals are one closed entry, and the permission a closed record.
 */

const TRAY = 'flex flex-col gap-1 rounded-lg border border-border bg-card px-3 py-2'

const HEAD = 'flex min-w-0 items-center gap-2 text-sm'

const MARK = 'flex shrink-0 text-muted-foreground'

const ACTIONS = 'ml-auto flex shrink-0 items-center gap-1'

const LIST = 'flex flex-col border-t border-border pt-1'

export function TrayDock({
  proposals,
  asked,
  onAnswer,
  onAcceptAll,
  onDecide,
  defaultReviewing = false,
}: {
  proposals: readonly Proposed[] | null
  asked: Asked | null
  onAnswer: (id: string, answer: 'accepted' | 'declined') => void
  onAcceptAll: () => void
  onDecide: (answer: 'allowed' | 'refused') => void
  defaultReviewing?: boolean | undefined
}): ReactNode {
  const [reviewing, setReviewing] = useState(defaultReviewing)
  const turn = useTransition(arrival)
  const waiting = (proposals ?? []).filter(({ answer }) => answer === 'pending')
  const count = String(waiting.length)
  return (
    <section aria-label="Waiting for your answer" className={TRAY}>
      <AnimatePresence initial={false}>
        {asked !== null && asked.answer === 'pending' && (
          <FoldItem key="asked">
            <AskedRow asked={asked} onAnswer={onDecide} />
          </FoldItem>
        )}
        {waiting.length > 0 && (
          <FoldItem key="proposals">
            <div className={HEAD}>
              <span className={MARK}>
                <IconBookmarkPlus size="sm" aria-hidden="true" />
              </span>
              <StatusDot status="pending" size="sm" label="waiting" />
              <span className="min-w-0 truncate">{`${count} proposed commands`}</span>
              <span className={ACTIONS}>
                <Button
                  variant="ghost"
                  size="sm"
                  aria-expanded={reviewing}
                  onClick={() => setReviewing(!reviewing)}
                >
                  Review
                  <motion.span
                    aria-hidden="true"
                    className="flex"
                    animate={{ rotate: reviewing ? 180 : 0 }}
                    transition={turn}
                  >
                    <IconChevronDown size="sm" />
                  </motion.span>
                </Button>
                <Button variant="primary" size="sm" onClick={onAcceptAll}>
                  {`Add all ${count}`}
                </Button>
              </span>
            </div>
          </FoldItem>
        )}
        {reviewing && waiting.length > 0 && (
          <FoldItem key="list">
            <div className={LIST}>
              <AnimatePresence initial={false}>
                {waiting.map((proposed) => (
                  <FoldItem key={proposed.proposal.id}>
                    <ProposalRow
                      proposed={proposed}
                      controls={
                        <AnswerControls
                          name={proposed.proposal.name}
                          onAnswer={(answer) => onAnswer(proposed.proposal.id, answer)}
                        />
                      }
                    />
                  </FoldItem>
                ))}
              </AnimatePresence>
            </div>
          </FoldItem>
        )}
      </AnimatePresence>
    </section>
  )
}

const SUMMARY = 'flex min-w-0 items-center gap-2'

const QUIET = 'min-w-0 truncate text-muted-foreground'

/** The six proposals as one entry of the thread: closed, its rows inside, the answer on each. */
export function TrayThreadEntry({ proposals }: { proposals: readonly Proposed[] }): ReactNode {
  const waiting = proposals.some(({ answer }) => answer === 'pending')
  return (
    <Disclosure
      summary={
        <span className={SUMMARY}>
          <span className={MARK}>
            <IconBookmarkPlus size="sm" aria-hidden="true" />
          </span>
          <StatusDot
            status={waiting ? 'pending' : 'success'}
            size="sm"
            label={waiting ? 'waiting' : 'answered'}
          />
          <span className="shrink-0 text-muted-foreground">Proposed commands</span>
          <span className={QUIET}>{waiting ? String(proposals.length) : tallyOf(proposals)}</span>
        </span>
      }
    >
      <div className="flex flex-col">
        {proposals.map((proposed) => (
          <ProposalRow key={proposed.proposal.id} proposed={proposed} />
        ))}
      </div>
    </Disclosure>
  )
}
