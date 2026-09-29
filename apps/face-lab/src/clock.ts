/**
 * The lab's own time. It runs at a speed, stops, steps a frame at a time and goes back, and every
 * face in the lab is drawn at it: a face is a function of time, so slowing the clock down is all
 * it takes to watch a blink in slow motion.
 */
export interface LabClock {
  readonly now: () => number
  readonly running: () => boolean
  readonly speed: () => number
  readonly setSpeed: (speed: number) => void
  readonly pause: () => void
  readonly play: () => void
  /** Moves the time on by `seconds`, running or not. */
  readonly step: (seconds: number) => void
  /** Puts the time at `at`, running or not. */
  readonly seek: (at: number) => void
}

export function labClock(): LabClock {
  const real = (): number => performance.now() / 1000
  let base = 0
  let since = real()
  let pace = 1
  let on = true
  const now = (): number => (on ? base + (real() - since) * pace : base)
  return {
    now,
    running: () => on,
    speed: () => pace,
    setSpeed: (speed) => {
      base = now()
      since = real()
      pace = speed
    },
    pause: () => {
      base = now()
      on = false
    },
    play: () => {
      since = real()
      on = true
    },
    step: (seconds) => {
      base = now() + seconds
      since = real()
    },
    seek: (at) => {
      base = at
      since = real()
    },
  }
}
