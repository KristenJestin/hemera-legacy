import { AnimatePresence } from 'motion/react'
import type { ReactNode } from 'react'

import { Button, IconButton } from '../../components/button/button.tsx'
import { StatusDot } from '../../components/status-dot/status-dot.tsx'
import { Tooltip } from '../../components/tooltip/tooltip.tsx'
import { IconChecklist, IconFileDiff, IconRestore, IconX } from '../../icons.ts'
import { Arrive } from './arrive.tsx'
import { CommentBox, KIND_ICONS, KIND_NAMES } from './comment-box.tsx'
import {
  type FeedbackAnchor,
  type FeedbackKind,
  type ReviewRound,
  type RoundFeedback,
  anchorLabel,
  waitsForFix,
} from './model.ts'

/**
 * The side of the review: the round's feedback, as it accumulates.
 *
 * Every feedback in the order it was left — on lines, on a story or a criterion, about the product,
 * general, a question — its kind its icon and, when it points somewhere, where, in a line: pressing
 * it goes there, in the diff or in the Spec. Nothing starts while it grows: "Fix these" is what
 * sends it, and it is only there while something waits for a fix. A question never does, since the
 * agent answers it. At the foot, the box for a feedback that points at nothing.
 */

const LIST = 'flex min-h-0 flex-1 flex-col gap-1 overflow-y-auto px-2 py-2'

const ROW = 'group flex items-start gap-1 rounded-md hover:bg-accent'

const GO =
  'flex min-w-0 flex-1 items-start gap-2 rounded-md px-2 py-1.5 text-left outline-none focus-ring data-[lit=true]:bg-primary-muted'

const STILL = 'flex min-w-0 flex-1 items-start gap-2 px-2 py-1.5'

const BODY = 'text-sm text-foreground'

const BODY_WITHDRAWN = 'text-sm text-muted-foreground line-through'

const WHERE = 'flex items-center gap-1 truncate font-mono text-xs text-muted-foreground'

const FOOT = 'flex flex-col gap-2 border-t border-border p-2'

export interface FeedbackListProps {
  round: ReviewRound
  feedback: readonly RoundFeedback[]
  lit: string | null
  /** Whether the round takes feedback: open, not yet sent to be fixed. */
  writable: boolean
  /** Whether "Fix these" was pressed and the fix pass is under way. */
  fixing: boolean
  onGo: (id: string) => void
  onToggle: (id: string) => void
  onAdd: (kind: FeedbackKind, body: string, anchor: FeedbackAnchor | null) => void
  onFix: () => void
}

function where(anchor: FeedbackAnchor | null, round: ReviewRound): ReactNode {
  const label = anchorLabel(anchor, round)
  if (label === null || anchor === null) return null
  return (
    <span className={WHERE}>
      {anchor.kind === 'code' ? (
        <IconFileDiff size="sm" aria-hidden="true" />
      ) : (
        <IconChecklist size="sm" aria-hidden="true" />
      )}
      <span className="truncate">{label}</span>
    </span>
  )
}

export function FeedbackList({
  round,
  feedback,
  lit,
  writable,
  fixing,
  onGo,
  onToggle,
  onAdd,
  onFix,
}: FeedbackListProps): ReactNode {
  const waiting = feedback.filter((one) => one.withdrawnAt === null && one.kind !== 'question')
  return (
    <aside aria-label="Feedback of the round" className="flex min-h-0 flex-1 flex-col">
      <header className="flex h-10 shrink-0 items-center gap-2 border-b border-border px-3">
        <h3 className="text-sm font-medium">Feedback</h3>
        <span className="text-xs text-muted-foreground tabular-nums">{feedback.length}</span>
        {fixing && (
          <span className="ml-auto flex">
            <StatusDot status="running" label="Being fixed" />
          </span>
        )}
      </header>
      <ol className={LIST}>
        <AnimatePresence initial={false}>
          {feedback.map((one) => {
            const withdrawn = one.withdrawnAt !== null
            const content = (
              <>
                <span className="mt-0.5 flex text-muted-foreground">
                  {KIND_ICONS[one.kind]('sm')}
                </span>
                <span className="flex min-w-0 flex-1 flex-col gap-0.5">
                  <span className={withdrawn ? BODY_WITHDRAWN : BODY}>{one.body}</span>
                  {where(one.anchor, round)}
                </span>
              </>
            )
            return (
              <li key={one.id} aria-label={KIND_NAMES[one.kind]}>
                <Arrive>
                  <div className={ROW}>
                    {one.anchor === null ? (
                      <div className={STILL}>{content}</div>
                    ) : (
                      <button
                        type="button"
                        className={GO}
                        data-lit={lit === one.id}
                        data-go={one.id}
                        onClick={() => onGo(one.id)}
                      >
                        {content}
                      </button>
                    )}
                    {writable && (
                      <Tooltip label={withdrawn ? 'Take it back' : 'Withdraw'}>
                        <IconButton
                          variant="ghost"
                          size="sm"
                          icon={withdrawn ? <IconRestore size="sm" /> : <IconX size="sm" />}
                          aria-label={withdrawn ? 'Take it back' : 'Withdraw'}
                          onClick={() => onToggle(one.id)}
                        />
                      </Tooltip>
                    )}
                  </div>
                </Arrive>
              </li>
            )
          })}
        </AnimatePresence>
      </ol>
      {writable && (
        <div className={FOOT}>
          <CommentBox
            label="A feedback on the round"
            placeholder="Anything about the result…"
            onSubmit={(kind, body) => onAdd(kind, body, null)}
          />
          <AnimatePresence initial={false}>
            {waitsForFix(feedback) && (
              <Arrive key="fix">
                <Button variant="primary" className="w-full" onClick={onFix}>
                  Fix these
                  <span className="tabular-nums">{waiting.length}</span>
                </Button>
              </Arrive>
            )}
          </AnimatePresence>
        </div>
      )}
    </aside>
  )
}
