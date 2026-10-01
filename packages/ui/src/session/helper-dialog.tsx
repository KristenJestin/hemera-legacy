import type { ReactNode } from 'react'

import { Dialog } from '../components/dialog/dialog.tsx'
import { Face } from '../components/face/face.tsx'
import type { GoingOnAgent } from './going-on.ts'

/**
 * A helper, read (issue #77): its live thread, read-only — no composer, nothing to answer with —
 * under a head its live face leads. The reader opens it to see what the helper is doing or whether
 * it is stuck; what they have to say goes to the main agent. The thread is the page's to draw.
 */

const THREAD = 'flex flex-col gap-3'

export interface HelperDialogProps {
  helper: GoingOnAgent
  open: boolean
  onOpenChange: (open: boolean) => void
  /** Its thread, as the page draws a thread, read-only. */
  children: ReactNode
}

export function HelperDialog({
  helper,
  open,
  onOpenChange,
  children,
}: HelperDialogProps): ReactNode {
  return (
    <Dialog
      size="wide"
      title={helper.name}
      lead={<Face state={helper.face} size="sm" />}
      open={open}
      onOpenChange={onOpenChange}
    >
      <div className={THREAD} data-helper-thread>
        {children}
      </div>
    </Dialog>
  )
}
