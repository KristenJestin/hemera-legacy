import { AnimatePresence, motion } from 'motion/react'
import { type ReactNode, useState } from 'react'

import { Button, IconButton } from '../../components/button/button.tsx'
import { Dialog } from '../../components/dialog/dialog.tsx'
import { Popover } from '../../components/popover/popover.tsx'
import { StatusDot } from '../../components/status-dot/status-dot.tsx'
import { Tooltip } from '../../components/tooltip/tooltip.tsx'
import { IconInfoCircle, IconX } from '../../icons.ts'
import { AgentText } from '../../message/agent-text.tsx'
import { fold, useTransition } from '../../motion.ts'
import { HELPER_TONES, type Helper, helperName } from './fixtures.ts'
import { HelperIcon } from './helper-icons.tsx'

/**
 * The helper agents in the Session's head line, after the runs (decisions of 30 September on
 * issue #77): one chip a helper — its icon, its dot and its name — that behaves as a run's chip
 * does. Pressed, it opens its glance: the helper as its chip draws it, how long it has been at
 * it, the step it is in and its last line, and two tools, as a run's glance has them:
 *
 * - ⓘ opens its thread, live and read only, in a dialog;
 * - × stops it, once the reader has said so. The main agent is told, and decides what comes next.
 */

/** The same chip as a run's, so a helper reads as one more thing going on. */
const CHIP =
  'inline-flex h-control-sm max-w-menu-side min-w-0 items-center gap-1.5 rounded-md border border-border bg-card px-2 text-xs outline-none hover:bg-accent focus-ring data-popup-open:bg-accent'

const ICON = 'flex shrink-0 text-muted-foreground'

const LABEL = 'min-w-0 truncate font-medium'

const SLOT = 'flex shrink-0 overflow-hidden pr-1.5'

const SHOWN = { width: 'auto', filter: 'opacity(1)' } as const

const HIDDEN = { width: 0, filter: 'opacity(0)' } as const

/** The glance, as a run's is laid: one line with its tools, and what it did under it. */
const GLANCE = 'flex w-menu-panel flex-col gap-2'

const GLANCE_HEAD = 'flex min-w-0 items-center gap-1.5 text-sm'

const FOR = 'min-w-0 flex-1 truncate font-mono text-xs text-muted-foreground'

const DOING = 'truncate font-mono text-xs text-muted-foreground'

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
  const transition = useTransition(fold)
  const [glance, setGlance] = useState<string | null>(defaultGlance)
  // The helper whose stop is being asked about: held here, since the glance closes as it asks.
  const [asking, setAsking] = useState<Helper | null>(null)
  const [askOpen, setAskOpen] = useState(false)
  return (
    <>
      <AnimatePresence initial={false}>
        {helpers.map((helper) => (
          <motion.span
            key={helper.id}
            className={SLOT}
            initial={HIDDEN}
            animate={SHOWN}
            exit={HIDDEN}
            transition={transition}
          >
            <Popover
              side="bottom"
              align="start"
              label={helperName(helper)}
              open={glance === helper.id}
              onOpenChange={(next) => setGlance(next ? helper.id : null)}
              trigger={
                <button
                  type="button"
                  className={CHIP}
                  aria-label={helperName(helper)}
                  data-helper={helper.id}
                >
                  <span className={ICON}>
                    <HelperIcon name={helper.icon} size="sm" />
                  </span>
                  <StatusDot status={HELPER_TONES[helper.state]} size="sm" />
                  <span className={LABEL}>{helper.name}</span>
                </button>
              }
            >
              <Glance
                helper={helper}
                onDetails={() => {
                  setGlance(null)
                  onDetails(helper.id)
                }}
                onStop={() => {
                  setGlance(null)
                  setAsking(helper)
                  setAskOpen(true)
                }}
              />
            </Popover>
          </motion.span>
        ))}
      </AnimatePresence>
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

function Glance({
  helper,
  onDetails,
  onStop,
}: {
  helper: Helper
  onDetails: () => void
  onStop: () => void
}): ReactNode {
  const working = helper.state === 'running' || helper.state === 'stuck'
  return (
    <div className={GLANCE}>
      <div className={GLANCE_HEAD}>
        <span className={ICON}>
          <HelperIcon name={helper.icon} size="sm" />
        </span>
        <StatusDot status={HELPER_TONES[helper.state]} size="sm" />
        <span className={LABEL}>{helper.name}</span>
        <span className={FOR}>{helper.for}</span>
        <span className="flex shrink-0 items-center">
          <Tooltip label="Its thread">
            <IconButton
              variant="ghost"
              size="sm"
              icon={<IconInfoCircle size="sm" />}
              aria-label={`The thread of ${helper.name}`}
              onClick={onDetails}
            />
          </Tooltip>
          {working && (
            <Tooltip label="Stop">
              <IconButton
                variant="ghost"
                size="sm"
                icon={<IconX size="sm" />}
                aria-label={`Stop ${helper.name}`}
                onClick={onStop}
              />
            </Tooltip>
          )}
        </span>
      </div>
      <p className={DOING}>{helper.steps.at(-1)}</p>
      <AgentText text={helper.last} />
    </div>
  )
}
