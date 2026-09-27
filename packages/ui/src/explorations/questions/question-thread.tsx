import { AnimatePresence, motion } from 'motion/react'
import { type ReactNode, useState } from 'react'

import { AgentText } from '../../message/agent-text.tsx'
import { MessageDaySeparator, MessageGroup } from '../../message/message.tsx'
import { CROSSFADE, arrival, crossfade, useTransition } from '../../motion.ts'
import type { SpecAnswer } from '../../spec/model.ts'
import { SPEC_PHASE_ICONS } from '../../spec/spec-icons.ts'
import { AnswerEcho, AnswerFolded, AnswerNote } from './picked-answers.tsx'
import { CardFrame, CardInline, CardLettered } from './question-cards.tsx'
import { SPLIT, phaseLabel, pickedOf } from './question-fixtures.ts'

/**
 * A question card and its answer in a thread (issue #182, point 3): what the reader asked, what
 * the agent found, the card it stopped on, and — once the reader has answered — the answer where
 * it lands and the agent going on from it.
 *
 * A card alone answers in place, in its own answered state. With an answer variant, the card
 * gives way to it: the folded card takes the card's place, and the quiet row and the echo sit on
 * the reader's side under the question, which stays as the agent's line it was.
 */

export type CardVariant = 'frame' | 'lettered' | 'inline'

export type AnswerVariant = 'folded' | 'note' | 'echo'

const CARDS = { frame: CardFrame, lettered: CardLettered, inline: CardInline }

const ANSWERS = { folded: AnswerFolded, note: AnswerNote, echo: AnswerEcho }

/** The question once answered, when the answer is drawn apart: its phase and its words, quiet. */
function Asked(): ReactNode {
  const Phase = SPEC_PHASE_ICONS[SPLIT.phase]
  return (
    <div className="flex flex-col gap-1">
      <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
        <Phase size="sm" aria-hidden="true" />
        Question · {phaseLabel(SPLIT.phase)}
      </p>
      <AgentText text={SPLIT.body} />
    </div>
  )
}

/** What the agent says once it has the answer. */
function goesOn(answer: SpecAnswer): string {
  const picked = pickedOf(SPLIT, answer)
  const kept = picked.own ? 'your split' : `**${picked.label}**`
  return `Noted: ${kept}. I have written it into the Spec's shape and will plan the export around it.`
}

export interface QuestionThreadProps {
  card: CardVariant
  /** How the answer shows once picked; none leaves the card answered in place. */
  answer?: AnswerVariant | undefined
  /** An answer already given, for a thread drawn after it. */
  answered?: SpecAnswer | undefined
}

export function QuestionThread({ card, answer, answered }: QuestionThreadProps): ReactNode {
  const [given, setGiven] = useState<SpecAnswer | null>(answered ?? null)
  const transition = useTransition(arrival)
  const fading = useTransition(crossfade)
  const Card = CARDS[card]
  const Answer = answer === undefined ? undefined : ANSWERS[answer]
  const apart = given !== null && Answer !== undefined
  return (
    <div role="log" aria-label="Thread" className="flex w-full max-w-3xl flex-col gap-5">
      <MessageDaySeparator day="Today" />
      <MessageGroup
        author="user"
        name="You"
        at="14:02"
        state="saved"
        lines={[
          {
            id: 'ask',
            body: 'The accountant wants the invoices of the year as CSV. Write the Spec for it.',
          },
        ]}
      />
      <AgentText text="The export writes one file per run today, whatever the period. Before I shape the Spec, one thing only you can decide:" />
      {/* The card gives way to the answer drawn apart: one content for another, in place. */}
      <AnimatePresence initial={false} mode="wait">
        <motion.div
          key={apart ? 'answer' : 'card'}
          className="flex flex-col gap-5"
          initial={CROSSFADE.from}
          animate={CROSSFADE.to}
          exit={CROSSFADE.from}
          transition={fading}
        >
          {given === null || Answer === undefined ? (
            <Card question={SPLIT} answered={given ?? undefined} onAnswer={setGiven} />
          ) : answer === 'folded' ? (
            <Answer question={SPLIT} answer={given} at="14:07" />
          ) : (
            <>
              <Asked />
              <Answer question={SPLIT} answer={given} at="14:07" />
            </>
          )}
        </motion.div>
      </AnimatePresence>
      {given !== null && (
        <motion.div initial={{ y: 8 }} animate={{ y: 0 }} transition={transition}>
          <AgentText text={goesOn(given)} />
        </motion.div>
      )}
    </div>
  )
}
