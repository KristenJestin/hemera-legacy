import { type ReactNode, useState } from 'react'

import { COMMAND_TYPE_ICONS } from '../activity/command-type.ts'
import { Button, IconButton } from '../components/button/button.tsx'
import type { PathEntry, PathListing } from '../components/suggest/path-input.tsx'
import { StatusDot } from '../components/status-dot/status-dot.tsx'
import { Tooltip } from '../components/tooltip/tooltip.tsx'
import { IconPencil, IconPlayerPlay, IconPlus, IconTrash } from '../icons.ts'
import { CommandDialog } from '../project/command-dialog.tsx'
import type { CommandLine, RepositoryLine } from '../project/model.ts'

/**
 * The Project's catalogue inside the Session (issue #237): read, run, added to, changed and taken
 * from without leaving the Session — a tab of its ⓘ details. A row is the command — its type, its
 * name, its line, a dot while it runs — and its three presses as icons; Add and the pencil open the
 * catalogue's own dialog, the one Project settings open, over the Session.
 */

export interface SessionCatalogueProps {
  commands: readonly CommandLine[]
  /** The names of the commands that run now in this Session. */
  running: readonly string[]
  /** The Project's repositories, which a command's folder may start from. */
  repositories: readonly RepositoryLine[]
  /** Whether `portless` is on this machine (D8-10). */
  portlessInstalled: boolean
  /** The Project's name, whose slug Portless is offered first. */
  projectName: string
  /** Runs the command, as Run does. */
  onRun: (command: CommandLine) => void
  /** Adds a command, and answers why it could not, or nothing. */
  onAdd: (command: CommandLine) => Promise<string | null>
  /** Rewrites the command of the same name, and answers why it could not, or nothing. */
  onUpdate: (command: CommandLine) => Promise<string | null>
  onRemove: (command: CommandLine) => void
  /** Lists one folder under the base a command runs from; null for the Workspace root. */
  onListFolder?: ((listing: PathListing) => Promise<readonly PathEntry[]>) | undefined
}

const LIST = 'flex flex-col gap-0.5'

const ROW = 'flex min-w-0 items-center gap-2 rounded-md px-2 py-1 text-sm hover:bg-accent'

const ICON = 'flex shrink-0 text-muted-foreground'

const NAME = 'shrink-0 font-medium'

const LINE = 'min-w-0 flex-1 truncate font-mono text-xs text-muted-foreground'

const TOOLS = 'flex shrink-0 items-center'

const FOOT = 'flex pt-1'

const NOTHING = 'px-2 pt-1 text-sm text-muted-foreground'

/** An icon press of a row, named by its tooltip. */
function Act({
  label,
  tip,
  onPress,
  children,
}: {
  label: string
  tip: string
  onPress: () => void
  children: ReactNode
}): ReactNode {
  return (
    <Tooltip label={tip}>
      <IconButton variant="ghost" size="sm" icon={children} aria-label={label} onClick={onPress} />
    </Tooltip>
  )
}

export function SessionCatalogue({
  commands,
  running,
  repositories,
  portlessInstalled,
  projectName,
  onRun,
  onAdd,
  onUpdate,
  onRemove,
  onListFolder,
}: SessionCatalogueProps): ReactNode {
  // The command the dialog edits, or null when it adds one; kept while the dialog closes, so it
  // does not change its title on its way out.
  const [editing, setEditing] = useState<CommandLine | null>(null)
  const [open, setOpen] = useState(false)
  const edit = (command: CommandLine | null): void => {
    setEditing(command)
    setOpen(true)
  }
  return (
    <div className="flex flex-col gap-0.5">
      {commands.length === 0 ? (
        <p className={NOTHING}>The catalogue holds no command yet.</p>
      ) : (
        <ul aria-label="The catalogue" className={LIST}>
          {commands.map((command) => {
            const TypeIcon = COMMAND_TYPE_ICONS[command.type]
            return (
              <li key={command.id} className={ROW}>
                <span className={ICON}>
                  <TypeIcon size="sm" aria-hidden="true" />
                </span>
                <span className={NAME}>{command.name}</span>
                <span className={LINE} title={command.command}>
                  {command.command}
                </span>
                {running.includes(command.name) && (
                  <StatusDot status="running" size="sm" label="running" />
                )}
                <span className={TOOLS}>
                  <Act label={`Run ${command.name}`} tip="Run" onPress={() => onRun(command)}>
                    <IconPlayerPlay size="sm" />
                  </Act>
                  <Act label={`Edit ${command.name}`} tip="Edit" onPress={() => edit(command)}>
                    <IconPencil size="sm" />
                  </Act>
                  <Act
                    label={`Remove ${command.name} from the catalogue`}
                    tip="Remove"
                    onPress={() => onRemove(command)}
                  >
                    <IconTrash size="sm" />
                  </Act>
                </span>
              </li>
            )
          })}
        </ul>
      )}
      <div className={FOOT}>
        <Button variant="ghost" size="sm" onClick={() => edit(null)}>
          <IconPlus size="sm" />
          Add a command
        </Button>
      </div>
      <CommandDialog
        open={open}
        onOpenChange={setOpen}
        command={editing}
        repositories={repositories}
        portlessInstalled={portlessInstalled}
        projectName={projectName}
        onListFolder={onListFolder}
        onSubmit={async (command) => await (editing === null ? onAdd : onUpdate)(command)}
      />
    </div>
  )
}
