/**
 * Waits for an element to stand still: its box drawn at the same place and size on a few frames
 * in a row.
 *
 * One read that looks right is not a rest. A control lets go of the hand on a spring that
 * overshoots, so on its way back it passes through its resting size and goes on moving; on a
 * machine busy with the rest of the run, the one read a `waitFor` takes can land on that frame,
 * and whatever the play measures next is measured against a box still on its way. Frames rather
 * than a clock, for the reason `withinFrames` gives: a slow runner stretches a clock, not a
 * frame count.
 */
export function atRest(element: Element, frames = STILL_FRAMES): Promise<void> {
  return new Promise((rested, failed) => {
    const started = performance.now()
    let still = 0
    let last = ''
    const look = (): void => {
      const box = element.getBoundingClientRect()
      const at = [box.left, box.top, box.width, box.height].join(',')
      still = at === last ? still + 1 : 0
      last = at
      if (still >= frames) {
        rested()
        return
      }
      if (performance.now() - started > LONGEST) {
        failed(new Error(`${element.tagName.toLowerCase()} never came to rest: ${at}`))
        return
      }
      requestAnimationFrame(look)
    }
    look()
  })
}

/** How many frames in a row the box has to stay put for it to be at rest. */
const STILL_FRAMES = 6

/**
 * How long a box may take to come to rest before the wait gives up, in milliseconds: the patience
 * every wait of a play is given (`asyncUtilTimeout` in the preview).
 */
const LONGEST = 10_000
