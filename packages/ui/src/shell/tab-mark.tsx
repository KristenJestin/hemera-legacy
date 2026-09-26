import type { ReactNode } from 'react'

import { SlidingMark } from '../components/sliding-mark/sliding-mark.tsx'

/**
 * The mark of the active tab, and how it crosses the strip (design D2-02).
 *
 * It stretches rather than slides. It first opens far enough to cover both the tab it is
 * leaving and the tab it is going to, holds that for a moment, then closes onto the second —
 * the edge in the direction of travel arriving first and the one behind it after, which is what
 * leaves the stretch. It reads as one sheet reaching across rather than as a rectangle being
 * carried over. A slab that kept its width the whole way was tried first and read as a piece of
 * chrome in transit.
 *
 * It is the strip's `SlidingMark`, crossing by `reach` (issue #127): one element owned by the
 * strip, drawn after the tabs so that it never passes under one, finding the active tab by its
 * `data-mark` and following it through a resize, a badge arriving and a scroll of the strip.
 * What is drawn here is its look: one sheet of the content's own surface the width of the strip,
 * cut down to the tab by a `clip-path`, a property a compositor carries.
 *
 * The flares at its feet are kept: they are siblings of the cut rather than children of it,
 * because a clip cuts everything under it and two squares meant to sit outside the mark's edges
 * are exactly what it would cut first. They find those edges through the same two properties.
 *
 * What it gives up is the line around the mark. A clip goes through a border as readily as
 * through anything else, so a sheet cut to a tab has no vertical edges of its own.
 */
/** The sheet's own box, and the one thing the clip is applied to. */
const CUT = 'tab-mark block size-full'

/**
 * What is clipped: one sheet of the content's own surface, the width of the strip.
 *
 * `block`, because a span is not: an inline element takes no height and no width, and a sheet
 * of nothing is a mark that never appears however right its two cuts are.
 */
const SHEET = 'block size-full bg-surface-content'

export interface TabMarkProps {
  /**
   * The key of the active tab, as its `data-mark` says. A Project can be active and absent from
   * the strip — while it is being archived — and the mark then draws nothing rather than two
   * flares stacked at the near end of the strip.
   */
  active: string | null
}

export function TabMark({ active }: TabMarkProps): ReactNode {
  return (
    <SlidingMark target={active} crossing="reach">
      <span data-mark-shape="" className={CUT}>
        <span className={SHEET} />
      </span>
      <span className="tab-flare tab-flare-start tab-mark-start" />
      <span className="tab-flare tab-flare-end tab-mark-end" />
    </SlidingMark>
  )
}
