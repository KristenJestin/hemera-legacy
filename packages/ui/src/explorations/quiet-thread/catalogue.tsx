import { type ReactNode, useState } from 'react'

import { COMMAND_TYPE_ICONS } from '../../activity/command-type.ts'
import { Button } from '../../components/button/button.tsx'
import { StatusDot } from '../../components/status-dot/status-dot.tsx'
import { IconPencil, IconPlayerPlay, IconPlus, IconTrash } from '../../icons.ts'
import { CommandDialog } from '../../project/command-dialog.tsx'
import type { CommandLine } from '../../project/model.ts'
import { REPOSITORIES } from './fixtures.ts'
import { Act, ICON, LINE_OF } from './parts.tsx'

/**
 * The Project's catalogue inside the Session (point 10 of #237): read, run, added to, changed and
 * taken from without leaving it. A row is the command — its type, its name, its line, a dot while
 * it runs — and its three presses as icons; Add and the pencil open the catalogue's own dialog, the
 * one Project settings open, over the Session.
 */

export interface CatalogueActions {
  onRun: (entry: CommandLine) => void
  /** Writes a command, new when `was` is null, and answers why it could not, or nothing. */
  onSave: (entry: CommandLine, was: CommandLine | null) => Promise<string | null>
  onRemove: (entry: CommandLine) => void
}

const ROW = 'flex min-w-0 items-center gap-2 rounded-md px-2 py-1 text-sm hover:bg-accent'

/** One command of the catalogue, with its presses. */
export function CatalogueRow({
  entry,
  running,
  actions,
  onEdit,
}: {
  entry: CommandLine
  running: boolean
  actions: CatalogueActions
  onEdit: (entry: CommandLine) => void
}): ReactNode {
  const TypeIcon = COMMAND_TYPE_ICONS[entry.type]
  return (
    <div className={ROW}>
      <span className={ICON}>
        <TypeIcon size="sm" aria-hidden="true" />
      </span>
      <span className="shrink-0 font-medium">{entry.name}</span>
      <span className={LINE_OF}>{entry.command}</span>
      {running && <StatusDot status="running" size="sm" label="running" />}
      <span className="flex shrink-0 items-center">
        <Act
          label={`Run ${entry.name}`}
          icon={<IconPlayerPlay size="sm" />}
          onPress={() => actions.onRun(entry)}
        />
        <Act
          label={`Edit ${entry.name}`}
          icon={<IconPencil size="sm" />}
          onPress={() => onEdit(entry)}
        />
        <Act
          label={`Remove ${entry.name} from the catalogue`}
          icon={<IconTrash size="sm" />}
          onPress={() => actions.onRemove(entry)}
        />
      </span>
    </div>
  )
}

/** The catalogue's own dialog, and the way to open it. */
export interface CatalogueEditor {
  edit: (entry: CommandLine | null) => void
  dialog: ReactNode
}

/**
 * The catalogue's own dialog, held by whoever draws the rows: `edit` opens it on a command, or on
 * a new one, and `dialog` is where it is drawn.
 */
export function useCatalogueEditor(actions: CatalogueActions): CatalogueEditor {
  const [open, setOpen] = useState(false)
  // Kept while the dialog closes, so it does not change its title on its way out.
  const [editing, setEditing] = useState<CommandLine | null>(null)
  return {
    edit: (entry) => {
      setEditing(entry)
      setOpen(true)
    },
    dialog: (
      <CommandDialog
        open={open}
        onOpenChange={setOpen}
        command={editing}
        repositories={REPOSITORIES}
        portlessInstalled={false}
        projectName="atlas"
        onSubmit={(entry) => actions.onSave(entry, editing)}
      />
    ),
  }
}

/** The whole catalogue, in rows, and Add at its foot. */
export function CatalogueRows({
  catalogue,
  running,
  actions,
  onEdit,
}: {
  catalogue: readonly CommandLine[]
  running: readonly string[]
  actions: CatalogueActions
  onEdit: (entry: CommandLine | null) => void
}): ReactNode {
  return (
    <div className="flex flex-col gap-0.5">
      <ul aria-label="The catalogue" className="flex flex-col gap-0.5">
        {catalogue.map((entry) => (
          <li key={entry.id}>
            <CatalogueRow
              entry={entry}
              running={running.includes(entry.name)}
              actions={actions}
              onEdit={onEdit}
            />
          </li>
        ))}
      </ul>
      <div className="flex pt-1">
        <Button variant="ghost" size="sm" onClick={() => onEdit(null)}>
          <IconPlus size="sm" />
          Add a command
        </Button>
      </div>
    </div>
  )
}
