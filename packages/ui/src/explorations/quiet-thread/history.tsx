import type { ReactNode } from 'react'

import { COMMAND_TYPE_ICONS } from '../../activity/command-type.ts'
import { Disclosure } from '../../activity/disclosure.tsx'
import { StatusDot } from '../../components/status-dot/status-dot.tsx'
import { IconRobot, IconTerminal2, IconUser } from '../../icons.ts'
import { type GoingOnRun, type GoingOnShell, goingOnStateOf } from '../../session/going-on.ts'
import { GOING_ON_TONES, GoingOnOutput } from '../../session/going-on-details.tsx'
import type { Held } from './fixtures.ts'
import { AgainOrStop, exitOf, ICON, QUIET_MONO, toneOf } from './parts.tsx'

/**
 * The history of what the Session ran (point 8 of #237), which the ⓘ details keep whole while the
 * line only shows what matters now: every run, the agent's and the reader's, and the lines the
 * agent ran in its own shell, in the order they began. A row says when, what, how it stands, what
 * it exited with and who started it, and holds Run again or Stop (point 11); opened, where it ran
 * and what it printed.
 */

/** One line of the history: a run Hemera held, or a line of the agent's own shell. */
export type Trace = { kind: 'run'; held: Held } | { kind: 'shell'; shell: GoingOnShell }

/** Every run and every line of the agent's shell, in the order they began. */
export function traceOf(runs: readonly Held[], shells: readonly GoingOnShell[]): Trace[] {
  const all: { at: string; trace: Trace }[] = [
    ...runs.map((held) => ({ at: held.run.at, trace: { kind: 'run', held } as const })),
    ...shells.map((shell) => ({ at: shell.at, trace: { kind: 'shell', shell } as const })),
  ]
  return all.toSorted((one, other) => one.at.localeCompare(other.at)).map(({ trace }) => trace)
}

const SUMMARY = 'flex min-w-0 flex-1 items-center gap-2'

const AT = 'w-10 shrink-0 font-mono text-xs text-muted-foreground'

const NAME = 'min-w-0 truncate'

const MONO = 'min-w-0 truncate font-mono text-xs'

const WHERE = 'min-w-0 truncate font-mono text-xs text-muted-foreground'

/** Who started it, as a mark: the reader, the agent through Hemera, or the agent's own shell. */
function Who({ by }: { by: 'user' | 'agent' | 'shell' }): ReactNode {
  const said = { user: 'by you', agent: 'by the agent', shell: 'by the agent, in its own shell' }[
    by
  ]
  return (
    <span role="img" aria-label={said} className={ICON}>
      {by === 'user' ? (
        <IconUser size="sm" aria-hidden="true" />
      ) : (
        <IconRobot size="sm" aria-hidden="true" />
      )}
    </span>
  )
}

export interface HistoryActions {
  onRunAgain: (run: GoingOnRun) => void
  onStop: (run: GoingOnRun) => void
}

/** A run of the history, closed: its row, and what it printed once opened. */
export function HistoryRun({
  run,
  actions,
  bare = false,
}: {
  run: GoingOnRun
  actions: HistoryActions
  /** Whether its name is left out, under the command of the catalogue it is a run of. */
  bare?: boolean | undefined
}): ReactNode {
  const TypeIcon = COMMAND_TYPE_ICONS[run.type]
  const tone = toneOf(run)
  const exit = exitOf(run)
  return (
    <Disclosure
      holdsPress
      summary={
        <span className={SUMMARY}>
          <span className={AT}>{run.at}</span>
          {!bare && (
            <span className={ICON}>
              <TypeIcon size="sm" aria-hidden="true" />
            </span>
          )}
          <StatusDot status={tone} size="sm" label={tone} />
          {!bare && <span className={run.oneOff === true ? MONO : NAME}>{run.name}</span>}
          {exit !== null && <span className={QUIET_MONO}>{exit}</span>}
          <Who by={run.startedBy} />
          <span className="pointer-events-auto ml-auto flex shrink-0 items-center">
            <AgainOrStop run={run} onRunAgain={actions.onRunAgain} onStop={actions.onStop} />
          </span>
        </span>
      }
    >
      <div className="flex flex-col gap-1">
        <span className={WHERE}>{`${run.folder} $ ${run.command}`}</span>
        <GoingOnOutput item={run} />
      </div>
    </Disclosure>
  )
}

/** A line of the agent's own shell: Hemera holds nothing of it to stop or run again. */
export function HistoryShell({ shell }: { shell: GoingOnShell }): ReactNode {
  const exit = exitOf(shell)
  const state = goingOnStateOf(shell)
  return (
    <Disclosure
      summary={
        <span className={SUMMARY}>
          <span className={AT}>{shell.at}</span>
          <span className={ICON}>
            <IconTerminal2 size="sm" aria-hidden="true" />
          </span>
          <StatusDot status={GOING_ON_TONES[state]} size="sm" label={state} />
          <span className={MONO}>{shell.command}</span>
          {exit !== null && <span className={QUIET_MONO}>{exit}</span>}
          <Who by="shell" />
        </span>
      }
    >
      <div className="flex flex-col gap-1">
        <span className={WHERE}>{`${shell.folder} $ ${shell.command}`}</span>
        <GoingOnOutput item={shell} />
      </div>
    </Disclosure>
  )
}

/** The whole history, in the order things began. */
export function CommandHistory({
  trace,
  actions,
}: {
  trace: readonly Trace[]
  actions: HistoryActions
}): ReactNode {
  return (
    <ol aria-label="What this Session ran" className="flex flex-col gap-0.5">
      {trace.map((one) => (
        <li key={one.kind === 'run' ? one.held.run.id : one.shell.id}>
          {one.kind === 'run' ? (
            <HistoryRun run={one.held.run} actions={actions} />
          ) : (
            <HistoryShell shell={one.shell} />
          )}
        </li>
      ))}
    </ol>
  )
}
