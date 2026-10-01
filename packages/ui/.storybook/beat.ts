import { useEffect, useState } from 'react'

/**
 * How long a story holds each step of a change it plays by itself, in milliseconds: long enough
 * to read the end a transition lands on before the next one starts.
 */
export const BEAT = 2500

/**
 * The step a story is on, among `count`, moved on every `every` milliseconds and round again.
 *
 * A story shows the component and nothing else — no button of its own to drive it — so a
 * transition is played by the story itself, over and over, and a play reads it as it comes.
 */
export function useBeat(count: number, every = BEAT): number {
  const [step, setStep] = useState(0)
  useEffect(() => {
    const beat = setInterval(() => setStep((was) => (was + 1) % count), every)
    return () => clearInterval(beat)
  }, [count, every])
  return step
}
