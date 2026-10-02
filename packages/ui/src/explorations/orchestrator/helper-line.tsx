import { AnimatePresence, motion } from 'motion/react'
import { type ReactNode, useState } from 'react'

import { IconButton } from '../../components/button/button.tsx'
import { Face } from '../../components/face/face.tsx'
import { Popover } from '../../components/popover/popover.tsx'
import { StatusDot, type StatusTone } from '../../components/status-dot/status-dot.tsx'
import { Tooltip } from '../../components/tooltip/tooltip.tsx'
import { IconClock, IconEye, IconInfoCircle } from '../../icons.ts'
import { AgentText } from '../../message/agent-text.tsx'
import { fold, useTransition } from '../../motion.ts'
import { GoingOnDetails } from '../../session/going-on-details.tsx'
import { type Helper, type HelperState, familyOf, goingOnOf, iconOf, placeOf } from './fixtures.ts'
import { HelperIcon } from './helper-icons.tsx'

/**
 * The helper agents in the line of what goes on, next to the runs (decision of 30 September on
 * issue #77): one chip a helper, its icon — a defined helper's own, the common one for a free
 * helper — its dot, its name, and the task it is on.
 *
 * Which launched which is said lightly: a helper launched by another is joined to its launcher's
 * chip, in one outline, and never drawn as a tree. A stuck helper keeps its chip where it is, its
 * dot stops breathing and a clock says how long it has been silent.
 *
 * A chip opens a glance: the helper's live face, where it stands, what it is doing and its last
 * line, and two tools — its session, read only, and the Details every item of the line has.
 */

export const HELPER_TONES: Record<HelperState, StatusTone> = {
  running: 'running',
  stuck: 'pending',
  finished: 'success',
  failed: 'failure',
}

const WORDS: Record<HelperState, string> = {
  running: 'running',
  stuck: 'silent',
  finished: 'done',
  failed: 'failed',
}

/** The same chip as a run's, so a helper reads as one more thing going on. */
const CHIP =
  'inline-flex h-control-sm max-w-menu-side min-w-0 items-center gap-1.5 rounded-md border border-border bg-card px-2 text-xs outline-none hover:bg-accent focus-ring aria-pressed:bg-accent data-popup-open:bg-accent'

/** A launcher and the helpers it launched: one outline, the chips inside it without their own. */
const FAMILY =
  'inline-flex h-control-sm min-w-0 items-stretch rounded-md border border-border bg-card'

const IN_FAMILY =
  'inline-flex max-w-menu-side min-w-0 items-center gap-1.5 px-2 text-xs outline-none first:rounded-l-md last:rounded-r-md hover:bg-accent focus-ring aria-pressed:bg-accent data-popup-open:bg-accent'

/** A launched helper, set off from its launcher by a thin rule. */
const CHILD = 'flex border-l border-border'

const ICON = 'flex shrink-0 text-muted-foreground'

const LABEL = 'min-w-0 truncate font-medium'

const HINT = 'shrink-0 font-mono text-muted-foreground'

const QUIET = 'flex shrink-0 items-center gap-0.5 font-mono text-muted-foreground'

const GLANCE = 'flex w-menu-panel flex-col gap-2'

const GLANCE_HEAD = 'flex min-w-0 items-center gap-2 text-sm'

const WHERE = 'min-w-0 flex-1 truncate text-xs text-muted-foreground'

const DOING = 'truncate font-mono text-xs text-muted-foreground'

const SLOT = 'flex shrink-0 overflow-hidden pr-1.5'

const SHOWN = { width: 'auto', filter: 'opacity(1)' } as const

const HIDDEN = { width: 0, filter: 'opacity(0)' } as const

/** What a chip is called to a screen reader. */
export function helperName(helper: Helper): string {
  return `Helper ${helper.name}, ${WORDS[helper.state]}`
}

function Inside({ helper }: { helper: Helper }): ReactNode {
  return (
    <>
      <span className={ICON}>
        <HelperIcon name={iconOf(helper)} size="md" />
      </span>
      <StatusDot status={HELPER_TONES[helper.state]} size="sm" />
      <span className={LABEL}>{helper.name}</span>
      {helper.task !== null && helper.task !== helper.name && helper.parent === null && (
        <span className={HINT}>{helper.task}</span>
      )}
      {helper.quiet !== undefined && (
        <span className={QUIET}>
          <IconClock size="sm" aria-hidden="true" />
          {helper.quiet}
        </span>
      )}
    </>
  )
}

function Glance({
  helper,
  helpers,
  onOpen,
  onDetails,
}: {
  helper: Helper
  helpers: readonly Helper[]
  onOpen: () => void
  onDetails: () => void
}): ReactNode {
  return (
    <div className={GLANCE}>
      <div className={GLANCE_HEAD}>
        <Face state={helper.face} size="sm" seed={helper.seed} />
        <StatusDot status={HELPER_TONES[helper.state]} size="sm" />
        <span className={LABEL}>{helper.name}</span>
        {helper.quiet !== undefined && (
          <span className={QUIET}>
            <IconClock size="sm" aria-hidden="true" />
            {helper.quiet}
          </span>
        )}
        <span className={WHERE}>{placeOf(helper, helpers)}</span>
        <span className="flex shrink-0 items-center">
          <Tooltip label="Open its session">
            <IconButton
              variant="ghost"
              size="sm"
              icon={<IconEye size="sm" />}
              aria-label={`Open the session of ${helper.name}`}
              onClick={onOpen}
            />
          </Tooltip>
          <Tooltip label="Details">
            <IconButton
              variant="ghost"
              size="sm"
              icon={<IconInfoCircle size="sm" />}
              aria-label={`Details of ${helper.name}`}
              onClick={onDetails}
            />
          </Tooltip>
        </span>
      </div>
      <p className={DOING}>{helper.doing}</p>
      <AgentText text={helper.last} />
    </div>
  )
}

export interface HelperChipsProps {
  helpers: readonly Helper[]
  /** The helper whose session is open, whose chip is pressed. */
  open: string | null
  onOpen: (id: string) => void
  /** The glance open as the line is drawn, for the stories. */
  defaultGlance?: string | null | undefined
}

export function HelperChips({
  helpers,
  open,
  onOpen,
  defaultGlance = null,
}: HelperChipsProps): ReactNode {
  const [glance, setGlance] = useState<string | null>(defaultGlance)
  const [detail, setDetail] = useState<Helper | null>(null)
  const [detailOpen, setDetailOpen] = useState(false)
  const transition = useTransition(fold)

  function chip(helper: Helper, className: string): ReactNode {
    return (
      <Popover
        side="bottom"
        align="start"
        label={helperName(helper)}
        open={glance === helper.id}
        onOpenChange={(next) => setGlance(next ? helper.id : null)}
        trigger={
          <button
            type="button"
            className={className}
            aria-label={helperName(helper)}
            aria-pressed={open === helper.id}
          >
            <Inside helper={helper} />
          </button>
        }
      >
        <Glance
          helper={helper}
          helpers={helpers}
          onOpen={() => {
            setGlance(null)
            onOpen(helper.id)
          }}
          onDetails={() => {
            setGlance(null)
            setDetail(helper)
            requestAnimationFrame(() => setDetailOpen(true))
          }}
        />
      </Popover>
    )
  }

  return (
    <>
      <AnimatePresence initial={false}>
        {familyOf(helpers).map(({ helper, children }) => (
          <motion.span
            key={helper.id}
            className={SLOT}
            initial={HIDDEN}
            animate={SHOWN}
            exit={HIDDEN}
            transition={transition}
          >
            {children.length === 0 ? (
              chip(helper, CHIP)
            ) : (
              <span role="group" aria-label={`${helper.name} and its helpers`} className={FAMILY}>
                {chip(helper, IN_FAMILY)}
                {children.map((child) => (
                  <span key={child.id} className={CHILD}>
                    {chip(child, IN_FAMILY)}
                  </span>
                ))}
              </span>
            )}
          </motion.span>
        ))}
      </AnimatePresence>
      {detail !== null && (
        <GoingOnDetails
          item={goingOnOf(detail)}
          open={detailOpen}
          onClose={() => setDetailOpen(false)}
          onStop={() => undefined}
          onOpenUrl={() => undefined}
          onAddToCatalogue={() => undefined}
        />
      )}
    </>
  )
}
