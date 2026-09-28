import { AnimatePresence, motion } from 'motion/react'
import { type ReactNode, useState } from 'react'

import { COMMAND_TYPE_ICONS } from '../../activity/command-type.ts'
import { Disclosure } from '../../activity/disclosure.tsx'
import { TerminalOutput } from '../../activity/terminal-output.tsx'
import { DecisionSummary } from '../../approval/decision-summary.tsx'
import { Button, IconButton } from '../../components/button/button.tsx'
import { Input } from '../../components/field/field.tsx'
import { Popover } from '../../components/popover/popover.tsx'
import { StatusDot, type StatusTone } from '../../components/status-dot/status-dot.tsx'
import { Tooltip } from '../../components/tooltip/tooltip.tsx'
import {
  IconBook,
  IconBookmarkPlus,
  IconCheck,
  IconInfoCircle,
  IconPencil,
  IconPlayerPlay,
  IconPlayerStop,
  IconPlus,
  IconRefresh,
  IconShield,
  IconX,
} from '../../icons.ts'
import { collapse, expand, fold, useTransition } from '../../motion.ts'
import type { CommandLine } from '../../project/model.ts'
import { type GoingOnRun, goingOnStateOf } from '../../session/going-on.ts'
import { GOING_ON_TONES, GoingOnDetails, GoingOnOutput } from '../../session/going-on-details.tsx'
import { ServiceUrl } from '../../workspace/service-list.tsx'
import type { Asked, Held, Proposed } from './fixtures.ts'

/**
 * What the three variants share (issue #237): the thread's entry for a run, the line in the head
 * with its lifecycle and each chip's glance, Run, the proposals' and the permission's rows, and
 * what arrives and leaves by its height. What differs between the variants is handed to these as
 * a rule, never drawn twice.
 */

export type Variant = 'tray' | 'pill' | 'deck'

/**
 * How a variant treats what the Session runs.
 *
 * - `oneOff` · when a one-off that ended well leaves the line (point 9): `while` after a short
 *   while, `seen` once its glance or its entry has been opened (or the Session opened again),
 *   `fade` dimmed for a short while and then gone, Run's menu keeping it under Earlier.
 * - `keep` · where a one-off offers to be kept in the catalogue: inside its thread entry once
 *   opened, in its chip's glance, or beside it in Run's menu.
 * - `catalogue` · where the ⓘ details hold the history and the catalogue (points 8 and 10): one
 *   Commands tab with the catalogue over the history, two tabs of their own, or one Commands tab
 *   where each command of the catalogue carries its own runs.
 */
export interface Rules {
  oneOff: 'while' | 'seen' | 'fade'
  keep: 'entry' | 'glance' | 'menu'
  catalogue: 'section' | 'tabs' | 'grouped'
}

export const RULES: Record<Variant, Rules> = {
  tray: { oneOff: 'while', keep: 'entry', catalogue: 'section' },
  pill: { oneOff: 'seen', keep: 'glance', catalogue: 'tabs' },
  deck: { oneOff: 'fade', keep: 'menu', catalogue: 'grouped' },
}

/**
 * How long a one-off that ended well keeps its chip, in the stories. The product would hold it
 * about a minute: long enough to be read by whoever was watching it, short enough not to be a
 * `sleep 120` for the rest of the Session.
 */
export const LINGER_MS = 2400

/** Where a run stands on the line: a chip, a dimmed chip on its way out, a shortcut, or gone. */
export type Place = 'chip' | 'dim' | 'rest' | 'gone'

/**
 * The lifecycle of the line (points 4 and 9 of #237). What runs is a chip. What failed stays until
 * it is seen. A command of the catalogue that ran stays, as the shortcut to run it again. A one-off
 * leaves once over, by the variant's rule. Whatever the reader took out by hand is gone, and stays
 * in the history.
 */
export function placeOf(rules: Rules, { run, seen, settled, removed, before }: Held): Place {
  if (removed) return 'gone'
  const state = goingOnStateOf(run)
  if (state === 'running') return 'chip'
  if (state === 'failed' && !seen) return 'chip'
  if (run.oneOff !== true) return 'rest'
  if (state === 'failed') return 'gone'
  if (rules.oneOff === 'seen') return seen || before ? 'gone' : 'chip'
  if (!settled) return rules.oneOff === 'fade' ? 'dim' : 'chip'
  return 'gone'
}

/** The tone of a run's dot, a stopped one included. */
export function toneOf(run: GoingOnRun): StatusTone {
  return run.state === 'stopped' ? 'cancelled' : GOING_ON_TONES[goingOnStateOf(run)]
}

const WORDS: Record<StatusTone, string> = {
  pending: 'waiting',
  running: 'running',
  success: 'done',
  failure: 'failed',
  cancelled: 'stopped',
}

/** What a run is called to a screen reader: its name and how it stands. */
export function nameOf(run: GoingOnRun): string {
  return `${run.name}, ${WORDS[toneOf(run)]}`
}

/** What stands after a run's name once it is over: the code it exited with. */
export function exitOf(run: { state: string; exitCode?: number | undefined }): string | null {
  if (run.state === 'running' || run.state === 'stopped' || run.exitCode === undefined) return null
  return `exit ${String(run.exitCode)}`
}

export const ICON = 'flex shrink-0 text-muted-foreground'

const NAME = 'min-w-0 truncate'

const MONO_NAME = 'min-w-0 truncate font-mono text-xs'

export const QUIET_MONO = 'shrink-0 font-mono text-xs text-muted-foreground'

export const GROUP = 'px-2 pt-2 pb-1 text-xs font-medium text-muted-foreground'

export const ROW =
  'flex w-full min-w-0 items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm outline-none hover:bg-accent focus-ring'

export const LINE_OF = 'min-w-0 flex-1 truncate font-mono text-xs text-muted-foreground'

const WHERE = 'min-w-0 flex-1 truncate font-mono text-xs text-muted-foreground'

/** A run's type icon, or the terminal's for a line the catalogue lacks. */
function TypeMark({ run }: { run: GoingOnRun }): ReactNode {
  const TypeIcon = COMMAND_TYPE_ICONS[run.type]
  return (
    <span className={ICON}>
      <TypeIcon size="sm" aria-hidden="true" />
    </span>
  )
}

/** What a run reads as in one line: its type, its dot, its name, and its exit once over. */
export function RunFace({ run }: { run: GoingOnRun }): ReactNode {
  const exit = exitOf(run)
  const tone = toneOf(run)
  return (
    <>
      <TypeMark run={run} />
      <StatusDot status={tone} size="sm" label={WORDS[tone]} />
      <span className={run.oneOff === true ? MONO_NAME : NAME}>{run.name}</span>
      {exit !== null && <span className={QUIET_MONO}>{exit}</span>}
      {run.url !== undefined && run.state === 'running' && (
        <span className={QUIET_MONO}>{run.url.replace(/^https?:\/\//, '')}</span>
      )}
    </>
  )
}

/** An icon action, named by its tooltip: never a word-button beside a run. */
export function Act({
  label,
  icon,
  onPress,
}: {
  label: string
  icon: ReactNode
  onPress: () => void
}): ReactNode {
  return (
    <Tooltip label={label}>
      <IconButton variant="ghost" size="sm" icon={icon} aria-label={label} onClick={onPress} />
    </Tooltip>
  )
}

/** The one-off's offer to be kept: a quiet mark, named by its tooltip, never a word-button. */
export function KeepButton({ run, onKeep }: { run: GoingOnRun; onKeep: () => void }): ReactNode {
  return (
    <Act
      label={`Add ${run.command} to the catalogue`}
      icon={<IconBookmarkPlus size="sm" />}
      onPress={onKeep}
    />
  )
}

/**
 * Run again, or Stop while it runs (point 11): the one press a run offers wherever it is read
 * with its tools, in its glance and in the history, in the same place.
 */
export function AgainOrStop({
  run,
  onRunAgain,
  onStop,
}: {
  run: GoingOnRun
  onRunAgain: (run: GoingOnRun) => void
  onStop: (run: GoingOnRun) => void
}): ReactNode {
  return run.state === 'running' ? (
    <Act
      label={`Stop ${run.name}`}
      icon={<IconPlayerStop size="sm" />}
      onPress={() => onStop(run)}
    />
  ) : (
    <Act
      label={`Run ${run.name} again`}
      icon={<IconRefresh size="sm" />}
      onPress={() => onRunAgain(run)}
    />
  )
}

// The thread's entry of a run (points 1 and 2).

const ENTRY_SUMMARY = 'flex min-w-0 items-center gap-2'

const ENTRY_LINE = 'flex min-w-0 items-center gap-1'

const ENTRY_COMMAND = 'min-w-0 truncate font-mono text-xs text-muted-foreground'

/**
 * A run in the thread: one line like any other call — its type, its dot, its name, its exit — and
 * nothing to press but the fold. Closed by default whatever its state: the thread says what
 * happened, and the output is there once asked for.
 */
export function ThreadRun({
  held,
  onSeen,
  keep,
}: {
  held: Held
  /** Said the first time the reader opens it: a failure opened is a failure seen. */
  onSeen: () => void
  /** The one-off's offer to be kept, when the variant puts it in the entry. */
  keep?: ReactNode
}): ReactNode {
  const { run } = held
  return (
    <Disclosure
      onOpenChange={(open) => {
        if (open) onSeen()
      }}
      summary={
        <span className={ENTRY_SUMMARY}>
          <RunFace run={run} />
        </span>
      }
    >
      <div className="flex flex-col gap-1">
        <div className={ENTRY_LINE}>
          <span className={ENTRY_COMMAND}>{`${run.folder} $ ${run.command}`}</span>
          {keep}
        </div>
        {run.output === '' ? (
          <p className="text-xs text-muted-foreground">Nothing printed.</p>
        ) : (
          <TerminalOutput
            plain
            terminalId={run.id}
            output={run.output}
            released={run.state !== 'running'}
          />
        )}
      </div>
    </Disclosure>
  )
}

// What arrives and leaves, by its height (point 6).

/**
 * An entry of the thread, or anything stacked in a column: it grows into place when it arrives
 * while the page is looked at, and pushes what is under it as it does. What was there when the
 * page opened is simply there.
 */
export function Arrive({ fresh, children }: { fresh: boolean; children: ReactNode }): ReactNode {
  const transition = useTransition(fold)
  return (
    <motion.div
      className="overflow-hidden"
      initial={fresh ? collapse : false}
      animate={expand}
      transition={transition}
    >
      {children}
    </motion.div>
  )
}

/** One of a list inside `AnimatePresence`: it arrives and leaves by its height. */
export function FoldItem({ children }: { children: ReactNode }): ReactNode {
  const transition = useTransition(fold)
  return (
    <motion.div
      className="overflow-hidden"
      initial={collapse}
      animate={expand}
      exit={collapse}
      transition={transition}
    >
      {children}
    </motion.div>
  )
}

/** What stands above the composer while it has something to say, and goes by its height. */
export function Dock({ shown, children }: { shown: boolean; children: ReactNode }): ReactNode {
  const transition = useTransition(fold)
  return (
    <AnimatePresence initial={false}>
      {shown && (
        <motion.div
          key="dock"
          className="overflow-hidden"
          initial={collapse}
          animate={expand}
          exit={collapse}
          transition={transition}
        >
          <div className="pb-2">{children}</div>
        </motion.div>
      )}
    </AnimatePresence>
  )
}

// The line in the head (points 4, 9 and 11).

const LINE = 'flex min-w-0 flex-1 flex-wrap items-center gap-y-1.5'

const CHIP =
  'inline-flex h-control-sm max-w-menu-side min-w-0 items-center gap-1.5 rounded-md border border-border bg-card px-2 text-xs outline-none hover:bg-accent focus-ring data-popup-open:bg-accent'

/** A chip on its way out: the same chip, its words quieter, still pressable. */
const DIM_CHIP =
  'inline-flex h-control-sm max-w-menu-side min-w-0 items-center gap-1.5 rounded-md border border-dashed border-border bg-transparent px-2 text-xs text-muted-foreground outline-none hover:bg-accent focus-ring data-popup-open:bg-accent'

/** The room each chip takes, which is what grows and folds: its right edge is the gap. */
const SLOT = 'flex shrink-0 overflow-hidden pr-1.5'

const SHOWN = { width: 'auto', filter: 'opacity(1)' } as const

const HIDDEN = { width: 0, filter: 'opacity(0)' } as const

const GLANCE = 'flex w-menu-panel flex-col gap-2'

const GLANCE_HEAD = 'flex min-w-0 items-center gap-1.5 text-sm'

/** A place on the line that arrives and leaves by its width, pushing the chips after it. */
function Slot({ children }: { children: ReactNode }): ReactNode {
  const transition = useTransition(fold)
  return (
    <motion.span
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

export interface LineActions {
  onStop: (run: GoingOnRun) => void
  onRunAgain: (run: GoingOnRun) => void
  onOpenUrl: (url: string) => void
  onKeep: (run: GoingOnRun) => void
  onSeen: (id: string) => void
  /** Takes a chip out of the line; the run stays in the history. */
  onRemove: (run: GoingOnRun) => void
}

/**
 * A chip's glance: one head — the run, where it runs, and its tools, Run again or Stop first, then
 * the one-off's keep where the variant puts it, the ⓘ of its details and the ✕ that takes it out
 * of the line — and what it printed under it.
 */
function Glance({
  run,
  rules,
  actions,
  onDetails,
}: {
  run: GoingOnRun
  rules: Rules
  actions: LineActions
  onDetails: () => void
}): ReactNode {
  return (
    <div className={GLANCE}>
      <div className={GLANCE_HEAD}>
        <RunFace run={run} />
        <span className={WHERE}>{run.folder}</span>
        <span className="flex shrink-0 items-center">
          <AgainOrStop run={run} onRunAgain={actions.onRunAgain} onStop={actions.onStop} />
          {run.oneOff === true && rules.keep === 'glance' && (
            <KeepButton run={run} onKeep={() => actions.onKeep(run)} />
          )}
          <Act
            label={`Details of ${run.name}`}
            icon={<IconInfoCircle size="sm" />}
            onPress={onDetails}
          />
          <Act
            label={`Remove ${run.name} from the line`}
            icon={<IconX size="sm" />}
            onPress={() => actions.onRemove(run)}
          />
        </span>
      </div>
      {run.url !== undefined && run.state === 'running' && (
        <p className="text-xs">
          <ServiceUrl url={run.url} readiness={run.readiness} onOpenUrl={actions.onOpenUrl} />
        </p>
      )}
      <GoingOnOutput item={run} />
    </div>
  )
}

/** Where a run sits on the line: a one-off by itself, a command of the catalogue by its name. */
function slotOf(run: GoingOnRun): string {
  return run.oneOff === true ? run.id : `command-${run.name}`
}

/**
 * The line, with a lifecycle: a chip per run that still has something to say, and one per command
 * of the catalogue that ran, which is its shortcut. A command run again takes its own chip's place,
 * so nothing on the line moves but what arrives and what leaves.
 */
export function QuietLine({
  rules,
  runs,
  actions,
  end,
  defaultOpen = null,
}: {
  rules: Rules
  runs: readonly Held[]
  actions: LineActions
  /** Run, at the end of the line. */
  end: ReactNode
  /** The chip whose glance is open as the line is drawn. */
  defaultOpen?: string | null | undefined
}): ReactNode {
  const [open, setOpen] = useState<string | null>(defaultOpen)
  const [detail, setDetail] = useState<string | null>(null)
  // The newest run of each slot is the one the slot shows.
  const latest = new Map(runs.map((one) => [slotOf(one.run), one]))
  const chips = [...latest.values()]
    .map((one) => ({ one, place: placeOf(rules, one) }))
    .filter(({ place }) => place !== 'gone')
  const detailed = runs.find(({ run }) => run.id === detail)?.run

  function glance(id: string, next: boolean): void {
    setOpen(next ? id : null)
    // A failure is seen once its glance has been read and closed: it leaves the line then, and
    // never from under the reader's eyes.
    if (!next) actions.onSeen(id)
  }

  return (
    <div role="group" aria-label="What goes on in this Session" className={LINE}>
      <AnimatePresence initial={false}>
        {chips.map(({ one, place }) => (
          <Slot key={slotOf(one.run)}>
            <Popover
              side="bottom"
              align="start"
              label={nameOf(one.run)}
              open={open === one.run.id}
              onOpenChange={(next) => glance(one.run.id, next)}
              trigger={
                <button
                  type="button"
                  className={place === 'dim' ? DIM_CHIP : CHIP}
                  aria-label={nameOf(one.run)}
                >
                  <RunFace run={one.run} />
                </button>
              }
            >
              <Glance
                run={one.run}
                rules={rules}
                actions={{
                  ...actions,
                  onRemove: (run) => {
                    setOpen(null)
                    actions.onRemove(run)
                  },
                }}
                onDetails={() => {
                  setOpen(null)
                  setDetail(one.run.id)
                }}
              />
            </Popover>
          </Slot>
        ))}
      </AnimatePresence>
      {end}
      {detailed !== undefined && (
        <GoingOnDetails
          item={detailed}
          onClose={() => setDetail(null)}
          onStop={actions.onStop}
          onOpenUrl={actions.onOpenUrl}
          onAddToCatalogue={actions.onKeep}
        />
      )}
    </div>
  )
}

// Run (points 5 and 10).

const TRIGGER =
  'inline-flex h-control-sm items-center gap-1 rounded-md px-2 text-xs font-medium text-muted-foreground outline-none hover:bg-accent hover:text-foreground focus-ring data-popup-open:bg-accent data-popup-open:text-foreground'

const FOOT = 'mt-1 flex flex-col border-t border-border pt-1'

const MENU_ROW = 'flex min-w-0 items-center gap-1'

const MENU_OPEN =
  'flex min-w-0 flex-1 items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm outline-none hover:bg-accent focus-ring'

/**
 * Run, at the end of the line: a command of the catalogue, or a line run once. At its foot, the
 * way to the catalogue, which never leaves the Session: `open` hands it to the ⓘ details, `edit`
 * edits it right here, a pencil a row and Add at the foot. The `deck` variant adds what left the
 * line, under Earlier, with a one-off's offer to be kept.
 */
export function RunMenu({
  catalogue,
  running,
  earlier = [],
  keepHere,
  catalogueHere,
  onRun,
  onKeep,
  onDetails,
  onOpenCatalogue,
  onEdit,
  defaultOpen = false,
}: {
  catalogue: readonly CommandLine[]
  /** The names of the catalogue's commands that run now. */
  running: readonly string[]
  /** What left the line, newest first. */
  earlier?: readonly GoingOnRun[] | undefined
  /** Whether a one-off under Earlier offers to be kept here. */
  keepHere: boolean
  /** Whether the catalogue is edited in this menu rather than in the details. */
  catalogueHere: boolean
  onRun: (line: string) => void
  onKeep: (run: GoingOnRun) => void
  onDetails: (run: GoingOnRun) => void
  /** Opens the ⓘ details on the catalogue. */
  onOpenCatalogue: () => void
  /** Opens the catalogue's own dialog on a command, or on a new one. */
  onEdit: (entry: CommandLine | null) => void
  defaultOpen?: boolean | undefined
}): ReactNode {
  const [open, setOpen] = useState(defaultOpen)
  const [line, setLine] = useState('')
  const typed = line.trim().toLowerCase()
  const listed = catalogue.filter(
    (entry) => entry.name.includes(typed) || entry.command.includes(typed),
  )

  function run(what: string): void {
    onRun(what)
    setLine('')
    setOpen(false)
  }

  function edit(entry: CommandLine | null): void {
    setOpen(false)
    onEdit(entry)
  }

  return (
    <Popover
      side="bottom"
      align="start"
      title="Run a command"
      open={open}
      onOpenChange={setOpen}
      trigger={
        <button type="button" className={TRIGGER}>
          <IconPlayerPlay size="sm" aria-hidden="true" />
          Run
        </button>
      }
    >
      <div className="flex w-menu-panel flex-col gap-2">
        <Input
          label="Command"
          placeholder="A command of the catalogue, or any line"
          value={line}
          onValueChange={setLine}
          onKeyDown={(event) => {
            if (event.key === 'Enter' && typed !== '') {
              event.preventDefault()
              run(listed[0]?.command ?? line.trim())
            }
          }}
        />
        <div className="flex flex-col">
          <p className={GROUP}>Catalogue</p>
          {listed.map((entry) => {
            const TypeIcon = COMMAND_TYPE_ICONS[entry.type]
            return (
              <div key={entry.id} className={MENU_ROW}>
                <button type="button" className={MENU_OPEN} onClick={() => run(entry.command)}>
                  <span className={ICON}>
                    <TypeIcon size="sm" aria-hidden="true" />
                  </span>
                  <span className="shrink-0 font-medium">{entry.name}</span>
                  <span className={LINE_OF}>{entry.command}</span>
                  {running.includes(entry.name) && (
                    <StatusDot status="running" size="sm" label="running" />
                  )}
                </button>
                {catalogueHere && (
                  <Act
                    label={`Edit ${entry.name}`}
                    icon={<IconPencil size="sm" />}
                    onPress={() => edit(entry)}
                  />
                )}
              </div>
            )
          })}
          {listed.length === 0 && typed !== '' && (
            <button type="button" className={ROW} onClick={() => run(line.trim())}>
              <span className={ICON}>
                <IconPlayerPlay size="sm" aria-hidden="true" />
              </span>
              <span className="shrink-0">Run once</span>
              <span className={LINE_OF}>{line.trim()}</span>
            </button>
          )}
        </div>
        {earlier.length > 0 && (
          <div role="group" aria-labelledby="run-earlier" className="flex flex-col">
            <p id="run-earlier" className={GROUP}>
              Earlier
            </p>
            {earlier.map((one) => (
              <div key={one.id} className={MENU_ROW}>
                <button
                  type="button"
                  className={MENU_OPEN}
                  aria-label={`${nameOf(one)}, details`}
                  onClick={() => {
                    setOpen(false)
                    onDetails(one)
                  }}
                >
                  <RunFace run={one} />
                  <span className={WHERE}>{one.at}</span>
                </button>
                {keepHere && one.oneOff === true && (
                  <KeepButton run={one} onKeep={() => onKeep(one)} />
                )}
              </div>
            ))}
          </div>
        )}
        <div className={FOOT}>
          {catalogueHere ? (
            <button type="button" className={ROW} onClick={() => edit(null)}>
              <span className={ICON}>
                <IconPlus size="sm" aria-hidden="true" />
              </span>
              Add a command
            </button>
          ) : (
            <button
              type="button"
              className={ROW}
              onClick={() => {
                setOpen(false)
                onOpenCatalogue()
              }}
            >
              <span className={ICON}>
                <IconBook size="sm" aria-hidden="true" />
              </span>
              Catalogue
            </button>
          )}
        </div>
      </div>
    </Popover>
  )
}

// A proposal, as a row (point 3).

const PROPOSAL = 'flex min-w-0 items-center gap-2 py-1 text-sm'

const ANSWER_MARK = 'flex shrink-0 text-muted-foreground'

/** A proposal in one line: its type, its name, its line; and its answer, or the controls given. */
export function ProposalRow({
  proposed,
  controls,
}: {
  proposed: Proposed
  /** What answers it, where the variant answers it in rows. */
  controls?: ReactNode
}): ReactNode {
  const { proposal, answer } = proposed
  const TypeIcon = COMMAND_TYPE_ICONS[proposal.type]
  return (
    <div className={PROPOSAL}>
      <span className={ICON}>
        <TypeIcon size="sm" aria-hidden="true" />
      </span>
      <span className="shrink-0 font-medium">{proposal.name}</span>
      <span className={LINE_OF}>{proposal.line}</span>
      {controls ??
        (answer === 'pending' ? (
          <StatusDot status="pending" size="sm" label="waiting" />
        ) : (
          <span className={ANSWER_MARK}>
            {answer === 'accepted' ? (
              <IconCheck size="sm" aria-label="added" />
            ) : (
              <IconX size="sm" aria-label="declined" />
            )}
          </span>
        ))}
    </div>
  )
}

/** The two answers of a proposal, as marks: never a pair of word-buttons per row. */
export function AnswerControls({
  name,
  onAnswer,
}: {
  name: string
  onAnswer: (answer: 'accepted' | 'declined') => void
}): ReactNode {
  return (
    <span className="flex shrink-0 items-center">
      <Act
        label={`Decline ${name}`}
        icon={<IconX size="sm" />}
        onPress={() => onAnswer('declined')}
      />
      <Act
        label={`Add ${name}`}
        icon={<IconCheck size="sm" />}
        onPress={() => onAnswer('accepted')}
      />
    </span>
  )
}

/** What the proposals come to, once answered: `5 added`, or `5 added, 1 declined`. */
export function tallyOf(proposals: readonly Proposed[]): string {
  const added = proposals.filter(({ answer }) => answer === 'accepted').length
  const declined = proposals.filter(({ answer }) => answer === 'declined').length
  if (declined === 0) return `${String(added)} added`
  if (added === 0) return `${String(declined)} declined`
  return `${String(added)} added, ${String(declined)} declined`
}

// A permission question (point 7).

const ASKED_ROW = 'flex min-w-0 items-center gap-2 text-sm'

const ASKED_MARK = 'flex shrink-0 text-warning-muted-foreground'

/**
 * A permission waiting, in one row: the shield, its dot, the line it would run, and the agent's
 * two answers — the words it offered, since a permission is a decision and not a state.
 */
export function AskedRow({
  asked,
  onAnswer,
}: {
  asked: Asked
  onAnswer: (answer: 'allowed' | 'refused') => void
}): ReactNode {
  return (
    <div className={ASKED_ROW} role="group" aria-label={`Permission to run ${asked.subject}`}>
      <span className={ASKED_MARK}>
        <IconShield size="sm" aria-hidden="true" />
      </span>
      <StatusDot status="pending" size="sm" label="waiting" />
      <span className={LINE_OF}>{asked.subject}</span>
      <span className="flex shrink-0 items-center gap-1">
        <Button variant="ghost" size="sm" onClick={() => onAnswer('refused')}>
          Refuse
        </Button>
        <Button variant="primary" size="sm" onClick={() => onAnswer('allowed')}>
          Allow once
        </Button>
      </span>
    </div>
  )
}

const TONE_OF_ASKED: Record<Asked['answer'], StatusTone> = {
  pending: 'pending',
  allowed: 'success',
  refused: 'cancelled',
}

/**
 * The permission's record in the thread: one closed line, answered or not — the shield, its dot,
 * the line — and, opened, where it would run and what was answered. Nothing to press but the fold:
 * the question itself waits where whatever waits for the reader waits.
 */
export function AskedThreadEntry({ asked }: { asked: Asked }): ReactNode {
  return (
    <Disclosure
      summary={
        <span className={ENTRY_SUMMARY}>
          <span className={ICON}>
            <IconShield size="sm" aria-hidden="true" />
          </span>
          <StatusDot
            status={TONE_OF_ASKED[asked.answer]}
            size="sm"
            label={asked.answer === 'pending' ? 'waiting' : asked.answer}
          />
          <span className="shrink-0 text-muted-foreground">{asked.label}</span>
          <span className={MONO_NAME}>{asked.subject}</span>
        </span>
      }
    >
      <div className="flex flex-col gap-1">
        <span className={ENTRY_COMMAND}>{`${asked.folder} $ ${asked.subject}`}</span>
        {asked.answer !== 'pending' && (
          <DecisionSummary
            answer={asked.answer === 'allowed' ? 'Allowed once' : 'Refused'}
            at={asked.at}
            refused={asked.answer === 'refused'}
          />
        )}
      </div>
    </Disclosure>
  )
}
