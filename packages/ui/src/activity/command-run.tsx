import type { ReactNode } from 'react'

import { Badge } from '../components/badge/badge.tsx'
import { StatusDot, type StatusTone } from '../components/status-dot/status-dot.tsx'
import { IconAlertTriangle } from '../icons.ts'
import { RunPlace, type RunRepository } from '../session/run-place.tsx'
import { claimOf, conflictOf, ServiceUrl } from '../workspace/service-list.tsx'
import type { PortClaim, PortConflict, Readiness } from '../workspace/services-model.ts'
import { COMMAND_TYPE_ICONS, type CommandType } from './command-type.ts'
import { Disclosure } from './disclosure.tsx'
import { TerminalOutput } from './terminal-output.tsx'

/**
 * A command Hemera runs for a Session, as the thread reads it (design D6-12, issue #237).
 *
 * A command is one process owned by Hemera, whoever started it: the agent through its tool, or
 * the reader through Run. The thread only tells what happened, so a run is one closed, quiet line
 * like the other calls — its type's icon (D8-07), its dot, its name, `exit N` once it is over,
 * and the address a server published while it serves — and nothing to press on it but its fold.
 * No badge: the icon says the type, and a one-off is written in the terminal's letters. No Stop,
 * no `Add to catalogue`: what a run offers is the line's, in the head, where the run is a chip.
 *
 * Closed by default whatever it is doing, a run that fails included: opened, it says where it
 * ran — the Project's repository with its mark, or the folder (#239), and the Workspace when it is
 * not the Session's own (D8-08) — the whole line, the address as the services of a Workspace say
 * it, a port conflict naming the other run, the variables Hemera gave it (D8-06, D8-09), and what
 * it printed.
 */

/**
 * How a run is read at a glance: the dot says how it stands, in the tones every state of the
 * application is said in, and beside it only what the dot cannot say — the code it exited with.
 * Its word is the dot's name, heard by a screen reader and shown under the pointer.
 */
const STATE: Record<CommandState, { word: string; tone: StatusTone }> = {
  running: { word: 'Running', tone: 'running' },
  finished: { word: 'Exited', tone: 'success' },
  failed: { word: 'Exited', tone: 'failure' },
  stopped: { word: 'Stopped', tone: 'cancelled' },
}

/** The code a run exited with, beside its dot, in the terminal's letters. */
const EXIT = 'shrink-0 font-mono text-xs text-muted-foreground'

/** The line that is read: the name, the state, and where it runs. */
const SUMMARY = 'flex min-w-0 items-center gap-2'

const NAME = 'min-w-0 truncate text-foreground'

/** A one-off's name, which is its line: set in the terminal's letters. */
const MONO_NAME = 'min-w-0 truncate font-mono text-xs text-foreground'

/** The address a server serves on, beside its name while it does. */
const SERVING = 'min-w-0 shrink truncate font-mono text-xs text-muted-foreground'

const TYPE_ICON = 'flex shrink-0 text-muted-foreground'

/** Where it ran, the first line of the body: the repository or the folder, and the Workspace. */
const WHERE = 'flex min-w-0 items-center gap-2 font-mono text-xs text-muted-foreground'

/** The command line itself, whole, as it was given to the shell. */
const LINE = 'min-w-0 font-mono text-xs break-all text-foreground'

/** The address the command published, and what it exited with. */
const FACTS = 'flex flex-wrap items-baseline gap-x-4 gap-y-1 pt-1 text-xs text-muted-foreground'

/** The variables Hemera gave the run, read as RunDetails reads them, and no bigger (D8-06). */
const VARIABLES = 'mt-1 flex flex-col gap-0.5 rounded-md border border-border bg-muted px-2 py-1.5'

const VARIABLE = 'flex min-w-0 gap-2 font-mono text-xs'

const KEY = 'shrink-0 text-foreground'

const SETTING = 'min-w-0 truncate text-muted-foreground'

/** Where a run stands: a process is running, over, or was stopped under it. */
export type CommandState = 'running' | 'finished' | 'failed' | 'stopped'

export interface CommandRunProps {
  /** The command's name in the catalogue, or what a one-off is called on screen. */
  name: string
  /** The command line, exactly as it was run. */
  command: string
  /** What the command is for, drawn with its fixed icon and its word (D8-07). */
  type: CommandType
  state: CommandState
  /**
   * The Project's repository it runs in, said as one with its mark (issue #239); undefined for a
   * folder that is none of the Project's repositories.
   */
  repository?: RunRepository | undefined
  /**
   * The folder it runs in: under the repository when it is in one, `.` for the repository itself;
   * relative to the Workspace otherwise, when it is inside it.
   */
  folder: string
  /** What the process has written so far, exactly as it arrived. */
  output: string
  /** The first `http://localhost:<port>` its output named, once it named one. */
  url?: string | undefined
  /**
   * Where that address stands (D8-09): a link once it has answered, text beside `starting` or
   * the minute without an answer until then.
   */
  readiness?: Readiness | undefined
  /** The variables Hemera gave the run, on top of the machine's environment (D8-06). */
  environment?: Readonly<Record<string, string>> | undefined
  /** The run holding the port this one published, named (D8-09). */
  portConflict?: PortConflict | undefined
  /** On the holder: the runs that published its port after it, each named (Decided 12). */
  heldAgainst?: readonly PortClaim[] | undefined
  /** What it exited with, once it is over. */
  exitCode?: number | undefined
  /** Whether the line was run without being in the catalogue. */
  oneOff?: boolean | undefined
  /**
   * The Workspace it runs in, named only when it is not the Session's own: a Project-scoped
   * service runs in `main` whichever Workspace asked for it (D8-07, D8-08).
   */
  workspace?: string | undefined
  /** Whether a reader who has not touched it finds it open: closed, unless a story asks. */
  defaultOpen?: boolean | undefined
  /** Opens the address the command published, which this block cannot do. */
  onOpenUrl?: ((url: string) => void) | undefined
  /** Where the block sits; never how it looks. */
  className?: string | undefined
}

export function CommandRun({
  name,
  command,
  type,
  state,
  repository,
  folder,
  output,
  url,
  readiness,
  environment = {},
  portConflict,
  heldAgainst = [],
  exitCode,
  oneOff = false,
  workspace,
  defaultOpen = false,
  onOpenUrl,
  className,
}: CommandRunProps): ReactNode {
  const shown = STATE[state]
  const TypeIcon = COMMAND_TYPE_ICONS[type]
  const running = state === 'running'
  // By code point, as RunDetails sorts them: the same order on every machine and locale.
  const variables = Object.entries(environment).toSorted(([one], [other]) =>
    one < other ? -1 : one > other ? 1 : 0,
  )
  const conflicts = [
    ...(portConflict === undefined ? [] : [conflictOf(portConflict)]),
    ...heldAgainst.map(claimOf),
  ]
  return (
    <Disclosure
      className={className}
      defaultOpen={defaultOpen}
      summary={
        <span className={SUMMARY}>
          <span className={TYPE_ICON}>
            <TypeIcon size="sm" aria-hidden="true" />
          </span>
          <StatusDot status={shown.tone} size="sm" label={shown.word} title={shown.word} />
          <span className={oneOff ? MONO_NAME : NAME}>{name}</span>
          {exitCode !== undefined && !running && state !== 'stopped' && (
            <span className={EXIT}>{`exit ${String(exitCode)}`}</span>
          )}
          {running && url !== undefined && (
            <span className={SERVING}>{url.replace(/^https?:\/\//, '')}</span>
          )}
        </span>
      }
    >
      <p className={WHERE}>
        <RunPlace repository={repository} folder={folder} />
        {workspace !== undefined && <span>{`in ${workspace}`}</span>}
      </p>
      <p className={LINE}>{command}</p>
      {url !== undefined && (
        <p className={FACTS}>
          <ServiceUrl url={url} readiness={readiness} onOpenUrl={onOpenUrl} />
        </p>
      )}
      {conflicts.map((conflict) => (
        <p key={conflict} className={FACTS}>
          <Badge tone="destructive" icon={<IconAlertTriangle size="sm" aria-hidden="true" />}>
            {conflict}
          </Badge>
        </p>
      ))}
      {variables.length > 0 && (
        <ul className={VARIABLES} aria-label="Variables given">
          {variables.map(([key, value]) => (
            <li key={key} className={VARIABLE}>
              <span className={KEY}>{key}</span>
              <span className={SETTING}>{value}</span>
            </li>
          ))}
        </ul>
      )}
      <TerminalOutput
        plain
        className="pt-1"
        terminalId={name}
        output={output}
        released={!running}
      />
    </Disclosure>
  )
}
