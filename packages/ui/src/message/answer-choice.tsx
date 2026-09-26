import { cn } from 'cn'
import { motion } from 'motion/react'
import { type ReactNode, useState } from 'react'

import { Badge } from '../components/badge/badge.tsx'
import { IconCheck } from '../icons.ts'
import { arrival, useTransition } from '../motion.ts'
import { MessageHeader, MessageRow } from './message.tsx'
import { MessageText } from './message-text.tsx'

/**
 * The reader's answer to a question of the agent, drawn as the choice they made (issue #165).
 *
 * Drawn as the reader's message (issue #149), a picked option read as words they typed. It is
 * not: they pressed a button. So it keeps the reader's side of the thread, on the right, and loses
 * the filled bubble of a message: an outlined pill with the choice's letter in a circle, lettered
 * as the question card lettered it, its label and a check, which reads as the button pressed and
 * now fixed. Above it, a muted `↳` line with the question it answers, on one line, the whole
 * question under the hand; the name and the time below, as under a message.
 *
 * `Other` is a choice as well, and its pill says so; what the reader typed in it is theirs, and is
 * drawn as their message, under the pill. Several choices are several pills under one question.
 *
 * An answer whose question is no longer in the thread never vanishes: it is the same pill without
 * the `↳` line, and without a letter when the card that gave it is not there to say which.
 */

const GROUP = 'flex w-full flex-col items-end gap-1.5'

/** The question answered: muted, on one line, at the measure of the thread. */
const ASKED = 'flex max-w-3xl min-w-0 items-center gap-1 px-3 text-xs text-muted-foreground'

const CHOICES = 'flex flex-col items-end gap-1'

/** A choice made: the outline of the button it was, with no fill of a message. */
const PILL =
  'flex max-w-3xl min-w-0 items-center gap-2 rounded-full border border-primary py-1 pr-3 text-sm text-foreground'

/** The choice's letter, in a circle: the letter the question card gave it. */
const LETTER =
  'flex size-5 shrink-0 items-center justify-center rounded-full bg-primary-muted font-mono text-xs text-primary-muted-foreground'

/** One choice, as the question card offered it. */
export interface AnswerChoiceItem {
  /** Its letter on the card: A, B, C…, and the next one for `Other`; none when unknown. */
  letter?: string | undefined
  /** What the card called it; `Other` for the reader's own answer. */
  label: string
  /** Whether the agent recommended it, which the card said with a badge. */
  recommended?: boolean | undefined
}

export interface AnswerChoiceProps {
  /** The question answered, as the agent asked it; none when it is no longer in the thread. */
  question?: string | undefined
  /** The choices made, in the card's order: one, or several for a question that takes several. */
  choices: AnswerChoiceItem[]
  /** What the reader typed under `Other`, drawn as their message. */
  text?: string | undefined
  /** The reader's name, said under the answer. */
  name?: string | undefined
  /** When it was answered, `HH:MM`, already written for the platform. */
  at?: string | undefined
  /** The whole date behind that time. */
  atLabel?: string | undefined
}

/**
 * What a screen reader hears: `You answered «question»: B, One CSV per month`, or `You answered: B,
 * One CSV per month` without its question, and the label alone without a letter.
 */
export function answerChoiceLabel({
  question,
  choices,
  text,
}: Pick<AnswerChoiceProps, 'question' | 'choices' | 'text'>): string {
  const chosen = choices
    .map((choice) =>
      choice.letter === undefined ? choice.label : `${choice.letter}, ${choice.label}`,
    )
    .join('; ')
  const typed = text === undefined ? '' : `: ${text}`
  const asked = question === undefined ? '' : ` «${question}»`
  return `You answered${asked}: ${chosen}${typed}`
}

export function AnswerChoice({
  question,
  choices,
  text,
  name = 'You',
  at,
  atLabel,
}: AnswerChoiceProps): ReactNode {
  const transition = useTransition(arrival)
  // The time is the quiet half of the foot, drawn under the hand as a message's is.
  const [underTheHand, setUnderTheHand] = useState(false)
  return (
    <div
      role="group"
      aria-label={answerChoiceLabel({ question, choices, text })}
      className={GROUP}
      onPointerEnter={() => setUnderTheHand(true)}
      onPointerLeave={() => setUnderTheHand(false)}
      onFocus={() => setUnderTheHand(true)}
      onBlur={() => setUnderTheHand(false)}
    >
      {question !== undefined && (
        <p className={ASKED} title={question}>
          <span aria-hidden="true">↳</span>
          <span className="truncate">{question}</span>
        </p>
      )}
      <motion.ul
        aria-label="Chosen"
        className={CHOICES}
        // Movement only, as a message arrives: a fade would be measured mid-way by the contrast
        // check of the catalogue.
        initial={{ y: 8, scale: 0.95 }}
        animate={{ y: 0, scale: 1 }}
        transition={transition}
      >
        {choices.map((choice) => (
          <li
            key={choice.letter ?? choice.label}
            // The letter's circle sits close to the rim; words alone keep the rim's own inset.
            className={cn(PILL, choice.letter === undefined ? 'pl-3' : 'pl-1')}
          >
            {choice.letter !== undefined && <span className={LETTER}>{choice.letter}</span>}
            <span className="min-w-0 break-words">{choice.label}</span>
            {choice.recommended === true && <Badge tone="success">recommended</Badge>}
            <span className="flex text-primary">
              <IconCheck size="sm" aria-hidden="true" />
            </span>
          </li>
        ))}
      </motion.ul>
      {text !== undefined && (
        <MessageRow author="user" tail>
          <MessageText body={text} />
        </MessageRow>
      )}
      <MessageHeader author="user" name={name} at={at} atLabel={atLabel} shown={underTheHand} />
    </div>
  )
}
