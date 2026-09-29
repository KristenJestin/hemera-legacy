import type { ReactNode } from 'react'

import { COMMAND_TYPE_ICONS } from '../activity/command-type.ts'
import { Disclosure } from '../activity/disclosure.tsx'
import { IconButton } from '../components/button/button.tsx'
import { StatusDot } from '../components/status-dot/status-dot.tsx'
import { Tooltip } from '../components/tooltip/tooltip.tsx'
import { IconPlayerStop, IconRefresh, IconRobot, IconTerminal2, IconUser } from '../icons.ts'
import { type GoingOnRun, type GoingOnShell, goingOnStateOf } from './going-on.ts'
import { GOING_ON_TONES, GOING_ON_WORDS, GoingOnOutput } from './going-on-details.tsx'
import { RunPlace } from './run-place.tsx'

/**
 * The history of what a Session ran (issue #237): the line under the title shows what matters
 * now, and the ⓘ details keep the whole trace — every run Hemera held, the agent's and the
 * reader's, and every line the agent ran in its own shell, in the order they began.
 *
 * A row says when it began, what it is, how it stands, what it exited with and who started it —
 * the reader, the agent through Hemera, or the agent in its own shell — and, for a run Hemera
 * holds, Run again or Stop while it runs, in the place a chip's glance has them. Opened, it says
 * where it ran, the whole line and what it printed. Nothing can be stopped or run again of the
 * agent's own shell: Hemera holds no process of it.
 */

export type HistoryItem = GoingOnRun | GoingOnShell

export interface SessionHistoryProps {
  /** What the Session ran, in the order it began. */
  items: readonly HistoryItem[]
  onRunAgain: (run: GoingOnRun) => void
  onStop: (run: GoingOnRun) => void
}

const LIST = 'flex flex-col gap-0.5'

const SUMMARY = 'flex min-w-0 flex-1 items-center gap-2'

const AT = 'w-10 shrink-0 font-mono text-xs text-muted-foreground'

const ICON = 'flex shrink-0 text-muted-foreground'

const NAME = 'min-w-0 truncate'

const MONO = 'min-w-0 truncate font-mono text-xs'

const EXIT = 'shrink-0 font-mono text-xs text-muted-foreground'

const TOOLS = 'pointer-events-auto ml-auto flex shrink-0 items-center'

const BODY = 'flex flex-col gap-1'

const WHERE = 'flex min-w-0 items-center gap-2 font-mono text-xs text-muted-foreground'

const LINE = 'min-w-0 font-mono text-xs break-all text-foreground'

const NOTHING = 'pt-1 text-sm text-muted-foreground'

/** Who started it, said by its mark and heard by its name. */
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

/** What stands after its name once it is over: the code it exited with. */
function exitOf(item: HistoryItem): string | null {
  if (goingOnStateOf(item) === 'running' || item.exitCode === undefined) return null
  if (item.kind === 'run' && item.state === 'stopped') return null
  return `exit ${String(item.exitCode)}`
}

/** Run again, or Stop while it runs: a run's one press, where its glance has it. */
function AgainOrStop({
  run,
  onRunAgain,
  onStop,
}: {
  run: GoingOnRun
  onRunAgain: (run: GoingOnRun) => void
  onStop: (run: GoingOnRun) => void
}): ReactNode {
  const running = run.state === 'running'
  return (
    <Tooltip label={running ? 'Stop' : 'Run again'}>
      <IconButton
        variant="ghost"
        size="sm"
        icon={running ? <IconPlayerStop size="sm" /> : <IconRefresh size="sm" />}
        aria-label={running ? `Stop ${run.name}` : `Run ${run.name} again`}
        onClick={() => (running ? onStop(run) : onRunAgain(run))}
      />
    </Tooltip>
  )
}

/** One row of the history, closed: its line, and what it ran once opened. */
function HistoryRow({
  item,
  onRunAgain,
  onStop,
}: {
  item: HistoryItem
  onRunAgain: (run: GoingOnRun) => void
  onStop: (run: GoingOnRun) => void
}): ReactNode {
  const state = goingOnStateOf(item)
  const tone = item.kind === 'run' && item.state === 'stopped' ? 'cancelled' : GOING_ON_TONES[state]
  const word = item.kind === 'run' && item.state === 'stopped' ? 'stopped' : GOING_ON_WORDS[state]
  const exit = exitOf(item)
  const TypeIcon = item.kind === 'run' ? COMMAND_TYPE_ICONS[item.type] : IconTerminal2
  const mono = item.kind === 'shell' || item.oneOff === true
  const name = item.kind === 'run' ? item.name : item.command
  return (
    <Disclosure
      holdsPress={item.kind === 'run'}
      summary={
        <span className={SUMMARY}>
          <span className={AT}>{item.at}</span>
          <span className={ICON}>
            <TypeIcon size="sm" aria-hidden="true" />
          </span>
          <StatusDot status={tone} size="sm" label={word} />
          <span className={mono ? MONO : NAME}>{name}</span>
          {exit !== null && <span className={EXIT}>{exit}</span>}
          <Who by={item.kind === 'shell' ? 'shell' : item.startedBy} />
          {item.kind === 'run' && (
            <span className={TOOLS}>
              <AgainOrStop run={item} onRunAgain={onRunAgain} onStop={onStop} />
            </span>
          )}
        </span>
      }
    >
      <div className={BODY}>
        <p className={WHERE}>
          {item.kind === 'run' ? (
            <RunPlace repository={item.repository} folder={item.folder} />
          ) : (
            item.folder
          )}
          <span>{`in ${item.workspace}`}</span>
        </p>
        <p className={LINE}>{item.command}</p>
        <GoingOnOutput item={item} />
      </div>
    </Disclosure>
  )
}

export function SessionHistory({ items, onRunAgain, onStop }: SessionHistoryProps): ReactNode {
  if (items.length === 0) return <p className={NOTHING}>Nothing was run in this Session yet.</p>
  return (
    <ol aria-label="What this Session ran" className={LIST}>
      {items.map((item) => (
        <li key={item.id}>
          <HistoryRow item={item} onRunAgain={onRunAgain} onStop={onStop} />
        </li>
      ))}
    </ol>
  )
}
