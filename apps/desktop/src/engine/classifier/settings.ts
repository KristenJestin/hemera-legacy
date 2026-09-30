/** One application classifier and one protected key reference in the Profile (D59-06/08). */

import { eq, sql } from 'drizzle-orm'
import { Context, Effect, Layer } from 'effect'

import { type ClassifierStrictness, DEFAULT_CLASSIFIER_STRICTNESS } from '@hemera/core'
import { type ClassifierMode, classifierStrictnessSchema } from '@hemera/ipc'

import { Database, DatabaseError } from '../storage/database.ts'
import { appPreferences } from '../storage/schema.ts'
import { mutate } from '../transaction.ts'

const MODE_KEY = 'classifier.mode'
const CIPHERTEXT_KEY = 'classifier.jev.ciphertext'
const CONSENT_KEY = 'classifier.jev.consent'
const STRICTNESS_KEY = 'classifier.strictness'

/** The level a stored value names, or the default for none or one no longer known (#298). */
function strictnessOf(stored: string | undefined): ClassifierStrictness {
  const parsed = classifierStrictnessSchema.safeParse(stored)
  return parsed.success ? parsed.data : DEFAULT_CLASSIFIER_STRICTNESS
}

export interface ClassifierSnapshot {
  readonly mode: ClassifierMode
  readonly strictness: ClassifierStrictness
  readonly key: string | null
  readonly consent: boolean
  readonly generation: number
}

export class ClassifierSettings extends Context.Service<
  ClassifierSettings,
  {
    readonly current: Effect.Effect<ClassifierSnapshot, DatabaseError>
    readonly select: (mode: ClassifierMode) => Effect.Effect<void, DatabaseError>
    /**
     * The level of the next call, in every Session. Not a new generation: a decision already
     * taken stays valid, as it was taken at the level it records (#298).
     */
    readonly selectStrictness: (
      strictness: ClassifierStrictness,
    ) => Effect.Effect<void, DatabaseError>
    readonly setConsent: (consent: boolean) => Effect.Effect<void, DatabaseError>
    readonly ciphertext: Effect.Effect<string | null, DatabaseError>
    readonly replaceKey: (
      ciphertext: string,
      plaintext: string,
    ) => Effect.Effect<void, DatabaseError>
    readonly restoreKey: (plaintext: string) => Effect.Effect<void>
    readonly removeKey: Effect.Effect<void, DatabaseError>
  }
>()('ClassifierSettings') {}

export const classifierSettingsLayer = Layer.effect(
  ClassifierSettings,
  Effect.gen(function* () {
    const database = yield* Database
    let key: string | null = null
    let generation = 0
    const value = (name: string) =>
      database
        .select()
        .from(appPreferences)
        .where(eq(appPreferences.key, name))
        .pipe(
          Effect.mapError(
            (cause) => new DatabaseError({ doing: 'reading classifier settings', cause }),
          ),
        )
    const write = (name: string, held: string) =>
      database
        .insert(appPreferences)
        .values({ key: name, value: held })
        .onConflictDoUpdate({ target: appPreferences.key, set: { value: sql`excluded.value` } })
        .pipe(
          Effect.mapError(
            (cause) => new DatabaseError({ doing: 'writing classifier settings', cause }),
          ),
        )
    return {
      current: Effect.gen(function* () {
        const [rows, consentRows, strictnessRows] = yield* Effect.all([
          value(MODE_KEY),
          value(CONSENT_KEY),
          value(STRICTNESS_KEY),
        ])
        const mode = rows[0]?.value === 'hemera-auto' ? 'hemera-auto' : 'agent-default'
        return {
          mode,
          strictness: strictnessOf(strictnessRows[0]?.value),
          key,
          consent: consentRows[0]?.value === 'true',
          generation,
        }
      }),
      select: (mode) =>
        mutate('selecting classifier mode', (transaction) =>
          Effect.gen(function* () {
            const rows = yield* transaction
              .select()
              .from(appPreferences)
              .where(eq(appPreferences.key, MODE_KEY))
            const previous = rows[0]?.value === 'hemera-auto' ? 'hemera-auto' : 'agent-default'
            if (previous === mode) return { result: false, events: [] }
            yield* transaction
              .insert(appPreferences)
              .values({ key: MODE_KEY, value: mode })
              .onConflictDoUpdate({
                target: appPreferences.key,
                set: { value: sql`excluded.value` },
              })
            return {
              result: true,
              events: [
                {
                  type: 'classifier.mode_changed',
                  entityKind: 'profile' as const,
                  entityId: 'profile',
                  source: 'ui' as const,
                  author: 'human' as const,
                  payload: { from: previous, to: mode },
                },
              ],
            }
          }),
        ).pipe(
          Effect.mapError((cause) =>
            cause instanceof DatabaseError
              ? cause
              : new DatabaseError({ doing: 'selecting classifier mode', cause }),
          ),
          Effect.provideService(Database, database),
          Effect.tap((changed) =>
            Effect.sync(() => {
              if (changed) generation += 1
            }),
          ),
          Effect.asVoid,
        ),
      selectStrictness: (strictness) =>
        mutate('selecting classifier strictness', (transaction) =>
          Effect.gen(function* () {
            const rows = yield* transaction
              .select()
              .from(appPreferences)
              .where(eq(appPreferences.key, STRICTNESS_KEY))
            const previous = strictnessOf(rows[0]?.value)
            if (previous === strictness) return { result: undefined, events: [] }
            yield* transaction
              .insert(appPreferences)
              .values({ key: STRICTNESS_KEY, value: strictness })
              .onConflictDoUpdate({
                target: appPreferences.key,
                set: { value: sql`excluded.value` },
              })
            return {
              result: undefined,
              events: [
                {
                  type: 'classifier.strictness_changed',
                  entityKind: 'profile' as const,
                  entityId: 'profile',
                  source: 'ui' as const,
                  author: 'human' as const,
                  payload: { from: previous, to: strictness },
                },
              ],
            }
          }),
        ).pipe(
          Effect.mapError((cause) =>
            cause instanceof DatabaseError
              ? cause
              : new DatabaseError({ doing: 'selecting classifier strictness', cause }),
          ),
          Effect.provideService(Database, database),
          Effect.asVoid,
        ),
      setConsent: (consent) =>
        write(CONSENT_KEY, String(consent)).pipe(
          Effect.tap(() =>
            Effect.sync(() => {
              generation += 1
            }),
          ),
          Effect.asVoid,
        ),
      ciphertext: value(CIPHERTEXT_KEY).pipe(Effect.map((rows) => rows[0]?.value ?? null)),
      replaceKey: (ciphertext, plaintext) =>
        write(CIPHERTEXT_KEY, ciphertext).pipe(
          Effect.tap(() =>
            Effect.sync(() => {
              key = plaintext
              generation += 1
            }),
          ),
          Effect.asVoid,
        ),
      restoreKey: (plaintext) =>
        Effect.sync(() => {
          key = plaintext
          generation += 1
        }),
      removeKey: database
        .delete(appPreferences)
        .where(eq(appPreferences.key, CIPHERTEXT_KEY))
        .pipe(
          Effect.mapError(
            (cause) => new DatabaseError({ doing: 'removing classifier key', cause }),
          ),
          Effect.tap(() =>
            Effect.sync(() => {
              key = null
              generation += 1
            }),
          ),
          Effect.asVoid,
        ),
    }
  }),
)
