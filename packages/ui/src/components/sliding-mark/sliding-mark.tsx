import { cn } from 'cn'
import { animate, motion, useMotionValue } from 'motion/react'
import type { Transition } from 'motion/react'
import { type ReactNode, type RefObject, useEffect, useLayoutEffect, useRef, useState } from 'react'

import {
  REACH_HANDOFF,
  REACH_OVERSHOOT,
  arrival,
  instant,
  lead,
  reach,
  settle,
  trail,
  useTransition,
} from '../../motion.ts'

/**
 * The mark of the chosen item of a list, and how it travels to the next one (issue #127).
 *
 * One mark, owned by the list and not by the item. A mark drawn inside the chosen item keeps
 * that item's place in the paint order, so every item drawn after it covers it on the way —
 * mostly on the way up — and since #108 a control under the hand carries a transform, which
 * traps whatever it holds in its own layer: no `z-index` on the mark can get it out. Drawn by
 * the list, the mark is one element with one place in that order, whichever item it is on.
 *
 * The layers, from the bottom:
 *
 * - every item that is not the chosen one, background and all;
 * - the mark, which is the last child of the list and so drawn after all of them: moving down
 *   or up, it crosses an item's background and never goes under it;
 * - what an item says (`OVER_MARK` on its content), and the chosen item as a whole (`OVER_MARK`
 *   on the item, which draws no fill of its own while it is chosen: the mark is its fill).
 *
 * The list is `relative isolate`: the mark is placed against it, and the layers above stay
 * among themselves rather than going up against whatever the list sits in.
 *
 * An item says which one it is with `data-mark="<key>"`; the mark is told the key of the chosen
 * one and finds it in the list. It is placed on that item's box — the layout's box, so a control
 * giving way under the press does not carry the mark with it — cut to what the list shows of it
 * when the item is scrolled half out, and followed: the list resizing, an item resizing and a
 * scroll inside the list all put it back on its item at once, with no journey. Only a change of
 * item is a journey, played on the preset the list asks for; under reduced motion it jumps.
 *
 * Two ways of crossing. `slide` carries the mark's box across and draws `shape` in it. `reach`
 * is the tab strip's (design D2-02): one sheet the width of the list cut down by two edges, which
 * open over both items, hold, and close onto the second — the edge in the direction of travel
 * first. What it draws is its `children`, which read the two edges from `--mark-left` and
 * `--mark-right`.
 */

/** What an item draws over the mark: its content, and the chosen item as a whole. */
export const OVER_MARK = 'relative z-1'

/** The box the mark travels in: nothing to the hand, and nothing to a screen reader. */
const BOX = 'pointer-events-none absolute top-0 left-0'

/** The reaching mark's frame: the whole list, which its two edges cut down. */
const FRAME = 'pointer-events-none absolute inset-0'

/**
 * Where the chosen item is, in the list's own coordinates.
 *
 * A type and not an interface: motion takes it as a target, which has an index signature an
 * interface does not inherit.
 */
type Box = {
  readonly x: number
  readonly y: number
  readonly width: number
  readonly height: number
}

/** Where a mark with no item to be on is put, out of sight: nothing, at the list's corner. */
const NOWHERE: Box = { x: 0, y: 0, width: 0, height: 0 }

/** Where the mark is, and where it comes from when it is travelling there. */
interface Place {
  readonly target: string
  readonly box: Box
  /** The box it is leaving, or null when there is no journey: a first paint, a resize. */
  readonly from: Box | null
}

type Common = {
  /** The key of the chosen item, as its `data-mark` says; null when the list holds none. */
  target: string | null
}

export type SlidingMarkProps = Common &
  (
    | {
        crossing?: 'slide' | undefined
        /** What it travels on: a kind of the motion preset. */
        preset?: Transition | undefined
        /** What the mark looks like, drawn in the chosen item's box. */
        shape: string
      }
    | {
        crossing: 'reach'
        /** What the mark looks like, cut by the two edges it reads. */
        children: ReactNode
      }
  )

export function SlidingMark(props: SlidingMarkProps): ReactNode {
  const { target } = props
  const holder = useRef<HTMLSpanElement>(null)
  const [place, setPlace] = useState<Place | null>(null)

  /**
   * Finds the chosen item and reads its box. A box that did not move is the one already held,
   * so a list that renders for another reason costs the mark nothing.
   */
  const measure = (): void => {
    const room = holder.current?.offsetParent
    if (!(room instanceof HTMLElement)) return
    const item =
      target === null
        ? null
        : room.querySelector<HTMLElement>(`[data-mark="${CSS.escape(target)}"]`)
    const box = item === null ? null : boxOf(item, room)
    setPlace((before) => {
      if (target === null || box === null) return null
      if (before?.target === target && same(before.box, box)) return before
      const from = before !== null && before.target !== target ? before.box : null
      return { target, box, from }
    })
  }

  // After every render of the list, before the paint: an item arriving, leaving or renamed is a
  // render of the list, and the mark is on its item the frame it is drawn.
  useLayoutEffect(measure)

  // And whatever moves an item without a render: a width, a scroll.
  useEffect(() => {
    const room = holder.current?.offsetParent
    if (!(room instanceof HTMLElement)) return
    const observer = new ResizeObserver(measure)
    observer.observe(room)
    for (const item of room.querySelectorAll('[data-mark]')) observer.observe(item)
    // Captured: a scroll does not bubble, and the one that moves the item is inside the list.
    room.addEventListener('scroll', measure, { capture: true, passive: true })
    return () => {
      observer.disconnect()
      room.removeEventListener('scroll', measure, { capture: true })
    }
  }, [target])

  if (props.crossing === 'reach') {
    return (
      <Reach holder={holder} place={place}>
        {props.children}
      </Reach>
    )
  }
  return (
    <Slide holder={holder} place={place} preset={props.preset ?? arrival} shape={props.shape} />
  )
}

function Slide({
  holder,
  place,
  preset,
  shape,
}: {
  holder: RefObject<HTMLSpanElement | null>
  place: Place | null
  preset: Transition
  shape: string
}): ReactNode {
  const transition = useTransition(preset)
  return (
    <motion.span
      ref={holder}
      aria-hidden="true"
      data-sliding-mark={place?.target ?? ''}
      className={cn(BOX, place === null && 'invisible')}
      initial={false}
      animate={place?.box ?? NOWHERE}
      transition={place === null || place.from === null ? instant : transition}
    >
      <span data-mark-shape="" className={shape} />
    </motion.span>
  )
}

/**
 * The reaching crossing: two edges, animated by hand, because the stretch is two springs on two
 * edges and not one on a box. They are written as two properties on the frame rather than as a
 * style: a clip-path assembled in a style attribute is a visual value living outside the theme.
 */
function Reach({
  holder,
  place,
  children,
}: {
  holder: RefObject<HTMLSpanElement | null>
  place: Place | null
  children: ReactNode
}): ReactNode {
  // Read once per render rather than per frame: everything below is imperative.
  const still = useTransition(reach).duration === 0
  const left = useMotionValue(0)
  const right = useMotionValue(0)
  const landing = useRef<ReturnType<typeof setTimeout>>(undefined)
  // Which journey is the current one: a closing edge that finishes after the mark was put
  // somewhere else must not relax back onto where it was going.
  const journey = useRef(0)

  const write = (): void => {
    const node = holder.current
    if (node === null) return
    node.style.setProperty('--mark-left', `${String(Math.max(0, left.get()))}px`)
    node.style.setProperty(
      '--mark-right',
      `${String(Math.max(0, node.offsetWidth - right.get()))}px`,
    )
  }

  // Before the paint: a mark put on its item after the frame is drawn is a mark seen elsewhere.
  useLayoutEffect(() => {
    clearTimeout(landing.current)
    journey.current += 1
    const current = journey.current
    if (place === null) return
    const { box, from } = place
    if (from === null || still) {
      left.jump(box.x)
      right.jump(box.x + box.width)
      write()
      return
    }
    // Open over both, hold, then close: the stretch is the whole point, and it has to be seen
    // before anything starts closing.
    void animate(left, Math.min(from.x, box.x), { ...reach, onUpdate: write })
    void animate(right, Math.max(from.x + from.width, box.x + box.width), {
      ...reach,
      onUpdate: write,
    })
    landing.current = setTimeout(() => {
      // The edge in the direction of travel closes first; the one behind it goes a few pixels
      // past its mark and relaxes back, which is what keeps the stretch from ending square.
      const forward = box.x > from.x
      const [leadEdge, leadTo, trailEdge, trailTo] = forward
        ? ([right, box.x + box.width, left, box.x] as const)
        : ([left, box.x, right, box.x + box.width] as const)
      void animate(leadEdge, leadTo, { ...lead, onUpdate: write })
      void animate(trailEdge, trailTo + (forward ? -REACH_OVERSHOOT : REACH_OVERSHOOT), {
        ...trail,
        onUpdate: write,
      }).then(() => {
        if (journey.current !== current) return
        void animate(trailEdge, trailTo, { ...settle, onUpdate: write })
      })
    }, REACH_HANDOFF * 1000)
  }, [place, still])

  // The right edge is written as what the frame keeps past it, and the frame is as wide as the
  // list: a list growing under a mark at rest carried that edge with it, and one shrinking cut
  // the mark away. Written again whenever the frame changes size, which no render says.
  useEffect(() => {
    const node = holder.current
    if (node === null) return
    const observer = new ResizeObserver(write)
    observer.observe(node)
    return () => {
      observer.disconnect()
    }
  }, [])

  useEffect(
    () => () => {
      clearTimeout(landing.current)
    },
    [],
  )

  return (
    <span
      ref={holder}
      aria-hidden="true"
      data-sliding-mark={place?.target ?? ''}
      className={cn(FRAME, place === null && 'invisible')}
    >
      {children}
    </span>
  )
}

/**
 * The layout's box of an item, in the coordinates of the list the mark is placed against, cut to
 * what the scrolling boxes between them show; null when none of it is shown.
 *
 * The size is the layout's (`offsetWidth`) and the centre is where the item is drawn: a press or
 * a lift scales an item about its centre, so the centre does not move and the size is not the
 * one the transform draws. A mark read off the drawn box would breathe with the hand.
 */
function boxOf(item: HTMLElement, room: HTMLElement): Box | null {
  const drawn = item.getBoundingClientRect()
  let left = drawn.left + (drawn.width - item.offsetWidth) / 2
  let top = drawn.top + (drawn.height - item.offsetHeight) / 2
  let right = left + item.offsetWidth
  let bottom = top + item.offsetHeight
  for (let node = item.parentElement; node !== null && node !== room; node = node.parentElement) {
    const style = getComputedStyle(node)
    if (style.overflowX === 'visible' && style.overflowY === 'visible') continue
    const shown = node.getBoundingClientRect()
    const inside = { left: shown.left + node.clientLeft, top: shown.top + node.clientTop }
    left = Math.max(left, inside.left)
    top = Math.max(top, inside.top)
    right = Math.min(right, inside.left + node.clientWidth)
    bottom = Math.min(bottom, inside.top + node.clientHeight)
  }
  if (right - left < 1 || bottom - top < 1) return null
  const origin = room.getBoundingClientRect()
  return {
    x: left - origin.left - room.clientLeft + room.scrollLeft,
    y: top - origin.top - room.clientTop + room.scrollTop,
    width: right - left,
    height: bottom - top,
  }
}

/** Whether two boxes are the same to the eye: a fraction of a pixel is not a move. */
function same(one: Box, other: Box): boolean {
  return (
    Math.abs(one.x - other.x) < 0.5 &&
    Math.abs(one.y - other.y) < 0.5 &&
    Math.abs(one.width - other.width) < 0.5 &&
    Math.abs(one.height - other.height) < 0.5
  )
}
