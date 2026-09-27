import { AnimatePresence, motion } from 'motion/react'
import { type ReactNode, useState } from 'react'

import { Badge } from '../components/badge/badge.tsx'
import { IconButton } from '../components/button/button.tsx'
import { Frame, FrameFooter, FrameHeader } from '../components/frame/frame.tsx'
import { Tooltip } from '../components/tooltip/tooltip.tsx'
import { IconArrowUp, IconClock, IconLock, IconMessageQuestion, IconSparkles } from '../icons.ts'
import { AgentText } from '../message/agent-text.tsx'
import { CROSSFADE, crossfade, useTransition } from '../motion.ts'
import { type SpecAnswer, type SpecQuestionView, answerText } from './model.ts'
import { SPEC_PHASE_ICONS } from './spec-icons.ts'

/**
 * A question of the Spec, asked in the thread (lot 19, brief revision 2, "Questions are asked in
 * the chat").
 *
 * A frame like every other surface of the app (issue #199, card B of the exploration of issue
 * #182): the head says the agent asks, with the question's phase at its end; the body holds the
 * question and the choices; the rim below says whether the Spec waits on the answer.
 *
 * The choices are Hemera's to label (recette of 26 September 2026, issue #134): each is lettered
 * A, B, C… in the order the agent gave them, and `Other` is always the last one, whatever the
 * agent offered. The agent writes the choices and nothing around them; a letter, a
 * "(recommended)" or an "other" of its own would be said twice.
 *
 * Pressing a choice is the answer: there is no `Answer` to press after it. `Other…` turns into its
 * field in place, the caret in it; Enter sends the words, as does the small send icon inside the
 * field, and Escape gives `Other…` back.
 *
 * The recommended choice wears a small mark at its end rather than a line under its label (issue
 * #199): a line pushed its words down and made its row taller than the others. The words the
 * mark stands for are in its tooltip and in the row's name.
 *
 * The question is Markdown, as everything the agent writes is, and reads as the thread reads it
 * (issue #134).
 *
 * Once answered, the card folds to the question alone: the answer is the reader's own, which the
 * thread draws where it was given (issue #149). A turn stopped before it was answered leaves the
 * card where it is, nothing in it to press, and says the question stays open in the Spec.
 */

/** The question itself, at the top of the body, as the thread draws what the agent writes. */
const ASKED = 'px-3 pt-3 pb-1 font-medium text-foreground'

const CHOICES = 'flex flex-col gap-0.5 p-1.5'

/** A row the hand chooses: the body's nested radius, and the hover every control answers with. */
const CHOICE =
  'flex w-full items-center gap-3 rounded-md px-3 py-2 text-left text-sm text-foreground outline-none focus-ring hover:bg-muted disabled:text-muted-foreground disabled:hover:bg-transparent'

/** A choice's letter, which is Hemera's and not the agent's: A, B, C… and the next for `Other`. */
const LETTER =
  'flex size-5 shrink-0 items-center justify-center rounded-sm border border-border font-mono text-xs text-muted-foreground'

/** The mark of the recommended choice, at the end of its row, in the row's own height. */
const MARK = 'flex shrink-0 text-primary-muted-foreground'

/** `Other…` turned into its field: the row it was, the field in the label's place. */
const WRITING = 'flex w-full items-center gap-3 px-3 py-1'

/** The reader's own answer: a field on the body's surface, the send icon inside its box. */
const FIELD_BOX =
  'flex min-w-0 flex-1 items-center rounded-md border border-input bg-surface-body focus-ring'

const FIELD =
  'h-control-sm w-full min-w-0 bg-transparent px-2.5 text-sm text-foreground outline-none placeholder:text-muted-foreground'

/** The rim's sentence below the body: whether the Spec waits on the answer. */
const SAYS = 'flex items-center gap-1.5 text-sm text-muted-foreground'

const FOLDED = 'flex flex-col gap-1'

const FOLDED_ASKED = 'text-foreground'

/** The letter of the choice at `index`: A for the first. */
function letterOf(index: number): string {
  return String.fromCodePoint(65 + index)
}

/** A phase as the card says it, with its capital. */
function phaseLabel(phase: string): string {
  return phase.charAt(0).toUpperCase() + phase.slice(1)
}

export interface SpecQuestionProps {
  question: SpecQuestionView
  /** The turn was stopped before it was answered. */
  cancelled?: boolean | undefined
  /** The answer: an option pressed, or the reader's own words. */
  onAnswer: (answer: SpecAnswer) => void
}

export function SpecQuestion({
  question,
  cancelled = false,
  onAnswer,
}: SpecQuestionProps): ReactNode {
  const [writing, setWriting] = useState(false)
  const [own, setOwn] = useState('')
  // Escape gives `Other…` back, and the focus with it: the field it was in is gone.
  const [left, setLeft] = useState(false)
  const fading = useTransition(crossfade)
  const answered = answerText(question) !== null
  if (answered) {
    return (
      <div role="group" aria-label={`Question: ${question.body}`} className={FOLDED}>
        <div className={FOLDED_ASKED}>
          <AgentText text={question.body} />
        </div>
      </div>
    )
  }
  const Phase = SPEC_PHASE_ICONS[question.phase]
  const said = own.trim()
  const give = (): void => {
    // An answer of nothing is not an answer.
    if (said !== '') onAnswer({ text: said })
  }
  const ownLetter = letterOf(question.options.length)
  return (
    <div role="group" aria-label={`Question: ${question.body}`} className="w-full">
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
            <p className={SAYS}>
              {cancelled ? (
                'Not answered · the turn was stopped; it stays open in the Spec'
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
              )}
            </p>
          </FrameFooter>
        }
      >
        <div className={ASKED}>
          <AgentText text={question.body} />
        </div>
        <ul aria-label="Answers" className={CHOICES}>
          {question.options.map((option, index) => {
            const row = (
              <button
                type="button"
                className={CHOICE}
                disabled={cancelled}
                onClick={() => onAnswer({ optionId: option.id })}
              >
                <span className={LETTER}>{letterOf(index)}</span>
                <span className="min-w-0 flex-1">
                  {option.label}
                  {option.recommended === true && (
                    <span className="sr-only">, recommended by the agent</span>
                  )}
                </span>
                {option.recommended === true && (
                  <span className={MARK}>
                    <IconSparkles size="sm" aria-hidden="true" />
                  </span>
                )}
              </button>
            )
            return (
              <li key={option.id}>
                {option.recommended === true ? (
                  <Tooltip label="Recommended by the agent" disabled={cancelled}>
                    {row}
                  </Tooltip>
                ) : (
                  row
                )}
              </li>
            )
          })}
          {/* Always there, always last: the answer nobody offered is the reader's to give. */}
          <li>
            <AnimatePresence initial={false} mode="wait">
              {writing ? (
                <motion.div
                  key="writing"
                  className={WRITING}
                  initial={CROSSFADE.from}
                  animate={CROSSFADE.to}
                  exit={CROSSFADE.from}
                  transition={fading}
                >
                  <span className={LETTER}>{ownLetter}</span>
                  <span className={FIELD_BOX}>
                    <input
                      // The caret goes where the press sent it.
                      autoFocus
                      aria-label="Other"
                      className={FIELD}
                      placeholder="Your own answer…"
                      value={own}
                      onChange={(event) => setOwn(event.target.value)}
                      onKeyDown={(event) => {
                        if (event.key === 'Escape') {
                          event.preventDefault()
                          setWriting(false)
                          setLeft(true)
                          return
                        }
                        if (event.key !== 'Enter') return
                        event.preventDefault()
                        give()
                      }}
                    />
                    <IconButton
                      variant="ghost"
                      size="sm"
                      aria-label="Send your answer"
                      icon={<IconArrowUp size="sm" />}
                      disabled={said === ''}
                      onClick={give}
                    />
                  </span>
                </motion.div>
              ) : (
                <motion.button
                  key="other"
                  type="button"
                  className={CHOICE}
                  disabled={cancelled}
                  autoFocus={left}
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
    </div>
  )
}
