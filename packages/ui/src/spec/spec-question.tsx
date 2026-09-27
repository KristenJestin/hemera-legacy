import { type BlockNode, type InlineNode, parseMarkdown } from '@tanstack/markdown'
import { AnimatePresence, motion } from 'motion/react'
import { type ReactNode, useState } from 'react'

import { Badge } from '../components/badge/badge.tsx'
import { IconButton } from '../components/button/button.tsx'
import { Tick } from '../components/checkbox/checkbox.tsx'
import { Frame, FrameFooter, FrameHeader } from '../components/frame/frame.tsx'
import { Tooltip } from '../components/tooltip/tooltip.tsx'
import { IconArrowUp, IconClock, IconLock, IconMessageQuestion, IconSparkles } from '../icons.ts'
import { AgentText } from '../message/agent-text.tsx'
import { CROSSFADE, collapse, crossfade, expand, fold, useTransition } from '../motion.ts'
import type { SpecAnswer, SpecQuestionView } from './model.ts'
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
 * The recommended choice wears a small mark after its label rather than a line under it (issue
 * #199): a line pushed its words down and made its row taller than the others. The words the
 * mark stands for are in its tooltip and in the row's name.
 *
 * The question is Markdown, as everything the agent writes is, and reads as the thread reads it
 * (issue #134).
 *
 * Answered, the card stays where it was asked and as it was (issue #199): the row chosen is filled
 * and draws its check, the others are quieted, and nothing in it can be pressed any more. No line
 * says which was chosen, and the thread draws no answer of its own under it: the card shows it,
 * and its name says it — `You answered «question»: B, One CSV per month`. Only the rim's sentence
 * goes, since the Spec no longer waits on it. A turn stopped before it was answered leaves the
 * card as it is too, nothing in it to press, and says the question stays open in the Spec.
 */

/** The question itself, at the top of the body, as the thread draws what the agent writes. */
const ASKED = 'px-3 pt-3 pb-1 font-medium text-foreground'

const CHOICES = 'flex flex-col gap-0.5 p-1.5'

/** A row the hand chooses: the body's nested radius, and the hover every control answers with. */
const CHOICE =
  'flex w-full items-center gap-3 rounded-md px-3 py-2 text-left text-sm text-foreground outline-none focus-ring hover:bg-muted disabled:text-muted-foreground disabled:hover:bg-transparent'

/** The row chosen, once answered: the primary's muted fill, the one row left in colour. */
const CHOSEN =
  'flex w-full items-center gap-3 rounded-md bg-primary-muted px-3 py-2 text-left text-sm text-foreground outline-none'

/** A choice's letter, which is Hemera's and not the agent's: A, B, C… and the next for `Other`. */
const LETTER =
  'flex size-5 shrink-0 items-center justify-center rounded-sm border border-border font-mono text-xs text-muted-foreground'

/** The letter of the choice made: the primary's own colours, where the others stay quiet. */
const LETTER_CHOSEN =
  'flex size-5 shrink-0 items-center justify-center rounded-sm border border-primary bg-primary font-mono text-xs text-primary-foreground'

/** The mark of the recommended choice, right after its label, in the line's own height. */
const MARK = 'ml-1.5 inline-flex align-middle text-primary-muted-foreground'

/** Where the check of the row chosen draws itself: held on every row, so no label moves. */
const CHECK = 'flex shrink-0 text-primary'

/** `Other…` turned into its field: the row it was, the field in the label's place. */
const WRITING = 'flex w-full items-center gap-3 px-3 py-1'

/** The reader's own answer: a field on the body's surface, the send icon inside its box. */
const FIELD_BOX =
  'flex min-w-0 flex-1 items-center rounded-md border border-input bg-surface-body focus-ring'

const FIELD =
  'h-control-sm w-full min-w-0 bg-transparent px-2.5 text-sm text-foreground outline-none placeholder:text-muted-foreground'

/** The rim's sentence below the body: whether the Spec waits on the answer. */
const SAYS = 'flex items-center gap-1.5 text-sm text-muted-foreground'

/** The room the rim's sentence folds away in, once the Spec no longer waits on it. */
const ROOM = 'overflow-hidden'

/** The letter of the choice at `index`: A for the first. */
function letterOf(index: number): string {
  return String.fromCodePoint(65 + index)
}

/** A phase as the card says it, with its capital. */
function phaseLabel(phase: string): string {
  return phase.charAt(0).toUpperCase() + phase.slice(1)
}

/** The words of a run of inline Markdown, without its marks. */
function wordsOf(nodes: readonly InlineNode[]): string {
  return nodes
    .map((node) => {
      switch (node.type) {
        case 'text':
        case 'inlineCode':
          return node.value
        case 'break':
          return ' '
        case 'image':
          return node.alt
        case 'strong':
        case 'emphasis':
        case 'strike':
        case 'link':
        case 'inlineComponent':
          return wordsOf(node.children)
        default:
          return ''
      }
    })
    .join('')
}

/** The words of one block of Markdown, without its marks. */
function blockWords(node: BlockNode): string {
  switch (node.type) {
    case 'heading':
    case 'paragraph':
      return wordsOf(node.children)
    case 'code':
      return node.value
    case 'list':
      return node.items.map((item) => item.children.map(blockWords).join(' ')).join(' ')
    case 'blockquote':
    case 'callout':
    case 'component':
      return node.children.map(blockWords).join(' ')
    default:
      return ''
  }
}

/**
 * The question as words (issue #170): the agent writes it in Markdown, and the card draws it so;
 * in the card's name, its stars and backticks would be read as they were typed.
 */
function plainQuestion(markdown: string): string {
  const words = parseMarkdown(markdown).children.map(blockWords).join(' ')
  return words.replaceAll(/\s+/g, ' ').trim()
}

/**
 * What a screen reader hears of an answered card: `You answered «question»: B, One CSV per
 * month`, or `…: D, Other: the words typed` for an answer of the reader's own.
 */
function answeredLabel(question: SpecQuestionView, answer: SpecAnswer): string {
  const asked = `You answered «${plainQuestion(question.body)}»`
  const index = question.options.findIndex((option) => option.id === answer.optionId)
  const option = question.options[index]
  if (option !== undefined) return `${asked}: ${letterOf(index)}, ${option.label}`
  if (answer.text !== undefined) {
    return `${asked}: ${letterOf(question.options.length)}, Other: ${answer.text}`
  }
  return asked
}

export interface SpecQuestionProps {
  question: SpecQuestionView
  /** The turn was stopped before it was answered. */
  cancelled?: boolean | undefined
  /**
   * Whether the answer came while the reader watched, the card drawn answered for the first time
   * since: its check draws itself in rather than being there already. A card answered in front of
   * the reader draws it anyway.
   */
  arrives?: boolean | undefined
  /** The answer: an option pressed, or the reader's own words. */
  onAnswer: (answer: SpecAnswer) => void
}

export function SpecQuestion({
  question,
  cancelled = false,
  arrives = false,
  onAnswer,
}: SpecQuestionProps): ReactNode {
  const [writing, setWriting] = useState(false)
  const [own, setOwn] = useState('')
  // Escape gives `Other…` back, and the focus with it: the field it was in is gone.
  const [left, setLeft] = useState(false)
  // A card drawn open and answered since was answered in front of the reader.
  const [drawnOpen] = useState(question.answer === null)
  const fading = useTransition(crossfade)
  const folding = useTransition(fold)
  const { answer } = question
  const closed = answer !== null || cancelled
  const drawsItsCheck = arrives || drawnOpen
  const Phase = SPEC_PHASE_ICONS[question.phase]
  const said = own.trim()
  const give = (): void => {
    // An answer of nothing is not an answer.
    if (said !== '') onAnswer({ text: said })
  }
  const ownLetter = letterOf(question.options.length)
  const chosenOwn =
    answer !== null &&
    answer.text !== undefined &&
    !question.options.some((option) => option.id === answer.optionId)
  return (
    <div
      role="group"
      aria-label={answer === null ? `Question: ${question.body}` : answeredLabel(question, answer)}
      className="w-full"
    >
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
          <AnimatePresence initial={false}>
            {answer === null && (
              <motion.div
                key="says"
                className={ROOM}
                initial={collapse}
                animate={expand}
                exit={collapse}
                transition={folding}
              >
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
              </motion.div>
            )}
          </AnimatePresence>
        }
      >
        <div className={ASKED}>
          <AgentText text={question.body} />
        </div>
        <ul aria-label="Answers" className={CHOICES}>
          {question.options.map((option, index) => {
            const chosen = answer?.optionId === option.id
            const row = (
              <button
                type="button"
                className={chosen ? CHOSEN : CHOICE}
                disabled={closed}
                aria-pressed={answer === null ? undefined : chosen}
                onClick={() => onAnswer({ optionId: option.id })}
              >
                <span className={chosen ? LETTER_CHOSEN : LETTER}>{letterOf(index)}</span>
                <span className="min-w-0 flex-1">
                  {option.label}
                  {option.recommended === true && (
                    <>
                      <span className={MARK}>
                        <IconSparkles size="sm" aria-hidden="true" />
                      </span>
                      <span className="sr-only">, recommended by the agent</span>
                    </>
                  )}
                </span>
                <span className={CHECK}>
                  <Tick checked={chosen} arrives={drawsItsCheck} />
                </span>
              </button>
            )
            return (
              <li key={option.id}>
                {option.recommended === true ? (
                  <Tooltip label="Recommended by the agent" disabled={closed}>
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
              {chosenOwn ? (
                <motion.button
                  key="given"
                  type="button"
                  className={CHOSEN}
                  disabled
                  aria-pressed
                  initial={CROSSFADE.from}
                  animate={CROSSFADE.to}
                  transition={fading}
                >
                  <span className={LETTER_CHOSEN}>{ownLetter}</span>
                  <span className="min-w-0 flex-1 break-words">{answer?.text}</span>
                  <span className={CHECK}>
                    <Tick checked arrives={drawsItsCheck} />
                  </span>
                </motion.button>
              ) : writing && !closed ? (
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
                  disabled={closed}
                  aria-pressed={answer === null ? undefined : false}
                  autoFocus={left}
                  initial={CROSSFADE.from}
                  animate={CROSSFADE.to}
                  exit={CROSSFADE.from}
                  transition={fading}
                  onClick={() => setWriting(true)}
                >
                  <span className={LETTER}>{ownLetter}</span>
                  {/* Once answered it is no longer a door to a field: the choice it was. */}
                  <span className="min-w-0 flex-1">{answer === null ? 'Other…' : 'Other'}</span>
                </motion.button>
              )}
            </AnimatePresence>
          </li>
        </ul>
      </Frame>
    </div>
  )
}
