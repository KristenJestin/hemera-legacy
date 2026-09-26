/**
 * The domain events a service follows, once they are committed (#113).
 *
 * A service that has to react to what another one wrote does not call into it: the one that wrote
 * hands the events it has just committed here, and whoever follows that type of event hears it —
 * a Rework says that the Spec was reworked, and the launches cancel what waited on the revision it
 * left. The writer knows nothing of who follows, so neither imports the other.
 *
 * Handed over after the transaction commits, never inside it, so nothing reacts to a change that
 * was rolled back. What follows an event is said once, as it passes: a follower that has to hold
 * across an engine that stops reads the state the event left, at its next start, as well.
 */

import { Context, Effect, Layer, type Scope } from 'effect'

import type { NewEvent } from './journal.ts'

/** What a service does of an event it follows; what it cannot do is its own to say. */
export type Follower = (event: NewEvent) => Effect.Effect<void>

export interface DomainEventsService {
  /** Follows one type of event, for as long as the scope it is asked in stays open. */
  readonly follow: (type: string, follower: Follower) => Effect.Effect<void, never, Scope.Scope>
  /** The events a transaction has just committed, handed in order to who follows each type. */
  readonly committed: (events: readonly NewEvent[]) => Effect.Effect<void>
}

export class DomainEvents extends Context.Service<DomainEvents, DomainEventsService>()(
  'DomainEvents',
) {}

export const domainEventsLayer = Layer.sync(DomainEvents, () => {
  const following = new Set<{ readonly type: string; readonly follower: Follower }>()
  return {
    follow: (type, follower) =>
      Effect.acquireRelease(
        Effect.sync(() => {
          const one = { type, follower }
          following.add(one)
          return one
        }),
        (one) =>
          Effect.sync(() => {
            following.delete(one)
          }),
      ).pipe(Effect.asVoid),
    committed: (events) =>
      Effect.forEach(
        events,
        (event) =>
          Effect.forEach(
            [...following].filter((one) => one.type === event.type),
            (one) => one.follower(event),
            { discard: true },
          ),
        { discard: true },
      ),
  } satisfies DomainEventsService
})
