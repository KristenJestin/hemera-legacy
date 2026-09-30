import { AnimatePresence, motion, useAnimate } from 'motion/react'
import { type ReactNode, type RefObject, useEffect, useRef, useState } from 'react'

import { IconCheck, IconPlayerStop, IconX } from '../../icons.ts'
import { CROSSFADE, crossfade, instant, morph, pop, useTransition } from '../../motion.ts'

/**
 * What the run chips and the helper chips share (maintainer's spec of 30 September on issue #77):
 * the chip's own neutral surface, no dot, and a background that moves and never stays tinted.
 *
 * - working · a calm sign that it works (`WorkingLook`); the chip's own icon stands, and the
 *   duration ticks in seconds (`112s`);
 * - still · working and silent for too long: the same chip, and nothing moving across it;
 * - done · the wipe crosses once in the success tint and leaves the chip neutral; the chip's icon
 *   gives way to a plain tick, the one thing coloured;
 * - failed · the same once in the failure's tint, then one short shake; a plain cross in the
 *   failure's colour;
 * - stopped · no wipe; a plain stop, quiet.
 *
 * The chip's icon keeps its room when it gives way, so nothing on the line moves. Asked for less
 * movement, no wipe and no shake: the end is there at once.
 */

export type ChipState = 'working' | 'still' | 'finished' | 'failed' | 'stopped'

export const CHIP =
  'relative isolate inline-flex h-control-sm max-w-menu-side min-w-0 items-center gap-1.5 overflow-hidden rounded-md border border-border bg-card px-2 text-xs outline-none hover:bg-accent focus-ring data-popup-open:bg-accent'

/**
 * How a chip says it is working, calmly (maintainer's feedback: a head line of chips wiping at once
 * was disturbing). Nothing travels across it any more while the progress is not known:
 *
 * - `faint` · the whole background, a faint tint breathing on the running dot's beat;
 * - `line` · a thin line along its foot, still. Recommended: nothing on the line moves while a run
 *   works, and the seconds ticking already say it does.
 */
export type WorkingLook = 'faint' | 'line'

const WORKING: Record<WorkingLook, string> = {
  faint:
    'pointer-events-none absolute inset-0 -z-10 bg-warning-muted opacity-50 motion-safe:animate-breathe',
  line: 'pointer-events-none absolute inset-x-0 bottom-0 -z-10 h-0.5 bg-warning/60',
}

const LAST_WIPE: Record<'finished' | 'failed', string> = {
  finished: 'pointer-events-none absolute inset-0 -z-10 bg-success-muted',
  failed: 'pointer-events-none absolute inset-0 -z-10 bg-destructive-muted',
}

/** The icon's room, held by the chip's own icon whether it shows or not. */
const ICON = 'relative flex shrink-0'

const OWN = 'flex text-muted-foreground'

/** Only the icon is coloured once the chip has ended. */
const ENDED: Record<'finished' | 'failed' | 'stopped', string> = {
  finished: 'absolute inset-y-0 left-0 flex items-center text-success',
  failed: 'absolute inset-y-0 left-0 flex items-center text-destructive',
  stopped: 'absolute inset-y-0 left-0 flex items-center text-muted-foreground',
}

const LABEL = 'min-w-0 truncate font-medium'

/**
 * The duration's room, reserved for three digits and the unit (`999s`) and set against its end,
 * so the chip does not move as a digit is added; past 999 s it steps once to four.
 */
const TIME = 'w-8 shrink-0 text-right font-mono text-muted-foreground tabular-nums'

const TIME_LONG = 'w-10 shrink-0 text-right font-mono text-muted-foreground tabular-nums'

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

export interface LiveChip {
  /** What shakes: the chip's wrapper. */
  chip: RefObject<HTMLSpanElement | null>
  /** What the chip shows: still working while its last wipe crosses. */
  shows: ChipState
  /** Whether the last wipe is crossing. */
  wiping: boolean
  /** Said as the last wipe has crossed. */
  onWiped: () => void
}

/** The motion of a chip that ends while it is watched: the last wipe, then the shake of a failure. */
export function useLiveChip(state: ChipState): LiveChip {
  const [chip, animate] = useAnimate<HTMLSpanElement>()
  const shaking = useTransition(pop)
  const ending = useTransition(morph)
  const before = useRef(state)
  const [wiping, setWiping] = useState(false)

  useEffect(() => {
    const was = before.current
    before.current = state
    const working = was === 'working' || was === 'still'
    if (!working || (state !== 'finished' && state !== 'failed') || ending === instant) return
    setWiping(true)
  }, [state])

  return {
    chip,
    shows: wiping ? 'working' : state,
    wiping,
    onWiped: () => {
      setWiping(false)
      if (state !== 'failed' || shaking === instant || chip.current === null) return
      void animate(chip.current, SHAKE, shaking)
    },
  }
}

export interface ChipFaceProps {
  live: LiveChip
  state: ChipState
  /** The chip's own icon: the command's type, or the helper's. */
  icon: ReactNode
  name: string
  time: string
  /** How it says it is working. */
  working?: WorkingLook | undefined
}

/** What a chip holds: the moving background, its icon or the end that replaced it, name and time. */
export function ChipFace({
  live,
  state,
  icon,
  name,
  time,
  working = 'line',
}: ChipFaceProps): ReactNode {
  const ending = useTransition(morph)
  const fade = useTransition(crossfade)
  const { shows } = live
  const end = shows === 'finished' || shows === 'failed' || shows === 'stopped' ? shows : null
  const ended = end !== null
  return (
    <>
      {state === 'working' && <span aria-hidden="true" className={WORKING[working]} />}
      {live.wiping && (state === 'finished' || state === 'failed') && (
        <motion.span
          key="last"
          aria-hidden="true"
          className={LAST_WIPE[state]}
          initial={{ x: '-100%' }}
          animate={{ x: '100%' }}
          transition={ending}
          onAnimationComplete={live.onWiped}
        />
      )}
      <span className={ICON}>
        <motion.span
          className={OWN}
          initial={false}
          animate={ended ? CROSSFADE.from : CROSSFADE.to}
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
              {shows === 'finished' && <IconCheck size="sm" aria-hidden="true" />}
              {shows === 'failed' && <IconX size="sm" aria-hidden="true" />}
              {shows === 'stopped' && <IconPlayerStop size="sm" aria-hidden="true" />}
            </motion.span>
          )}
        </AnimatePresence>
      </span>
      <span className={LABEL}>{name}</span>
      <span className={time.length > 4 ? TIME_LONG : TIME}>{time}</span>
    </>
  )
}
