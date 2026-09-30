import { type ReactNode, useState } from 'react'

import type { CommandState } from '../../activity/command-run.tsx'
import { COMMAND_TYPE_ICONS } from '../../activity/command-type.ts'
import { IconInfoCircle, IconRefresh, IconX } from '../../icons.ts'
import { GOING_ON_WORDS, GoingOnDetails, GoingOnOutput } from '../../session/going-on-details.tsx'
import { type GoingOnRun, goingOnStateOf } from '../../session/going-on.ts'
import { type ChipState, ChipTool, LiveChip, durationOf, useNow } from './live-chip.tsx'

/**
 * The runs of the head line (maintainer's decisions of 1 October on issue #77): each a `LiveChip`
 * with the command's type icon in its slot. Its glance's tools: × stops it while it runs, "Run
 * again" once it has ended, ⓘ opens its details.
 */

/** A run and the moments its duration is read from. */
export interface LiveRun {
  item: GoingOnRun
  startedAt: number
  endedAt: number | null
}

/** A run's state as its chip says it. */
const CHIP_STATES: Record<CommandState, ChipState> = {
  running: 'working',
  finished: 'finished',
  failed: 'failed',
  stopped: 'stopped',
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
  const state = CHIP_STATES[item.state]
  const running = state === 'working'
  const now = useNow(running)
  const Icon = COMMAND_TYPE_ICONS[item.type]
  return (
    <LiveChip
      state={state}
      icon={<Icon size="sm" aria-hidden="true" />}
      name={item.name}
      label={`${item.name}, ${GOING_ON_WORDS[goingOnStateOf(item)]}`}
      time={durationOf((run.endedAt ?? now) - run.startedAt)}
      data={{ 'data-run': item.id }}
      tools={(close) => (
        <>
          {running ? (
            <ChipTool label={`Stop ${item.name}`} tip="Stop" onPress={onStop}>
              <IconX size="sm" />
            </ChipTool>
          ) : (
            <ChipTool
              label={`Run ${item.name} again`}
              tip="Run again"
              onPress={() => {
                close()
                onRetry()
              }}
            >
              <IconRefresh size="sm" />
            </ChipTool>
          )}
          <ChipTool
            label={`Details of ${item.name}`}
            tip="Details"
            onPress={() => {
              close()
              onDetails()
            }}
          >
            <IconInfoCircle size="sm" />
          </ChipTool>
        </>
      )}
    >
      <GoingOnOutput item={item} />
    </LiveChip>
  )
}
