import { cn } from 'cn'
import { AnimatePresence, motion } from 'motion/react'
import { type ReactNode, useState } from 'react'

import { Badge } from '../../components/badge/badge.tsx'
import { Frame, FrameFooter, FrameHeader } from '../../components/frame/frame.tsx'
import {
  IconCheck,
  IconClock,
  IconLock,
  IconMessageQuestion,
  IconPencil,
  IconSparkles,
} from '../../icons.ts'
import { AgentText } from '../../message/agent-text.tsx'
import {
  CROSSFADE,
  arrival,
  collapse,
  crossfade,
  expand,
  fold,
  push,
  useTransition,
} from '../../motion.ts'
import type { SpecAnswer, SpecQuestionView } from '../../spec/model.ts'
import { SPEC_PHASE_ICONS } from '../../spec/spec-icons.ts'
import { letterOf, phaseLabel, pickedOf } from './question-fixtures.ts'
import { OwnField, Radio, plainText, useAnswer } from './question-parts.tsx'

/**
 * Three question cards built from the design system's frame, rows and tokens (issue #182, point
 * 1). Today's card is a pink-bordered block that looks like nothing else in the app; each of these
 * is a frame like every other surface, and differs from the others in four things: how
 * `blocking` is said, how the recommended choice is marked, how the reader's own answer opens its
 * field, and how the card looks once answered.
 *
 * - A · Frame · the showcase the maintainer liked: a head `Question · Shape` with the phase's
 *   glyph, `blocking` a quiet chip at its end; the choices as rows with a radio, the recommended
 *   one marked `Recommended` in words at its end; the last row `Write my own answer`, which opens
 *   its field under it. Answered, the other rows fold away and the chosen one stays, checked.
 * - B · Lettered · the choices lettered A, B, C as today, the recommended one saying so on a line
 *   under its label with a sparkle; `blocking` said in a sentence in the rim below the body; the
 *   last row `Other…` turns into its field in place. Answered, every row stays, the chosen one
 *   filled and checked, the others quiet, and the rim says `Answered`.
 * - C · Inline · the head is one quiet line with the phase and a coloured chip, `Blocks the Spec`
 *   or `Can wait`; the recommended choice wears a badge; the reader's field is always open in the
 *   rim below. Answered, the card folds to one line: the question in the head, the choice under
 *   it.
 *
 * Nothing here is wired or exported: the variant chosen is built in `spec/`, and this goes.
 */

export interface QuestionCardProps {
  question: SpecQuestionView
  /** The answer already given, for a card drawn answered. */
  answered?: SpecAnswer | undefined
  /** Words already in the reader's own field, the field open. */
  ownWords?: string | undefined
  onAnswer?: ((answer: SpecAnswer) => void) | undefined
  /**
   * The choice drawn under the hand, for a story to show the hover still: a pointer moved by a
   * play is not a pointer the stylesheet sees.
   */
  hovered?: string | undefined
}

/** A row the hand chooses: the body's nested radius, and the hover every control answers with. */
const CHOICE =
  'flex w-full items-center gap-3 rounded-md px-3 py-2 text-left text-sm text-foreground outline-none focus-ring hover:bg-muted data-hovered:bg-muted'

/** A row that is no longer a control: the choice kept, once the question is answered. */
const KEPT = 'flex w-full items-center gap-3 rounded-md px-3 py-2 text-sm text-foreground'

/** The words under a row's label, or at its end: the quiet half of a row. */
const QUIET = 'text-xs text-muted-foreground'

/** The question itself, at the top of the body, as the thread draws what the agent writes. */
const ASKED = 'px-3 pt-3 pb-1 font-medium text-foreground'

/** The room a row folds away in: clipped, so the fold never shows a row cut in half. */
const ROOM = 'overflow-hidden'

// ---------------------------------------------------------------------------------------------
// A · Frame

/** A · Frame: the showcase, a head with the phase and a quiet `blocking` chip at its end. */
export function CardFrame({
  question,
  answered,
  ownWords,
  onAnswer,
  hovered,
}: QuestionCardProps): ReactNode {
  const [answer, give] = useAnswer(answered, onAnswer)
  const [writing, setWriting] = useState(ownWords !== undefined)
  const [words, setWords] = useState(ownWords ?? '')
  const folding = useTransition(fold)
  const pushing = useTransition(push)
  const Phase = SPEC_PHASE_ICONS[question.phase]
  const picked = answer === null ? null : pickedOf(question, answer)
  const chip =
    picked !== null ? (
      <Badge tone="success">answered</Badge>
    ) : question.blocking ? (
      <Badge>blocking</Badge>
    ) : undefined
  return (
    <section aria-label={`Question: ${plainText(question.body)}`} className="w-full max-w-2xl">
      <Frame
        animated
        header={
          <FrameHeader
            icon={<Phase size="sm" />}
            title={`Question · ${phaseLabel(question.phase)}`}
            action={chip}
          />
        }
      >
        <div className={ASKED}>
          <AgentText text={question.body} />
        </div>
        <motion.ul layout="position" transition={pushing} aria-label="Choices" className="p-1.5">
          <AnimatePresence initial={false}>
            {question.options.map((option, index) => {
              const chosen = answer?.optionId === option.id
              if (answer !== null && !chosen) return null
              const inside = (
                <>
                  <Radio checked={chosen} />
                  <span className="min-w-0 flex-1">
                    <span className="sr-only">{letterOf(index)}, </span>
                    {option.label}
                  </span>
                  {option.recommended === true && <span className={QUIET}>Recommended</span>}
                  {chosen && (
                    <span className="flex text-primary">
                      <IconCheck size="sm" aria-hidden="true" />
                    </span>
                  )}
                </>
              )
              return (
                <motion.li
                  key={option.id}
                  className={ROOM}
                  initial={collapse}
                  animate={expand}
                  exit={collapse}
                  transition={folding}
                >
                  {answer === null ? (
                    <button
                      type="button"
                      className={CHOICE}
                      data-hovered={hovered === option.id ? true : undefined}
                      onClick={() => give({ optionId: option.id })}
                    >
                      {inside}
                    </button>
                  ) : (
                    <div className={KEPT}>{inside}</div>
                  )}
                </motion.li>
              )
            })}
            {answer === null && (
              <motion.li
                key="own"
                className={ROOM}
                initial={collapse}
                animate={expand}
                exit={collapse}
                transition={folding}
              >
                <button
                  type="button"
                  className={CHOICE}
                  aria-expanded={writing}
                  onClick={() => setWriting(!writing)}
                >
                  <span className="flex size-4 items-center justify-center text-muted-foreground">
                    <IconPencil size="sm" aria-hidden="true" />
                  </span>
                  <span className="min-w-0 flex-1">Write my own answer</span>
                </button>
                <AnimatePresence initial={false}>
                  {writing && (
                    <motion.div
                      className={ROOM}
                      initial={collapse}
                      animate={expand}
                      exit={collapse}
                      transition={folding}
                    >
                      <div className="px-3 pt-1 pb-2">
                        <OwnField
                          words={words}
                          onWords={setWords}
                          onGive={(text) => give({ text })}
                          onLeave={() => setWriting(false)}
                          focus={ownWords === undefined}
                        />
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>
              </motion.li>
            )}
            {picked?.own === true && (
              <motion.li
                key="own-given"
                className={ROOM}
                initial={collapse}
                animate={expand}
                exit={collapse}
                transition={folding}
              >
                <div className={KEPT}>
                  <Radio checked />
                  <span className="min-w-0 flex-1 break-words">{picked.label}</span>
                  <span className={QUIET}>Your own answer</span>
                  <span className="flex text-primary">
                    <IconCheck size="sm" aria-hidden="true" />
                  </span>
                </div>
              </motion.li>
            )}
          </AnimatePresence>
        </motion.ul>
      </Frame>
    </section>
  )
}

// ---------------------------------------------------------------------------------------------
// B · Lettered

/** A choice's letter, in the square the card has lettered its choices in since issue #134. */
const LETTER =
  'flex size-5 shrink-0 items-center justify-center rounded-sm border border-border font-mono text-xs text-muted-foreground'

/** The letter of the choice made: the primary's own colours, where the others stay quiet. */
const LETTER_CHOSEN =
  'flex size-5 shrink-0 items-center justify-center rounded-sm bg-primary font-mono text-xs text-primary-foreground'

/** The row chosen, once answered: the primary's muted fill, the one surface left in colour. */
const CHOSEN =
  'flex w-full items-center gap-3 rounded-md bg-primary-muted px-3 py-2 text-sm text-foreground'

/** The rows not chosen, once answered: still there, read as the choices that were offered. */
const PASSED = 'flex w-full items-center gap-3 rounded-md px-3 py-2 text-sm text-muted-foreground'

/** The rim's sentence below the body: whether the Spec waits on the answer, then that it came. */
const SAYS = 'flex items-center gap-1.5 text-sm text-muted-foreground'

/** B · Lettered: lettered rows, the recommendation under its label, `blocking` in a sentence. */
export function CardLettered({
  question,
  answered,
  ownWords,
  onAnswer,
  hovered,
}: QuestionCardProps): ReactNode {
  const [answer, give] = useAnswer(answered, onAnswer)
  const [writing, setWriting] = useState(ownWords !== undefined)
  const [words, setWords] = useState(ownWords ?? '')
  const fading = useTransition(crossfade)
  const Phase = SPEC_PHASE_ICONS[question.phase]
  const picked = answer === null ? null : pickedOf(question, answer)
  const ownLetter = letterOf(question.options.length)
  const saying =
    picked !== null ? (
      <>
        <span className="flex text-success-muted-foreground">
          <IconCheck size="sm" aria-hidden="true" />
        </span>
        Answered · you chose {picked.letter}
      </>
    ) : question.blocking ? (
      <>
        <IconLock size="sm" aria-hidden="true" />
        Blocking · the Spec cannot be marked ready before this is answered
      </>
    ) : (
      <>
        <IconClock size="sm" aria-hidden="true" />
        Not blocking · the Spec can go on without it
      </>
    )
  return (
    <section aria-label={`Question: ${plainText(question.body)}`} className="w-full max-w-2xl">
      <Frame
        header={
          <FrameHeader
            icon={<IconMessageQuestion size="sm" />}
            title="The agent asks"
            action={
              <Badge tone="define" icon={<Phase size="sm" />}>
                {phaseLabel(question.phase)}
              </Badge>
            }
          />
        }
        footer={
          <FrameFooter>
            <AnimatePresence initial={false} mode="wait">
              <motion.p
                key={picked === null ? 'open' : 'answered'}
                className={SAYS}
                initial={CROSSFADE.from}
                animate={CROSSFADE.to}
                exit={CROSSFADE.from}
                transition={fading}
              >
                {saying}
              </motion.p>
            </AnimatePresence>
          </FrameFooter>
        }
      >
        <div className={ASKED}>
          <AgentText text={question.body} />
        </div>
        <ul aria-label="Choices" className="flex flex-col gap-0.5 p-1.5">
          {question.options.map((option, index) => {
            const chosen = answer?.optionId === option.id
            const letter = letterOf(index)
            const inside = (
              <>
                <span className={chosen ? LETTER_CHOSEN : LETTER}>{letter}</span>
                <span className="flex min-w-0 flex-1 flex-col">
                  <span>{option.label}</span>
                  {option.recommended === true && (
                    <span className="flex items-center gap-1 text-xs text-primary-muted-foreground">
                      <IconSparkles size="sm" aria-hidden="true" />
                      Recommended by the agent
                    </span>
                  )}
                </span>
                {chosen && (
                  <span className="flex text-primary">
                    <IconCheck size="sm" aria-hidden="true" />
                  </span>
                )}
              </>
            )
            return (
              <li key={option.id}>
                {answer === null ? (
                  <button
                    type="button"
                    className={CHOICE}
                    data-hovered={hovered === option.id ? true : undefined}
                    onClick={() => give({ optionId: option.id })}
                  >
                    {inside}
                  </button>
                ) : (
                  <div className={chosen ? CHOSEN : PASSED}>{inside}</div>
                )}
              </li>
            )
          })}
          <li>
            <AnimatePresence initial={false} mode="wait">
              {picked?.own === true ? (
                <motion.div
                  key="given"
                  className={CHOSEN}
                  initial={CROSSFADE.from}
                  animate={CROSSFADE.to}
                  transition={fading}
                >
                  <span className={LETTER_CHOSEN}>{ownLetter}</span>
                  <span className="min-w-0 flex-1 break-words">{picked.label}</span>
                  <span className="flex text-primary">
                    <IconCheck size="sm" aria-hidden="true" />
                  </span>
                </motion.div>
              ) : answer !== null ? (
                <motion.div
                  key="passed"
                  className={PASSED}
                  initial={CROSSFADE.from}
                  animate={CROSSFADE.to}
                  transition={fading}
                >
                  <span className={LETTER}>{ownLetter}</span>
                  <span className="min-w-0 flex-1">Other</span>
                </motion.div>
              ) : writing ? (
                <motion.div
                  key="writing"
                  className="flex items-center gap-3 px-3 py-1"
                  initial={CROSSFADE.from}
                  animate={CROSSFADE.to}
                  exit={CROSSFADE.from}
                  transition={fading}
                >
                  <span className={LETTER}>{ownLetter}</span>
                  <OwnField
                    words={words}
                    onWords={setWords}
                    onGive={(text) => give({ text })}
                    onLeave={() => setWriting(false)}
                    focus={ownWords === undefined}
                  />
                </motion.div>
              ) : (
                <motion.button
                  key="other"
                  type="button"
                  className={CHOICE}
                  initial={CROSSFADE.from}
                  animate={CROSSFADE.to}
                  exit={CROSSFADE.from}
                  transition={fading}
                  onClick={() => setWriting(true)}
                >
                  <span className={LETTER}>{ownLetter}</span>
                  <span className="min-w-0 flex-1">Other…</span>
                </motion.button>
              )}
            </AnimatePresence>
          </li>
        </ul>
      </Frame>
    </section>
  )
}

// ---------------------------------------------------------------------------------------------
// C · Inline

/** The head of C: one quiet line in the rim, the phase at its start and the chip at its end. */
const LINE = 'flex min-w-0 items-center gap-2 px-2.5 pt-1 pb-2 text-sm text-muted-foreground'

/** C · Inline: a quiet head, a coloured chip, the field always open, folded to one line. */
export function CardInline({
  question,
  answered,
  ownWords,
  onAnswer,
  hovered,
}: QuestionCardProps): ReactNode {
  const [answer, give] = useAnswer(answered, onAnswer)
  const [words, setWords] = useState(ownWords ?? '')
  const folding = useTransition(fold)
  const arriving = useTransition(arrival)
  const Phase = SPEC_PHASE_ICONS[question.phase]
  const picked = answer === null ? null : pickedOf(question, answer)
  const plain = plainText(question.body)
  return (
    <section aria-label={`Question: ${plain}`} className="w-full max-w-2xl">
      <Frame
        animated
        header={
          <div className={LINE}>
            <Phase size="sm" aria-hidden="true" />
            <span className="shrink-0 font-medium text-foreground">
              {phaseLabel(question.phase)}
            </span>
            {picked !== null && (
              <span className="min-w-0 flex-1 truncate" title={plain}>
                · {plain}
              </span>
            )}
            <span className="ml-auto flex shrink-0">
              {picked !== null ? (
                <Badge tone="success">Answered</Badge>
              ) : question.blocking ? (
                <Badge tone="warning">Blocks the Spec</Badge>
              ) : (
                <Badge tone="info">Can wait</Badge>
              )}
            </span>
          </div>
        }
        footer={
          <AnimatePresence initial={false}>
            {answer === null && (
              <motion.div
                className={ROOM}
                initial={collapse}
                animate={expand}
                exit={collapse}
                transition={folding}
              >
                <FrameFooter>
                  <OwnField
                    words={words}
                    onWords={setWords}
                    onGive={(text) => give({ text })}
                    placeholder="Or write your own answer…"
                  />
                </FrameFooter>
              </motion.div>
            )}
          </AnimatePresence>
        }
      >
        <AnimatePresence initial={false}>
          {answer === null && (
            <motion.div
              className={ROOM}
              initial={collapse}
              animate={expand}
              exit={collapse}
              transition={folding}
            >
              <div className={cn(ASKED, 'text-base')}>
                <AgentText text={question.body} />
              </div>
            </motion.div>
          )}
        </AnimatePresence>
        <ul aria-label="Choices" className="flex flex-col p-1.5">
          <AnimatePresence initial={false}>
            {question.options.map((option, index) => {
              const chosen = answer?.optionId === option.id
              if (answer !== null && !chosen) return null
              const inside = (
                <>
                  <Radio checked={chosen} />
                  <span className="min-w-0 flex-1">
                    <span className="sr-only">{letterOf(index)}, </span>
                    {option.label}
                  </span>
                  {option.recommended === true && <Badge tone="success">Recommended</Badge>}
                </>
              )
              return (
                <motion.li
                  key={option.id}
                  className={ROOM}
                  initial={collapse}
                  animate={expand}
                  exit={collapse}
                  transition={folding}
                >
                  {answer === null ? (
                    <button
                      type="button"
                      className={CHOICE}
                      data-hovered={hovered === option.id ? true : undefined}
                      onClick={() => give({ optionId: option.id })}
                    >
                      {inside}
                    </button>
                  ) : (
                    <div className={KEPT}>{inside}</div>
                  )}
                </motion.li>
              )
            })}
            {picked?.own === true && (
              <motion.li
                key="own-given"
                initial={{ y: 8 }}
                animate={{ y: 0 }}
                transition={arriving}
              >
                <div className={KEPT}>
                  <Radio checked />
                  <span className="min-w-0 flex-1 break-words">{picked.label}</span>
                  <span className={QUIET}>Your own answer</span>
                </div>
              </motion.li>
            )}
          </AnimatePresence>
        </ul>
      </Frame>
    </section>
  )
}
