import { cn } from 'cn'
import { type KeyboardEvent, type ReactNode, useState } from 'react'

import { Card } from '../../components/card/card.tsx'
import { Menu, type MenuItem } from '../../components/menu/menu.tsx'
import { Tooltip } from '../../components/tooltip/tooltip.tsx'
import {
  IconArrowDown,
  IconArrowUp,
  IconCheck,
  IconCircleDashed,
  IconDots,
  IconPencil,
  IconPlus,
  IconRestore,
  IconRoute,
  IconX,
} from '../../icons.ts'
import {
  type CliState,
  type DeliveryRules,
  POLICIES,
  POLICY_LABELS,
  POLICY_STEPS,
  type Policy,
  type RepositoryRules,
  type RuleCell,
  type RuleRow,
  type RuleStep,
  type StepKind,
  changesOf,
  configOf,
  hasFields,
  inOrder,
  partsOf,
  policyOf,
  rowsOf,
  stepsOf,
} from './model.ts'
import {
  ClosureRows,
  ForgeCard,
  FORM,
  KIND_GROUPS,
  MARK,
  MONO,
  ModeMark,
  STEP_ICONS,
  STEP_LABELS,
} from './parts.tsx'
import { BASE_SCOPE, CHANGED_DOT, type Editing, StepDialog, saved } from './step-dialog.tsx'

/**
 * C · Presets, with the repositories: a preset sets the Project's base, and the table under it
 * reads the base down its first column and each repository across, in delivery order. A cell says
 * where the step stands in that repository: inherited, changed (its own value, in the tint of a
 * change), left out, or a step of its own. Everything is changed from the cell or the column.
 */

// ——— The presets ———

const TILES = 'grid grid-cols-6 gap-2'

const TILE =
  'flex min-w-0 flex-col items-start gap-2 rounded-md border border-border bg-card px-3 py-2 text-left text-sm text-muted-foreground outline-none focus-ring hover:bg-muted aria-checked:border-primary aria-checked:text-foreground disabled:opacity-50 disabled:hover:bg-card'

/** The arrows that walk the tiles, and which way. */
const ARROWS = new Map<string, 1 | -1>([
  ['ArrowRight', 1],
  ['ArrowLeft', -1],
])

/** A preset as the chain of the icons of its steps. */
function Chain({ kinds }: { kinds: readonly StepKind[] }): ReactNode {
  if (kinds.length === 0) return <IconCircleDashed size="sm" aria-hidden="true" />
  return (
    <span className="flex items-center gap-1" aria-hidden="true">
      {kinds.map((kind) => {
        const Icon = STEP_ICONS[kind]
        return <Icon key={kind} size="sm" />
      })}
    </span>
  )
}

/** The five presets as one choice, and Custom, chosen when the base is none of them. */
export function PolicyChooser({
  value,
  onChange,
}: {
  value: Policy | null
  onChange: (policy: Policy) => void
}): ReactNode {
  const index = value === null ? -1 : POLICIES.indexOf(value)
  const walk = (event: KeyboardEvent<HTMLDivElement>) => {
    const by = ARROWS.get(event.key)
    if (by === undefined) return
    event.preventDefault()
    const next = POLICIES[(Math.max(index, 0) + by + POLICIES.length) % POLICIES.length]
    if (next === undefined) return
    onChange(next)
    event.currentTarget.querySelector<HTMLButtonElement>(`[data-policy="${next}"]`)?.focus()
  }
  return (
    <div role="radiogroup" aria-label="Preset" className={TILES} onKeyDown={walk}>
      {POLICIES.map((policy) => (
        <button
          key={policy}
          type="button"
          role="radio"
          data-policy={policy}
          aria-checked={value === policy}
          tabIndex={value === policy || (value === null && policy === 'nothing') ? 0 : -1}
          className={TILE}
          onClick={() => onChange(policy)}
        >
          <Chain kinds={POLICY_STEPS[policy]} />
          <span className="truncate">{POLICY_LABELS[policy]}</span>
        </button>
      ))}
      <button
        type="button"
        role="radio"
        aria-checked={value === null}
        disabled={value !== null}
        tabIndex={-1}
        className={TILE}
      >
        <IconPencil size="sm" aria-hidden="true" />
        <span className="truncate">Custom</span>
      </button>
    </div>
  )
}

// ——— The table ———

const TABLE = 'w-full table-fixed border-separate border-spacing-y-1 text-sm'

const HEAD_CELL = 'px-2 pb-1 text-left align-bottom text-xs font-medium text-muted-foreground'

const ROW_CELL =
  'border-y border-border bg-muted px-2 py-1.5 first:rounded-l-md first:border-l last:rounded-r-md last:border-r'

const STEP = 'flex min-w-0 items-center gap-2'

const WHAT = 'shrink-0 text-foreground'

const ON = cn(MONO, 'min-w-0 truncate text-muted-foreground')

/** A repository's own step reads quieter in the base column: the base does not have it. */
const OWN = 'shrink-0 text-muted-foreground'

const CELL = 'flex h-control-sm max-w-24 min-w-0 items-center gap-1.5'

const CELL_VALUE = cn(MONO, 'min-w-0 truncate text-foreground')

/** A step as its icon, what it is and what it acts on. */
function StepFace({ step, own = false }: { step: RuleStep; own?: boolean }): ReactNode {
  const Icon = STEP_ICONS[step.config.kind]
  const { what, on } = partsOf(step.config)
  return (
    <span className={STEP}>
      <span className={MARK}>
        <Icon size="sm" aria-hidden="true" />
      </span>
      <span className={own ? OWN : WHAT}>{what}</span>
      <span className={ON} title={on}>
        {on}
      </span>
    </span>
  )
}

/** What a cell draws: where the step stands in the repository, and its own value once changed. */
function CellFace({ cell, base }: { cell: RuleCell; base: RuleStep }): ReactNode {
  switch (cell.origin) {
    case null:
      return null
    case 'inherited':
      return (
        <span className={cn(CELL, 'text-muted-foreground')}>
          <IconCheck size="sm" aria-hidden="true" />
        </span>
      )
    case 'off':
      return (
        <span className={cn(CELL, 'text-muted-foreground')}>
          <IconCircleDashed size="sm" aria-hidden="true" />
        </span>
      )
    case 'added':
      return (
        <span className={cn(CELL, 'text-primary')}>
          <IconPlus size="sm" aria-hidden="true" />
        </span>
      )
    case 'changed': {
      const step = cell.step ?? base
      const value =
        JSON.stringify(step.config) === JSON.stringify(base.config) ? '' : partsOf(step.config).on
      return (
        <span className={CELL}>
          <span aria-hidden="true" className={CHANGED_DOT} />
          {step.mode !== base.mode && <ModeMark mode={step.mode} />}
          <span className={CELL_VALUE}>{value}</span>
        </span>
      )
    }
  }
}

const ORIGIN_WORDS = {
  inherited: 'as the base',
  changed: 'changed',
  added: 'its own',
  off: 'left out',
} as const

export interface TableActions {
  /** Opens the dialog. */
  edit: (editing: Editing) => void
  onChange: (next: Partial<DeliveryRules>) => void
}

/** One cell: where the step stands in a repository, pressed for what can be done to it. */
function Cell({
  row,
  cell,
  repository,
  actions,
}: {
  row: RuleRow
  cell: RuleCell
  repository: RepositoryRules
  actions: TableActions
}): ReactNode {
  if (cell.origin === null) return null
  const { what } = partsOf(row.step.config)
  const name = repository.name
  const items: MenuItem[] = []
  const base = row.owner === null ? row.step : null
  if (cell.origin === 'inherited' && hasFields(row.step.config.kind)) {
    items.push({
      label: `Change for ${name}`,
      icon: <IconPencil size="sm" />,
      onSelect: () =>
        actions.edit({ scope: name, step: row.step, added: false, base, after: null }),
    })
  }
  if (cell.origin === 'changed' && cell.step !== null) {
    const step = cell.step
    items.push({
      label: `Edit for ${name}`,
      icon: <IconPencil size="sm" />,
      onSelect: () => actions.edit({ scope: name, step, added: false, base, after: null }),
    })
  }
  if (cell.origin === 'added' && cell.step !== null) {
    const step = cell.step
    items.push({
      label: 'Edit',
      icon: <IconPencil size="sm" />,
      onSelect: () => actions.edit({ scope: name, step, added: false, base: null, after: null }),
    })
  }
  return (
    <Menu
      label={`${name}: ${what}, ${ORIGIN_WORDS[cell.origin]}`}
      trigger={<CellFace cell={cell} base={row.step} />}
      groups={[items, cellToggles(row, cell, repository, actions)].filter((one) => one.length > 0)}
    />
  )
}

/** What changes a cell's standing: leave out, put back, back to the base, remove. */
function cellToggles(
  row: RuleRow,
  cell: RuleCell,
  repository: RepositoryRules,
  actions: TableActions,
): MenuItem[] {
  const id = row.step.id
  const write = (next: RepositoryRules) => actions.onChange({ repositories: [next] })
  switch (cell.origin) {
    case 'inherited':
      return [
        {
          label: `Leave out of ${repository.name}`,
          icon: <IconCircleDashed size="sm" />,
          onSelect: () => write({ ...repository, off: [...repository.off, id] }),
        },
      ]
    case 'changed':
      return [
        {
          label: 'Back to the base',
          icon: <IconRestore size="sm" />,
          onSelect: () =>
            write({
              ...repository,
              changed: Object.fromEntries(
                Object.entries(repository.changed).filter(([one]) => one !== id),
              ),
            }),
        },
        {
          label: `Leave out of ${repository.name}`,
          icon: <IconCircleDashed size="sm" />,
          onSelect: () => write({ ...repository, off: [...repository.off, id] }),
        },
      ]
    case 'off':
      return [
        {
          label: `Put back in ${repository.name}`,
          icon: <IconRestore size="sm" />,
          onSelect: () => write({ ...repository, off: repository.off.filter((one) => one !== id) }),
        },
      ]
    case 'added':
      return [
        {
          label: 'Remove',
          icon: <IconX size="sm" />,
          onSelect: () =>
            write({
              ...repository,
              added: repository.added
                .filter((one) => one.step.id !== id)
                .map((one) => (one.after === id ? Object.assign({}, one, { after: null }) : one)),
            }),
        },
      ]
    case null:
      return []
  }
}

/** A repository's column head: its name, a dot when it changes the base, and who it follows. */
function ColumnHead({
  repository,
  actions,
}: {
  repository: RepositoryRules
  actions: TableActions
}): ReactNode {
  const changes = changesOf(repository)
  const reset: MenuItem[] =
    changes === 0
      ? []
      : [
          {
            label: 'Back to the base',
            icon: <IconRestore size="sm" />,
            onSelect: () =>
              actions.onChange({
                repositories: [{ ...repository, off: [], changed: {}, added: [] }],
              }),
          },
        ]
  return (
    <span className="flex min-w-0 flex-col items-start gap-0.5">
      <Menu
        label={`${repository.name}, ${String(changes)} changes from the base`}
        trigger={
          <span className="flex min-w-0 items-center gap-1.5 text-sm text-foreground">
            <span className="truncate">{repository.name}</span>
            {changes > 0 && <span aria-hidden="true" className={CHANGED_DOT} />}
          </span>
        }
        groups={[
          [
            {
              label: `Add a step for ${repository.name}`,
              icon: <IconPlus size="sm" />,
              onSelect: () =>
                actions.edit({
                  scope: repository.name,
                  step: { id: `${repository.name}-new`, mode: 'auto', config: configOf('confirm') },
                  added: true,
                  base: null,
                  after: null,
                }),
            },
          ],
          reset,
        ].filter((one) => one.length > 0)}
      />
      {repository.after !== null && (
        <Tooltip label={`After ${repository.after}`}>
          <i
            role="img"
            tabIndex={0}
            aria-label={`After ${repository.after}`}
            className="flex items-center gap-1 rounded-sm px-1 text-xs font-normal not-italic text-muted-foreground focus-ring"
          >
            <IconRoute size="sm" aria-hidden="true" />
            {repository.after}
          </i>
        </Tooltip>
      )}
    </span>
  )
}

/** The menu at the end of a row: edit, move and remove, of what can be done there. */
function RowMenu({
  row,
  rules,
  actions,
}: {
  row: RuleRow
  rules: DeliveryRules
  actions: TableActions
}): ReactNode {
  if (row.owner !== null) return null
  const index = rules.base.findIndex((one) => one.id === row.step.id)
  const move = (by: -1 | 1) => {
    const next = [...rules.base]
    const [taken] = next.splice(index, 1)
    if (taken === undefined) return
    next.splice(index + by, 0, taken)
    actions.onChange({ base: next })
  }
  const first: MenuItem[] = [
    {
      label: 'Edit',
      icon: <IconPencil size="sm" />,
      onSelect: () =>
        actions.edit({ scope: BASE_SCOPE, step: row.step, added: false, base: null, after: null }),
    },
  ]
  if (index > 0)
    first.push({ label: 'Move up', icon: <IconArrowUp size="sm" />, onSelect: () => move(-1) })
  if (index < rules.base.length - 1) {
    first.push({ label: 'Move down', icon: <IconArrowDown size="sm" />, onSelect: () => move(1) })
  }
  return (
    <Menu
      label={`${partsOf(row.step.config).what}: more`}
      icon={<IconDots size="sm" />}
      groups={[
        first,
        [
          {
            label: 'Remove',
            icon: <IconX size="sm" />,
            onSelect: () =>
              actions.onChange({ base: rules.base.filter((one) => one !== row.step) }),
          },
        ],
      ]}
    />
  )
}

/** The base down the first column, each repository across, in delivery order. */
export function RulesTable({
  rules,
  actions,
}: {
  rules: DeliveryRules
  actions: TableActions
}): ReactNode {
  const ordered = inOrder(rules.repositories)
  const rows = rowsOf(rules)
  return (
    <table className={TABLE} aria-label="Steps of each repository">
      <colgroup>
        <col />
        <col className="w-10" />
        {ordered.map((one) => (
          <col key={one.name} className="w-24" />
        ))}
        <col className="w-10" />
      </colgroup>
      <thead>
        <tr>
          <th className={HEAD_CELL}>Base</th>
          <th className={HEAD_CELL}>
            <span className="sr-only">Starts</span>
          </th>
          {ordered.map((repository) => (
            <th key={repository.name} className={HEAD_CELL}>
              <ColumnHead repository={repository} actions={actions} />
            </th>
          ))}
          <th className={HEAD_CELL}>
            <span className="sr-only">More</span>
          </th>
        </tr>
      </thead>
      <tbody>
        {rows.map((row) => (
          <tr key={`${row.owner ?? BASE_SCOPE}-${row.step.id}`}>
            <td className={ROW_CELL}>
              <StepFace step={row.step} own={row.owner !== null} />
            </td>
            <td className={ROW_CELL}>{row.step.mode === 'ask' && <ModeMark mode="ask" />}</td>
            {row.cells.map((cell) => {
              const repository = ordered.find((one) => one.name === cell.repository)
              return (
                <td key={cell.repository} className={ROW_CELL}>
                  {repository !== undefined && (
                    <Cell row={row} cell={cell} repository={repository} actions={actions} />
                  )}
                </td>
              )
            })}
            <td className={ROW_CELL}>
              <RowMenu row={row} rules={rules} actions={actions} />
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  )
}

/** The Add menu of the card: a base step of any kind, grouped. */
function AddStep({ onAdd }: { onAdd: (kind: StepKind) => void }): ReactNode {
  return (
    <Menu
      label="Add step"
      size="sm"
      groups={KIND_GROUPS.map((kinds) =>
        kinds.map((kind) => {
          const Icon = STEP_ICONS[kind]
          return { label: STEP_LABELS[kind], icon: <Icon size="sm" />, onSelect: () => onAdd(kind) }
        }),
      )}
    />
  )
}

/** The Delivery section: the forge and the repositories, the presets and the table, the closure. */
export function RulesEditor({
  rules,
  cli,
  onChange,
  dialogOn,
}: {
  rules: DeliveryRules
  cli: CliState
  onChange: (next: Partial<DeliveryRules>) => void
  /** The dialog open as the section is drawn, for a story. */
  dialogOn?: Editing | undefined
}): ReactNode {
  const [editing, setEditing] = useState<Editing | null>(dialogOn ?? null)
  const [open, setOpen] = useState(dialogOn !== undefined)
  // A repository written by a cell replaces its namesake; the rest of the list stays.
  const write = (next: Partial<DeliveryRules>) => {
    const written = next.repositories
    if (written === undefined) return onChange(next)
    onChange({
      ...next,
      repositories: rules.repositories.map(
        (one) => written.find((mine) => mine.name === one.name) ?? one,
      ),
    })
  }
  const actions: TableActions = {
    edit: (next) => {
      setEditing(next)
      setOpen(true)
    },
    onChange: write,
  }
  return (
    <>
      <ForgeCard rules={rules} cli={cli} onChange={onChange} />
      <Card
        title="Steps"
        actions={
          <AddStep
            onAdd={(kind) =>
              actions.edit({
                scope: BASE_SCOPE,
                step: {
                  id: `${kind}-${String(rules.base.length)}`,
                  mode: 'auto',
                  config: configOf(kind),
                },
                added: true,
                base: null,
                after: null,
              })
            }
          />
        }
      >
        <div className={FORM}>
          <PolicyChooser
            value={policyOf(rules.base)}
            onChange={(policy) => onChange({ base: stepsOf(policy) })}
          />
          <RulesTable rules={rules} actions={actions} />
        </div>
        {editing !== null && (
          <StepDialog
            open={open}
            onOpenChange={setOpen}
            editing={editing}
            rules={rules}
            onSave={(done) => onChange(saved(rules, done))}
          />
        )}
      </Card>
      <Card title="Afterwards">
        <ClosureRows
          offerCleanup={rules.offerCleanup}
          onOfferCleanup={(offerCleanup) => onChange({ offerCleanup })}
        />
      </Card>
    </>
  )
}
