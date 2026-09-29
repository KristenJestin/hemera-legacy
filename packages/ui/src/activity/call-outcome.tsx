import type { ReactNode } from 'react'

import { DecisionSummary } from '../approval/decision-summary.tsx'
import { StatusDot, type StatusTone } from '../components/status-dot/status-dot.tsx'
import { IconBookmarkPlus, IconShield } from '../icons.ts'
import type { CommandProposalState } from './command-proposal.tsx'
import type { CommandState } from './command-run.tsx'
import { TerminalOutput } from './terminal-output.tsx'

/**
 * What became of one of Hemera's calls, said on the call's own line (review of #250): the thread
 * keeps one entry for a call and not three. A run the call asked for is its dot and `exit N`; the
 * permission it waited on is a shield in the tone of the answer; a command it proposed is a
 * bookmark in the tone of the human's decision. Each mark is named by its word, heard and never
 * read; what they are about is in the call's body.
 */

/** How the permission a call waited on was answered, or that it ran without asking. */
export type CallPermission = 'pending' | 'allowed' | 'refused' | 'stopped' | 'unasked'

export interface CallOutcomeProps {
  permission?: CallPermission | undefined
  run?: { state: CommandState; exitCode?: number | undefined } | undefined
  proposal?: CommandProposalState | undefined
}

const OUTCOME = 'flex shrink-0 items-center gap-1.5'

const SHIELDS: Record<CallPermission, { word: string; tone: string }> = {
  pending: { word: 'waiting for your permission', tone: 'flex text-warning-muted-foreground' },
  allowed: { word: 'allowed once', tone: 'flex text-success-muted-foreground' },
  refused: { word: 'refused', tone: 'flex text-destructive-muted-foreground' },
  stopped: { word: 'left unanswered', tone: 'flex text-muted-foreground' },
  unasked: { word: 'ran without asking', tone: 'flex text-muted-foreground' },
}

const BOOKMARKS: Record<CommandProposalState, { word: string; tone: string }> = {
  pending: { word: 'waiting to be added', tone: 'flex text-warning-muted-foreground' },
  accepted: { word: 'added to the catalogue', tone: 'flex text-success-muted-foreground' },
  declined: { word: 'declined', tone: 'flex text-muted-foreground' },
}

const RUNS: Record<CommandState, { word: string; tone: StatusTone }> = {
  running: { word: 'running', tone: 'running' },
  finished: { word: 'exited', tone: 'success' },
  failed: { word: 'exited', tone: 'failure' },
  stopped: { word: 'stopped', tone: 'cancelled' },
}

const EXIT = 'font-mono text-xs text-muted-foreground'

export function CallOutcome({ permission, run, proposal }: CallOutcomeProps): ReactNode {
  if (permission === undefined && run === undefined && proposal === undefined) return null
  return (
    <span className={OUTCOME}>
      {permission !== undefined && (
        <span role="img" aria-label={SHIELDS[permission].word} className={SHIELDS[permission].tone}>
          <IconShield size="sm" aria-hidden="true" />
        </span>
      )}
      {proposal !== undefined && (
        <span role="img" aria-label={BOOKMARKS[proposal].word} className={BOOKMARKS[proposal].tone}>
          <IconBookmarkPlus size="sm" aria-hidden="true" />
        </span>
      )}
      {run !== undefined && (
        <>
          <StatusDot status={RUNS[run.state].tone} size="sm" label={RUNS[run.state].word} />
          {run.exitCode !== undefined && run.state !== 'running' && run.state !== 'stopped' && (
            <span className={EXIT}>{`exit ${String(run.exitCode)}`}</span>
          )}
        </>
      )}
    </span>
  )
}

export interface CallOutcomeDetailsProps {
  /** The answer the permission was given, and when. */
  decision?: { answer: string; at: string; refused: boolean } | undefined
  /** What the run printed. */
  output?: { id: string; text: string; released: boolean } | undefined
  /** The command proposed: where it would run, its line, and why. */
  proposal?: { line: string; folder: string; why: string } | undefined
}

const DETAILS = 'flex flex-col gap-1 pt-1'

const PROPOSED_LINE = 'font-mono text-xs break-all text-foreground'

const WHY = 'text-sm text-muted-foreground'

/** What became of a call, read once it is opened: the answer given, what ran, what was proposed. */
export function CallOutcomeDetails({
  decision,
  output,
  proposal,
}: CallOutcomeDetailsProps): ReactNode {
  if (decision === undefined && output === undefined && proposal === undefined) return null
  return (
    <div className={DETAILS}>
      {decision !== undefined && (
        <DecisionSummary answer={decision.answer} at={decision.at} refused={decision.refused} />
      )}
      {proposal !== undefined && (
        <>
          <p className={PROPOSED_LINE}>{`${proposal.folder} $ ${proposal.line}`}</p>
          <p className={WHY}>{proposal.why}</p>
        </>
      )}
      {output !== undefined && (
        <TerminalOutput
          plain
          terminalId={output.id}
          output={output.text}
          released={output.released}
        />
      )}
    </div>
  )
}
