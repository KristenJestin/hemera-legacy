import { motion } from 'motion/react'
import type { ReactNode } from 'react'

import { check, instant, morph, ping, pinging, useTransition } from '../../motion.ts'

/**
 * Where a task stands, as one small mark that changes in place (issue #77): one ring and what it
 * holds, about 20 px, every state a pose of the same strokes, so a change is a stroke moving and
 * never one glyph swapped for another.
 *
 * - `todo` · a dashed ring, quiet: nothing has started.
 * - `progress` · the ring as an arc: turning while how far is not known; standing at its share on a
 *   faint track when it is, and reaching a new share on `morph` — the spring of a dimension, which
 *   never overshoots — from wherever it stands.
 * - `done` · the ring closes and a check draws itself in it; `failed`, a cross.
 * - `yours` · the ring closes around a dot that waits for the reader, a ring leaving it on the
 *   running dot's beat (`ping`).
 * - `blocked` · the ring closes around a bar: the way is shut.
 * - `skipped` · the dashed ring, a stroke across it.
 *
 * Asked for less movement, every pose is there at once, the arc does not turn and no ring leaves
 * the dot. Without a `label` it is decoration beside a line that already says the state.
 */

export type MarkState = 'todo' | 'progress' | 'done' | 'failed' | 'yours' | 'blocked' | 'skipped'

const TONES: Record<MarkState, string> = {
  todo: 'relative inline-flex shrink-0 text-muted-foreground',
  progress: 'relative inline-flex shrink-0 text-warning',
  done: 'relative inline-flex shrink-0 text-success',
  failed: 'relative inline-flex shrink-0 text-destructive',
  yours: 'relative inline-flex shrink-0 text-warning',
  blocked: 'relative inline-flex shrink-0 text-destructive',
  skipped: 'relative inline-flex shrink-0 text-muted-foreground',
}

const SVG = 'size-5 stroke-current'

/** The arc turns while how far is not known: the loading indicator's own turn. */
const TURNING = 'size-5 stroke-current motion-safe:animate-turn'

/** The ring leaving the dot of what waits for the reader, the dot's own tone. */
const PING = 'absolute inset-1 rounded-full bg-warning motion-reduce:hidden'

/** How much of the ring the arc covers while it turns. */
const ARC = 0.28

/** How much of the ring each pose closes. */
function ringOf(state: MarkState, progress: number | undefined): number {
  if (state === 'todo' || state === 'skipped') return 0
  if (state === 'progress') return progress ?? ARC
  return 1
}

/** A stroke drawn whole, or not at all. */
function drawn(on: boolean) {
  return { pathLength: on ? 1 : 0, opacity: on ? 1 : 0 }
}

export interface StatusMarkProps {
  state: MarkState
  /** How far a task in progress is, from 0 to 1, when it is known; left out, the arc turns. */
  progress?: number | undefined
  /** What a screen reader says. Left out, the mark is hidden from it. */
  label?: string | undefined
}

export function StatusMark({ state, progress, label }: StatusMarkProps): ReactNode {
  const ringing = useTransition(morph)
  const drawing = useTransition(check.draw)
  const beat = useTransition(pinging)
  const turning = state === 'progress' && progress === undefined
  const dashed = state === 'todo' || state === 'skipped'
  const ring = ringOf(state, progress)
  return (
    <span
      role={label === undefined ? undefined : 'img'}
      aria-label={label}
      aria-hidden={label === undefined ? true : undefined}
      className={TONES[state]}
      data-mark={state}
    >
      {state === 'yours' && beat !== instant && (
        <motion.span
          aria-hidden="true"
          className={PING}
          data-figure="ping"
          animate={ping}
          transition={beat}
        />
      )}
      <svg
        viewBox="0 0 20 20"
        aria-hidden="true"
        fill="none"
        strokeWidth="1.75"
        strokeLinecap="round"
        strokeLinejoin="round"
        className={turning ? TURNING : SVG}
      >
        {state === 'progress' && progress !== undefined && (
          <circle cx="10" cy="10" r="7.25" className="stroke-border" data-figure="track" />
        )}
        <motion.circle
          cx="10"
          cy="10"
          r="7.25"
          strokeDasharray="2 2.55"
          data-figure="dashed"
          initial={false}
          animate={{ opacity: dashed ? 1 : 0 }}
          transition={ringing}
        />
        <g transform="rotate(-90 10 10)">
          <motion.circle
            cx="10"
            cy="10"
            r="7.25"
            data-figure="ring"
            initial={false}
            animate={{ pathLength: ring, opacity: ring === 0 ? 0 : 1 }}
            transition={ringing}
          />
        </g>
        <motion.path
          d="M6.6 10.3l2.3 2.3l4.5 -4.7"
          data-figure="check"
          initial={false}
          animate={drawn(state === 'done')}
          transition={drawing}
        />
        <motion.path
          d="M7.6 7.6l4.8 4.8M12.4 7.6l-4.8 4.8"
          data-figure="cross"
          initial={false}
          animate={drawn(state === 'failed')}
          transition={drawing}
        />
        <motion.path
          d="M7 10h6"
          data-figure="bar"
          initial={false}
          animate={drawn(state === 'blocked')}
          transition={drawing}
        />
        <motion.path
          d="M6.5 13.5l7 -7"
          data-figure="strike"
          initial={false}
          animate={drawn(state === 'skipped')}
          transition={drawing}
        />
        <motion.circle
          cx="10"
          cy="10"
          r="2.25"
          className="fill-current"
          stroke="none"
          data-figure="dot"
          initial={false}
          animate={{ scale: state === 'yours' ? 1 : 0 }}
          transition={ringing}
        />
      </svg>
    </span>
  )
}
