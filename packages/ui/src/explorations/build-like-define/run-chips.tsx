import { type ReactNode, useState } from 'react'

import type { CommandState } from '../../activity/command-run.tsx'
import { COMMAND_TYPE_ICONS } from '../../activity/command-type.ts'
import { IconButton } from '../../components/button/button.tsx'
import { Popover } from '../../components/popover/popover.tsx'
import { StatusDot } from '../../components/status-dot/status-dot.tsx'
import { Tooltip } from '../../components/tooltip/tooltip.tsx'
import { IconInfoCircle, IconPlayerStop, IconRefresh } from '../../icons.ts'
import {
  GOING_ON_TONES,
  GOING_ON_WORDS,
  GoingOnDetails,
  GoingOnOutput,
} from '../../session/going-on-details.tsx'
import { type GoingOnRun, goingOnStateOf } from '../../session/going-on.ts'
import {
  CHIP,
  ChipFace,
  type ChipState,
  type WorkingLook,
  durationOf,
  useLiveChip,
  useNow,
} from './live-chip.tsx'

/**
 * The runs of the head line as chips that say what they are doing (maintainer's spec of 30
 * September on issue #77): the run's own neutral chip, no dot, a calm sign while it works, one wipe
 * in the tint it ends on and its type icon given way to a plain tick or cross — what `live-chip`
 * holds for run and helper chips alike. Running it again is in its glance. Its ⓘ is what it was.
 */

/** A run and the moments its duration is read from. */
export interface LiveRun {
  item: GoingOnRun
  startedAt: number
  endedAt: number | null
}

const SLOT = 'flex shrink-0 items-center pr-1.5'

const ICON = 'flex shrink-0 text-muted-foreground'

const LABEL = 'min-w-0 truncate font-medium'

const GLANCE = 'flex w-menu-panel flex-col gap-2'

const GLANCE_TIME = 'min-w-0 flex-1 font-mono text-xs text-muted-foreground tabular-nums'

const GLANCE_HEAD = 'flex min-w-0 items-center gap-1.5 text-sm'

/** A run's state as its chip says it. */
const CHIP_STATES: Record<CommandState, ChipState> = {
  running: 'working',
  finished: 'finished',
  failed: 'failed',
  stopped: 'stopped',
}

export interface RunChipsProps {
  runs: readonly LiveRun[]
  /** How a running chip says it works; the calm line unless a story compares. */
  working?: WorkingLook | undefined
  onStop: (id: string) => void
  onRetry: (id: string) => void
}

export function RunChips({ runs, working, onStop, onRetry }: RunChipsProps): ReactNode {
  const [details, setDetails] = useState<string | null>(null)
  const shown = runs.find((run) => run.item.id === details)
  return (
    <>
      {runs.map((run) => (
        <RunChip
          key={run.item.id}
          run={run}
          working={working}
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
  working,
  onStop,
  onRetry,
  onDetails,
}: {
  run: LiveRun
  working: WorkingLook | undefined
  onStop: () => void
  onRetry: () => void
  onDetails: () => void
}): ReactNode {
  const { item } = run
  const state = goingOnStateOf(item)
  const running = state === 'running'
  const now = useNow(running)
  const [glance, setGlance] = useState(false)
  const chipState = CHIP_STATES[item.state]
  const live = useLiveChip(chipState)
  const Icon = COMMAND_TYPE_ICONS[item.type]
  const name = `${item.name}, ${GOING_ON_WORDS[state]}`
  const time = durationOf((run.endedAt ?? now) - run.startedAt)

  return (
    <span className={SLOT}>
      <span ref={live.chip} className="flex">
        <Popover
          side="bottom"
          align="start"
          label={name}
          open={glance}
          onOpenChange={setGlance}
          trigger={
            <button
              type="button"
              className={CHIP}
              aria-label={name}
              data-run={item.id}
              data-state={state}
            >
              <ChipFace
                live={live}
                state={chipState}
                icon={<Icon size="sm" aria-hidden="true" />}
                name={item.name}
                time={time}
                working={working}
              />
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
