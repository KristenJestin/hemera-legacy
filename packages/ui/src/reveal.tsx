import { cn } from 'cn'
import { AnimatePresence, motion } from 'motion/react'
import type { ReactNode } from 'react'

import { collapse, expand, fold, useTransition } from './motion.ts'

const ROOM = 'overflow-hidden -mx-1 -mb-1 px-1 pb-1'

/** The gaps of the columns a room is placed in. */
export type RevealGap = '3' | '4'

/** The gap of the column taken back outside the room, and held inside it. */
const GAP: Record<RevealGap, { readonly room: string; readonly inside: string }> = {
  '3': { room: '-mt-3', inside: 'pt-3' },
  '4': { room: '-mt-4', inside: 'pt-4' },
}

export interface RevealProps {
  /** Whether what it holds is there. */
  shown: boolean
  /** The gap of the column it sits in, when it sits in one. */
  gap?: RevealGap | undefined
  children: ReactNode
}

/**
 * What a choice brings in, and takes away again (issue #183): a field that a box ticked asks
 * for, a note that only says something once two fields are filled.
 *
 * It arrives the way the rest of the design system's bodies arrive — `expand`, its room growing
 * while it fades in, on the spring made for a dimension — and leaves on `collapse`. Everything
 * under it moves with that room, so a dialog or a page grows as one thing rather than some of
 * it gliding and the rest landing at once; and a dialog's body follows a room that grows frame
 * by frame instead of playing it again.
 *
 * What is there when it is first drawn is simply there: a dialog opened on a box already ticked
 * shows its field, it does not unfold it.
 *
 * The room cuts what it holds, so that nothing of it shows before there is room for it, and it
 * keeps a little space around it so that a control's lift under the hand is never cut. It sits in a column whose parts a gap keeps apart, and
 * a room that is only arriving must not stand that gap away from what is above it: `gap` says
 * which one, and the room takes it back while it is empty and holds it inside once it is not.
 */
export function Reveal({ shown, gap, children }: RevealProps): ReactNode {
  const transition = useTransition(fold)
  const spacing = gap === undefined ? undefined : GAP[gap]
  return (
    <AnimatePresence initial={false}>
      {shown && (
        <motion.div
          // Named for what reads it: a story looking for the room a field arrived in.
          data-reveal=""
          className={cn(ROOM, spacing?.room)}
          initial={collapse}
          animate={expand}
          exit={collapse}
          transition={transition}
        >
          <div className={spacing?.inside}>{children}</div>
        </motion.div>
      )}
    </AnimatePresence>
  )
}
