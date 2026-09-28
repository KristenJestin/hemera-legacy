import { AnimatePresence } from 'motion/react'
import { type ReactNode, useState } from 'react'

import { COMMAND_TYPE_ICONS } from '../../activity/command-type.ts'
import { Disclosure } from '../../activity/disclosure.tsx'
import { PermissionRequest } from '../../approval/permission-request.tsx'
import { Button } from '../../components/button/button.tsx'
import { Popover } from '../../components/popover/popover.tsx'
import { StatusDot, type StatusTone } from '../../components/status-dot/status-dot.tsx'
import { IconBookmarkPlus, IconShield } from '../../icons.ts'
import type { Asked, ProposalAnswer, Proposed } from './fixtures.ts'
import { AnswerControls, FoldItem, ProposalRow } from './parts.tsx'

/**
 * B · Pill. Whatever waits is a pill that rises over the composer, the way the thread's own
 * "latest" pill does: a shield while a permission waits, a bookmark while proposals do, a dot and
 * a count, and nothing else on the page moves for it. Pressed, it opens the review above it — the
 * permission as its full card first, then a row a proposal, answered by marks — with Add all at
 * its foot. In the thread each proposal stays the call it was, one closed line with its dot.
 */

const PLACE = 'flex justify-center'

const PILL =
  'inline-flex h-control-sm items-center gap-1.5 rounded-full border border-border bg-card px-3 text-xs font-medium shadow-sm outline-none hover:bg-accent focus-ring data-popup-open:bg-accent'

const MARK = 'flex shrink-0 text-muted-foreground'

const WARN = 'flex shrink-0 text-warning-muted-foreground'

const FOOT = 'flex items-center justify-end gap-1 border-t border-border pt-2'

export function PillDock({
  proposals,
  asked,
  onAnswer,
  onAcceptAll,
  onDeclineAll,
  onDecide,
  defaultOpen = false,
}: {
  proposals: readonly Proposed[] | null
  asked: Asked | null
  onAnswer: (id: string, answer: 'accepted' | 'declined') => void
  onAcceptAll: () => void
  onDeclineAll: () => void
  onDecide: (answer: 'allowed' | 'refused') => void
  defaultOpen?: boolean | undefined
}): ReactNode {
  const [open, setOpen] = useState(defaultOpen)
  const waiting = (proposals ?? []).filter(({ answer }) => answer === 'pending')
  const asking = asked !== null && asked.answer === 'pending' ? asked : null
  const count = waiting.length + (asking === null ? 0 : 1)
  return (
    <div className={PLACE}>
      <Popover
        side="top"
        align="center"
        title="Waiting for your answer"
        open={open}
        onOpenChange={setOpen}
        trigger={
          <button
            type="button"
            className={PILL}
            aria-label={`${String(count)} waiting for your answer, review`}
          >
            {asking !== null && (
              <span className={WARN}>
                <IconShield size="sm" aria-hidden="true" />
              </span>
            )}
            {waiting.length > 0 && (
              <span className={MARK}>
                <IconBookmarkPlus size="sm" aria-hidden="true" />
              </span>
            )}
            <StatusDot status="pending" size="sm" />
            {String(count)}
          </button>
        }
      >
        <div className="flex w-menu-wide flex-col gap-2">
          {asking !== null && (
            <PermissionRequest
              toolName="commands_run"
              label={asking.label}
              subject={asking.subject}
              intent={asking.intent}
              options={asking.options}
              onDecide={(option) => onDecide(option.kind === 'allow_once' ? 'allowed' : 'refused')}
            />
          )}
          {waiting.length > 0 && (
            <>
              <div className="flex flex-col">
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
              <div className={FOOT}>
                <Button variant="ghost" size="sm" onClick={onDeclineAll}>
                  Decline all
                </Button>
                <Button variant="primary" size="sm" onClick={onAcceptAll}>
                  {`Add all ${String(waiting.length)}`}
                </Button>
              </div>
            </>
          )}
        </div>
      </Popover>
    </div>
  )
}

const TONES: Record<ProposalAnswer, StatusTone> = {
  pending: 'pending',
  accepted: 'success',
  declined: 'cancelled',
}

const WORDS: Record<ProposalAnswer, string> = {
  pending: 'waiting',
  accepted: 'added',
  declined: 'declined',
}

const SUMMARY = 'flex min-w-0 items-center gap-2'

const LINE = 'font-mono text-xs break-all text-foreground'

const WHY = 'text-sm text-muted-foreground'

/** One proposal as the call it was: closed, its dot saying the answer, its line and why inside. */
export function PillThreadEntry({ proposed }: { proposed: Proposed }): ReactNode {
  const { proposal, answer } = proposed
  const TypeIcon = COMMAND_TYPE_ICONS[proposal.type]
  return (
    <Disclosure
      summary={
        <span className={SUMMARY}>
          <span className={MARK}>
            <IconBookmarkPlus size="sm" aria-hidden="true" />
          </span>
          <StatusDot status={TONES[answer]} size="sm" label={WORDS[answer]} />
          <span className={MARK}>
            <TypeIcon size="sm" aria-hidden="true" />
          </span>
          <span className="min-w-0 truncate">{proposal.name}</span>
        </span>
      }
    >
      <div className="flex flex-col gap-0.5">
        <p className={LINE}>{`${proposal.folder} $ ${proposal.line}`}</p>
        <p className={WHY}>{proposal.why}</p>
      </div>
    </Disclosure>
  )
}
