import { AnimatePresence, motion, useAnimate } from 'motion/react'
import { type ReactNode, useEffect, useState } from 'react'

import { IconCheck, IconInfoCircle, IconPlayerStop, IconRefresh, IconX } from '../../icons.ts'
import {
  CROSSFADE,
  SHAKE,
  WIPE,
  collapse,
  crossfade,
  expand,
  fold,
  instant,
  shake,
  useTransition,
  wipe,
} from '../../motion.ts'
import { Button, IconButton } from '../button/button.tsx'
import { Popover } from '../popover/popover.tsx'
import { Tooltip } from '../tooltip/tooltip.tsx'

/**
 * What goes on, as one chip (issue #77, the maintainer's decisions of 1 October): a run and a
 * helper are the same chip, and differ only by what fills its `icon` slot — a command's type icon,
 * a helper's avatar — and by what their glance holds.
 *
 * - Neutral: the chip's own surface, edge and text, and no dot.
 * - Its duration in seconds and nothing else, glued to its unit (`84s`), in tabular digits and in
 *   a room kept for three of them, so the chip does not grow as a digit arrives; past 999s it
 *   widens once.
 * - Working, a faint tint breathes across its background, on the running dot's beat.
 * - Ending while it is watched, one wipe crosses it in the tint it ended on — success or failure —
 *   then a failure gives one short shake (`shake`), and the chip is neutral again: nothing tinted
 *   lasts. Its icon gives way to a plain check or ✕, the only thing coloured; stopped, a plain
 *   stop, quiet. The icon keeps its room, so nothing on the line moves.
 * - At its widest, a long name ends in "…"; the seconds never give way; the whole name is its
 *   tooltip, and its glance's head.
 * - Pressed, its glance: the mark, the whole name, the seconds, the step it is on and what it
 *   printed or said last; ⓘ for its details, and × to stop it — asked first, in the glance —
 *   while it works; Run again once it has ended.
 *
 * Asked for less movement, there is no breath, no wipe and no shake: the end is there at once.
 */

export type LiveState = 'running' | 'finished' | 'failed' | 'stopped'

/** How each state is said to a screen reader, after the name. */
export const LIVE_WORDS: Record<LiveState, string> = {
  running: 'running',
  finished: 'done',
  failed: 'failed',
  stopped: 'stopped',
}

const CHIP =
  'relative isolate inline-flex h-control-sm max-w-menu-side min-w-0 items-center gap-1.5 overflow-hidden rounded-md border border-border bg-card px-2 text-xs outline-none hover:bg-accent focus-ring data-popup-open:bg-accent'

/** What carries the shake: the chip as a whole, and nothing beside it. */
const SHAKEN = 'inline-flex min-w-0'

/** What says it works: the whole background, a faint tint breathing on the running dot's beat. */
const BREATH =
  'pointer-events-none absolute inset-0 -z-10 bg-warning-muted opacity-50 motion-safe:animate-breathe'

const WIPED: Record<'finished' | 'failed', string> = {
  finished: 'pointer-events-none absolute inset-0 -z-10 bg-success-muted',
  failed: 'pointer-events-none absolute inset-0 -z-10 bg-destructive-muted',
}

/** The icon's room, held by the chip's own icon whether it shows or not. */
const MARK = 'relative flex shrink-0'

const OWN = 'flex text-muted-foreground'

/** Once ended, only the icon is coloured. */
const ENDED: Record<Exclude<LiveState, 'running'>, string> = {
  finished: 'absolute inset-0 flex items-center justify-center text-success',
  failed: 'absolute inset-0 flex items-center justify-center text-destructive',
  stopped: 'absolute inset-0 flex items-center justify-center text-muted-foreground',
}

const NAME = 'min-w-0 truncate font-medium'

/** Three digits and the unit, set against its end; a fourth digit widens it. */
const TIME = 'min-w-8 shrink-0 text-right font-mono text-muted-foreground tabular-nums'

const GLANCE = 'flex w-menu-panel flex-col gap-2'

const HEAD = 'flex min-w-0 items-start gap-1.5 text-sm'

/** The head's mark, set on the first line of a name that wraps. */
const HEAD_MARK = 'flex h-5 shrink-0 items-center'

/** The whole name in the glance: it wraps rather than ending in an ellipsis. */
const WHOLE_NAME = 'min-w-0 flex-1 font-medium break-words'

const HEAD_TIME = 'shrink-0 pt-0.5 font-mono text-xs text-muted-foreground tabular-nums'

const TOOLS = '-my-1 flex shrink-0 items-center'

const ASK = 'overflow-hidden'

const QUESTION = 'flex min-w-0 items-center gap-2 text-sm'

const QUESTION_TEXT = 'min-w-0 flex-1 truncate font-medium'

const STEP = 'truncate font-mono text-xs text-muted-foreground'

/** A duration in seconds and nothing else, the unit against the number: `1s`, `84s`, `1200s`. */
export function durationOf(ms: number): string {
  return `${String(Math.max(0, Math.floor(ms / 1000)))}s`
}

/** The time now, read again every second while `ticking`. */
function useNow(ticking: boolean): number {
  const [now, setNow] = useState(() => Date.now())
  useEffect(() => {
    if (!ticking) return
    setNow(Date.now())
    const tick = setInterval(() => setNow(Date.now()), 1000)
    return () => clearInterval(tick)
  }, [ticking])
  return now
}

export interface LiveChipProps {
  /** The whole name, which the chip ends in an ellipsis when it is long. */
  name: string
  /** The slot: a command's type icon, a helper's avatar. */
  icon: ReactNode
  state: LiveState
  /** When it started, in milliseconds since the epoch. */
  startedAt: number
  /** When it ended; null while it works, and the seconds tick. */
  endedAt: number | null
  /** What a screen reader calls the chip and its glance; its name and its state by default. */
  label?: string | undefined
  /** The step it is on, one quiet line under the glance's head. */
  step?: ReactNode
  /** What it printed or said last, under the step. */
  children?: ReactNode
  /** ⓘ: its details. */
  onDetails: () => void
  /** × while it works, once the reader said so; left out, it cannot be stopped from here. */
  onStop?: (() => void) | undefined
  /** Run again, once it has ended. */
  onRunAgain?: (() => void) | undefined
  /** × once it has ended: takes the chip off the line it stands on. */
  onRemove?: (() => void) | undefined
  /** The tools of its own kind, before ⓘ. */
  tools?: ReactNode
  /** The glance open, for a caller that holds it; left out, the chip does. */
  open?: boolean | undefined
  onOpenChange?: ((open: boolean) => void) | undefined
  /** The glance has finished closing. */
  onClosed?: (() => void) | undefined
  /** The glance open as the chip is drawn. */
  defaultOpen?: boolean | undefined
}

/** The chip's icon, or the plain mark it ended on, in the same room. */
function Mark({ icon, end }: { icon: ReactNode; end: LiveState }): ReactNode {
  const fade = useTransition(crossfade)
  const ended = end === 'running' ? null : end
  return (
    <span className={MARK}>
      <motion.span
        className={OWN}
        initial={false}
        animate={ended === null ? CROSSFADE.to : CROSSFADE.from}
        transition={fade}
      >
        {icon}
      </motion.span>
      <AnimatePresence initial={false}>
        {ended !== null && (
          <motion.span
            key={ended}
            className={ENDED[ended]}
            data-end={ended}
            initial={CROSSFADE.from}
            animate={CROSSFADE.to}
            exit={CROSSFADE.from}
            transition={fade}
          >
            {ended === 'finished' && <IconCheck size="sm" aria-hidden="true" />}
            {ended === 'failed' && <IconX size="sm" aria-hidden="true" />}
            {ended === 'stopped' && <IconPlayerStop size="sm" aria-hidden="true" />}
          </motion.span>
        )}
      </AnimatePresence>
    </span>
  )
}

/** A tool of the glance, named by its tooltip. */
function Tool({
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

export function LiveChip({
  name,
  icon,
  state,
  startedAt,
  endedAt,
  label = `${name}, ${LIVE_WORDS[state]}`,
  step,
  children,
  onDetails,
  onStop,
  onRunAgain,
  onRemove,
  tools,
  open,
  onOpenChange,
  onClosed,
  defaultOpen = false,
}: LiveChipProps): ReactNode {
  const [held, setHeld] = useState(defaultOpen)
  const shown = open ?? held
  const [asking, setAsking] = useState(false)
  const [scope, animate] = useAnimate<HTMLSpanElement>()
  const crossing = useTransition(wipe)
  const shaking = useTransition(shake)
  const folding = useTransition(fold)
  const now = useNow(endedAt === null)
  const running = state === 'running'

  // Ended while it was watched, it wipes across once in the tint it ended on. Decided as the state
  // changes, during the render, so the end's mark never shows for a frame before the wipe.
  const [seen, setSeen] = useState(state)
  const [wiping, setWiping] = useState(false)
  if (seen !== state) {
    setSeen(state)
    setWiping(
      seen === 'running' && (state === 'finished' || state === 'failed') && crossing !== instant,
    )
  }

  function openChange(next: boolean): void {
    setHeld(next)
    if (!next) setAsking(false)
    onOpenChange?.(next)
  }

  /** The wipe has crossed: the end shows, and a failure gives its one short shake. */
  function crossed(): void {
    setWiping(false)
    if (state !== 'failed' || shaking === instant || scope.current === null) return
    void animate(scope.current, SHAKE, shaking)
  }

  const time = durationOf((endedAt ?? now) - startedAt)
  const end = wiping ? 'running' : state

  return (
    <span ref={scope} className={SHAKEN} data-live-chip>
      <Popover
        side="bottom"
        align="start"
        label={label}
        open={shown}
        onOpenChange={openChange}
        onClosed={onClosed}
        trigger={
          <Tooltip label={name}>
            <button type="button" className={CHIP} aria-label={label} data-state={state}>
              {running && <span aria-hidden="true" className={BREATH} data-breath />}
              {/* A presence of its own: a chip on a line whose presence skips what is there at
                  first would otherwise have its wipe start where it ends, and never cross. */}
              <AnimatePresence>
                {wiping && (state === 'finished' || state === 'failed') && (
                  <motion.span
                    key="wipe"
                    aria-hidden="true"
                    className={WIPED[state]}
                    data-wipe
                    initial={WIPE.before}
                    animate={WIPE.past}
                    transition={crossing}
                    onAnimationComplete={crossed}
                  />
                )}
              </AnimatePresence>
              <Mark icon={icon} end={end} />
              <span className={NAME}>{name}</span>
              <span className={TIME}>{time}</span>
            </button>
          </Tooltip>
        }
      >
        <div className={GLANCE}>
          <div className={HEAD}>
            <span className={HEAD_MARK}>
              <Mark icon={icon} end={end} />
            </span>
            <span className={WHOLE_NAME}>{name}</span>
            <span className={HEAD_TIME}>{time}</span>
            <span className={TOOLS}>
              {!running && onRunAgain !== undefined && (
                <Tool
                  label={`Run ${name} again`}
                  tip="Run again"
                  onPress={() => {
                    openChange(false)
                    onRunAgain()
                  }}
                >
                  <IconRefresh size="sm" />
                </Tool>
              )}
              {tools}
              <Tool
                label={`Details of ${name}`}
                tip="Details"
                onPress={() => {
                  openChange(false)
                  onDetails()
                }}
              >
                <IconInfoCircle size="sm" />
              </Tool>
              {running && onStop !== undefined && (
                <Tool label={`Stop ${name}`} tip="Stop" onPress={() => setAsking(true)}>
                  <IconX size="sm" />
                </Tool>
              )}
              {!running && onRemove !== undefined && (
                <Tool
                  label={`Remove ${name} from the line`}
                  tip="Remove from the line"
                  onPress={onRemove}
                >
                  <IconX size="sm" />
                </Tool>
              )}
            </span>
          </div>
          <AnimatePresence initial={false}>
            {running && asking && onStop !== undefined && (
              <motion.div
                key="ask"
                className={ASK}
                initial={collapse}
                animate={expand}
                exit={collapse}
                transition={folding}
              >
                <div role="group" aria-label={`Stop ${name}?`} className={QUESTION}>
                  <span className={QUESTION_TEXT}>{`Stop ${name}?`}</span>
                  <Button variant="ghost" size="sm" onClick={() => setAsking(false)}>
                    Cancel
                  </Button>
                  <Button
                    variant="destructive"
                    size="sm"
                    onClick={() => {
                      setAsking(false)
                      onStop()
                    }}
                  >
                    Stop
                  </Button>
                </div>
              </motion.div>
            )}
          </AnimatePresence>
          {step !== undefined && <p className={STEP}>{step}</p>}
          {children}
        </div>
      </Popover>
    </span>
  )
}
