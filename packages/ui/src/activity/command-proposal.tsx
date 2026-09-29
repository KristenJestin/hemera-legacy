import type { ReactNode } from 'react'

import { IconBookmarkPlus } from '../icons.ts'
import { NoticeCard } from '../session/notice-card.tsx'
import { COMMAND_TYPE_ICONS, type CommandType } from './command-type.ts'
import { type NoticeAnswer, NoticeRecord } from './notice-record.tsx'

/**
 * A command the agent proposes for the catalogue, waiting for the human (D8-11), as the Session's
 * notices list it (issue #237).
 *
 * The agent has no write on the catalogue: `commands_propose` leaves an entry in the thread and
 * nothing else, and the command enters the catalogue only when a human accepts it. It is drawn as
 * every notice is (`NoticeCard`), under its group's "Add to the catalogue": the type with its fixed
 * icon and the name, the line whole, where it would run, and Decline / Add. Why the agent proposes it is under
 * the pointer on the name, and in the thread's record of it, which is also where the answer stays.
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

const NAME = 'font-medium'

export function CommandProposal({
  name,
  line,
  type,
  folder,
  why,
  onAccept,
  onDecline,
}: CommandProposalProps): ReactNode {
  const TypeIcon = COMMAND_TYPE_ICONS[type]
  return (
    <NoticeCard
      name={`Proposed command ${name}`}
      subject={
        <>
          <span className="flex shrink-0 text-muted-foreground">
            <TypeIcon size="sm" aria-hidden="true" />
          </span>
          <span className={NAME} title={why}>
            {name}
          </span>
        </>
      }
      line={line}
      // Where it would run, when it is not the Workspace root, where every line runs.
      place={folder === '.' ? undefined : folder}
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
