import { motion } from 'motion/react'
import type { ReactNode } from 'react'

import { check, instant, morph, ping, pinging, useTransition } from '../../motion.ts'

/**
 * A task's status as one small mark that changes in place (maintainer's request of 30 September on
 * issue #77, after React Bits' "status mark", written again on the design system's own kinds).
 *
 * One ring and what it holds, 20 px, every state a pose of the same strokes:
 *
 * - `todo` · a dashed ring, quiet: nothing has started;
 * - `progress` · the ring as an arc: turning while how far is unknown; when it is known, the arc
 *   stands at its share on a faint track, and a new share is reached on the `morph` spring from
 *   wherever the arc stands — no jump, no overshoot, a change half-way turned round smoothly;
 * - `done` · the ring closes and a tick draws itself in it;
 * - `failed` · the ring closes and a cross draws itself;
 * - `yours` · the ring closes around a dot that waits, a ring leaving it on the running dot's beat;
 * - `blocked` · the ring closes around a bar: the way is shut;
 * - `skipped` · the dashed ring, a stroke across it.
 *
 * Asked for less movement, every pose is there at once and nothing turns or rings.
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

/** 20 px in a list, 16 px on a chip. */
export type MarkSize = 'md' | 'sm'

const SVG: Record<MarkSize, string> = {
  md: 'size-5 stroke-current',
  sm: 'size-icon-sm stroke-current',
}

/** The arc turns while how far is not known: the loading indicator's own turn. */
const TURNING: Record<MarkSize, string> = {
  md: 'size-5 stroke-current motion-safe:animate-turn',
  sm: 'size-icon-sm stroke-current motion-safe:animate-turn',
}

/** How much of the ring the arc covers while it turns. */
const ARC = 0.28

/** How much of the ring each pose closes. */
function ringOf(state: MarkState, progress: number | undefined): number {
  if (state === 'todo' || state === 'skipped') return 0
  if (state === 'progress') return progress ?? ARC
  return 1
}

export interface StatusMarkProps {
  state: MarkState
  /** How far a task in progress is, from 0 to 1, when it is known. */
  progress?: number | undefined
  /** What a screen reader says: the state in words. */
  label: string
  size?: MarkSize | undefined
  /** Whether it draws itself in as it is mounted, rather than standing there already. */
  arrives?: boolean | undefined
}

export function StatusMark({
  state,
  progress,
  label,
  size = 'md',
  arrives = false,
}: StatusMarkProps): ReactNode {
  const ringing = useTransition(morph)
  const drawing = useTransition(check.draw)
  const pulse = useTransition(pinging)
  const turning = state === 'progress' && progress === undefined
  const dashed = state === 'todo' || state === 'skipped'
  const drawn = (on: boolean) => ({ pathLength: on ? 1 : 0, opacity: on ? 1 : 0 })
  // Arriving, every stroke starts undrawn; otherwise each stands where it is.
  const from = arrives ? drawn(false) : false
  return (
    <span role="img" aria-label={label} className={TONES[state]} data-mark={state}>
      {state === 'yours' && pulse !== instant && (
        <motion.span
          aria-hidden="true"
          className="absolute inset-1 rounded-full bg-warning motion-reduce:hidden"
          animate={ping}
          transition={pulse}
        />
      )}
      <svg
        viewBox="0 0 20 20"
        aria-hidden="true"
        fill="none"
        strokeWidth="1.75"
        strokeLinecap="round"
        strokeLinejoin="round"
        className={turning ? TURNING[size] : SVG[size]}
      >
        {state === 'progress' &&
          progress !== undefined && (
            // The ring the arc travels on, while how far is known.
            <circle cx="10" cy="10" r="7.25" className="stroke-border" />
          )}
        <motion.circle
          cx="10"
          cy="10"
          r="7.25"
          strokeDasharray="2 2.55"
          initial={false}
          animate={{ opacity: dashed ? 1 : 0 }}
          transition={ringing}
        />
        <g transform="rotate(-90 10 10)">
          <motion.circle
            cx="10"
            cy="10"
            r="7.25"
            initial={from}
            animate={{
              pathLength: ringOf(state, progress),
              opacity: dashed || ringOf(state, progress) === 0 ? 0 : 1,
            }}
            transition={ringing}
          />
        </g>
        <motion.path
          d="M6.6 10.3l2.3 2.3l4.5 -4.7"
          initial={from}
          animate={drawn(state === 'done')}
          transition={drawing}
        />
        <motion.path
          d="M7.6 7.6l4.8 4.8M12.4 7.6l-4.8 4.8"
          initial={from}
          animate={drawn(state === 'failed')}
          transition={drawing}
        />
        <motion.path
          d="M7 10h6"
          initial={from}
          animate={drawn(state === 'blocked')}
          transition={drawing}
        />
        <motion.path
          d="M6.5 13.5l7 -7"
          initial={from}
          animate={drawn(state === 'skipped')}
          transition={drawing}
        />
        <motion.circle
          cx="10"
          cy="10"
          r="2.25"
          className="fill-current"
          stroke="none"
          initial={false}
          animate={{ scale: state === 'yours' ? 1 : 0 }}
          transition={ringing}
        />
      </svg>
    </span>
  )
}
