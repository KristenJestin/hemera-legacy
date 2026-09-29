import type { ReactNode } from 'react'

import { Button } from '../components/button/button.tsx'

/**
 * One thing that waits for the reader, as the Session's notices draw every kind of it (review of
 * #250: "aucune cohérence"): one anatomy, one card style, whatever the kind.
 *
 * - a head: the kind's mark and a short title that says what accepting does — "Run once", "Add to
 *   the catalogue", "Start a Spec" — or, for a question, the question itself;
 * - a body: what it is about, the line whole in the terminal's letters, and where;
 * - one row of answers, always in the same place and the same shape: a quiet text button that
 *   refuses, then the primary one that accepts, their verbs matching the title. A question has
 *   no row: its choices are its answers, in the body.
 *
 * No icon-only ✓ or ✕: an answer is a word.
 */

export interface NoticeAnswerButton {
  label: string
  onPress: () => void
}

export interface NoticeCardProps {
  /** The kind's mark. */
  icon: ReactNode
  /** What accepting does, or the question asked. */
  title: ReactNode
  /** What the card is called to a screen reader. */
  name: string
  /** What it is about, before its line: a command's name, a path as the agent named it. */
  subject?: ReactNode
  /** The line it is about, whole, in the terminal's letters. */
  line?: string | undefined
  /** Where it would run or act, under the line. */
  place?: ReactNode
  /** Anything else it holds: a question's choices, a Spec's title and type. */
  children?: ReactNode
  /** The quiet answer that refuses; none on a question. */
  refuse?: NoticeAnswerButton | undefined
  /** Answers between the two, for an agent that offered more than one way. */
  others?: readonly NoticeAnswerButton[] | undefined
  /** The primary answer that accepts; none on a question. */
  accept?: NoticeAnswerButton | undefined
}

const CARD = 'flex flex-col gap-2 rounded-lg border border-border bg-surface-body p-3'

const HEAD = 'flex min-w-0 items-start gap-2 text-sm font-medium text-foreground'

const MARK = 'flex h-control-text shrink-0 items-center text-muted-foreground'

const BODY = 'flex min-w-0 flex-col gap-1.5'

const SUBJECT = 'flex min-w-0 items-center gap-1.5 text-sm text-foreground'

const LINE =
  'rounded-md bg-muted px-2 py-1 font-mono text-xs break-all whitespace-pre-wrap text-foreground'

const PLACE = 'flex min-w-0 flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground'

const ANSWERS = 'flex flex-wrap items-center justify-end gap-2'

export function NoticeCard({
  icon,
  title,
  name,
  subject,
  line,
  place,
  children,
  refuse,
  others = [],
  accept,
}: NoticeCardProps): ReactNode {
  const answers = refuse !== undefined || accept !== undefined || others.length > 0
  return (
    <div role="group" aria-label={name} className={CARD}>
      <div className={HEAD}>
        <span aria-hidden="true" className={MARK}>
          {icon}
        </span>
        <span className="min-w-0 flex-1">{title}</span>
      </div>
      {(subject !== undefined ||
        line !== undefined ||
        place !== undefined ||
        children !== undefined) && (
        <div className={BODY}>
          {subject !== undefined && <div className={SUBJECT}>{subject}</div>}
          {line !== undefined && <pre className={LINE}>{line}</pre>}
          {place !== undefined && <div className={PLACE}>{place}</div>}
          {children}
        </div>
      )}
      {answers && (
        <div className={ANSWERS}>
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
        </div>
      )}
    </div>
  )
}
