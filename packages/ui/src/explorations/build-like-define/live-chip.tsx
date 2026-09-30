import { AnimatePresence, motion, useAnimate } from 'motion/react'
import { type ReactNode, useEffect, useRef, useState } from 'react'

import { IconButton } from '../../components/button/button.tsx'
import { Popover } from '../../components/popover/popover.tsx'
import { Tooltip } from '../../components/tooltip/tooltip.tsx'
import { IconCheck, IconPlayerStop, IconX } from '../../icons.ts'
import { CROSSFADE, crossfade, instant, morph, pop, useTransition } from '../../motion.ts'

/**
 * One chip for everything that goes on in a Session (maintainer's decisions of 1 October on issue
 * #77): a run and a helper are the same chip, `LiveChip`, and differ only by what fills its `icon`
 * slot — a command's type icon, a helper's letter avatar — and by what its glance says.
 *
 * - the chip's own neutral surface, border and text; no dot;
 * - working · a faint tint breathing on the running dot's beat across its background;
 * - still · working and silent for too long: the same chip, and nothing breathing;
 * - done · one wipe crosses in the success tint and leaves the chip neutral; the icon gives way to
 *   a plain tick, the one thing coloured;
 * - failed · the same once in the failure's tint, then one short shake; a plain cross;
 * - stopped · no wipe; a plain stop, quiet;
 * - its duration in seconds (`112s`), in a room kept for three digits, so the chip does not move
 *   as a digit is added (past 999s it steps once to four);
 * - a long name ends in an ellipsis — its start is what tells runs and helpers apart — and never
 *   takes the seconds' room; the whole name is its tooltip, and its glance's;
 * - pressed, its glance: the icon, the whole name, the seconds, the tools (ⓘ, ×, and what else
 *   the kind has), and what it said last.
 *
 * The icon keeps its room when it gives way, so nothing on the line moves. Asked for less
 * movement, no wipe, no shake and no breath: the end is there at once.
 */

export type ChipState = 'working' | 'still' | 'finished' | 'failed' | 'stopped'

const CHIP =
  'relative isolate inline-flex h-control-sm max-w-menu-side min-w-0 items-center gap-1.5 overflow-hidden rounded-md border border-border bg-card px-2 text-xs outline-none hover:bg-accent focus-ring data-popup-open:bg-accent'

/** What says it works: the whole background, a faint tint breathing on the running dot's beat. */
const WORKING =
  'pointer-events-none absolute inset-0 -z-10 bg-warning-muted opacity-50 motion-safe:animate-breathe'

const LAST_WIPE: Record<'finished' | 'failed', string> = {
  finished: 'pointer-events-none absolute inset-0 -z-10 bg-success-muted',
  failed: 'pointer-events-none absolute inset-0 -z-10 bg-destructive-muted',
}

/** The icon's room, held by the chip's own icon whether it shows or not. */
const ICON = 'relative flex shrink-0'

const OWN = 'flex text-muted-foreground'

/** Only the icon is coloured once the chip has ended. */
const ENDED: Record<'finished' | 'failed' | 'stopped', string> = {
  finished: 'absolute inset-0 flex items-center justify-center text-success',
  failed: 'absolute inset-0 flex items-center justify-center text-destructive',
  stopped: 'absolute inset-0 flex items-center justify-center text-muted-foreground',
}

const LABEL = 'min-w-0 truncate font-medium'

const TIME = 'w-8 shrink-0 text-right font-mono text-muted-foreground tabular-nums'

const TIME_LONG = 'w-10 shrink-0 text-right font-mono text-muted-foreground tabular-nums'

const SLOT = 'flex shrink-0 items-center pr-1.5'

const GLANCE = 'flex w-menu-panel flex-col gap-2'

const GLANCE_HEAD = 'flex min-w-0 items-start gap-1.5 text-sm'

/** The whole name in the glance: it wraps rather than ending in an ellipsis. */
const GLANCE_NAME = 'min-w-0 flex-1 font-medium break-words'

const GLANCE_TIME = 'shrink-0 pt-0.5 font-mono text-xs text-muted-foreground tabular-nums'

/**
 * The one short shake of what failed: out and back, once, on the pop's beat. A kind of the
 * preset's own in a real version (`motion.ts` has none yet); written here for the exploration.
 */
const SHAKE = { x: [0, -3, 2, 0] }

/** A duration in seconds and nothing else, the unit against the number: `1s`, `42s`, `112s`. */
export function durationOf(ms: number): string {
  return `${String(Math.max(0, Math.floor(ms / 1000)))}s`
}

/** The time now, read again each second while something works. */
export function useNow(ticking: boolean): number {
  const [now, setNow] = useState(() => Date.now())
  useEffect(() => {
    if (!ticking) return
    const tick = setInterval(() => setNow(Date.now()), 1000)
    return () => clearInterval(tick)
  }, [ticking])
  return now
}

export interface LiveChipProps {
  state: ChipState
  /** The slot: a command's type icon, or a helper's avatar. */
  icon: ReactNode
  /** The whole name, which the chip ends in an ellipsis when it is long. */
  name: string
  /** What a screen reader calls the chip: its name and how it stands. */
  label: string
  time: string
  /** The glance's tools, ⓘ and × among them, handed the way to close the glance. */
  tools: (close: () => void) => ReactNode
  /** What the glance shows under its head: what it said or printed last. */
  children: ReactNode
  /** The glance open as the chip is drawn, for the stories. */
  defaultOpen?: boolean | undefined
  /** An attribute to find the chip by: `data-run` or `data-helper`. */
  data?: Record<`data-${string}`, string> | undefined
}

/** The chip every run and every helper is: its slot, its name, its seconds, its glance. */
export function LiveChip({
  state,
  icon,
  name,
  label,
  time,
  tools,
  children,
  defaultOpen = false,
  data,
}: LiveChipProps): ReactNode {
  const [open, setOpen] = useState(defaultOpen)
  const [chip, animate] = useAnimate<HTMLSpanElement>()
  const shaking = useTransition(pop)
  const ending = useTransition(morph)
  const fade = useTransition(crossfade)
  const before = useRef(state)
  const [wiping, setWiping] = useState(false)

  // Ended while it was watched, it wipes across once in the tint it ended on.
  useEffect(() => {
    const was = before.current
    before.current = state
    const working = was === 'working' || was === 'still'
    if (!working || (state !== 'finished' && state !== 'failed') || ending === instant) return
    setWiping(true)
  }, [state])

  /** The last wipe has crossed: the end shows, and a failure gives its one short shake. */
  function wiped(): void {
    setWiping(false)
    if (state !== 'failed' || shaking === instant || chip.current === null) return
    void animate(chip.current, SHAKE, shaking)
  }

  const shows = wiping ? 'working' : state
  const end = shows === 'finished' || shows === 'failed' || shows === 'stopped' ? shows : null
  const timeClass = time.length > 4 ? TIME_LONG : TIME

  return (
    <span className={SLOT}>
      <span ref={chip} className="flex">
        <Popover
          side="bottom"
          align="start"
          label={label}
          open={open}
          onOpenChange={setOpen}
          trigger={
            <Tooltip label={name}>
              <button
                type="button"
                className={CHIP}
                aria-label={label}
                data-state={state}
                {...data}
              >
                {state === 'working' && <span aria-hidden="true" className={WORKING} />}
                {wiping && (state === 'finished' || state === 'failed') && (
                  <motion.span
                    key="last"
                    aria-hidden="true"
                    className={LAST_WIPE[state]}
                    initial={{ x: '-100%' }}
                    animate={{ x: '100%' }}
                    transition={ending}
                    onAnimationComplete={wiped}
                  />
                )}
                <span className={ICON}>
                  <motion.span
                    className={OWN}
                    initial={false}
                    animate={end === null ? CROSSFADE.to : CROSSFADE.from}
                    transition={fade}
                  >
                    {icon}
                  </motion.span>
                  <AnimatePresence initial={false}>
                    {end !== null && (
                      <motion.span
                        key={end}
                        className={ENDED[end]}
                        initial={CROSSFADE.from}
                        animate={CROSSFADE.to}
                        exit={CROSSFADE.from}
                        transition={fade}
                      >
                        {end === 'finished' && <IconCheck size="sm" aria-hidden="true" />}
                        {end === 'failed' && <IconX size="sm" aria-hidden="true" />}
                        {end === 'stopped' && <IconPlayerStop size="sm" aria-hidden="true" />}
                      </motion.span>
                    )}
                  </AnimatePresence>
                </span>
                <span className={LABEL}>{name}</span>
                <span className={timeClass}>{time}</span>
              </button>
            </Tooltip>
          }
        >
          <div className={GLANCE}>
            <div className={GLANCE_HEAD}>
              <span className={OWN}>{icon}</span>
              <span className={GLANCE_NAME}>{name}</span>
              <span className={GLANCE_TIME}>{time}</span>
              <span className="-my-1 flex shrink-0 items-center">
                {tools(() => setOpen(false))}
              </span>
            </div>
            {children}
          </div>
        </Popover>
      </span>
    </span>
  )
}

/** A tool of a glance, named by its tooltip. */
export function ChipTool({
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
