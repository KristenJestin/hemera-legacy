import { cn } from 'cn'
import type { ReactNode } from 'react'

import { IconButton } from '../components/button/button.tsx'
import { Tooltip } from '../components/tooltip/tooltip.tsx'
import { IconBookmarkPlus, IconCheck, IconX } from '../icons.ts'
import { COMMAND_TYPE_ICONS, type CommandType } from './command-type.ts'
import { type NoticeAnswer, NoticeRecord } from './notice-record.tsx'

/**
 * A command the agent proposes for the catalogue, waiting for the human (D8-11), as the Session's
 * notices list it (issue #237).
 *
 * The agent has no write on the catalogue: `commands_propose` leaves an entry in the thread and
 * nothing else, and the command enters the catalogue only when a human accepts it. One row says
 * what would be kept — the type with its fixed icon, the name, where it would run when that is not
 * the Workspace root, and the line, wrapped where it is so what is accepted is read whole — and
 * the two answers, as marks: a row of proposals is answered one mark at a time, and a pair of
 * word-buttons a row made six proposals a wall of buttons. Why the agent proposes it is under the
 * pointer on the name, and in the thread's record of it, which is also where the answer stays.
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
  /** Where the row sits; never how it looks. */
  className?: string | undefined
}

const ROW = 'flex min-w-0 items-start gap-2 text-sm'

const MARK = 'flex h-control-sm shrink-0 items-center text-muted-foreground'

const WHAT = 'flex min-w-0 flex-1 flex-wrap items-baseline gap-x-2 py-1.5'

const NAME = 'shrink-0 font-medium text-foreground'

const FOLDER = 'shrink-0 font-mono text-xs text-muted-foreground'

const LINE = 'min-w-0 font-mono text-xs break-all text-muted-foreground'

const ANSWERS = 'flex shrink-0 items-center'

export function CommandProposal({
  name,
  line,
  type,
  folder,
  why,
  onAccept,
  onDecline,
  className,
}: CommandProposalProps): ReactNode {
  const TypeIcon = COMMAND_TYPE_ICONS[type]
  return (
    <div role="group" aria-label={`Proposed command ${name}`} className={cn(ROW, className)}>
      <span className={MARK}>
        <TypeIcon size="sm" aria-hidden="true" />
      </span>
      <span className={WHAT}>
        <span className={NAME} title={why}>
          {name}
        </span>
        {folder !== '.' && <span className={FOLDER}>{folder}</span>}
        <span className={LINE}>{line}</span>
      </span>
      <span className={ANSWERS}>
        <Tooltip label="Decline">
          <IconButton
            variant="ghost"
            size="sm"
            icon={<IconX size="sm" />}
            aria-label={`Decline ${name}`}
            onClick={onDecline}
          />
        </Tooltip>
        <Tooltip label="Accept">
          <IconButton
            variant="ghost"
            size="sm"
            icon={<IconCheck size="sm" />}
            aria-label={`Accept ${name}`}
            onClick={onAccept}
          />
        </Tooltip>
      </span>
    </div>
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
