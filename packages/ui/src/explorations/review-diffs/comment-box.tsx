import { type KeyboardEvent, type ReactNode, useEffect, useRef, useState } from 'react'

import { Button, IconButton } from '../../components/button/button.tsx'
import { Tooltip } from '../../components/tooltip/tooltip.tsx'
import { IconBulb, IconMessage, IconMessageQuestion, IconX } from '../../icons.ts'
import type { FeedbackKind } from './model.ts'

/**
 * The box a feedback is written in: on lines of the diff, under a story or a criterion, or at
 * the foot of the list for one that points at nothing.
 *
 * Its kind is three icons rather than a menu: product, general, question, the one chosen pressed.
 * A question is answered by the agent and never becomes a fix, which the list says by its icon.
 * Ctrl+Enter records it, Escape lets it go.
 */

export const KIND_ICONS: Record<FeedbackKind, (size: 'sm' | 'md') => ReactNode> = {
  product: (size) => <IconBulb size={size} aria-hidden="true" />,
  general: (size) => <IconMessage size={size} aria-hidden="true" />,
  question: (size) => <IconMessageQuestion size={size} aria-hidden="true" />,
}

export const KIND_NAMES: Record<FeedbackKind, string> = {
  product: 'About the product',
  general: 'General',
  question: 'A question',
}

const KINDS: readonly FeedbackKind[] = ['product', 'general', 'question']

const BOX = 'flex flex-col gap-2 rounded-lg border border-border bg-card p-2 shadow-sm'

const AREA =
  'min-h-16 w-full resize-none rounded-md bg-transparent px-1 py-0.5 text-sm text-foreground outline-none placeholder:text-muted-foreground'

const FOOT = 'flex items-center gap-1'

/** One kind to choose, the one chosen pressed. */
const KIND =
  'flex size-control-sm items-center justify-center rounded-md text-muted-foreground outline-none focus-ring hover:bg-accent aria-pressed:bg-accent aria-pressed:text-foreground'

export interface CommentBoxProps {
  /** What the box is called, and what it says it is about: `Comment on api/src/x.ts:12–18`. */
  label: string
  placeholder: string
  /** Records the feedback. */
  onSubmit: (kind: FeedbackKind, body: string) => void
  /** Lets it go; a box at the foot of the list has none, it is always there. */
  onCancel?: (() => void) | undefined
  /** Whether it takes the keyboard as it appears, which a box opened on lines does. */
  autoFocus?: boolean | undefined
}

export function CommentBox({
  label,
  placeholder,
  onSubmit,
  onCancel,
  autoFocus = false,
}: CommentBoxProps): ReactNode {
  const [kind, setKind] = useState<FeedbackKind>('general')
  const [body, setBody] = useState('')
  const area = useRef<HTMLTextAreaElement>(null)
  const empty = body.trim() === ''

  useEffect(() => {
    if (autoFocus) area.current?.focus({ preventScroll: true })
  }, [autoFocus])

  function submit(): void {
    if (empty) return
    onSubmit(kind, body.trim())
    setBody('')
  }

  function keys(event: KeyboardEvent<HTMLTextAreaElement>): void {
    if (event.key === 'Enter' && (event.ctrlKey || event.metaKey)) {
      event.preventDefault()
      submit()
    }
    if (event.key === 'Escape' && onCancel !== undefined) {
      event.preventDefault()
      onCancel()
    }
  }

  return (
    <div role="group" aria-label={label} className={BOX} data-comment-box>
      <textarea
        ref={area}
        aria-label={label}
        placeholder={placeholder}
        value={body}
        rows={2}
        onChange={(event) => setBody(event.target.value)}
        onKeyDown={keys}
        className={AREA}
      />
      <div className={FOOT}>
        <div role="group" aria-label="Kind" className="flex gap-0.5">
          {KINDS.map((one) => (
            <Tooltip key={one} label={KIND_NAMES[one]}>
              <button
                type="button"
                aria-pressed={kind === one}
                aria-label={KIND_NAMES[one]}
                className={KIND}
                onClick={() => setKind(one)}
              >
                {KIND_ICONS[one]('sm')}
              </button>
            </Tooltip>
          ))}
        </div>
        <span className="ml-auto flex items-center gap-1">
          {onCancel !== undefined && (
            <Tooltip label="Let it go" keys="Escape">
              <IconButton
                variant="ghost"
                size="sm"
                icon={<IconX size="sm" />}
                aria-label="Let it go"
                onClick={onCancel}
              />
            </Tooltip>
          )}
          {!empty && (
            <Button variant="primary" size="sm" onClick={submit}>
              Comment
            </Button>
          )}
        </span>
      </div>
    </div>
  )
}
