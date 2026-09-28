import { AnimatePresence, motion } from 'motion/react'
import type { ReactNode } from 'react'

import { COMMAND_TYPE_ICONS } from '../../activity/command-type.ts'
import { Disclosure } from '../../activity/disclosure.tsx'
import { PermissionRequest } from '../../approval/permission-request.tsx'
import { Button } from '../../components/button/button.tsx'
import { StatusDot } from '../../components/status-dot/status-dot.tsx'
import { IconBookmarkPlus } from '../../icons.ts'
import { CROSSFADE, crossfade, useTransition } from '../../motion.ts'
import type { Asked, Proposed } from './fixtures.ts'
import { FoldItem, ProposalRow, tallyOf } from './parts.tsx'

/**
 * C · Deck. Whatever waits is a deck of cards on the composer, one on top and the edges of the
 * rest under it: the permission first, as its full card, since the turn waits on it; then each
 * proposal, read whole — its line and why — and answered, the next taking its place where it
 * stood. Add all is a link on the card. The thread holds nothing of the proposals while they wait;
 * once the last is answered, one closed entry arrives with the tally.
 */

const DECK = 'flex flex-col'

const CARD = 'flex flex-col gap-1 rounded-lg border border-border bg-card px-3 py-2'

const HEAD = 'flex min-w-0 items-center gap-2 text-sm'

const MARK = 'flex shrink-0 text-muted-foreground'

const COUNT = 'ml-auto shrink-0 text-xs text-muted-foreground'

const LINE = 'truncate font-mono text-xs text-foreground'

const WHY = 'truncate text-sm text-muted-foreground'

const ACTIONS = 'flex items-center gap-1 pt-1'

/** The edges of the cards still under the top one: one a card, two at most. */
const EDGE_NEAR = 'mx-2 h-1.5 rounded-b-md border border-t-0 border-border bg-card'

const EDGE_FAR = 'mx-4 h-1.5 rounded-b-md border border-t-0 border-border bg-card'

export function DeckDock({
  proposals,
  asked,
  onAnswer,
  onAcceptAll,
  onDecide,
}: {
  proposals: readonly Proposed[] | null
  asked: Asked | null
  onAnswer: (id: string, answer: 'accepted' | 'declined') => void
  onAcceptAll: () => void
  onDecide: (answer: 'allowed' | 'refused') => void
}): ReactNode {
  const fade = useTransition(crossfade)
  const all = proposals ?? []
  const waiting = all.filter(({ answer }) => answer === 'pending')
  const asking = asked !== null && asked.answer === 'pending' ? asked : null
  const under = waiting.length - (asking === null ? 1 : 0)
  const top = waiting[0]
  return (
    <section aria-label="Waiting for your answer" className={DECK}>
      <AnimatePresence initial={false} mode="wait">
        {asking !== null ? (
          <motion.div
            key={asking.id}
            initial={CROSSFADE.from}
            animate={CROSSFADE.to}
            exit={CROSSFADE.from}
            transition={fade}
          >
            <PermissionRequest
              toolName="commands_run"
              label={asking.label}
              subject={asking.subject}
              intent={asking.intent}
              parameters={[{ label: 'In', value: asking.folder }]}
              options={asking.options}
              onDecide={(option) => onDecide(option.kind === 'allow_once' ? 'allowed' : 'refused')}
            />
          </motion.div>
        ) : (
          top !== undefined && (
            <motion.div
              key={top.proposal.id}
              className={CARD}
              initial={CROSSFADE.from}
              animate={CROSSFADE.to}
              exit={CROSSFADE.from}
              transition={fade}
            >
              <ProposalCard
                top={top}
                place={all.length - waiting.length + 1}
                of={all.length}
                left={waiting.length}
                onAnswer={onAnswer}
                onAcceptAll={onAcceptAll}
              />
            </motion.div>
          )
        )}
      </AnimatePresence>
      <AnimatePresence initial={false}>
        {under > 0 && (
          <FoldItem key="near">
            <div className={EDGE_NEAR} />
          </FoldItem>
        )}
        {under > 1 && (
          <FoldItem key="far">
            <div className={EDGE_FAR} />
          </FoldItem>
        )}
      </AnimatePresence>
    </section>
  )
}

function ProposalCard({
  top,
  place,
  of,
  left,
  onAnswer,
  onAcceptAll,
}: {
  top: Proposed
  place: number
  of: number
  left: number
  onAnswer: (id: string, answer: 'accepted' | 'declined') => void
  onAcceptAll: () => void
}): ReactNode {
  const { proposal } = top
  const TypeIcon = COMMAND_TYPE_ICONS[proposal.type]
  return (
    <>
      <div className={HEAD}>
        <span className={MARK}>
          <IconBookmarkPlus size="sm" aria-hidden="true" />
        </span>
        <StatusDot status="pending" size="sm" label="waiting" />
        <span className={MARK}>
          <TypeIcon size="sm" aria-hidden="true" />
        </span>
        <span className="min-w-0 truncate font-medium">{proposal.name}</span>
        <span className={COUNT}>{`${String(place)} / ${String(of)}`}</span>
      </div>
      <p className={LINE}>{`${proposal.folder} $ ${proposal.line}`}</p>
      <p className={WHY}>{proposal.why}</p>
      <div className={ACTIONS}>
        <Button
          variant="secondary"
          size="sm"
          aria-label={`Add ${proposal.name}`}
          onClick={() => onAnswer(proposal.id, 'accepted')}
        >
          Add
        </Button>
        <Button
          variant="ghost"
          size="sm"
          aria-label={`Decline ${proposal.name}`}
          onClick={() => onAnswer(proposal.id, 'declined')}
        >
          Decline
        </Button>
        {left > 1 && (
          <Button variant="link" size="sm" className="ml-auto" onClick={onAcceptAll}>
            {`Add all ${String(left)}`}
          </Button>
        )}
      </div>
    </>
  )
}

const SUMMARY = 'flex min-w-0 items-center gap-2'

/** What the proposals came to, arriving in the thread once the last one is answered. */
export function DeckThreadEntry({ proposals }: { proposals: readonly Proposed[] }): ReactNode {
  return (
    <Disclosure
      summary={
        <span className={SUMMARY}>
          <span className={MARK}>
            <IconBookmarkPlus size="sm" aria-hidden="true" />
          </span>
          <StatusDot status="success" size="sm" label="answered" />
          <span className="shrink-0 text-muted-foreground">Proposed commands</span>
          <span className="min-w-0 truncate text-muted-foreground">{tallyOf(proposals)}</span>
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
