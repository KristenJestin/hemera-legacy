import type { ReactNode } from 'react'

import { IconButton } from '../../components/button/button.tsx'
import { Tooltip } from '../../components/tooltip/tooltip.tsx'
import { IconRestore, IconX } from '../../icons.ts'
import { KIND_ICONS, KIND_NAMES } from './comment-box.tsx'
import type { RoundFeedback } from './model.ts'

/**
 * One feedback as it is read where it points: under the lines of the diff, under a story or a
 * criterion. Its kind is its icon, its body the words; the hand withdraws it, or takes it back.
 * `lit` is the moment the list sent the reader here: the note wears the ring of the focus for as
 * long as it is the one gone to.
 */

const NOTE =
  'flex items-start gap-2 rounded-lg border border-border bg-card px-2.5 py-2 text-sm shadow-sm data-[lit=true]:ring-2 data-[lit=true]:ring-ring'

const BODY = 'min-w-0 flex-1 text-foreground'

const WITHDRAWN = 'min-w-0 flex-1 text-muted-foreground line-through'

export interface FeedbackNoteProps {
  feedback: RoundFeedback
  lit?: boolean | undefined
  /** Withdraws it, or takes it back once withdrawn; absent while the round takes no change. */
  onToggle?: ((id: string) => void) | undefined
}

export function FeedbackNote({ feedback, lit = false, onToggle }: FeedbackNoteProps): ReactNode {
  const withdrawn = feedback.withdrawnAt !== null
  return (
    <div
      className={NOTE}
      data-lit={lit}
      data-feedback={feedback.id}
      role="note"
      aria-label={KIND_NAMES[feedback.kind]}
    >
      <span className="mt-0.5 flex text-muted-foreground">{KIND_ICONS[feedback.kind]('sm')}</span>
      <p className={withdrawn ? WITHDRAWN : BODY}>{feedback.body}</p>
      {onToggle !== undefined && (
        <Tooltip label={withdrawn ? 'Take it back' : 'Withdraw'}>
          <IconButton
            variant="ghost"
            size="sm"
            icon={withdrawn ? <IconRestore size="sm" /> : <IconX size="sm" />}
            aria-label={withdrawn ? 'Take it back' : 'Withdraw'}
            onClick={() => onToggle(feedback.id)}
          />
        </Tooltip>
      )}
    </div>
  )
}
