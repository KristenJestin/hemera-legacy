import { motion } from 'motion/react'
import { type ReactNode, useState } from 'react'

import { Button, IconButton } from '../components/button/button.tsx'
import { IconChevronDown } from '../icons.ts'
import { fold, useTransition } from '../motion.ts'

/**
 * One thing that waits for the reader, as the Session's notices list it (variant A of the
 * exploration after #250, the compact list): one dense row, whatever the kind. The kind itself is
 * the coloured tile the notices draw before the row, and is said nowhere else.
 *
 * - its text: what it is about — the line a one-off would run, a command's name and its line, a
 *   Spec's title — cut to one line; or, for a question, the question itself, whole;
 * - the answers, beside the text's first line and always in the same shape: a quiet text button
 *   that refuses, then the primary one that accepts, their verbs the kind's. A question has none:
 *   its choices are its answers, under its text;
 * - a chevron, when there is more to read, that unfolds the text in place: the one line becomes the
 *   whole of it, wrapped where it stands, with where it runs as a small line under it. There is one
 *   text, never a second block; the row grows by its height, and the answers and the chevron stay
 *   on the first line.
 *
 * No icon-only ✓ or ✕: an answer is a word.
 */

export interface NoticeAnswerButton {
  label: string
  onPress: () => void
}

export interface NoticeRowProps {
  /** What the row is called to a screen reader. */
  name: string
  /** What it is about: cut to one line, and whole once unfolded. */
  head: ReactNode
  /** Whether the text is a line to run, set in the terminal's letters. */
  mono?: boolean | undefined
  /** Whether the text is read whole at once, with nothing to unfold: a question. */
  wrap?: boolean | undefined
  /** Whether there is more to read than one line holds; a line to run or a place says there is. */
  unfolds?: boolean | undefined
  /** Where it would run or act, the small line under the unfolded text. */
  place?: ReactNode
  /** What the row always holds under its text: a question's choices, a Spec's type. */
  children?: ReactNode
  /** The quiet answer that refuses. */
  refuse?: NoticeAnswerButton | undefined
  /** Answers between the two, for an agent that offered more than one way. */
  others?: readonly NoticeAnswerButton[] | undefined
  /** The primary answer that accepts. */
  accept?: NoticeAnswerButton | undefined
}

const ROW = 'flex min-w-0 flex-col'

const FIRST = 'flex min-w-0 items-start gap-2'

/** The text's room, which is what grows: its first line sits on the answers' line. */
const ROOM = 'min-w-0 flex-1 overflow-hidden'

const TEXT = 'py-1.5 text-sm break-words text-foreground'

const MONO_TEXT = 'py-2 font-mono text-xs break-all whitespace-pre-wrap text-foreground'

/** The same texts cut to their first line, while folded. */
const TEXT_CUT = 'line-clamp-1 py-1.5 text-sm break-words text-foreground'

const MONO_TEXT_CUT =
  'line-clamp-1 py-2 font-mono text-xs break-all whitespace-pre-wrap text-foreground'

const PLACE =
  'flex min-w-0 flex-wrap items-center gap-x-3 gap-y-1 pb-1 text-xs text-muted-foreground'

const ANSWERS = 'flex shrink-0 items-center gap-1'

/** The height of the one line a row is folded to: a control's, the answers' beside it. */
const ONE_LINE = 'var(--spacing-control-sm)'

const BODY = 'pt-1'

export function NoticeRow({
  name,
  head,
  mono = false,
  wrap = false,
  unfolds = mono,
  place,
  children,
  refuse,
  others = [],
  accept,
}: NoticeRowProps): ReactNode {
  const [open, setOpen] = useState(false)
  // Cut while folded, and until the fold is over: the text stays whole while its room closes on
  // it, and is cut once the room is one line again.
  const [cut, setCut] = useState(true)
  const folding = useTransition(fold)
  const more = !wrap && (unfolds || place !== undefined)

  const toggle = (): void => {
    if (!open) setCut(false)
    setOpen(!open)
  }

  return (
    <div role="group" aria-label={name} className={ROW}>
      <div className={FIRST}>
        <motion.div
          className={ROOM}
          initial={false}
          // Folded, the room is one line — the height of the answers beside it, a control's —
          // and unfolded, the text's own.
          animate={{ height: open || wrap ? 'auto' : ONE_LINE }}
          transition={folding}
          onAnimationComplete={() => {
            if (!open) setCut(true)
          }}
        >
          <div>
            <div
              className={cut && !wrap ? (mono ? MONO_TEXT_CUT : TEXT_CUT) : mono ? MONO_TEXT : TEXT}
            >
              {head}
            </div>
            {!cut && place !== undefined && <div className={PLACE}>{place}</div>}
          </div>
        </motion.div>
        {(refuse !== undefined || accept !== undefined || others.length > 0) && (
          <span className={ANSWERS}>
            {refuse !== undefined && (
              <Button variant="ghost" size="sm" onClick={refuse.onPress}>
                {refuse.label}
              </Button>
            )}
            {others.map((other) => (
              <Button key={other.label} variant="secondary" size="sm" onClick={other.onPress}>
                {other.label}
              </Button>
            ))}
            {accept !== undefined && (
              <Button variant="primary" size="sm" onClick={accept.onPress}>
                {accept.label}
              </Button>
            )}
          </span>
        )}
        {more && (
          <IconButton
            variant="ghost"
            size="sm"
            icon={<IconChevronDown size="sm" />}
            aria-label={open ? 'Fold the whole line' : 'Show the whole line'}
            aria-expanded={open}
            onClick={toggle}
          />
        )}
      </div>
      {children !== undefined && <div className={BODY}>{children}</div>}
    </div>
  )
}
