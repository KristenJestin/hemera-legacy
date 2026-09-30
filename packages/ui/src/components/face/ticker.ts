/**
 * One frame loop for every face on the page.
 *
 * A sidebar of Sessions is a column of faces, and a loop each is as many callbacks asking the
 * browser for the same frame. One loop runs while anything listens and stops when nothing does;
 * each listener is handed the frame's own time, in seconds, so every face on the page is drawn at
 * the same instant.
 */
const listeners = new Set<(at: number) => void>()
let request = 0

function tick(time: number): void {
  const at = time / 1000
  for (const listener of listeners) listener(at)
  request = listeners.size > 0 ? requestAnimationFrame(tick) : 0
}

/** Calls `listener` on every frame until the function handed back is called. */
export function onFrame(listener: (at: number) => void): () => void {
  listeners.add(listener)
  if (request === 0) request = requestAnimationFrame(tick)
  return () => {
    listeners.delete(listener)
  }
}

/** The time the frames are told, in seconds, read now. */
export function clock(): number {
  return performance.now() / 1000
}
