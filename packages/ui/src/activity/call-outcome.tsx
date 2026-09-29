import type { ReactNode } from 'react'

import { StatusDot, type StatusTone } from '../components/status-dot/status-dot.tsx'
import { IconBookmarkPlus, IconShield } from '../icons.ts'
import type { CommandProposalState } from './command-proposal.tsx'
import type { CommandState } from './command-run.tsx'

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
