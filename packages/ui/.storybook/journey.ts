/**
 * Whether a length travelled from one value to another or jumped there, told by the clock rather
 * than by a count of frames.
 *
 * A play that watches a journey reads the length on every frame and looks for a value in between.
 * On a machine busy with the rest of the run a frame can come a quarter of a second after the one
 * before it, and a spring of the preset is most of the way home by then: the journey happened, but
 * no frame was there to see it, and the play read a jump. So every reading carries the time it was
 * taken, and a jump is only called one when the frames around it were close enough together that
 * a spring could not have made the whole way between them. Otherwise nothing was seen either way,
 * and the play does the gesture again.
 *
 * A value in between is one more than one unit away from both ends: a pixel for a length read as
 * it is, a hundredth for a length read as a share of the way.
 */

/** One reading of a length, and when it was taken. */
export interface Reading {
  readonly at: number
  readonly value: number
}

/** What the readings say about the way from one value to another. */
export type Journey = 'travelled' | 'jumped' | 'unseen'

/**
 * How long the preset's springs take to cover most of their way, in milliseconds.
 *
 * The slowest of them that moves a dimension, `arrival` (stiffness 170, damping 26), is a little
 * under three quarters of the way home 200 ms after it starts, and `morph` is further; neither
 * is within a hundredth of the end of its way before 300 ms, nor within a pixel of the end of a
 * journey of tens of pixels. A change from one end to the other inside less than this was not a
 * journey.
 */
const WHOLE_WAY = 300

/** A length being read on every frame. */
export interface Watch {
  /** Stops reading, and answers what was read. */
  readonly stop: () => Reading[]
}

/** Reads a length on every frame, from now until `stop` is called. */
export function readEveryFrame(read: () => number): Watch {
  const readings: Reading[] = []
  let reading = true
  const look = (): void => {
    if (!reading) return
    readings.push({ at: performance.now(), value: read() })
    requestAnimationFrame(look)
  }
  look()
  return {
    stop: () => {
      reading = false
      return readings
    },
  }
}

/**
 * What the readings say about the way from `from` to `to`.
 *
 * The first reading that left `from` is either somewhere in between — the journey was seen — or
 * already at `to`. In the second case the frames before it bound when the journey could have
 * started: a spring does its first frame at its start, so the value read three frames earlier at
 * the most was still `from` with nothing under way. If those three frames and this one fit inside
 * `WHOLE_WAY`, the length got there faster than any spring of the preset does, and it jumped.
 */
export function journeyOf(readings: readonly Reading[], from: number, to: number): Journey {
  const left = readings.findIndex((reading) => Math.abs(reading.value - from) > 1)
  if (left === -1) return 'unseen'
  const first = readings[left]!
  if (Math.abs(first.value - to) > 1) return 'travelled'
  const earliest = readings[Math.max(0, left - 3)]!
  return first.at - earliest.at < WHOLE_WAY ? 'jumped' : 'unseen'
}
