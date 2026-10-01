import { MotionGlobalConfig, frameData } from 'motion/react'

/**
 * The clock the animations of a play run on, which no frame moves on by more than `STEP`.
 *
 * A play that watches a movement reads it once a frame, and motion moves an animation on by the
 * time that went by since the frame before. On a machine busy with the rest of the run, a frame
 * can come a quarter of a second after the one before it: a shake of four tenths of a second is
 * then two frames, a stroke drawn in a quarter of a second is one, and the movement happened with
 * no frame there to see it. Whether a play saw it was down to when the frames happened to fall.
 *
 * So, while a play watches, motion runs on this clock instead of the page's. It goes on with the
 * page's, frame after frame, but never by more than `STEP` at once: on a machine that keeps up,
 * nothing changes; on one that does not, the animations play slower, and every one of them is
 * drawn on frames at most `STEP` apart, whatever the machine is doing. It is what motion does by
 * itself with the delta it hands a frame, and does not do with the time it moves an animation by.
 *
 * What motion hands to the browser — an opacity, a filter, a transform it animates whole — runs
 * on the page's own clock and not on motion's. Those are held as well: each one is paused as it
 * is made, and set on every frame to where this clock stands.
 *
 * A play reads its time from `now`, so that what it tells from the time between two frames — a
 * jump, a beat — is told on the time the animations moved by.
 */
export interface Clock {
  /** Where the clock stands, in milliseconds. */
  readonly now: () => number
  /** Gives motion and the browser's animations back to the page's clock. */
  readonly stop: () => void
}

/**
 * The most a frame moves the animations on by, in milliseconds: what a frame at 25 per second
 * lasts, and the delta motion caps its own frames at.
 *
 * The shortest movement a play watches for is a shake of four tenths of a second, whose way past
 * one pixel on either side lasts more than eighty milliseconds each: two frames at least land in
 * each.
 */
export const STEP = 40

/**
 * Puts motion, and the browser's animations motion starts, on a clock of their own until `stop`
 * is called — or until the test is over, however it ended, when a runner is driving the page:
 * a play that failed or ran out of time would otherwise leave the next story on it.
 */
export async function steadyClock(): Promise<Clock> {
  let at = performance.now()
  let last = at
  let running = true
  // Each browser animation held, and where the clock stood when it was made.
  const held = new Map<Animation, number>()
  const animate = Element.prototype.animate
  const manual = MotionGlobalConfig.useManualTiming

  Element.prototype.animate = function (
    this: Element,
    ...args: Parameters<Element['animate']>
  ): Animation {
    const animation = animate.apply(this, args)
    animation.pause()
    held.set(animation, at)
    return animation
  }
  MotionGlobalConfig.useManualTiming = true
  frameData.timestamp = at

  const tick = (page: number): void => {
    if (!running) return
    at += Math.min(Math.max(page - last, 0), STEP)
    last = page
    frameData.timestamp = at
    for (const [animation, from] of held) {
      if (animation.playState === 'idle' || animation.playState === 'finished') {
        held.delete(animation)
        continue
      }
      const end = Number(animation.effect?.getComputedTiming().endTime ?? 0)
      if (at - from >= end) {
        held.delete(animation)
        animation.finish()
        continue
      }
      if (animation.playState === 'running') animation.pause()
      animation.currentTime = at - from
    }
    requestAnimationFrame(tick)
  }
  requestAnimationFrame(tick)

  const stop = (): void => {
    if (!running) return
    running = false
    Element.prototype.animate = animate
    MotionGlobalConfig.useManualTiming = manual
    for (const [animation, from] of held) {
      animation.currentTime = at - from
      animation.play()
    }
    held.clear()
  }

  const runner = await import('vitest/browser').catch(() => null)
  if (runner !== null) {
    const { onTestFinished } = await import('vitest')
    onTestFinished(stop)
  }
  return { now: () => at, stop }
}
