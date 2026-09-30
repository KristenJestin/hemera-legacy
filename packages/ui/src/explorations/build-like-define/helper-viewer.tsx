import { AnimatePresence, motion } from 'motion/react'
import { type ReactNode, useEffect, useRef } from 'react'

import { IconButton } from '../../components/button/button.tsx'
import { Dialog } from '../../components/dialog/dialog.tsx'
import { StatusDot } from '../../components/status-dot/status-dot.tsx'
import { Tooltip } from '../../components/tooltip/tooltip.tsx'
import { IconX } from '../../icons.ts'
import { MessageScroller } from '../../message/scroller/scroller.tsx'
import { CROSSFADE, arrival, crossfade, slide, useTransition } from '../../motion.ts'
import { HELPER_TONES, type Helper, helperName } from './fixtures.ts'
import { HelperIcon } from './helper-icons.tsx'
import { threadOf } from './threads.tsx'

/**
 * A helper's thread, read only, opened from its chip (maintainer's feedback of 30 September on
 * issue #77): one mechanism for every kind of Session — `free`, `define` and `build` — that
 * belongs to neither the chat column nor a panel. Three ways to lay it, each with the same
 * inside: the helpers of the Session in a strip to go from one to another, the one open pressed,
 * its live thread under it, and no composer. Each closes back where the reader was — by its
 * close, by Escape, or by pressing the open helper's chip again — and gives the keyboard back to
 * the chip that opened it.
 *
 * - `sheet` · a large sheet under the head line, over the page. The head line stays in view, so
 *   a chip still goes from one helper to another.
 * - `dialog` · a dialog, as the Session details are one.
 * - `side` · a sheet sliding over the page from the right, over the panel's side.
 */

export type Opening = 'sheet' | 'dialog' | 'side'

const SHEET =
  'absolute inset-x-3 top-0 bottom-3 flex flex-col rounded-xl border border-border bg-surface-rim p-1.5 shadow-lg'

const SIDE_CLIP = 'pointer-events-none absolute inset-0 overflow-hidden'

const SIDE =
  'pointer-events-auto absolute top-0 right-3 bottom-3 flex w-spec-panel flex-col rounded-xl border border-border bg-surface-rim p-1.5 shadow-lg'

const HEAD = 'flex min-h-control-md shrink-0 items-center gap-1 pt-1 pr-1.5 pb-2.5 pl-1'

const STRIP = 'flex min-w-0 flex-1 flex-wrap items-center gap-1'

const TAB =
  'inline-flex h-control-sm min-w-0 items-center gap-1.5 rounded-md px-2 text-xs outline-none hover:bg-accent focus-ring aria-pressed:bg-accent aria-pressed:font-medium'

const BODY =
  'relative flex min-h-0 flex-1 flex-col overflow-hidden rounded-lg border border-border bg-surface-body shadow-sm'

const LAYER = 'absolute inset-0 flex flex-col'

export interface HelperViewerProps {
  opening: Opening
  helpers: readonly Helper[]
  /** The helper whose thread is open, or none. */
  open: string | null
  onOpen: (id: string) => void
  onClose: () => void
}

export function HelperViewer({
  opening,
  helpers,
  open,
  onOpen,
  onClose,
}: HelperViewerProps): ReactNode {
  const helper = helpers.find((one) => one.id === open)
  const arriving = useTransition(arrival)
  const fade = useTransition(crossfade)
  if (opening === 'dialog') {
    return (
      <Dialog
        title="Helpers"
        size="wide"
        open={helper !== undefined}
        onOpenChange={(next) => {
          if (!next) onClose()
        }}
      >
        {helper !== undefined && (
          <div className="flex h-pinned min-h-0 flex-col gap-2">
            <div className="flex shrink-0">
              <Strip helpers={helpers} open={helper.id} onOpen={onOpen} />
            </div>
            <Thread helper={helper} />
          </div>
        )}
      </Dialog>
    )
  }
  const from =
    opening === 'sheet'
      ? { y: slide('nudge', 'backward').enter, ...CROSSFADE.from }
      : { x: 'calc(100% + 1rem)' }
  const to = opening === 'sheet' ? { y: 0, ...CROSSFADE.to } : { x: 0 }
  const moves = opening === 'sheet' ? fade : arriving
  const sheet =
    helper === undefined ? null : (
      <motion.section
        key="viewer"
        aria-label="Helpers"
        className={opening === 'sheet' ? SHEET : SIDE}
        initial={from}
        animate={to}
        exit={from}
        transition={moves}
        onKeyDown={(event) => {
          if (event.key === 'Escape') onClose()
        }}
      >
        <header className={HEAD}>
          <Strip helpers={helpers} open={helper.id} onOpen={onOpen} />
          <Tooltip label="Close">
            <IconButton
              variant="ghost"
              size="sm"
              icon={<IconX size="sm" />}
              aria-label="Close the helpers"
              data-close
              onClick={onClose}
            />
          </Tooltip>
        </header>
        <div className={BODY}>
          <Thread helper={helper} />
        </div>
      </motion.section>
    )
  return opening === 'side' ? (
    <div className={SIDE_CLIP}>
      <AnimatePresence initial={false}>{sheet}</AnimatePresence>
    </div>
  ) : (
    <AnimatePresence initial={false}>{sheet}</AnimatePresence>
  )
}

/** The helpers of the Session, the open one pressed: a press goes to another. */
function Strip({
  helpers,
  open,
  onOpen,
}: {
  helpers: readonly Helper[]
  open: string
  onOpen: (id: string) => void
}): ReactNode {
  const strip = useRef<HTMLDivElement>(null)
  // Opened, the keyboard lands on the helper it opened on.
  useEffect(() => {
    strip.current
      ?.querySelector<HTMLElement>('[aria-pressed="true"]')
      ?.focus({ preventScroll: true })
  }, [])
  return (
    <div ref={strip} role="group" aria-label="The helpers of this Session" className={STRIP}>
      {helpers.map((one) => (
        <button
          key={one.id}
          type="button"
          className={TAB}
          aria-pressed={one.id === open}
          aria-label={helperName(one)}
          onClick={() => onOpen(one.id)}
        >
          <span className="flex shrink-0 text-muted-foreground">
            <HelperIcon name={one.icon} size="md" />
          </span>
          <StatusDot status={HELPER_TONES[one.state]} size="sm" />
          <span className="truncate">{one.name}</span>
        </button>
      ))}
    </div>
  )
}

/** The open helper's live thread, cross-faded when another is picked. */
function Thread({ helper }: { helper: Helper }): ReactNode {
  const fade = useTransition(crossfade)
  return (
    <div className="relative flex min-h-0 flex-1 flex-col">
      <AnimatePresence initial={false}>
        <motion.div
          key={helper.id}
          className={LAYER}
          initial={CROSSFADE.from}
          animate={CROSSFADE.to}
          exit={CROSSFADE.from}
          transition={fade}
        >
          <MessageScroller
            className="flex-1"
            label={`What ${helper.name} is doing`}
            entries={threadOf(helper)}
          />
        </motion.div>
      </AnimatePresence>
    </div>
  )
}
