/**
 * Says what the system prefers, for the length of one story.
 *
 * The preference is a media query, and a media query is answered by the browser: a story
 * cannot decide it from the inside, and a `MotionConfig` only reaches what motion animates.
 * The stylesheet answers the same query on its own (`motion-safe`, the popup utilities), so
 * the one way to test both at once is to ask the browser to say what the system prefers.
 *
 * Answers `false` where nobody is driving the browser, which is the catalogue opened by hand:
 * the reader sees what their own system asked for, and the story says so.
 *
 * The preference is the page's, and the page outlives the story: the runner opens the next story
 * file in the same page. So it is handed back by the test itself, once the test is over however
 * it ended — a story that failed, or ran out of time before a `finally` of its own, used to leave
 * every story after it on that page asking for less movement, and failing for a reason not its
 * own — and handing it back is not spent out of the story's own time.
 */
export async function emulateReducedMotion(): Promise<boolean> {
  const runner = await import('vitest/browser').catch(() => null)
  if (runner === null) return false
  const { onTestFinished } = await import('vitest')
  const session = runner.cdp()
  const set = async (preference: string): Promise<void> => {
    await session.send('Emulation.setEmulatedMedia', {
      features: [{ name: 'prefers-reduced-motion', value: preference }],
    })
  }
  const asked = set('reduce')
  // As soon as the preference is asked for, so that a test that runs out of time while it is on
  // its way still ends by taking it back — after it has landed, whatever became of it, so the two
  // cannot arrive the wrong way round.
  onTestFinished(async () => {
    await asked.catch(() => undefined)
    await set('no-preference')
    await until(() => !globalThis.matchMedia('(prefers-reduced-motion: reduce)').matches)
  })
  await asked
  // The page answers once the preference has arrived; a story that acted before then would be
  // testing the preference it was trying to change.
  await until(() => globalThis.matchMedia('(prefers-reduced-motion: reduce)').matches)
  return true
}

/** Waits for the page to agree, a frame at a time. */
function until(reached: () => boolean): Promise<void> {
  return new Promise((settle) => {
    const look = (): void => {
      if (reached()) {
        settle()
        return
      }
      requestAnimationFrame(look)
    }
    look()
  })
}

/**
 * Whether the page is being asked for less movement right now, whoever asked: the system the
 * runner stands on, or a story that emulated it.
 *
 * A play that measures a journey has nothing to measure where the journey is not played, and
 * a runner can ask for less movement by itself — a headless Chromium on a CI machine may. Such a
 * play reads this and asserts the end state with no journey instead, which is the rule it is
 * then being run under.
 */
export function movesLess(): boolean {
  return globalThis.matchMedia('(prefers-reduced-motion: reduce)').matches
}

/**
 * Whether the page agrees within that many frames: how a play tells "at once" from "after a
 * journey" without a clock, which a slow runner would stretch and a frame count does not.
 */
export function withinFrames(reached: () => boolean, frames: number): Promise<boolean> {
  return new Promise((settle) => {
    const look = (left: number): void => {
      if (reached()) {
        settle(true)
        return
      }
      if (left === 0) {
        settle(false)
        return
      }
      requestAnimationFrame(() => {
        look(left - 1)
      })
    }
    look(frames)
  })
}

/**
 * What "at once" is, in frames: time for React and motion to answer a press, and a small part
 * of the journey the slowest fold of the preset takes, so a fold still travelling fails it.
 */
export const AT_ONCE = 5
