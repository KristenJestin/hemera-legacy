import type { ReactNode } from 'react'

import { IconBookmarkPlus } from '../icons.ts'
import { NoticeRow } from '../session/notice-row.tsx'
import { COMMAND_TYPE_ICONS, type CommandType } from './command-type.ts'
import { type NoticeAnswer, NoticeRecord } from './notice-record.tsx'

/**
 * A command the agent proposes for the catalogue, waiting for the human (D8-11), as the Session's
 * notices list it (issue #237).
 *
 * The agent has no write on the catalogue: `commands_propose` leaves an entry in the thread and
 * nothing else, and the command enters the catalogue only when a human accepts it. It is drawn as
 * every notice is (`NoticeRow`): its name, and Decline / Add, after the tile that says it is to be
 * added to the catalogue; the chevron unfolds its whole line and where it would run. Its type is
 * left to the thread's record: a second mark on the row read as a second kind. Why the agent
 * proposes it is under the pointer on the name, and in the thread's record of it.
 */

/** Where a proposal stands: waiting for the human, or answered. */
export type CommandProposalState = 'pending' | 'accepted' | 'declined'

export interface CommandProposalProps {
  /** The name it would be kept under, which is what the agent asks for afterwards. */
  name: string
  /** The line it would run, exactly as proposed. */
  line: string
  type: CommandType
  /** The folder it would run in, relative to the Workspace root; `.` for the root itself. */
  folder: string
  /** Why the agent thinks it is worth keeping, in its own words. */
  why: string
  /** Writes the command to the catalogue, which is the human's to do. */
  onAccept: () => void
  onDecline: () => void
}

export function CommandProposal({
  name,
  line,
  folder,
  why,
  onAccept,
  onDecline,
}: CommandProposalProps): ReactNode {
  return (
    <NoticeRow
      name={`Proposed command ${name}`}
      head={<span title={why}>{name}</span>}
      // Unfolded, what it is takes the name's place, and the whole line opens under it, with the
      // name it would be kept under and where it would run, when that is not the Workspace root.
      title="Add command"
      line={line}
      place={
        <>
          <span className="font-medium text-foreground">{name}</span>
          {folder !== '.' && <span>{folder}</span>}
        </>
      }
      refuse={{ label: 'Decline', onPress: onDecline }}
      accept={{ label: 'Add', onPress: onAccept }}
    />
  )
}

const STATES: Record<CommandProposalState, { answer: NoticeAnswer; word: string }> = {
  pending: { answer: 'pending', word: 'waiting' },
  accepted: { answer: 'accepted', word: 'added to the catalogue' },
  declined: { answer: 'refused', word: 'declined' },
}

const KEPT = 'flex flex-col gap-1'

const KEPT_LINE = 'font-mono text-xs break-all text-foreground'

const KEPT_WHY = 'text-sm text-muted-foreground'

export interface CommandProposalRecordProps {
  name: string
  line: string
  type: CommandType
  folder: string
  why: string
  state: CommandProposalState
}

/**
 * A proposal as the thread keeps it (issue #237): one closed line — the bookmark, a dot for the
 * answer, the type and the name — and, opened, the line where it would run and why the agent
 * proposed it. It is answered among the Session's notices, never here.
 */
export function CommandProposalRecord({
  name,
  line,
  type,
  folder,
  why,
  state,
}: CommandProposalRecordProps): ReactNode {
  const { answer, word } = STATES[state]
  const TypeIcon = COMMAND_TYPE_ICONS[type]
  return (
    <NoticeRecord
      icon={<IconBookmarkPlus size="sm" aria-hidden="true" />}
      answer={answer}
      answerLabel={word}
      subject={name}
      name={`Proposed command ${name}, ${word}`}
    >
      <div className={KEPT}>
        <p className={KEPT_LINE}>
          <span className="inline-flex pr-2 align-middle text-muted-foreground">
            <TypeIcon size="sm" aria-hidden="true" />
          </span>
          {`${folder} $ ${line}`}
        </p>
        <p className={KEPT_WHY}>{why}</p>
      </div>
    </NoticeRecord>
  )
}
