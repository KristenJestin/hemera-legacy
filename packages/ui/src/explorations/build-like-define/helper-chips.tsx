import { type ReactNode, useState } from 'react'

import { Button } from '../../components/button/button.tsx'
import { Dialog } from '../../components/dialog/dialog.tsx'
import { IconInfoCircle, IconX } from '../../icons.ts'
import { AgentText } from '../../message/agent-text.tsx'
import { type Helper, helperName } from './fixtures.ts'
import { HelperAvatar } from './helper-icons.tsx'
import { type ChipState, ChipTool, LiveChip, durationOf, useNow } from './live-chip.tsx'

/**
 * The helper agents in the Session's head line, after the runs (maintainer's decisions of 1
 * October on issue #77): each the same `LiveChip` as a run, with the helper's letter avatar in its
 * slot. Its glance's tools: ⓘ opens its thread, read only, in a dialog; × stops it once the reader
 * has said so — the main agent is told, and decides what comes next.
 */

const DOING = 'truncate font-mono text-xs text-muted-foreground'

/** A helper's state as its chip says it: a stuck helper still works, and nothing breathes on it. */
const CHIP_STATES: Record<Helper['state'], ChipState> = {
  running: 'working',
  stuck: 'still',
  finished: 'finished',
  failed: 'failed',
  stopped: 'stopped',
}

/** How long a helper has been at it, in milliseconds, from the minutes its fixture says. */
function runFor(helper: Helper): number {
  return Number.parseInt(helper.for, 10) * 60_000
}

export interface HelperChipsProps {
  helpers: readonly Helper[]
  /** Opens a helper's thread. */
  onDetails: (id: string) => void
  /** Stops a helper, once the reader confirmed it. */
  onStop: (id: string) => void
  /** The glance open as the line is drawn, for the stories. */
  defaultGlance?: string | null | undefined
}

export function HelperChips({
  helpers,
  onDetails,
  onStop,
  defaultGlance = null,
}: HelperChipsProps): ReactNode {
  // The helper whose stop is being asked about: held here, since the glance closes as it asks.
  const [asking, setAsking] = useState<Helper | null>(null)
  const [askOpen, setAskOpen] = useState(false)
  return (
    <>
      {helpers.map((helper) => (
        <HelperChip
          key={helper.id}
          helper={helper}
          helpers={helpers}
          defaultOpen={defaultGlance === helper.id}
          onDetails={() => onDetails(helper.id)}
          onStop={() => {
            setAsking(helper)
            setAskOpen(true)
          }}
        />
      ))}
      <Dialog
        title={`Stop ${asking?.name ?? 'this helper'}?`}
        open={askOpen}
        onOpenChange={setAskOpen}
        actions={
          <>
            <Button variant="ghost" onClick={() => setAskOpen(false)}>
              Cancel
            </Button>
            <Button
              variant="destructive"
              onClick={() => {
                setAskOpen(false)
                if (asking !== null) onStop(asking.id)
              }}
            >
              Stop
            </Button>
          </>
        }
      />
    </>
  )
}

function HelperChip({
  helper,
  helpers,
  defaultOpen,
  onDetails,
  onStop,
}: {
  helper: Helper
  helpers: readonly Helper[]
  defaultOpen: boolean
  onDetails: () => void
  onStop: () => void
}): ReactNode {
  const state = CHIP_STATES[helper.state]
  const working = state === 'working' || state === 'still'
  const [start] = useState(() => Date.now() - runFor(helper))
  const now = useNow(working)
  return (
    <LiveChip
      state={state}
      icon={<HelperAvatar helper={helper} helpers={helpers} />}
      name={helper.name}
      label={helperName(helper)}
      time={durationOf(now - start)}
      defaultOpen={defaultOpen}
      data={{ 'data-helper': helper.id }}
      tools={(close) => (
        <>
          {working && (
            <ChipTool
              label={`Stop ${helper.name}`}
              tip="Stop"
              onPress={() => {
                close()
                onStop()
              }}
            >
              <IconX size="sm" />
            </ChipTool>
          )}
          <ChipTool
            label={`The thread of ${helper.name}`}
            tip="Its thread"
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
      <p className={DOING}>{helper.steps.at(-1)}</p>
      <AgentText text={helper.last} />
    </LiveChip>
  )
}
