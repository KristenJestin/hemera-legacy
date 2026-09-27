import { cn } from 'cn'
import { type ReactNode, useState } from 'react'

import { Badge } from '../components/badge/badge.tsx'
import { Button } from '../components/button/button.tsx'
import { CardRow } from '../components/card/card.tsx'
import { Input } from '../components/field/field.tsx'
import { IconPlayerPlay, IconPlayerStop } from '../icons.ts'
import { ServiceList } from '../workspace/service-list.tsx'
import type { ServiceLine } from '../workspace/services-model.ts'
import { CommandRun, type CommandRunProps } from '../activity/command-run.tsx'

/**
 * The commands of a Session, in one place (design D6-12).
 *
 * Every command Hemera runs for a Session is watched from here, whoever started it: the agent
 * through `commands_run`, or the reader on the last line of the panel. That is the point of the
 * panel — a server the agent started is a process the reader can see, read and stop without
 * asking the agent anything, and the address it published is one press away.
 *
 * A one-off line is run here and shows here as a run like any other, and it does not enter the
 * catalogue by itself: what a Project keeps is the reader's decision, taken in the Project's
 * settings, not a side effect of typing in this box.
 *
 * The panel draws no run of its own: each line is the same block the thread shows, so what the
 * reader learns here is what they will read there.
 */

/** One run, as the panel lists it: the block's own props, and the id that names it. */
export type CommandPanelRun = Omit<
  CommandRunProps,
  'onOpenUrl' | 'onStop' | 'defaultOpen' | 'className'
> & {
  /** What stops it and what the panel keys it by. */
  id: string
}

/** A command of the Project's catalogue, as the panel offers it: run by its name. */
export interface CatalogueCommandLine {
  readonly name: string
  /** What it runs, shown under its name. */
  readonly line: string
}

export interface CommandsPanelProps {
  /** The runs of this Session, the oldest first, as the engine keeps them. */
  runs: readonly CommandPanelRun[]
  /** Stops one of them, which is the reader's one action on a run. */
  onStop?: ((id: string) => void) | undefined
  /** Opens the address a run published, which this block cannot do. */
  onOpenUrl?: ((url: string) => void) | undefined
  /** Runs a line that is not in the catalogue, inside the Workspace root. */
  onRun?: ((line: string) => void) | undefined
  /**
   * The Project's catalogue, each command a row with its Run (#217): what a reader came to run,
   * found here rather than typed by name on the line. Absent, no catalogue is listed.
   */
  catalogue?: readonly CatalogueCommandLine[] | undefined
  /** Runs a command of the catalogue by its name. */
  onRunCommand?: ((name: string) => void) | undefined
  /**
   * The services of the Session's Workspace, whoever started them, with their state and address
   * (#217). Absent, no services are listed.
   */
  services?: readonly ServiceLine[] | undefined
  /** Stops one of those services, and only that instance. */
  onStopService?: ((id: string) => void) | undefined
  /** Where the panel sits; never how it looks. */
  className?: string | undefined
}

const PANEL = 'flex w-full flex-col gap-2'

const HEAD = 'flex items-center gap-2'

const TITLE = 'text-sm text-foreground'

const LIST = 'flex flex-col gap-2'

/** What a Session that has run nothing says, rather than an empty box. */
const NOTHING = 'text-sm text-muted-foreground'

/** The line a reader types a command on, and what it is worth knowing before they do. */
const ONCE = 'text-xs text-muted-foreground'

const COMMAND_TEXT = 'flex min-w-0 flex-1 flex-col gap-0.5'

const COMMAND_NAME = 'min-w-0 truncate text-sm text-foreground'

const COMMAND_LINE = 'min-w-0 truncate font-mono text-xs text-muted-foreground'

export function CommandsPanel({
  runs,
  onStop,
  onOpenUrl,
  onRun,
  catalogue,
  onRunCommand,
  services,
  onStopService,
  className,
}: CommandsPanelProps): ReactNode {
  const [line, setLine] = useState('')
  const running = runs.filter((run) => run.state === 'running').length
  const empty = line.trim() === ''
  return (
    <section className={cn(PANEL, className)} aria-label="Commands">
      <div className={HEAD}>
        <span className={TITLE}>Commands</span>
        <Badge tone={running > 0 ? 'info' : 'neutral'}>
          {running > 0 ? `${running} running` : `${runs.length}`}
        </Badge>
      </div>
      {catalogue === undefined ? null : catalogue.length === 0 ? (
        <p className={NOTHING}>No command in the catalogue. Add one in the Project's settings.</p>
      ) : (
        <ul className={LIST} aria-label="Catalogue">
          {catalogue.map((command) => {
            // A command of the catalogue running in this Session offers Stop in place of Run: a
            // second instance is not what a reader pressing its row again is asking for.
            const live = runs.findLast(
              (run) => run.name === command.name && run.state === 'running',
            )
            return (
              <li key={command.name}>
                <CardRow>
                  <span className={COMMAND_TEXT}>
                    <span className={COMMAND_NAME}>{command.name}</span>
                    <span className={COMMAND_LINE}>{command.line}</span>
                  </span>
                  {live === undefined ? (
                    <Button
                      variant="secondary"
                      size="sm"
                      aria-label={`Run ${command.name}`}
                      disabled={onRunCommand === undefined}
                      onClick={() => onRunCommand?.(command.name)}
                    >
                      <IconPlayerPlay size="sm" />
                      Run
                    </Button>
                  ) : (
                    <Button
                      variant="secondary"
                      size="sm"
                      aria-label={`Stop ${command.name}`}
                      disabled={onStop === undefined}
                      onClick={() => onStop?.(live.id)}
                    >
                      <IconPlayerStop size="sm" />
                      Stop
                    </Button>
                  )}
                </CardRow>
              </li>
            )
          })}
        </ul>
      )}
      <Input
        label="Run a line"
        placeholder="pnpm test --watch"
        value={line}
        onValueChange={setLine}
        action={
          <Button
            variant="secondary"
            size="sm"
            disabled={empty || onRun === undefined}
            onClick={() => {
              if (onRun === undefined || empty) return
              onRun(line.trim())
              setLine('')
            }}
          >
            Run
          </Button>
        }
      />
      <p className={ONCE}>
        A one-off line runs inside the Workspace root and does not enter the catalogue.
      </p>
      {runs.length === 0 ? (
        <p className={NOTHING}>No command has run in this Session.</p>
      ) : (
        <ul className={LIST}>
          {runs.map((run) => (
            <li key={run.id}>
              <CommandRun
                {...run}
                onOpenUrl={onOpenUrl}
                onStop={onStop === undefined ? undefined : () => onStop(run.id)}
              />
            </li>
          ))}
        </ul>
      )}
      {services === undefined ? null : (
        <ServiceList services={services} onStop={onStopService} onOpenUrl={onOpenUrl} />
      )}
    </section>
  )
}
