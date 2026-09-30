import type { ReactNode } from 'react'

import { SlidingMark } from '../components/sliding-mark/sliding-mark.tsx'
import { morph } from '../motion.ts'

/**
 * The one filled surface of the sidebar: the place being looked at, pressed into the panel.
 *
 * Denser than what surrounds it and not lighter. A light theme has nothing above white to lift
 * a selection to, so lifting it there says almost nothing; weight is a difference both themes
 * can carry. Nothing is raised, so nothing casts a shadow.
 */
const MARK = 'absolute inset-0 rounded-md bg-sidebar-accent'

/**
 * The sidebar's mark, handed from entry to entry: a Session, the Journal, the settings at the
 * foot of the panel (issue #127).
 *
 * It is the panel's and no entry's. An entry says which one it is with `data-mark`, and the
 * panel draws this after all of them, so that the mark crosses the rows between two places
 * rather than going under them — and it is written once, here, because two files draw entries
 * of the panel: the sidebar, and the Session's own row.
 *
 * It travels on `morph`, the panel's own spring: past critical damping, so the mark lands on
 * its row without going past it.
 */
export function SidebarMark({ target }: { target: string | null }): ReactNode {
  return <SlidingMark target={target} preset={morph} shape={MARK} />
}
