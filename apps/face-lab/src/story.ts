import {
  DETAILS,
  type DetailName,
  type FacePlayer,
  type FaceState,
  type FaceTuning,
  createFace,
  changeBetween,
} from '@hemera/ui/face'

/** A state the face was put in, and when, on the lab's clock. */
export interface Played {
  readonly state: FaceState
  readonly at: number
}

/** Everything a story is told with, beside the story itself. */
export interface Telling {
  readonly seed: number
  readonly detail: DetailName
  readonly reduced: boolean
  readonly tuning: FaceTuning
}

/**
 * A player told a story from its start: the first state, then every change at its moment.
 *
 * The face is a function of time, so a story told again is the same face — which is what lets
 * the lab change a number and see the same moment again with it, or go back to a moment it
 * already played.
 */
export function replay(history: readonly Played[], telling: Telling): FacePlayer {
  const [first, ...rest] = history
  const player = createFace({
    state: first?.state ?? 'asleep',
    at: first?.at ?? 0,
    seed: telling.seed,
    detail: DETAILS[telling.detail],
    reduced: telling.reduced,
    tuning: telling.tuning,
  })
  for (const change of rest) player.change(change.state, change.at)
  return player
}

/**
 * A player for the moment `at` of a story: told up to the last change before it, and told again
 * only when the moment crosses a change, so a long story is not replayed on every frame.
 */
export function playerOver(
  history: readonly Played[],
  telling: Telling,
): (at: number) => FacePlayer {
  let told: { count: number; player: FacePlayer } | null = null
  return (at) => {
    const count = Math.max(1, history.filter((played) => played.at <= at).length)
    if (told === null || told.count !== count) {
      told = { count, player: replay(history.slice(0, count), telling) }
    }
    return told.player
  }
}

/** How long the change from one state to another lasts, as the story is told. */
export function lengthOf(from: FaceState, to: FaceState, tuning: FaceTuning): number {
  return tuning.timing.change[changeBetween(from, to)] * tuning.pace
}
