import Fuse from 'fuse.js'
import { type ReactNode, useEffect, useMemo, useRef, useState } from 'react'

import { COMMAND_TYPE_ICONS, type CommandType } from '../activity/command-type.ts'
import { Input } from '../components/field/field.tsx'
import { Popover } from '../components/popover/popover.tsx'
import { StatusDot } from '../components/status-dot/status-dot.tsx'
import { Tooltip } from '../components/tooltip/tooltip.tsx'
import { IconPlayerPlay } from '../icons.ts'

/**
 * Where the reader starts a command in a Session (issue #219): a Run at the end of the line under
 * its title, opening one field over the Project's catalogue.
 *
 * A command of the catalogue and a one-off line are two different things to start, and they look
 * it: the catalogue's with their type, their name and their line in quiet letters, a dot on what
 * already runs; a line the catalogue lacks apart, under its own words, run once in the Workspace's
 * root and not kept. No badge: a hint that shouts in green reads as a state.
 *
 * The list is the button: a click on a row starts it, and Enter starts the one the typing or the
 * arrows chose. An empty field chooses nothing, so an Enter there starts nothing.
 *
 * Typing matches the line as well as the name, and the name first — `pnpm lint` brings `lint` up —
 * by Fuse.js, whose weights are that order and which forgives a typo in a name.
 */

/** A command of the Project's catalogue, as the field offers it. */
export interface RunCatalogueEntry {
  name: string
  command: string
  type: CommandType
  /** Whether it runs already in this Session. */
  running: boolean
}

export interface RunCommandProps {
  catalogue: readonly RunCatalogueEntry[]
  /** The Workspace a command starts in, named. */
  workspace: string
  onRunCommand: (entry: RunCatalogueEntry) => void
  /** Runs a line once, in the Workspace's root, without keeping it. */
  onRunOnce: (line: string) => void
  /** Whether the field is open as it is drawn. */
  defaultOpen?: boolean | undefined
  /**
   * The keystroke that opens Run from anywhere in the Session (review of #250), written for the
   * platform: shown in Run's tooltip. The page registers it, and says it was pressed by `asked`.
   */
  shortcut?: string | undefined
  /** Bumped each time the keystroke is pressed: Run opens, its field taking the caret. */
  asked?: number | undefined
  /** What is typed in the field as it is drawn. */
  defaultLine?: string | undefined
}

type Option = { kind: 'catalogue'; entry: RunCatalogueEntry } | { kind: 'once'; line: string }

/**
 * How closely a match must fit to be offered. At 0.3 a line finds its command alone (`pnpm lint`
 * offers `lint`, not every command that starts with `pnpm`), a missing or doubled letter is
 * forgiven (`typechek`), and a line of nothing offers nothing; 0.4 let the other `pnpm` lines
 * trail behind, and it takes 0.5, with everything noisy, to forgive two letters swapped.
 */
const THRESHOLD = 0.3

const TRIGGER =
  'inline-flex h-control-sm items-center gap-1 rounded-md px-2 text-xs font-medium text-muted-foreground outline-none hover:bg-accent hover:text-foreground focus-ring data-popup-open:bg-accent data-popup-open:text-foreground'

const GROUP = 'px-2 pt-2 pb-1 text-xs font-medium text-muted-foreground'

const ROW =
  'flex w-full min-w-0 items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm outline-none hover:bg-accent'

const ROW_ACTIVE =
  'flex w-full min-w-0 items-center gap-2 rounded-md bg-accent px-2 py-1.5 text-left text-sm text-accent-foreground outline-none'

const ICON = 'flex shrink-0 text-muted-foreground'

const LINE = 'min-w-0 flex-1 truncate font-mono text-xs text-muted-foreground'

const ONCE_LINE = 'min-w-0 flex-1 truncate font-mono text-xs'

const NOTE = 'text-xs text-muted-foreground'

/** What the field offers for what is typed: the catalogue's matches, then the line itself, once. */
function optionsOf(
  catalogue: readonly RunCatalogueEntry[],
  fuse: Fuse<RunCatalogueEntry>,
  typed: string,
): Option[] {
  if (typed === '') return catalogue.map((entry) => ({ kind: 'catalogue', entry }))
  // Fuse weighs the keys after it matched them, so a result can come back scored past the
  // threshold it was asked for: a one-off line that only looks like a catalogue line came back
  // first, and Enter started the catalogue's command instead of the line typed. What is offered
  // is what is within the threshold.
  const matched: Option[] = fuse
    .search(typed)
    .filter(({ score }) => (score ?? 1) <= THRESHOLD)
    .map(({ item }) => ({ kind: 'catalogue', entry: item }))
  const known = catalogue.some((entry) => entry.name === typed || entry.command === typed)
  return known ? matched : [...matched, { kind: 'once', line: typed }]
}

function RunField({
  catalogue,
  workspace,
  defaultLine,
  onRun,
}: {
  catalogue: readonly RunCatalogueEntry[]
  workspace: string
  defaultLine: string
  onRun: (option: Option) => void
}): ReactNode {
  const [line, setLine] = useState(defaultLine)
  const typed = line.trim()
  const [active, setActive] = useState(typed === '' ? -1 : 0)
  const fuse = useMemo(
    () =>
      new Fuse(catalogue, {
        keys: [
          { name: 'name', weight: 2 },
          { name: 'command', weight: 1 },
        ],
        threshold: THRESHOLD,
        ignoreLocation: true,
        includeScore: true,
      }),
    [catalogue],
  )
  const options = optionsOf(catalogue, fuse, typed)
  const chosen = active < 0 ? undefined : options[Math.min(active, options.length - 1)]
  const listed = options.flatMap((option) => (option.kind === 'catalogue' ? [option] : []))
  const once = options.find((option) => option.kind === 'once')

  function run(option: Option | undefined): void {
    if (option === undefined) return
    onRun(option)
    setLine('')
    setActive(-1)
  }

  return (
    <div className="flex w-menu-panel flex-col gap-2">
      <Input
        label="Command"
        placeholder="A command of the catalogue, or any line"
        value={line}
        onValueChange={(next) => {
          setLine(next)
          setActive(next.trim() === '' ? -1 : 0)
        }}
        onKeyDown={(event) => {
          if (event.key === 'ArrowDown' && options.length > 0) {
            event.preventDefault()
            setActive((Math.max(active, -1) + 1) % options.length)
          }
          if (event.key === 'ArrowUp' && options.length > 0) {
            event.preventDefault()
            setActive((Math.max(active, 0) - 1 + options.length) % options.length)
          }
          if (event.key === 'Enter') {
            event.preventDefault()
            run(chosen)
          }
        }}
      />
      <div role="listbox" aria-label="What Run can start" className="flex flex-col">
        {listed.length > 0 && (
          <div role="group" aria-labelledby="run-catalogue" className="flex flex-col">
            <p id="run-catalogue" className={GROUP}>
              Catalogue
            </p>
            {listed.map((option) => {
              const index = options.indexOf(option)
              const TypeIcon = COMMAND_TYPE_ICONS[option.entry.type]
              return (
                <button
                  key={option.entry.name}
                  type="button"
                  role="option"
                  aria-selected={index === active}
                  className={index === active ? ROW_ACTIVE : ROW}
                  onPointerEnter={() => setActive(index)}
                  onClick={() => run(option)}
                >
                  <span className={ICON}>
                    <TypeIcon size="sm" aria-hidden="true" />
                  </span>
                  <span className="shrink-0 font-medium">{option.entry.name}</span>
                  <span className={LINE}>{option.entry.command}</span>
                  {option.entry.running && <StatusDot status="running" size="sm" label="running" />}
                </button>
              )
            })}
          </div>
        )}
        {once !== undefined && once.kind === 'once' && (
          <div role="group" aria-labelledby="run-once" className="flex flex-col">
            <p id="run-once" className={GROUP}>
              Not in the catalogue
            </p>
            <button
              type="button"
              role="option"
              aria-selected={options.indexOf(once) === active}
              className={options.indexOf(once) === active ? ROW_ACTIVE : ROW}
              onPointerEnter={() => setActive(options.indexOf(once))}
              onClick={() => run(once)}
            >
              <span className={ICON}>
                <IconPlayerPlay size="sm" aria-hidden="true" />
              </span>
              <span className="shrink-0">Run once</span>
              <span className={ONCE_LINE}>{once.line}</span>
            </button>
          </div>
        )}
      </div>
      <p className={NOTE}>
        {chosen === undefined
          ? 'Type a command of the catalogue, or any line to run it once.'
          : chosen.kind === 'once'
            ? `Runs once in ${workspace}’s root, and is not kept in the catalogue.`
            : `${chosen.entry.command}, in ${workspace}.`}
      </p>
    </div>
  )
}

export function RunCommand({
  catalogue,
  workspace,
  onRunCommand,
  onRunOnce,
  defaultOpen = false,
  defaultLine = '',
  shortcut,
  asked = 0,
}: RunCommandProps): ReactNode {
  const [open, setOpen] = useState(defaultOpen)
  // The keystroke asked for Run: it opens, and the popover puts the caret in its field.
  const answered = useRef(asked)
  useEffect(() => {
    if (asked === answered.current) return
    answered.current = asked
    setOpen(true)
  }, [asked])
  return (
    <Popover
      side="bottom"
      align="start"
      title="Run a command"
      open={open}
      onOpenChange={setOpen}
      trigger={
        <Tooltip label="Run a command" keys={shortcut}>
          <button type="button" className={TRIGGER}>
            <IconPlayerPlay size="sm" aria-hidden="true" />
            Run
          </button>
        </Tooltip>
      }
    >
      <RunField
        catalogue={catalogue}
        workspace={workspace}
        defaultLine={defaultLine}
        onRun={(option) => {
          if (option.kind === 'once') onRunOnce(option.line)
          else onRunCommand(option.entry)
          setOpen(false)
        }}
      />
    </Popover>
  )
}
