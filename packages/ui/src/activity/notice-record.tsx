import type { ReactNode } from 'react'

import { StatusDot, type StatusTone } from '../components/status-dot/status-dot.tsx'
import { Disclosure } from './disclosure.tsx'

/**
 * What stays in the thread of something that waited for a human (issue #237): one closed, quiet
 * line where it was asked, answered or not — its kind's mark, a dot for where it stands, and what
 * it was about — and, opened, whatever it keeps of it. The question itself is answered among the
 * Session's notices, above the composer; the thread only tells what happened, and never draws a
 * big card for it.
 *
 * The dot says the answer: waiting, taken, refused or left. Its word is the dot's name, heard by
 * a screen reader and nowhere else on the line.
 */

/** Where the thing stands: still waiting, answered yes, answered no, or left without an answer. */
export type NoticeAnswer = 'pending' | 'accepted' | 'refused' | 'left'

const TONES: Record<NoticeAnswer, StatusTone> = {
  pending: 'pending',
  accepted: 'success',
  refused: 'cancelled',
  left: 'cancelled',
}

export interface NoticeRecordProps {
  /** The kind's mark: a shield, a bookmark, a question… */
  icon: ReactNode
  answer: NoticeAnswer
  /** What the dot is called: `waiting`, `allowed`, `added`, `declined`… */
  answerLabel: string
  /** What a reader calls the kind of thing, before what it was about: `Run command`. */
  label?: string | undefined
  /** What it was about: the line, the path, the name, the question. */
  subject: string
  /** Whether the subject is a line or a path, set in the terminal's letters. */
  mono?: boolean | undefined
  /** What was answered, after the subject, when the answer has words: `A, The issue date`. */
  said?: string | undefined
  /** What the line keeps once opened; nothing opens when there is none. */
  children?: ReactNode
  /** What the whole line is called, when the dot and the subject are not enough to say it. */
  name?: string | undefined
}

const SUMMARY = 'flex min-w-0 items-center gap-2'

const MARK = 'flex shrink-0 text-muted-foreground'

const LABEL = 'shrink-0 text-muted-foreground'

const SUBJECT = 'min-w-0 truncate'

const MONO_SUBJECT = 'min-w-0 truncate font-mono text-xs'

const SAID = 'min-w-0 shrink-0 truncate text-muted-foreground'

export function NoticeRecord({
  icon,
  answer,
  answerLabel,
  label,
  subject,
  mono = false,
  said,
  children,
  name,
}: NoticeRecordProps): ReactNode {
  return (
    <div role="group" aria-label={name ?? `${label ?? ''} ${subject}, ${answerLabel}`.trim()}>
      <Disclosure
        summary={
          <span className={SUMMARY}>
            <span className={MARK}>{icon}</span>
            <StatusDot status={TONES[answer]} size="sm" label={answerLabel} />
            {label !== undefined && <span className={LABEL}>{label}</span>}
            <span className={mono ? MONO_SUBJECT : SUBJECT} title={subject}>
              {subject}
            </span>
            {said !== undefined && <span className={SAID}>{said}</span>}
          </span>
        }
      >
        {children}
      </Disclosure>
    </div>
  )
}
