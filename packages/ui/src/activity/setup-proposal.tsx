import type { ReactNode } from 'react'

import { IconListCheck } from '../icons.ts'
import { NoticeRow } from '../session/notice-row.tsx'
import { type NoticeAnswer, NoticeRecord } from './notice-record.tsx'

/**
 * A change to the Project's setup the agent proposes, waiting for the human (#218), as the
 * Session's notices list it.
 *
 * The agent reads the setup freely and changes nothing of it: `setup_propose` leaves one entry in
 * the thread per change, and the change is applied only when a human accepts it — through the very
 * use case the Project settings call. It is drawn as every notice is (`NoticeRow`): what it is
 * about, and Decline / Accept, after the setup's tile; the chevron unfolds its verb in that place —
 * "Add service", "Add variable" — the line it would run, and every other field it would write.
 * The changes waiting together are accepted in one press by the group's Accept all.
 *
 * A variable's value is never one of the fields: the row says it would be set, and nothing more
 * (Decided 2 of #218).
 */

/** Where a proposal stands: waiting for the human, or answered. */
export type SetupProposalState = 'pending' | 'accepted' | 'declined'

/** One field the change would write. */
export interface SetupProposalDetail {
  label: string
  value: string
}

export interface SetupProposalProps {
  /** What accepting it does: `Add service`, `Add variable`, `Clean up Workspace`. */
  verb: string
  /** What it is about: a command's name, a repository's path, a variable's name. */
  subject: string
  /** Whether the subject is a path, set in the terminal's letters. */
  mono?: boolean | undefined
  /** The line a command or a step would run, whole. */
  line?: string | undefined
  /** Every other field it would write, in the order the settings show them. */
  details: readonly SetupProposalDetail[]
  /** Why the agent proposes it, in its own words: under the pointer on the subject. */
  why: string
  /** Applies the change, which is the human's to do. */
  onAccept: () => void
  onDecline: () => void
}

const DETAIL_LABEL = 'text-muted-foreground'

const DETAIL_VALUE = 'font-mono text-foreground'

/** The fields, as one small line under the line to run. */
function Details({ details }: { details: readonly SetupProposalDetail[] }): ReactNode {
  return details.map((detail) => (
    <span key={detail.label}>
      <span className={DETAIL_LABEL}>{`${detail.label} `}</span>
      <span className={DETAIL_VALUE}>{detail.value}</span>
    </span>
  ))
}

export function SetupProposal({
  verb,
  subject,
  mono = false,
  line,
  details,
  why,
  onAccept,
  onDecline,
}: SetupProposalProps): ReactNode {
  return (
    <NoticeRow
      name={`Proposed change ${verb} ${subject}`}
      head={<span title={why}>{subject}</span>}
      mono={mono}
      title={verb}
      line={line}
      place={details.length === 0 ? undefined : <Details details={details} />}
      refuse={{ label: 'Decline', onPress: onDecline }}
      accept={{ label: 'Accept', onPress: onAccept }}
    />
  )
}

/** A proposal's answer, as the thread says it: its dot, and the dot's word. */
export const SETUP_ANSWERS: Record<SetupProposalState, { answer: NoticeAnswer; word: string }> = {
  pending: { answer: 'pending', word: 'waiting' },
  accepted: { answer: 'accepted', word: 'applied' },
  declined: { answer: 'refused', word: 'declined' },
}

const KEPT = 'flex flex-col gap-1'

const KEPT_LINE = 'font-mono text-xs break-all text-foreground'

const KEPT_DETAILS = 'flex flex-wrap gap-x-3 gap-y-1 text-xs'

const KEPT_WHY = 'text-sm text-muted-foreground'

export interface SetupProposalRecordProps {
  verb: string
  subject: string
  mono?: boolean | undefined
  line?: string | undefined
  details: readonly SetupProposalDetail[]
  why: string
  state: SetupProposalState
}

/**
 * A proposed change as the thread keeps it when the call that proposed it is not in the thread:
 * one closed line — the setup's mark, a dot for the answer, the verb and what it is about — and,
 * opened, what it would write and why. It is answered among the Session's notices, never here.
 */
export function SetupProposalRecord({
  verb,
  subject,
  mono = false,
  line,
  details,
  why,
  state,
}: SetupProposalRecordProps): ReactNode {
  const { answer, word } = SETUP_ANSWERS[state]
  return (
    <NoticeRecord
      icon={<IconListCheck size="sm" aria-hidden="true" />}
      answer={answer}
      answerLabel={word}
      label={verb}
      subject={subject}
      mono={mono}
      name={`Proposed change ${verb} ${subject}, ${word}`}
    >
      <div className={KEPT}>
        {line !== undefined && <p className={KEPT_LINE}>{line}</p>}
        {details.length > 0 && (
          <p className={KEPT_DETAILS}>
            <Details details={details} />
          </p>
        )}
        <p className={KEPT_WHY}>{why}</p>
      </div>
    </NoticeRecord>
  )
}
