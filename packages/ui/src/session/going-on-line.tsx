import { AnimatePresence, motion } from 'motion/react'
import { type ReactNode, useRef, useState } from 'react'

import { COMMAND_TYPE_ICONS } from '../activity/command-type.ts'
import { IconButton } from '../components/button/button.tsx'
import { LiveChip } from '../components/live-chip/live-chip.tsx'
import { Popover } from '../components/popover/popover.tsx'
import { StatusDot } from '../components/status-dot/status-dot.tsx'
import { Tooltip } from '../components/tooltip/tooltip.tsx'
import { IconBookmarkPlus, IconInfoCircle, IconTerminal2, IconX } from '../icons.ts'
import { AgentText } from '../message/agent-text.tsx'
import { fold, useTransition } from '../motion.ts'
import { ServiceUrl } from '../workspace/service-list.tsx'
import {
  GOING_ON_SHOWN,
  type GoingOnAgent,
  type GoingOnItem,
  type GoingOnRun,
  type GoingOnShell,
  goingOnStateOf,
  rankedGoingOn,
} from './going-on.ts'
import {
  type CommandItem,
  GOING_ON_TONES,
  GOING_ON_WORDS,
  GoingOnDetails,
  GoingOnOutput,
} from './going-on-details.tsx'
import { HelperAvatar } from './helper-avatar.tsx'
import { HelperDialog } from './helper-dialog.tsx'
import { RunPlace } from './run-place.tsx'

/**
 * What goes on in a Session, as a line right under its title (issue #219): the commands Hemera
 * runs, the ones the agent runs in its own shell, and its sub-agents, one chip each, where the eye
 * already is when it looks for what the Session is doing.
 *
 * The kinds are told apart by their chip. A command Hemera runs is a `LiveChip` (issue #77): its
 * type's icon, its name and its seconds, no dot — a faint breath while it runs, the plain mark it
 * ended on after — and its glance says where it runs, its address once a server answers, and what
 * it printed. A command of the agent's own shell has a terminal and a dashed edge, since Hemera
 * holds no process it could stop, and its dot says how it stands. A helper the agent launched is a
 * live chip too (issue #77), its avatar in the slot: its glance says what it is doing and what it
 * last said, its ⓘ opens its live thread read-only (`HelperDialog`), and × stops it once the reader
 * said so. What failed comes first, then what runs, then what is over, and a chip that changes rank
 * travels to its new place; four chips, and a `+N` for the rest, which opens the whole list grouped
 * by kind.
 *
 * A chip of the shell opens a glance: one line — icon, dot, name, where it runs, the ⓘ of its
 * Details — and what it printed under it. The Details are a dialog laid the same way for the
 * commands (`GoingOnDetails`). The line ends on `end`, where the page puts the way to start a
 * command.
 *
 * What the line holds is the page's to decide (issue #237: what runs, what failed and is not seen
 * yet, the catalogue's shortcuts); the glance is where the reader acts on it — Run again, or Stop
 * while it runs, the one-off's `Add to catalogue`, the ⓘ, and the ✕ that takes the chip out of the
 * line; reading a chip never takes it out (review of #250). A chip arrives and leaves by its width,
 * pushing the chips after it. With nothing going on, the line is its Run alone.
 */

export interface GoingOnLineProps {
  items: readonly GoingOnItem[]
  /** What closes the line: the way to start a command, when the page has one. */
  end?: ReactNode
  onStop: (run: GoingOnRun) => void
  onOpenUrl: (url: string) => void
  onAddToCatalogue: (run: GoingOnRun) => void
  /** Runs it again: a command of the catalogue as itself, a one-off as the one-off it was. */
  onRunAgain?: ((run: GoingOnRun) => void) | undefined
  /** Takes the chip out of the line; what it was stays in the history. */
  onRemove?: ((item: GoingOnItem) => void) | undefined
  /** Stops a helper, once the reader said so in its glance (issue #77). */
  onStopHelper?: ((helper: GoingOnAgent) => void) | undefined
  /** A helper's thread as the page draws one, read-only: what its dialog holds. */
  helperThread?: ((helper: GoingOnAgent) => ReactNode) | undefined
  /**
   * A chip's glance opened, or finished closing (issue #321): what leaves the line on its own waits
   * for the reader to put its glance away.
   */
  onGlance?: ((id: string, open: boolean) => void) | undefined
  /** The glance open as the line is drawn: an item's id, `more` for the list, or none. */
  defaultOpen?: string | null | undefined
  /** The item whose Details are open as the line is drawn. */
  defaultDetail?: string | null | undefined
}

const LINE = 'flex min-w-0 flex-wrap items-center gap-y-1.5'

/** A command of the agent's own shell: the same chip, on a dashed edge Hemera does not hold. */
const SHELL_CHIP =
  'inline-flex h-control-sm max-w-menu-side min-w-0 items-center gap-1.5 rounded-md border border-dashed border-border bg-card px-2 text-xs outline-none hover:bg-accent focus-ring data-popup-open:bg-accent'

const MORE =
  'inline-flex h-control-sm items-center rounded-md px-2 text-xs font-medium text-muted-foreground outline-none hover:bg-accent hover:text-foreground focus-ring data-popup-open:bg-accent data-popup-open:text-foreground'

const ICON = 'flex shrink-0 text-muted-foreground'

const LABEL = 'min-w-0 truncate font-medium'

const MONO_LABEL = 'min-w-0 truncate font-mono'

const HINT = 'shrink-0 font-mono text-muted-foreground'

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
  agent: 'Helpers',
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
    icon: <HelperAvatar name={item.name} />,
    label: item.name,
    address: null,
    mono: false,
  }
}

/** What a chip is called to a screen reader: its label, whose it is, and how it stands. */
function nameOf(item: GoingOnItem): string {
  const words = GOING_ON_WORDS[goingOnStateOf(item)]
  if (item.kind === 'shell') return `${item.command}, run by the agent, ${words}`
  if (item.kind === 'agent') return `Helper ${item.name}, ${words}`
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

/** Where the agent's shell ran it: the quiet words after its name. */
function whereOf(item: GoingOnShell): string {
  return `${item.folder} · the agent’s shell`
}

/** An icon action of a glance, named by its tooltip: never a word-button beside a run. */
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

/**
 * The room a chip takes on the line, which is what grows and folds: its right edge is the gap. A
 * little room on its left too, given back by its margin, so a live chip's shake is not cut.
 */
const SLOT = 'flex shrink-0 overflow-hidden -ml-1 pl-1 pr-1.5'

const SHOWN = { width: 'auto', filter: 'opacity(1)' } as const

const HIDDEN = { width: 0, filter: 'opacity(0)' } as const

/**
 * A place on the line that arrives and leaves by its width, pushing the chips after it, and travels
 * to its new rank rather than jumping there.
 */
function Slot({ children }: { children: ReactNode }): ReactNode {
  const transition = useTransition(fold)
  return (
    <motion.span
      layout="position"
      className={SLOT}
      initial={HIDDEN}
      animate={SHOWN}
      exit={HIDDEN}
      transition={transition}
    >
      {children}
    </motion.span>
  )
}

/** A glance at a command of the agent's shell: one line with its tools, and what it printed. */
function Glance({
  item,
  onDetails,
  onRemove,
}: {
  item: GoingOnShell
  onDetails: () => void
  onRemove?: (() => void) | undefined
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
          <Act label={`Details of ${face.label}`} tip="Details" onPress={onDetails}>
            <IconInfoCircle size="sm" />
          </Act>
          {onRemove !== undefined && (
            <Act
              label={`Remove ${face.label} from the line`}
              tip="Remove from the line"
              onPress={onRemove}
            >
              <IconX size="sm" />
            </Act>
          )}
        </span>
      </div>
      <GoingOnOutput item={item} />
    </div>
  )
}

/**
 * A command Hemera runs, as a live chip (issue #77): its type's icon in the slot; in its glance,
 * where it runs, its address once a server answers on one, and what it printed. Stop, Run again,
 * the one-off's `Add to catalogue`, the ⓘ and, once it has ended, the ✕ that takes it off the line.
 */
function RunChip({
  run,
  open,
  onOpenChange,
  onClosed,
  onDetails,
  onStop,
  onOpenUrl,
  onRunAgain,
  onAddToCatalogue,
  onRemove,
}: {
  run: GoingOnRun
  open: boolean
  onOpenChange: (open: boolean) => void
  onClosed: () => void
  onDetails: () => void
  onStop: (run: GoingOnRun) => void
  onOpenUrl: (url: string) => void
  onRunAgain?: ((run: GoingOnRun) => void) | undefined
  onAddToCatalogue: (run: GoingOnRun) => void
  onRemove?: (() => void) | undefined
}): ReactNode {
  const TypeIcon = COMMAND_TYPE_ICONS[run.type]
  return (
    <LiveChip
      name={run.name}
      icon={<TypeIcon size="sm" aria-hidden="true" />}
      state={run.state}
      startedAt={run.startedAt}
      endedAt={run.endedAt}
      label={nameOf(run)}
      step={<RunPlace repository={run.repository} folder={run.folder} />}
      open={open}
      onOpenChange={onOpenChange}
      onClosed={onClosed}
      onDetails={onDetails}
      onStop={() => onStop(run)}
      onRunAgain={onRunAgain === undefined ? undefined : () => onRunAgain(run)}
      onRemove={onRemove}
      tools={
        run.oneOff === true && (
          <Act
            label={`Add ${run.name} to the catalogue`}
            tip="Add to catalogue"
            onPress={() => onAddToCatalogue(run)}
          >
            <IconBookmarkPlus size="sm" />
          </Act>
        )
      }
    >
      {run.url !== undefined && run.state === 'running' && (
        <p className="text-xs">
          <ServiceUrl url={run.url} readiness={run.readiness} onOpenUrl={onOpenUrl} />
        </p>
      )}
      <GoingOnOutput item={run} />
    </LiveChip>
  )
}

/**
 * A helper, as a live chip (issue #77): its avatar in the slot — two letters when another helper
 * shares its initial — its name and its seconds; in its glance, what it is doing and what it last
 * said; its ⓘ opens its thread, × stops it once the reader said so, and once it has ended × takes
 * it off the line.
 */
function HelperChip({
  helper,
  others,
  open,
  onOpenChange,
  onClosed,
  onDetails,
  onStop,
  onRemove,
}: {
  helper: GoingOnAgent
  others: readonly string[]
  open: boolean
  onOpenChange: (open: boolean) => void
  onClosed: () => void
  onDetails: () => void
  onStop?: (() => void) | undefined
  onRemove?: (() => void) | undefined
}): ReactNode {
  return (
    <LiveChip
      name={helper.name}
      icon={<HelperAvatar name={helper.name} others={others} />}
      state={helper.state}
      startedAt={helper.startedAt}
      endedAt={helper.endedAt}
      label={nameOf(helper)}
      step={helper.step}
      open={open}
      onOpenChange={onOpenChange}
      onClosed={onClosed}
      onDetails={onDetails}
      onStop={onStop}
      onRemove={onRemove}
    >
      {helper.last !== null && <AgentText text={helper.last} />}
    </LiveChip>
  )
}

export function GoingOnLine({
  items,
  end,
  onStop,
  onOpenUrl,
  onAddToCatalogue,
  onRunAgain,
  onRemove,
  onStopHelper,
  helperThread,
  onGlance,
  defaultOpen = null,
  defaultDetail = null,
}: GoingOnLineProps): ReactNode {
  const [open, setOpen] = useState<string | null>(defaultOpen)
  const [detail, setDetail] = useState<string | null>(defaultDetail)
  // What the reader took out of the line from its glance: the glance closes first, with its own
  // motion, and the chip leaves once it is gone — never a glance left on a chip going away.
  const [leaving, setLeaving] = useState<GoingOnItem | null>(null)
  const ranked = rankedGoingOn(items)
  const chips = ranked.slice(0, GOING_ON_SHOWN)
  const rest = ranked.length - chips.length
  // The Details open and close as every dialog of the window does, by its own motion: drawn closed
  // first and opened on the next frame, and kept drawn while they close, on the item they were
  // about even if it has left the line since.
  const [detailOpen, setDetailOpen] = useState(defaultDetail !== null)
  const lastDetailed = useRef<GoingOnItem | undefined>(undefined)
  const detailed = items.find((item) => item.id === detail) ?? lastDetailed.current
  lastDetailed.current = detailed
  // The helpers' names, which decide whether an avatar needs a second letter.
  const othersOf = (helper: GoingOnAgent) =>
    items.flatMap((item) => (item.kind === 'agent' && item.id !== helper.id ? [item.name] : []))

  function details(id: string): void {
    glance(null)
    setDetail(id)
    requestAnimationFrame(() => setDetailOpen(true))
  }

  /** Opens one glance, or none, and says which opened (issue #321). */
  function glance(id: string | null): void {
    setOpen(id)
    if (id !== null && id !== 'more') onGlance?.(id, true)
  }

  return (
    <div role="group" aria-label="What goes on in this Session" className={LINE}>
      <AnimatePresence initial={false}>
        {chips.map((item) => {
          const glanced = (next: boolean) => {
            if (next) glance(item.id)
            else if (open === item.id) setOpen(null)
          }
          // The glance closes first, with its own motion, and the chip leaves once it is gone.
          const closed = () => {
            onGlance?.(item.id, false)
            if (leaving?.id !== item.id) return
            setLeaving(null)
            onRemove?.(item)
          }
          const remove =
            onRemove === undefined
              ? undefined
              : () => {
                  setLeaving(item)
                  setOpen(null)
                }
          const chip = (): ReactNode => {
            if (item.kind === 'run') {
              return (
                <RunChip
                  run={item}
                  open={open === item.id}
                  onOpenChange={glanced}
                  onClosed={closed}
                  onDetails={() => details(item.id)}
                  onStop={onStop}
                  onOpenUrl={onOpenUrl}
                  onRunAgain={onRunAgain}
                  onAddToCatalogue={onAddToCatalogue}
                  onRemove={remove}
                />
              )
            }
            if (item.kind === 'agent') {
              return (
                <HelperChip
                  helper={item}
                  others={othersOf(item)}
                  open={open === item.id}
                  onOpenChange={glanced}
                  onClosed={closed}
                  onDetails={() => details(item.id)}
                  onStop={onStopHelper === undefined ? undefined : () => onStopHelper(item)}
                  onRemove={remove}
                />
              )
            }
            return (
              <Popover
                side="bottom"
                align="start"
                label={nameOf(item)}
                open={open === item.id}
                onOpenChange={glanced}
                onClosed={closed}
                trigger={
                  <button type="button" className={SHELL_CHIP} aria-label={nameOf(item)}>
                    <ItemLine item={item} />
                  </button>
                }
              >
                <Glance item={item} onDetails={() => details(item.id)} onRemove={remove} />
              </Popover>
            )
          }
          return <Slot key={item.id}>{chip()}</Slot>
        })}
      </AnimatePresence>
      {rest > 0 && (
        <span className={SLOT}>
          <Popover
            side="bottom"
            align="start"
            title="Everything in this Session"
            open={open === 'more'}
            onOpenChange={(next) => glance(next ? 'more' : null)}
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
        </span>
      )}
      {end}
      {detailed?.kind === 'agent' && (
        <HelperDialog
          helper={detailed}
          open={detailOpen}
          onOpenChange={(next) => {
            if (!next) setDetailOpen(false)
          }}
        >
          {helperThread?.(detailed)}
        </HelperDialog>
      )}
      {detailed !== undefined && detailed.kind !== 'agent' && (
        <GoingOnDetails
          item={detailed satisfies CommandItem}
          open={detailOpen}
          onClose={() => setDetailOpen(false)}
          onStop={onStop}
          onOpenUrl={onOpenUrl}
          onAddToCatalogue={onAddToCatalogue}
        />
      )}
    </div>
  )
}
