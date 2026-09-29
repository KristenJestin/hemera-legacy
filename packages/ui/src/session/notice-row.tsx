import { AnimatePresence, motion } from 'motion/react'
import { type ReactNode, useState } from 'react'

import { Button, IconButton } from '../components/button/button.tsx'
import { IconChevronDown } from '../icons.ts'
import { CROSSFADE, collapse, crossfade, expand, fold, useTransition } from '../motion.ts'

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
 * - a chevron, when there is more to read. Unfolded, the cut line gives way, where it stands, to
 *   the item's title — "Run command", "Add command", a tool's label — and the whole line opens
 *   under it in its block, where it runs as a small line under that, growing by its height. The
 *   line is said once either way: cut on the head, or whole under the title.
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
  /** What it is about, cut to one line: the line to run, a command's name. */
  head: ReactNode
  /** Whether the head is a line to run, set in the terminal's letters. */
  mono?: boolean | undefined
  /** Whether the head is read whole, with nothing to unfold: a question. */
  wrap?: boolean | undefined
  /** What the item is, which takes the head's place once unfolded: `Run command`. */
  title?: string | undefined
  /** The line whole, in its block under the title once unfolded. */
  line?: string | undefined
  /** Where it would run or act, the small line under the block. */
  place?: ReactNode
  /** What the row always holds under its head: a question's choices, a Spec's type. */
  children?: ReactNode
  /** The quiet answer that refuses. */
  refuse?: NoticeAnswerButton | undefined
  /** Answers between the two, for an agent that offered more than one way. */
  others?: readonly NoticeAnswerButton[] | undefined
  /** The primary answer that accepts. */
  accept?: NoticeAnswerButton | undefined
}

const ROW = 'flex min-w-0 flex-col'

const FIRST = 'flex min-h-control-sm min-w-0 items-center gap-2'

/** The head's one line, where the cut text and the title trade places. */
const HEAD = 'relative min-w-0 flex-1'

const TEXT = 'truncate text-sm text-foreground'

const MONO_TEXT = 'truncate font-mono text-xs text-foreground'

const WRAPPED = 'min-w-0 flex-1 py-1 text-sm text-foreground'

/** The title, laid over the cut line it replaces, so neither moves the row. */
const TITLE = 'absolute inset-0 flex items-center truncate text-sm font-medium text-foreground'

const ANSWERS = 'flex shrink-0 items-center gap-1'

const WHOLE = 'flex flex-col gap-1 pt-1 pb-1'

const LINE =
  'rounded-md bg-muted px-2 py-1 font-mono text-xs break-all whitespace-pre-wrap text-foreground'

const PLACE = 'flex min-w-0 flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground'

const BODY = 'pt-1'

export function NoticeRow({
  name,
  head,
  mono = false,
  wrap = false,
  title,
  line,
  place,
  children,
  refuse,
  others = [],
  accept,
}: NoticeRowProps): ReactNode {
  const [open, setOpen] = useState(false)
  const folding = useTransition(fold)
  const fading = useTransition(crossfade)
  const more = !wrap && (line !== undefined || place !== undefined)
  return (
    <div role="group" aria-label={name} className={ROW}>
      <div className={FIRST}>
        {wrap ? (
          <div className={WRAPPED}>{head}</div>
        ) : (
          <div className={HEAD}>
            <motion.div
              className={mono ? MONO_TEXT : TEXT}
              aria-hidden={open ? true : undefined}
              initial={false}
              animate={open ? CROSSFADE.from : CROSSFADE.to}
              transition={fading}
            >
              {head}
            </motion.div>
            <AnimatePresence initial={false}>
              {open && title !== undefined && (
                <motion.div
                  key="title"
                  className={TITLE}
                  initial={CROSSFADE.from}
                  animate={CROSSFADE.to}
                  exit={CROSSFADE.from}
                  transition={fading}
                >
                  {title}
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        )}
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
            onClick={() => setOpen(!open)}
          />
        )}
      </div>
      <AnimatePresence initial={false}>
        {open && (
          <motion.div
            key="whole"
            className="overflow-hidden"
            initial={collapse}
            animate={expand}
            exit={collapse}
            transition={folding}
          >
            <div className={WHOLE}>
              {line !== undefined && <pre className={LINE}>{line}</pre>}
              {place !== undefined && <div className={PLACE}>{place}</div>}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
      {children !== undefined && <div className={BODY}>{children}</div>}
    </div>
  )
}
