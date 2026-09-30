import { motion } from 'motion/react'
import type { ReactNode } from 'react'

import { collapse, expand, fold, useTransition } from '../../motion.ts'

/**
 * What arrives where the hand asked for it — a box opened on lines, under a story, a feedback
 * just recorded — growing its room while it fades in, so what is under it is pushed rather than
 * jumping. `Reveal` of the design system does the same for what is shown by a choice, and draws
 * what is there at first without growing it; this one always grows, since it only ever exists
 * because the hand just asked.
 */
export function Arrive({ children }: { children: ReactNode }): ReactNode {
  const transition = useTransition(fold)
  return (
    <motion.div
      className="-mx-1 overflow-hidden px-1"
      initial={collapse}
      animate={expand}
      exit={collapse}
      transition={transition}
    >
      {children}
    </motion.div>
  )
}
