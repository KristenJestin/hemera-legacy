import { AnimatePresence, motion, useAnimate } from 'motion/react'
import { type ReactNode, useEffect, useRef, useState } from 'react'

import { COMMAND_TYPE_ICONS } from '../../activity/command-type.ts'
import { IconButton } from '../../components/button/button.tsx'
import { Popover } from '../../components/popover/popover.tsx'
import { StatusDot } from '../../components/status-dot/status-dot.tsx'
import { Tooltip } from '../../components/tooltip/tooltip.tsx'
import { IconInfoCircle, IconPlayerStop, IconRefresh } from '../../icons.ts'
import { fold, instant, morph, pinging, pop, useTransition } from '../../motion.ts'
import {
  GOING_ON_TONES,
  GOING_ON_WORDS,
  GoingOnDetails,
  GoingOnOutput,
} from '../../session/going-on-details.tsx'
import { type GoingOnRun, type GoingOnState, goingOnStateOf } from '../../session/going-on.ts'
import { StatusMark } from './status-mark.tsx'

/**
 * The runs of the head line as chips that say what they are doing (maintainer's requests of 30
 * September on issue #77, after React Bits' "call chip", written again on the design system's own
 * kinds). The chip is the run's — its icon, its name, how long — with no dot: the chip itself says
 * how the run stands. Its glance and ⓘ are what they were.
 *
 * - running · a tint wipes across the chip on the running dot's beat, and the duration ticks, in
 *   seconds as a person says them (`42 s`, `1 min 12 s`);
 * - done · one last wipe, in the success tint, which is the chip's once it has crossed, and a
 *   tick draws itself at the end;
 * - failed · the same last wipe in the failure's tint, with no border, a cross drawn at the end,
 *   one short shake, and a retry glyph beside it that runs it again.
 *
 * Asked for less movement, no wipe and no shake: the end is there at once.
 */

/** A run and the moments its duration is read from. */
export interface LiveRun {
  item: GoingOnRun
  startedAt: number
  endedAt: number | null
}

const CHIP =
  'relative isolate inline-flex h-control-sm max-w-menu-side min-w-0 items-center gap-1.5 overflow-hidden rounded-md border border-border bg-card px-2 text-xs outline-none hover:bg-accent focus-ring data-popup-open:bg-accent'

/** A run done: the success tint, no border, what the wipe ended in. */
const DONE =
  'relative isolate inline-flex h-control-sm max-w-menu-side min-w-0 items-center gap-1.5 overflow-hidden rounded-md border border-transparent bg-success-muted px-2 text-xs text-success-muted-foreground outline-none focus-ring data-popup-open:border-success'

/** A run that failed: the failure's tint, no border. */
const FAILED =
  'relative isolate inline-flex h-control-sm max-w-menu-side min-w-0 items-center gap-1.5 overflow-hidden rounded-md border border-transparent bg-destructive-muted px-2 text-xs text-destructive-muted-foreground outline-none focus-ring data-popup-open:border-destructive'

/** The chip as it shows: running (and while its last wipe crosses), done, or failed. */
const CHIPS: Record<GoingOnState, string> = { running: CHIP, finished: DONE, failed: FAILED }

/** What wipes across a running chip, under its words. */
const WIPE = 'pointer-events-none absolute inset-0 -z-10 bg-warning-muted'

/** The last wipe, in the tint the run ends on, which is the chip's own once it has crossed. */
const WIPE_DONE = 'pointer-events-none absolute inset-0 -z-10 bg-success-muted'

const WIPE_FAILED = 'pointer-events-none absolute inset-0 -z-10 bg-destructive-muted'

const ICON = 'flex shrink-0'

const LABEL = 'min-w-0 truncate font-medium'

const TIME = 'shrink-0 font-mono tabular-nums'

const SLOT = 'flex shrink-0 items-center pr-1.5'

const OPENS = 'flex shrink-0 overflow-hidden'

const SHOWN = { width: 'auto', filter: 'opacity(1)' } as const

const HIDDEN = { width: 0, filter: 'opacity(0)' } as const

const GLANCE = 'flex w-menu-panel flex-col gap-2'

const GLANCE_TIME = 'min-w-0 flex-1 font-mono text-xs text-muted-foreground tabular-nums'

/** The mark a run ends on, opening beside its duration. */
const END_MARK = 'flex shrink-0 overflow-hidden'

const GLANCE_HEAD = 'flex min-w-0 items-center gap-1.5 text-sm'

/**
 * The one short shake of a run that failed: out and back, once, on the pop's beat. A kind of the
 * preset's own in a real version (`motion.ts` has none yet); written here for the exploration.
 */
const SHAKE = { x: [0, -3, 2, 0] }

/**
 * A duration in seconds, as a person says it: `42 s`, `1 min 12 s` past a minute, `1 h 3 min`
 * past an hour, where the seconds no longer matter.
 */
function durationOf(ms: number): string {
  const seconds = Math.max(0, Math.floor(ms / 1000))
  if (seconds < 60) return `${String(seconds)} s`
  const minutes = Math.floor(seconds / 60)
  if (minutes < 60) return `${String(minutes)} min ${String(seconds % 60)} s`
  return `${String(Math.floor(minutes / 60))} h ${String(minutes % 60)} min`
}

/** The time now, read again each second while something runs. */
function useNow(ticking: boolean): number {
  const [now, setNow] = useState(() => Date.now())
  useEffect(() => {
    if (!ticking) return
    const tick = setInterval(() => setNow(Date.now()), 1000)
    return () => clearInterval(tick)
  }, [ticking])
  return now
}

export interface RunChipsProps {
  runs: readonly LiveRun[]
  onStop: (id: string) => void
  onRetry: (id: string) => void
}

export function RunChips({ runs, onStop, onRetry }: RunChipsProps): ReactNode {
  const [details, setDetails] = useState<string | null>(null)
  const shown = runs.find((run) => run.item.id === details)
  return (
    <>
      {runs.map((run) => (
        <RunChip
          key={run.item.id}
          run={run}
          onStop={() => onStop(run.item.id)}
          onRetry={() => onRetry(run.item.id)}
          onDetails={() => setDetails(run.item.id)}
        />
      ))}
      {shown !== undefined && (
        <GoingOnDetails
          item={shown.item}
          onClose={() => setDetails(null)}
          onStop={() => onStop(shown.item.id)}
          onOpenUrl={() => undefined}
          onAddToCatalogue={() => undefined}
        />
      )}
    </>
  )
}

function RunChip({
  run,
  onStop,
  onRetry,
  onDetails,
}: {
  run: LiveRun
  onStop: () => void
  onRetry: () => void
  onDetails: () => void
}): ReactNode {
  const { item } = run
  const state = goingOnStateOf(item)
  const running = state === 'running'
  const now = useNow(running)
  const [glance, setGlance] = useState(false)
  const [chip, animate] = useAnimate<HTMLSpanElement>()
  const shaking = useTransition(pop)
  const looping = useTransition(pinging)
  const ending = useTransition(morph)
  const opening = useTransition(fold)
  const before = useRef(state)
  // Ended while it was watched, the run wipes across once more before its end shows.
  const [wiping, setWiping] = useState(false)
  const shows: GoingOnState = running || wiping ? 'running' : state
  const Icon = COMMAND_TYPE_ICONS[item.type]
  const name = `${item.name}, ${GOING_ON_WORDS[state]}`
  const time = durationOf((run.endedAt ?? now) - run.startedAt)

  useEffect(() => {
    const was = before.current
    before.current = state
    if (was !== 'running' || state === 'running') return
    if (ending === instant) return
    setWiping(true)
  }, [state])

  /** The last wipe done: the end shows, and a failure gives its one short shake. */
  function ended(): void {
    setWiping(false)
    if (state !== 'failed' || shaking === instant || chip.current === null) return
    void animate(chip.current, SHAKE, shaking)
  }

  return (
    <span className={SLOT}>
      <span ref={chip} className="flex">
        <Popover
          side="bottom"
          align="start"
          label={name}
          open={glance}
          onOpenChange={setGlance}
          trigger={
            <button
              type="button"
              className={CHIPS[shows]}
              aria-label={name}
              data-run={item.id}
              data-state={state}
            >
              {running && looping !== instant && (
                <motion.span
                  aria-hidden="true"
                  className={WIPE}
                  initial={{ x: '-100%' }}
                  animate={{ x: '100%' }}
                  transition={looping}
                />
              )}
              {wiping && (
                <motion.span
                  key="last"
                  aria-hidden="true"
                  className={state === 'failed' ? WIPE_FAILED : WIPE_DONE}
                  initial={{ x: '-100%' }}
                  animate={{ x: '0%' }}
                  transition={ending}
                  onAnimationComplete={ended}
                />
              )}
              <span className={ICON}>
                <Icon size="sm" aria-hidden="true" />
              </span>
              <span className={LABEL}>{item.name}</span>
              <span className={TIME}>{time}</span>
              <AnimatePresence initial={false}>
                {shows !== 'running' && (
                  <motion.span
                    key="end"
                    className={END_MARK}
                    initial={HIDDEN}
                    animate={SHOWN}
                    exit={HIDDEN}
                    transition={opening}
                  >
                    <StatusMark
                      size="sm"
                      state={shows === 'failed' ? 'failed' : 'done'}
                      label={GOING_ON_WORDS[state]}
                      arrives
                    />
                  </motion.span>
                )}
              </AnimatePresence>
            </button>
          }
        >
          <div className={GLANCE}>
            <div className={GLANCE_HEAD}>
              <span className={ICON}>
                <Icon size="sm" aria-hidden="true" />
              </span>
              <StatusDot status={GOING_ON_TONES[state]} size="sm" />
              <span className={LABEL}>{item.name}</span>
              <span className={GLANCE_TIME}>{time}</span>
              <span className="flex shrink-0 items-center">
                {running ? (
                  <Act label={`Stop ${item.name}`} tip="Stop" onPress={onStop}>
                    <IconPlayerStop size="sm" />
                  </Act>
                ) : (
                  <Act
                    label={`Run ${item.name} again`}
                    tip="Run again"
                    onPress={() => {
                      setGlance(false)
                      onRetry()
                    }}
                  >
                    <IconRefresh size="sm" />
                  </Act>
                )}
                <Act
                  label={`Details of ${item.name}`}
                  tip="Details"
                  onPress={() => {
                    setGlance(false)
                    onDetails()
                  }}
                >
                  <IconInfoCircle size="sm" />
                </Act>
              </span>
            </div>
            <GoingOnOutput item={item} />
          </div>
        </Popover>
      </span>
      <AnimatePresence initial={false}>
        {state === 'failed' && (
          <motion.span
            key="retry"
            className={OPENS}
            initial={HIDDEN}
            animate={SHOWN}
            exit={HIDDEN}
            transition={opening}
          >
            <Act label={`Run ${item.name} again`} tip="Run again" onPress={onRetry}>
              <IconRefresh size="sm" />
            </Act>
          </motion.span>
        )}
      </AnimatePresence>
    </span>
  )
}

/** An icon action, named by its tooltip, as a run's glance has them. */
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
