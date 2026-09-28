import { type ReactNode, useState } from 'react'

import { COMMAND_TYPE_ICONS } from '../activity/command-type.ts'
import { IconButton } from '../components/button/button.tsx'
import { Popover } from '../components/popover/popover.tsx'
import { StatusDot } from '../components/status-dot/status-dot.tsx'
import { Tooltip } from '../components/tooltip/tooltip.tsx'
import { IconInfoCircle, IconPlayerStop, IconRobot, IconTerminal2 } from '../icons.ts'
import { AgentText } from '../message/agent-text.tsx'
import { ServiceUrl } from '../workspace/service-list.tsx'
import {
  GOING_ON_SHOWN,
  type GoingOnItem,
  type GoingOnRun,
  goingOnStateOf,
  rankedGoingOn,
} from './going-on.ts'
import {
  GOING_ON_TONES,
  GOING_ON_WORDS,
  GoingOnDetails,
  GoingOnOutput,
} from './going-on-details.tsx'
import { RunPlace } from './run-place.tsx'

/**
 * What goes on in a Session, as a line right under its title (issue #219): the commands Hemera
 * runs, the ones the agent runs in its own shell, and its sub-agents, one chip each, where the eye
 * already is when it looks for what the Session is doing.
 *
 * The kinds are told apart by their chip: a command Hemera runs has its type's icon and a solid
 * edge; a command of the agent's own shell a terminal and a dashed edge, since Hemera holds no
 * process it could stop; a sub-agent a robot. How each stands is its dot alone, and beside its name
 * only an address once a server answers on one. What failed comes first, then what runs, then what
 * is over; four chips, and a `+N` for the rest, which opens the whole list grouped by kind.
 *
 * A chip opens a glance: one line — icon, dot, name, where it runs, Stop when Hemera holds the
 * process, and the ⓘ of its Details — and what it printed under it. The Details are a dialog laid
 * the same way for every kind (`GoingOnDetails`). The line ends on `end`, where the page puts the
 * way to start a command.
 */

export interface GoingOnLineProps {
  items: readonly GoingOnItem[]
  /** Said when nothing goes on: where things would run. */
  emptyLabel: string
  /** What closes the line: the way to start a command, when the page has one. */
  end?: ReactNode
  onStop: (run: GoingOnRun) => void
  onOpenUrl: (url: string) => void
  onAddToCatalogue: (run: GoingOnRun) => void
  /** The glance open as the line is drawn: an item's id, `more` for the list, or none. */
  defaultOpen?: string | null | undefined
  /** The item whose Details are open as the line is drawn. */
  defaultDetail?: string | null | undefined
}

const LINE = 'flex min-w-0 flex-wrap items-center gap-1.5'

const CHIP =
  'inline-flex h-control-sm max-w-menu-side min-w-0 items-center gap-1.5 rounded-md border border-border bg-card px-2 text-xs outline-none hover:bg-accent focus-ring data-popup-open:bg-accent'

/** A command of the agent's own shell: the same chip, on a dashed edge Hemera does not hold. */
const SHELL_CHIP =
  'inline-flex h-control-sm max-w-menu-side min-w-0 items-center gap-1.5 rounded-md border border-dashed border-border bg-card px-2 text-xs outline-none hover:bg-accent focus-ring data-popup-open:bg-accent'

const MORE =
  'inline-flex h-control-sm items-center rounded-md px-2 text-xs font-medium text-muted-foreground outline-none hover:bg-accent hover:text-foreground focus-ring data-popup-open:bg-accent data-popup-open:text-foreground'

const ICON = 'flex shrink-0 text-muted-foreground'

const LABEL = 'min-w-0 truncate font-medium'

const MONO_LABEL = 'min-w-0 truncate font-mono'

const HINT = 'shrink-0 font-mono text-muted-foreground'

const QUIET = 'text-xs text-muted-foreground'

const GLANCE = 'flex w-menu-panel flex-col gap-2'

const GLANCE_HEAD = 'flex min-w-0 items-center gap-1.5 text-sm'

const WHERE = 'min-w-0 flex-1 truncate font-mono text-xs text-muted-foreground'

const TOOLS = 'flex shrink-0 items-center'

const GROUP = 'text-xs font-medium text-muted-foreground'

const ROW =
  'flex w-full min-w-0 items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm outline-none hover:bg-accent focus-ring'

/** What each kind is called in the list. */
const KINDS = {
  run: 'Commands',
  shell: 'Run by the agent',
  agent: 'Sub-agents',
} as const

/** What a chip and a row say: an icon, a label, and an address once a server answers. */
interface ItemFace {
  icon: ReactNode
  label: string
  address: string | null
  /** Whether the label is a command line, set in the terminal's letters. */
  mono: boolean
}

function faceOf(item: GoingOnItem): ItemFace {
  if (item.kind === 'run') {
    const TypeIcon = COMMAND_TYPE_ICONS[item.type]
    const serving = item.url !== undefined && item.state === 'running'
    return {
      icon: <TypeIcon size="sm" aria-hidden="true" />,
      label: item.name,
      address: serving ? (item.url?.replace(/^https?:\/\//, '') ?? null) : null,
      mono: false,
    }
  }
  if (item.kind === 'shell') {
    return {
      icon: <IconTerminal2 size="sm" aria-hidden="true" />,
      label: item.command,
      address: null,
      mono: true,
    }
  }
  return {
    icon: <IconRobot size="sm" aria-hidden="true" />,
    label: item.name,
    address: null,
    mono: false,
  }
}

/** What a chip is called to a screen reader: its label, whose it is, and how it stands. */
function nameOf(item: GoingOnItem): string {
  const words = GOING_ON_WORDS[goingOnStateOf(item)]
  if (item.kind === 'shell') return `${item.command}, run by the agent, ${words}`
  if (item.kind === 'agent') return `Sub-agent ${item.name}, ${words}`
  const address = faceOf(item).address
  return address === null ? `${item.name}, ${words}` : `${item.name}, ${words} on ${address}`
}

/** The inside of a chip and of a row: the icon, the dot, the label, an address when there is one. */
function ItemLine({ item }: { item: GoingOnItem }): ReactNode {
  const face = faceOf(item)
  return (
    <>
      <span className={ICON}>{face.icon}</span>
      <StatusDot status={GOING_ON_TONES[goingOnStateOf(item)]} size="sm" />
      <span className={face.mono ? MONO_LABEL : LABEL}>{face.label}</span>
      {face.address !== null && <span className={HINT}>{face.address}</span>}
    </>
  )
}

/**
 * Where the item runs, or how far a sub-agent got: the quiet words after its name. A run in one of
 * the Project's repositories is said as it, with its mark (issue #239).
 */
function whereOf(item: GoingOnItem): ReactNode {
  if (item.kind === 'run') return <RunPlace repository={item.repository} folder={item.folder} />
  if (item.kind === 'shell') return `${item.folder} · the agent’s shell`
  return `${String(item.steps.length)} steps`
}

/** A glance at one item: one line with its tools, and what it printed or last said under it. */
function Glance({
  item,
  onStop,
  onOpenUrl,
  onDetails,
}: {
  item: GoingOnItem
  onStop: (run: GoingOnRun) => void
  onOpenUrl: (url: string) => void
  onDetails: () => void
}): ReactNode {
  const face = faceOf(item)
  const state = goingOnStateOf(item)
  return (
    <div className={GLANCE}>
      <div className={GLANCE_HEAD}>
        <span className={ICON}>{face.icon}</span>
        <StatusDot status={GOING_ON_TONES[state]} size="sm" />
        <span className={face.mono ? MONO_LABEL : LABEL}>{face.label}</span>
        <span className={WHERE}>{whereOf(item)}</span>
        <span className={TOOLS}>
          {item.kind === 'run' && item.state === 'running' && (
            <Tooltip label="Stop">
              <IconButton
                variant="ghost"
                size="sm"
                icon={<IconPlayerStop size="sm" />}
                aria-label={`Stop ${item.name}`}
                onClick={() => onStop(item)}
              />
            </Tooltip>
          )}
          <Tooltip label="Details">
            <IconButton
              variant="ghost"
              size="sm"
              icon={<IconInfoCircle size="sm" />}
              aria-label={`Details of ${face.label}`}
              onClick={onDetails}
            />
          </Tooltip>
        </span>
      </div>
      {item.kind === 'run' && item.url !== undefined && item.state === 'running' && (
        <p className="text-xs">
          <ServiceUrl url={item.url} readiness={item.readiness} onOpenUrl={onOpenUrl} />
        </p>
      )}
      {item.kind === 'agent' ? (
        <div className="flex flex-col gap-1 text-sm">
          <p>{item.task}</p>
          <AgentText text={item.last} />
        </div>
      ) : (
        <GoingOnOutput item={item} />
      )}
    </div>
  )
}

export function GoingOnLine({
  items,
  emptyLabel,
  end,
  onStop,
  onOpenUrl,
  onAddToCatalogue,
  defaultOpen = null,
  defaultDetail = null,
}: GoingOnLineProps): ReactNode {
  const [open, setOpen] = useState<string | null>(defaultOpen)
  const [detail, setDetail] = useState<string | null>(defaultDetail)
  const ranked = rankedGoingOn(items)
  const chips = ranked.slice(0, GOING_ON_SHOWN)
  const rest = ranked.length - chips.length
  const detailed = items.find((item) => item.id === detail)

  function details(id: string): void {
    setOpen(null)
    setDetail(id)
  }

  return (
    <div role="group" aria-label="What goes on in this Session" className={LINE}>
      {items.length === 0 && <span className={QUIET}>{emptyLabel}</span>}
      {chips.map((item) => (
        <Popover
          key={item.id}
          side="bottom"
          align="start"
          label={nameOf(item)}
          open={open === item.id}
          onOpenChange={(next) => setOpen(next ? item.id : null)}
          trigger={
            <button
              type="button"
              className={item.kind === 'shell' ? SHELL_CHIP : CHIP}
              aria-label={nameOf(item)}
            >
              <ItemLine item={item} />
            </button>
          }
        >
          <Glance
            item={item}
            onStop={onStop}
            onOpenUrl={onOpenUrl}
            onDetails={() => details(item.id)}
          />
        </Popover>
      ))}
      {rest > 0 && (
        <Popover
          side="bottom"
          align="start"
          title="Everything in this Session"
          open={open === 'more'}
          onOpenChange={(next) => setOpen(next ? 'more' : null)}
          trigger={
            <button type="button" className={MORE} aria-label={`${String(rest)} more`}>
              {`+${String(rest)}`}
            </button>
          }
        >
          <div className="flex w-menu-panel flex-col gap-3">
            {(['run', 'shell', 'agent'] as const).map((kind) => {
              const ofKind = ranked.filter((item) => item.kind === kind)
              if (ofKind.length === 0) return null
              return (
                <div key={kind} className="flex flex-col gap-0.5">
                  <p className={GROUP}>{KINDS[kind]}</p>
                  {ofKind.map((item) => (
                    <button
                      key={item.id}
                      type="button"
                      className={ROW}
                      aria-label={`${nameOf(item)}, details`}
                      onClick={() => details(item.id)}
                    >
                      <ItemLine item={item} />
                    </button>
                  ))}
                </div>
              )
            })}
          </div>
        </Popover>
      )}
      {end}
      {detailed !== undefined && (
        <GoingOnDetails
          item={detailed}
          onClose={() => setDetail(null)}
          onStop={onStop}
          onOpenUrl={onOpenUrl}
          onAddToCatalogue={onAddToCatalogue}
        />
      )}
    </div>
  )
}
