import { cn } from 'cn'
import { type ReactNode, useEffect, useRef, useState } from 'react'

import { Button } from '../../components/button/button.tsx'
import type { SpecAnswer } from '../../spec/model.ts'

/**
 * What the three question cards of issue #182 share: the radio of a row, the reader's own answer
 * and the question said in words. None of it is a component of the design system; it lives and
 * goes with the exploration.
 */

const RING =
  'flex size-4 shrink-0 items-center justify-center rounded-full border border-input bg-surface-body'

const DOT = 'size-2 rounded-full bg-primary'

/** The radio of a choice: a ring, and the dot inside it once it is the one chosen. */
export function Radio({ checked }: { checked: boolean }): ReactNode {
  return (
    <span aria-hidden="true" className={cn(RING, checked && 'border-primary')}>
      {checked && <span className={DOT} />}
    </span>
  )
}

/** The question in words, without the marks of its Markdown, for a name or a single line. */
export function plainText(markdown: string): string {
  return markdown.replaceAll(/[*_`]/g, '').replaceAll(/\s+/g, ' ').trim()
}

/**
 * The answer of a card, kept by the card so a story can be played by the hand: it starts as the
 * story says, and pressing a choice answers.
 */
export function useAnswer(
  initial: SpecAnswer | undefined,
  onAnswer: ((answer: SpecAnswer) => void) | undefined,
): [SpecAnswer | null, (answer: SpecAnswer) => void] {
  const [answer, setAnswer] = useState<SpecAnswer | null>(initial ?? null)
  return [
    answer,
    (given) => {
      setAnswer(given)
      onAnswer?.(given)
    },
  ]
}

const FIELD_BOX = 'flex min-w-0 flex-1 rounded-md border border-input bg-surface-body focus-ring'

const FIELD =
  'h-control-sm w-full bg-transparent px-2.5 text-sm text-foreground outline-none placeholder:text-muted-foreground'

export interface OwnFieldProps {
  words: string
  onWords: (words: string) => void
  onGive: (words: string) => void
  /** Escape: the field is left, for a card that opened it on a press. */
  onLeave?: (() => void) | undefined
  /** Whether the caret goes into the field the moment it is drawn. */
  focus?: boolean | undefined
  placeholder?: string | undefined
}

/** The reader's own answer: a field and its `Answer`, pressable once there are words. */
export function OwnField({
  words,
  onWords,
  onGive,
  onLeave,
  focus = false,
  placeholder = 'Your answer…',
}: OwnFieldProps): ReactNode {
  const field = useRef<HTMLInputElement>(null)
  useEffect(() => {
    if (focus) field.current?.focus()
  }, [focus])
  const said = words.trim()
  return (
    <div className="flex w-full items-center gap-2">
      <span className={FIELD_BOX}>
        <input
          ref={field}
          aria-label="Your own answer"
          className={FIELD}
          placeholder={placeholder}
          value={words}
          onChange={(event) => onWords(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === 'Escape' && onLeave !== undefined) {
              event.preventDefault()
              onLeave()
            }
            if (event.key !== 'Enter' || said === '') return
            event.preventDefault()
            onGive(said)
          }}
        />
      </span>
      <Button variant="primary" size="sm" disabled={said === ''} onClick={() => onGive(said)}>
        Answer
      </Button>
    </div>
  )
}
