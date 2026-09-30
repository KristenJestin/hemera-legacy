import { AnimatePresence, motion } from 'motion/react'
import type { ReactNode } from 'react'

import { StatusDot } from '../../components/status-dot/status-dot.tsx'
import { Tooltip } from '../../components/tooltip/tooltip.tsx'
import { fold, useTransition } from '../../motion.ts'
import { HELPER_TONES, type Helper, helperName } from './fixtures.ts'
import { HelperIcon } from './helper-icons.tsx'

/**
 * The helper agents in the Session's head line, after the runs (decisions of 30 September on
 * issue #77): one chip a helper, and on it the helper only — its icon, a defined helper's own or
 * the common one of a free helper, its dot and its name, in the order a run's chip has them. What
 * it was handed and who launched it are the main agent's business, and nothing on the chip says
 * them.
 *
 * Resting on a chip, its glance quotes the helper's last line. Pressing it opens the helper's
 * thread, read only; the chip stays pressed while it is open, and a second press closes it.
 */

/** The same chip as a run's, so a helper reads as one more thing going on. */
const CHIP =
  'inline-flex h-control-sm max-w-menu-side min-w-0 items-center gap-1.5 rounded-md border border-border bg-card px-2 text-xs outline-none hover:bg-accent focus-ring aria-pressed:bg-accent'

const ICON = 'flex shrink-0 text-muted-foreground'

const LABEL = 'min-w-0 truncate font-medium'

/** Each chip's room in the line, which opens as a helper is launched and closes as it goes. */
const SLOT = 'flex shrink-0 overflow-hidden pr-1.5'

const SHOWN = { width: 'auto', filter: 'opacity(1)' } as const

const HIDDEN = { width: 0, filter: 'opacity(0)' } as const

export interface HelperChipsProps {
  helpers: readonly Helper[]
  /** The helper whose thread is open, whose chip is pressed. */
  open: string | null
  /** Opens a helper's thread, or closes it when it is the one open. */
  onPress: (id: string) => void
}

export function HelperChips({ helpers, open, onPress }: HelperChipsProps): ReactNode {
  const transition = useTransition(fold)
  return (
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
          <Tooltip label={helper.last} quote side="bottom">
            <button
              type="button"
              className={CHIP}
              aria-label={helperName(helper)}
              aria-pressed={open === helper.id}
              data-helper={helper.id}
              onClick={() => onPress(helper.id)}
            >
              <span className={ICON}>
                <HelperIcon name={helper.icon} size="md" />
              </span>
              <StatusDot status={HELPER_TONES[helper.state]} size="sm" />
              <span className={LABEL}>{helper.name}</span>
            </button>
          </Tooltip>
        </motion.span>
      ))}
    </AnimatePresence>
  )
}
