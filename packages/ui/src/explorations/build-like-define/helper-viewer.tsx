import type { ReactNode } from 'react'

import { Dialog } from '../../components/dialog/dialog.tsx'
import { StatusDot } from '../../components/status-dot/status-dot.tsx'
import { MessageScroller } from '../../message/scroller/scroller.tsx'
import { HELPER_TONES, HELPER_WORDS, type Helper } from './fixtures.ts'
import { HelperIcon } from './helper-icons.tsx'
import { threadOf } from './threads.tsx'

/**
 * A helper's thread, read only, opened from its chip (the maintainer's choice of 30 September on
 * issue #77): a dialog, as the Session details are one, the same in every kind of Session. It
 * shows the helper that was opened and nothing else — its icon and its dot beside its name, then
 * its live thread, with no composer. It closes by its close or by Escape, and the keyboard goes
 * back to the chip that opened it.
 */

const WHO = 'flex shrink-0 items-center gap-1.5 text-xs text-muted-foreground'

export interface HelperViewerProps {
  helpers: readonly Helper[]
  /** The helper whose thread is open, or none. */
  open: string | null
  onClose: () => void
}

export function HelperViewer({ helpers, open, onClose }: HelperViewerProps): ReactNode {
  const helper = helpers.find((one) => one.id === open)
  return (
    <Dialog
      title={helper?.name ?? ''}
      size="wide"
      open={helper !== undefined}
      onOpenChange={(next) => {
        if (!next) onClose()
      }}
    >
      {helper !== undefined && (
        <div className="flex h-pinned min-h-0 flex-col gap-2">
          <span className={WHO}>
            <HelperIcon name={helper.icon} size="md" />
            <StatusDot
              status={HELPER_TONES[helper.state]}
              size="sm"
              label={HELPER_WORDS[helper.state]}
            />
            <span className="font-mono">{helper.at}</span>
          </span>
          <MessageScroller
            className="flex-1"
            label={`What ${helper.name} is doing`}
            entries={threadOf(helper)}
          />
        </div>
      )}
    </Dialog>
  )
}
