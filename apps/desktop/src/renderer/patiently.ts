/**
 * Asking again what the window cannot be drawn without.
 *
 * The main process gives a question five seconds, and a machine starting its day — the engine
 * opening the database, a reopened Session's agent being started beside it, everything else on
 * the machine starting too — can take longer than that to answer one. A question the window asks
 * once at start and never again is then a list left empty for as long as the window is open: the
 * agent menu came back with nothing in it, and a Session could not be made. What the window reads
 * to draw itself is read again, a little later each time, and only a question that failed every
 * time is given up on — for the page to say so, and to offer to ask again.
 *
 * Only for what reads: asking twice for a list is harmless, and writing twice is not.
 */

/** How long to wait before each new attempt, which is also how many there are after the first. */
export const RETRY_DELAYS_MS: readonly number[] = [500, 1_500, 4_000]

/** A pause of that long, on the window's own clock. */
async function waited(milliseconds: number): Promise<void> {
  await new Promise<void>((resolve) => {
    setTimeout(resolve, milliseconds)
  })
}

/**
 * Answers what `ask` answered on the first attempt that succeeded, or fails with the last failure
 * once every delay has been waited out.
 */
export async function patiently<T>(
  ask: () => Promise<T>,
  delays: readonly number[] = RETRY_DELAYS_MS,
): Promise<T> {
  const [delay, ...rest] = delays
  if (delay === undefined) return await ask()
  try {
    return await ask()
  } catch {
    // Not the answer yet: the question is asked again once the pause is over, and only the last
    // attempt's failure is the one whoever asked is told.
    await waited(delay)
    return await patiently(ask, rest)
  }
}
