/**
 * The values of the variables an agent proposed, held until a human decides (Decided 2 of #218).
 *
 * An agent may write a variable's value when it has one, and that value is never shown back: not
 * in the thread, not in the Journal. A proposal is an entry of the thread, so the value cannot
 * ride in it; it waits here, in the engine's memory and nowhere else, under the proposal's
 * identifier. Accepted, it is written through the use case the settings call and let go of;
 * declined, it is let go of. An engine that stops forgets it, and the proposal is then refused
 * rather than applied with a value nobody holds.
 */

import { Context, Effect, Layer } from 'effect'

export interface SetupValuesService {
  /** Holds a value under the proposal it belongs to. */
  readonly hold: (proposalId: string, value: string) => Effect.Effect<void>
  /** The value held under a proposal, and undefined when none is. Nothing is let go of. */
  readonly peek: (proposalId: string) => Effect.Effect<string | undefined>
  /** Lets go of the value of a proposal, decided either way. */
  readonly drop: (proposalId: string) => Effect.Effect<void>
}

export class SetupValues extends Context.Service<SetupValues, SetupValuesService>()(
  'SetupValues',
) {}

/** One book of values per engine: the tools write it, the human's decision reads it. */
export const setupValuesLayer: Layer.Layer<SetupValues> = Layer.sync(SetupValues, () => {
  const held = new Map<string, string>()
  return {
    hold: (proposalId, value) =>
      Effect.sync(() => {
        held.set(proposalId, value)
      }),
    peek: (proposalId) => Effect.sync(() => held.get(proposalId)),
    drop: (proposalId) =>
      Effect.sync(() => {
        held.delete(proposalId)
      }),
  }
})
