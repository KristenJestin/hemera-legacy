import { cn } from 'cn'
import { type ReactNode, useEffect, useLayoutEffect, useRef, useState } from 'react'

import { crossfade, instant, useTransition } from '../../motion.ts'
import { FaceFigure, type FacePainter } from './figure.tsx'
import { DETAILS, type DetailName, type FacePlayer, TUNING, createFace } from './player.ts'
import { EXPRESSIONS, type FaceState } from './states.ts'
import { clock, onFrame } from './ticker.ts'

/**
 * Hemera's face: a small mascot whose expression, motion and colour say what an agent is doing
 * (issue #140).
 *
 * Two eyes and a mouth, each one stroke of three points, and every state a way of placing those
 * points, a way of moving the head and a way of blinking. Inside a state it lives — blinks, looks
 * about, plays a short flourish now and then — at intervals drawn from a seed, so it never falls
 * into a loop and the same seed always tells the same story. Between two states it never cuts:
 * every change is a designed motion from wherever the face is, eyes, mouth, head and colour
 * together, and a change arriving half-way through another is taken from there.
 *
 * Telling two states apart never depends on the colour; it only says again what the shape says.
 * The state is said in words too — to whatever reads the page, and on hover.
 *
 * Small, it simplifies rather than blurs: no mouth, heavier strokes, gestures that travel further
 * so they still read. A reader asking for less movement gets still expressions and a soft
 * cross-fade between them.
 */

/** From an icon button to the hero of an empty page. */
export const FACE_SIZES = ['icon', 'sm', 'md', 'lg', 'hero'] as const

export type FaceSize = (typeof FACE_SIZES)[number]

/** The step of the scale each size is drawn at. */
export const SIZE_CLASSES = {
  icon: 'size-icon-md',
  sm: 'size-6',
  md: 'size-10',
  lg: 'size-16',
  hero: 'size-face-hero',
} as const satisfies Record<FaceSize, string>

/** How much of the face each size can hold. */
const DETAIL_OF: Record<FaceSize, DetailName> = {
  icon: 'icon',
  sm: 'small',
  md: 'full',
  lg: 'full',
  hero: 'full',
}

/** How much of the face a size holds. */
export function detailOf(size: FaceSize): DetailName {
  return DETAIL_OF[size]
}

const FRAME = 'inline-block shrink-0'

export interface FaceProps {
  /** What the agent is doing. */
  state: FaceState
  /** How big it is drawn. */
  size?: FaceSize | undefined
  /**
   * Makes its life deterministic: the same seed and the same changes at the same moments are the
   * same face. Left out, each face draws its own, so two side by side never move in step.
   */
  seed?: number | undefined
  /** What the face says in words; the state's own words when left out. */
  label?: string | undefined
  /** Where the face sits; never how it looks. */
  className?: string | undefined
}

export function Face({ state, size = 'md', seed, label, className }: FaceProps): ReactNode {
  const reduced = useTransition(crossfade) === instant
  const detail = DETAILS[detailOf(size)]
  const [drawn] = useState(() => Math.floor(Math.random() * 2 ** 31))
  const chosen = seed ?? drawn
  const painter = useRef<FacePainter | null>(null)
  const player = useRef<FacePlayer | null>(null)
  const holder = useRef<HTMLSpanElement | null>(null)
  const latest = useRef(state)
  const wake = useRef<() => void>(() => undefined)

  /** Paints the face as it is now, and makes sure it goes on being painted. */
  const draw = (): void => {
    const face = player.current
    if (face !== null) painter.current?.paint(face.frame(clock()))
    wake.current()
  }

  // A new seed, a new size or a change of preference is a new face, begun where the state is.
  useLayoutEffect(() => {
    player.current = createFace({
      state: latest.current,
      at: clock(),
      seed: chosen,
      detail,
      reduced,
      tuning: TUNING,
    })
    draw()
  }, [chosen, detail, reduced])

  useLayoutEffect(() => {
    latest.current = state
    player.current?.change(state, clock())
    draw()
  }, [state])

  // Painted on the page's one frame loop while it is on screen and has anything to move: a face
  // scrolled away, or a still one under reduced motion, costs nothing.
  useEffect(() => {
    let stop: (() => void) | null = null
    let seen = true
    const tick = (at: number): void => {
      const face = player.current
      if (face === null) return
      const frame = face.frame(at)
      painter.current?.paint(frame)
      if (frame.still) {
        stop?.()
        stop = null
      }
    }
    const run = (): void => {
      if (stop === null && seen) stop = onFrame(tick)
    }
    wake.current = run
    const observer = new IntersectionObserver((entries) => {
      seen = entries.some((entry) => entry.isIntersecting)
      if (seen) run()
      else {
        stop?.()
        stop = null
      }
    })
    if (holder.current !== null) observer.observe(holder.current)
    run()
    return () => {
      observer.disconnect()
      stop?.()
      wake.current = () => undefined
    }
  }, [])

  const words = label ?? EXPRESSIONS[state].label
  return (
    <span
      ref={holder}
      role="img"
      aria-label={words}
      title={words}
      data-state={state}
      className={cn(FRAME, SIZE_CLASSES[size], className)}
    >
      <FaceFigure detail={detail} painter={painter} />
    </span>
  )
}
