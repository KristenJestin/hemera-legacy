import { AnimatePresence, motion, useAnimate } from 'motion/react'
import { type ReactNode, useEffect, useRef, useState } from 'react'

import { COMMAND_TYPE_ICONS } from '../../activity/command-type.ts'
import { IconButton } from '../../components/button/button.tsx'
import { Popover } from '../../components/popover/popover.tsx'
import { StatusDot } from '../../components/status-dot/status-dot.tsx'
import { Tooltip } from '../../components/tooltip/tooltip.tsx'
import { IconInfoCircle, IconPlayerStop, IconRefresh } from '../../icons.ts'
import { CROSSFADE, crossfade, fold, instant, pinging, pop, useTransition } from '../../motion.ts'
import {
  GOING_ON_TONES,
  GOING_ON_WORDS,
  GoingOnDetails,
  GoingOnOutput,
} from '../../session/going-on-details.tsx'
import { type GoingOnRun, goingOnStateOf } from '../../session/going-on.ts'

/**
 * The runs of the head line as chips that say what they are doing (maintainer's request of 30
 * September on issue #77, after React Bits' "call chip", written again on the design system's own
 * kinds). The chip is the run's, and its glance and ⓘ are what they were; what it adds:
 *
 * - running · a tint wipes across the chip on the running dot's beat, and its duration ticks;
 * - done · one short wash of the success tint, and the duration stands;
 * - failed · the chip takes the failure's tint and gives one short shake — nothing else on the
 *   line moves — and a retry glyph opens beside it, which runs it again.
 *
 * Asked for less movement, no wipe, no wash and no shake: the tint and the glyph are there at once.
 */

/** A run and the moments its duration is read from. */
export interface LiveRun {
  item: GoingOnRun
  startedAt: number
  endedAt: number | null
}

const CHIP =
  'relative isolate inline-flex h-control-sm max-w-menu-side min-w-0 items-center gap-1.5 overflow-hidden rounded-md border border-border bg-card px-2 text-xs outline-none hover:bg-accent focus-ring data-popup-open:bg-accent'

const FAILED =
  'relative isolate inline-flex h-control-sm max-w-menu-side min-w-0 items-center gap-1.5 overflow-hidden rounded-md border border-destructive bg-destructive-muted px-2 text-xs text-destructive-muted-foreground outline-none focus-ring'

/** What wipes across a running chip, under its words. */
const WIPE = 'pointer-events-none absolute inset-0 -z-10 bg-warning-muted'

/** What washes a chip once as it is done. */
const WASH = 'pointer-events-none absolute inset-0 -z-10 bg-success-muted'

const ICON = 'flex shrink-0 text-muted-foreground'

const LABEL = 'min-w-0 truncate font-medium'

const TIME = 'shrink-0 font-mono text-muted-foreground tabular-nums'

const SLOT = 'flex shrink-0 items-center pr-1.5'

const OPENS = 'flex shrink-0 overflow-hidden'

const SHOWN = { width: 'auto', filter: 'opacity(1)' } as const

const HIDDEN = { width: 0, filter: 'opacity(0)' } as const

const GLANCE = 'flex w-menu-panel flex-col gap-2'

const GLANCE_TIME = 'min-w-0 flex-1 font-mono text-xs text-muted-foreground tabular-nums'

const GLANCE_HEAD = 'flex min-w-0 items-center gap-1.5 text-sm'

/**
 * The one short shake of a run that failed: out and back, once, on the pop's beat. A kind of the
 * preset's own in a real version (`motion.ts` has none yet); written here for the exploration.
 */
const SHAKE = { x: [0, -3, 2, 0] }

/** A duration as a clock says it: minutes and seconds. */
function clockOf(ms: number): string {
  const seconds = Math.max(0, Math.floor(ms / 1000))
  return `${String(Math.floor(seconds / 60))}:${String(seconds % 60).padStart(2, '0')}`
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
  const wiping = useTransition(pinging)
  const washing = useTransition(crossfade)
  // The wash comes as the run is done, and goes as soon as it has come.
  const [washed, setWashed] = useState(false)
  const folding = useTransition(fold)
  const before = useRef(state)
  const Icon = COMMAND_TYPE_ICONS[item.type]
  const name = `${item.name}, ${GOING_ON_WORDS[state]}`
  const time = clockOf((run.endedAt ?? now) - run.startedAt)

  // One short shake as the run fails, one wash as it is done; never for a run that already was.
  useEffect(() => {
    const was = before.current
    before.current = state
    if (was === state) return
    if (state === 'finished' && washing !== instant) setWashed(true)
    if (state !== 'failed' || shaking === instant || chip.current === null) return
    void animate(chip.current, SHAKE, shaking)
  }, [state])

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
              className={state === 'failed' ? FAILED : CHIP}
              aria-label={name}
              data-run={item.id}
              data-state={state}
            >
              {running && wiping !== instant && (
                <motion.span
                  aria-hidden="true"
                  className={WIPE}
                  initial={{ x: '-100%' }}
                  animate={{ x: '100%' }}
                  transition={wiping}
                />
              )}
              <AnimatePresence initial={false}>
                {washed && (
                  <motion.span
                    key="wash"
                    aria-hidden="true"
                    className={WASH}
                    initial={CROSSFADE.from}
                    animate={CROSSFADE.to}
                    exit={CROSSFADE.from}
                    transition={washing}
                    onAnimationComplete={() => setWashed(false)}
                  />
                )}
              </AnimatePresence>
              <span className={ICON}>
                <Icon size="sm" aria-hidden="true" />
              </span>
              <StatusDot status={GOING_ON_TONES[state]} size="sm" />
              <span className={LABEL}>{item.name}</span>
              <span className={TIME}>{time}</span>
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
            transition={folding}
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
