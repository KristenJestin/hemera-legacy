import { motion } from 'motion/react'
import { type ReactNode, useState } from 'react'

import { Frame, FrameHeader } from '../../components/frame/frame.tsx'
import { IconCheck, IconUser } from '../../icons.ts'
import { MessageHeader } from '../../message/message.tsx'
import { arrival, useTransition } from '../../motion.ts'
import type { SpecAnswer, SpecQuestionView } from '../../spec/model.ts'
import { SPEC_PHASE_ICONS } from '../../spec/spec-icons.ts'
import { phaseLabel, pickedOf } from './question-fixtures.ts'
import { Radio, plainText } from './question-parts.tsx'

/**
 * Three ways a picked answer shows in the thread (issue #182, point 2). The outlined pill with its
 * `↳ question` line (#165) is not liked; each of these reads as a choice the reader made with a
 * press, and not as a message they typed.
 *
 * - A · Folded card · the question card itself folds to one line where it was asked, on the
 *   agent's side: the chosen row checked, `You chose` before it, the question after it, quiet.
 *   The thread carries no second trace of the answer.
 * - B · Quiet row · one line on the reader's side, in the thread's rhythm and without a surface:
 *   a check, `You chose B · One CSV per month`. The question is under the hand, not on the page.
 * - C · Echo · a small frame on the reader's side echoing the card: its head `Your answer · Shape`,
 *   its body the chosen row with its radio, lettered as the card lettered it.
 *
 * The reader's own words are said by each in its own way: the folded row holds them, the quiet
 * row quotes them, the echo's body is them.
 */

export interface PickedAnswerProps {
  question: SpecQuestionView
  answer: SpecAnswer
  /** When it was answered, `HH:MM`. */
  at?: string | undefined
}

/** What a screen reader hears: who chose what, for which question. */
function nameOf(question: SpecQuestionView, answer: SpecAnswer): string {
  const picked = pickedOf(question, answer)
  const what = picked.own
    ? `in your own words: ${picked.label}`
    : `${picked.letter}, ${picked.label}`
  return `You answered «${plainText(question.body)}» ${what}`
}

/** An answer arrives as a line of the thread does: a few pixels of travel, and no fade. */
const AWAY = { y: 8, scale: 0.95 }
const IN_PLACE = { y: 0, scale: 1 }

// ---------------------------------------------------------------------------------------------
// A · Folded card

/** The card folded to its line: the rim and the body of a frame, one row inside. */
const FOLDED_ROW = 'flex min-w-0 items-center gap-2 px-3 py-2 text-sm'

/** A · Folded card: the card itself, folded to one line, the chosen row checked. */
export function AnswerFolded({ question, answer }: PickedAnswerProps): ReactNode {
  const transition = useTransition(arrival)
  const picked = pickedOf(question, answer)
  const Phase = SPEC_PHASE_ICONS[question.phase]
  const plain = plainText(question.body)
  return (
    <motion.div
      role="group"
      aria-label={nameOf(question, answer)}
      className="flex w-full max-w-2xl"
      initial={AWAY}
      animate={IN_PLACE}
      transition={transition}
    >
      <Frame className="w-full">
        <div className={FOLDED_ROW}>
          <Radio checked />
          <span className="shrink-0 text-muted-foreground">
            {picked.own ? 'You wrote' : 'You chose'}
          </span>
          {picked.own ? (
            <span className="min-w-0 truncate font-medium text-foreground" title={picked.label}>
              «{picked.label}»
            </span>
          ) : (
            <span className="shrink-0 font-medium text-foreground">
              {picked.letter} · {picked.label}
            </span>
          )}
          <span className="ml-auto flex min-w-0 items-center gap-1.5 text-muted-foreground">
            <span className="flex shrink-0">
              <Phase size="sm" aria-hidden="true" />
            </span>
            <span className="truncate" title={plain}>
              {plain}
            </span>
          </span>
        </div>
      </Frame>
    </motion.div>
  )
}

// ---------------------------------------------------------------------------------------------
// B · Quiet row

/** The quiet row: a line of the thread on the reader's side, the size of what Hemera notes. */
const QUIET_ROW = 'flex max-w-3xl min-w-0 items-center gap-1.5 px-3 text-sm text-muted-foreground'

/** The check before it, in a small round of the primary's muted fill: a press, fixed. */
const CHECK =
  'flex size-5 shrink-0 items-center justify-center rounded-full bg-primary-muted text-primary-muted-foreground'

/** The reader's own words, quoted under the row, as quiet as the row itself. */
const QUOTE =
  'mr-3 max-w-3xl min-w-0 border-r-2 border-primary pr-2 text-sm break-words text-foreground'

/** B · Quiet row: `You chose B · One CSV per month`, on the reader's side, with no surface. */
export function AnswerNote({ question, answer, at }: PickedAnswerProps): ReactNode {
  const transition = useTransition(arrival)
  const [underTheHand, setUnderTheHand] = useState(false)
  const picked = pickedOf(question, answer)
  return (
    <motion.div
      role="group"
      aria-label={nameOf(question, answer)}
      className="flex w-full flex-col items-end gap-1"
      onPointerEnter={() => setUnderTheHand(true)}
      onPointerLeave={() => setUnderTheHand(false)}
      initial={AWAY}
      animate={IN_PLACE}
      transition={transition}
    >
      <p className={QUIET_ROW} title={plainText(question.body)}>
        <span className={CHECK}>
          <IconCheck size="sm" aria-hidden="true" />
        </span>
        {picked.own ? (
          <span>You answered in your own words</span>
        ) : (
          <span className="min-w-0 truncate">
            You chose{' '}
            <span className="font-medium text-foreground">
              {picked.letter} · {picked.label}
            </span>
          </span>
        )}
      </p>
      {picked.own && <p className={QUOTE}>{picked.label}</p>}
      <MessageHeader author="user" name="You" at={at} shown={underTheHand} />
    </motion.div>
  )
}

// ---------------------------------------------------------------------------------------------
// C · Echo

/** The echo's one row: the radio checked, the letter and the label, as the card drew them. */
const ECHO_ROW = 'flex min-w-0 items-center gap-3 px-3 py-2.5 text-sm text-foreground'

/** C · Echo: a small frame on the reader's side, the chosen row as the card drew it. */
export function AnswerEcho({ question, answer }: PickedAnswerProps): ReactNode {
  const transition = useTransition(arrival)
  const picked = pickedOf(question, answer)
  return (
    <motion.div
      role="group"
      aria-label={nameOf(question, answer)}
      className="flex w-full justify-end"
      initial={AWAY}
      animate={IN_PLACE}
      transition={transition}
    >
      <Frame
        className="w-full max-w-md"
        header={
          <FrameHeader
            icon={<IconUser size="sm" />}
            title={`Your answer · ${phaseLabel(question.phase)}`}
          />
        }
      >
        <div className={ECHO_ROW}>
          <Radio checked />
          {picked.own ? (
            <span className="min-w-0 flex-1 break-words">{picked.label}</span>
          ) : (
            <span className="min-w-0 flex-1">
              <span className="font-mono text-muted-foreground">{picked.letter}</span> ·{' '}
              {picked.label}
            </span>
          )}
          {picked.recommended && <span className="text-xs text-muted-foreground">Recommended</span>}
        </div>
      </Frame>
    </motion.div>
  )
}
