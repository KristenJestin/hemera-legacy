/**
 * Helper agents (issue #77): the child Sessions a build's main agent launches, stops and reads
 * through Hemera's tools, and that a helper launches in turn, two levels deep at most.
 *
 * A helper is a row of `sessions` with a parent: the runtime, the thread, the tool token and the
 * pool work for it as for any Session. What is its own is here: the launch, refused above the
 * Project's number of helpers at once and never queued; its brief, handed at its agent's first
 * safe point; its end — its answer read as its result, a failure, or a stop — written with its
 * Journal line in one transaction, the result queued for its launcher in the same one, so a quit
 * loses none of it (`queued_results`); and the Session its questions are answered in, the build's.
 *
 * The service sits below the tool catalogue and the runtime, like the builds: where it needs a
 * helper's agent — to start it, stop it, let it go, or hand its launcher what came back — it goes
 * through `HelperAgent`, a port the runtime fills once it is built (`drivenBy`).
 */

import {
  HELPER_DEPTH,
  type HelperState,
  HELPER_STATES,
  composeHelperBrief,
  helperNamed,
  helperResult,
  helpersFor,
  titleFromMessage,
} from '@hemera/core'
import { and, asc, desc, eq, inArray, or } from 'drizzle-orm'
import { Context, Effect, Layer } from 'effect'

import { BuildNotices, Builds } from '../build/build.ts'
import type { NewEvent } from '../journal.ts'
import { Database, type DatabaseError, type EngineTransaction } from '../storage/database.ts'
import {
  buildClaims,
  projects,
  queuedResults,
  sessionEntries,
  sessions,
} from '../storage/schema.ts'
import type { ParsedCall } from '../tools/arguments.ts'
import { failed, now } from '../specs/snapshot.ts'
import { mutate } from '../transaction.ts'

/** A call to one of the three helper tools, as `parseCall` read it. */
export type HelperCall = Extract<
  ParsedCall,
  { tool: 'helper_launch' | 'helper_stop' | 'helper_read' }
>

/** What a helper tool answers: the catalogue's `Answer`, which it writes down like any other. */
export interface HelperAnswer {
  readonly ok: boolean
  readonly refused?: boolean
  readonly summary: string
  readonly text: string
  readonly paths: readonly string[]
}

/** One helper, as the line of what goes on in its build reads it. */
export interface HelperView {
  readonly id: string
  /** The Session that launched it: the build Session, or another helper. */
  readonly parentSessionId: string
  readonly name: string
  /** The defined helper it runs, by id, or null for a free one. */
  readonly definition: string | null
  readonly depth: number
  /** The build task it was launched on, by its label, or null. */
  readonly task: string | null
  readonly state: HelperState
  /** The last line it said, or null while it has said nothing. */
  readonly lastLine: string | null
  readonly startedAt: string
  readonly endedAt: string | null
}

/** What the helpers ask of an agent, filled by the runtime once it is built. */
export interface HelperAgent {
  /** Starts the Session's agent and hands it what waits — a helper's brief — at once. */
  readonly start: (sessionId: string) => Effect.Effect<void>
  /** Stops the turn running in the Session, if one is, and lets its agent go. */
  readonly stop: (sessionId: string) => Effect.Effect<void>
  /** Lets the Session's agent go once no turn runs: a helper whose work settled. */
  readonly release: (sessionId: string) => Effect.Effect<void>
  /** Hands the Session's agent what waits for it — a helper's result — at its next safe point. */
  readonly handOver: (sessionId: string) => Effect.Effect<void>
}

export interface HelpersService {
  /** The runtime, once it is built: how a helper's agent is reached. */
  readonly drivenBy: (agent: HelperAgent) => void
  /** `helper_launch`, `helper_stop` and `helper_read`, called by the Session given. */
  readonly tool: (sessionId: string, call: HelperCall) => Effect.Effect<HelperAnswer>
  /** The brief waiting for a helper's agent, or null: handed at its first safe point. */
  readonly waiting: (sessionId: string) => string | null
  /** The helper's agent took its brief. */
  readonly taken: (sessionId: string) => void
  /**
   * A delivery turn of a Session ended (issue #77): for a running helper, its answer is its result
   * once no helper of its own still runs and no result of one waits for it; a turn that failed
   * fails it. Any other Session passes.
   */
  readonly turnEnded: (sessionId: string, turnId: string, stopReason: string) => Effect.Effect<void>
  /** The agent of a Session died under a turn: a running helper fails, and its launcher is told. */
  readonly died: (sessionId: string, reason: string) => Effect.Effect<void>
  /** The user's ×: a helper stopped, and the main agent told. Answers the build's helpers. */
  readonly stop: (helperId: string) => Effect.Effect<readonly HelperView[], DatabaseError>
  /** Every helper under a build Session, at any depth, in the order they were launched. */
  readonly list: (sessionId: string) => Effect.Effect<readonly HelperView[], DatabaseError>
  /**
   * The Session a Session's questions are answered in and its build is driven from: the build
   * Session for a helper at any depth, the Session itself for any other.
   */
  readonly answeredIn: (sessionId: string) => Effect.Effect<string>
  /** At the engine's start: a helper the last engine left running failed, and its build is told. */
  readonly recover: Effect.Effect<void, DatabaseError>
  /**
   * A write of a Session through Hemera's tools to a path of the Workspace root (issue #77): null
   * when it may go, or why not — the path is held by another task a helper is working on. The
   * first write of a helper on a task to a free path claims it for that task.
   */
  readonly claim: (sessionId: string, path: string) => Effect.Effect<string | null>
}

export class Helpers extends Context.Service<Helpers, HelpersService>()('Helpers') {}

type SessionRow = typeof sessions.$inferSelect

/** What a stop or an end is said with, to the agent and in the Journal. */
const STOPPED_BY = {
  agent: 'Stopped by its launcher.',
  user: 'Stopped by the user.',
} as const

function completed(summary: string, text: string): HelperAnswer {
  return { ok: true, summary, text, paths: [] }
}

function refusedAnswer(reason: string): HelperAnswer {
  return { ok: false, refused: true, summary: reason, text: reason, paths: [] }
}

function stateOf(row: Pick<SessionRow, 'helperState'>): HelperState {
  return HELPER_STATES.find((known) => known === row.helperState) ?? 'failed'
}

/** The last line of a text that says something, or null for none. */
function lastLineOf(text: string | undefined): string | null {
  if (text === undefined) return null
  return (
    text
      .split('\n')
      .map((line) => line.trim())
      .findLast((line) => line !== '') ?? null
  )
}

/** What a helper's launcher reads about its task once it ended without finishing. */
function taskWords(row: SessionRow): string {
  return row.helperTask === null
    ? ''
    : ` Its task ${row.helperTask} stays in progress, with its attempt and the files it holds: hand it again.`
}

export const helpersLayer = Layer.effect(
  Helpers,
  Effect.gen(function* () {
    const database = yield* Database
    const builds = yield* Builds
    const notices = yield* BuildNotices

    const withDatabase = <A, E>(effect: Effect.Effect<A, E, Database>): Effect.Effect<A, E> =>
      effect.pipe(Effect.provideService(Database, database))

    /** The runtime, once it handed itself over. */
    let agent: HelperAgent | null = null
    /** The briefs whose helper's agent has not taken them yet, by helper. */
    const due = new Map<string, string>()

    const rowOf = (sessionId: string) =>
      database
        .select()
        .from(sessions)
        .where(eq(sessions.id, sessionId))
        .pipe(
          Effect.map((found) => found[0] ?? null),
          Effect.orElseSucceed(() => null),
        )

    /** The build Session a row answers to: itself, its parent, or its parent's parent. */
    const rootOf = (row: SessionRow) =>
      Effect.gen(function* () {
        if (row.parentSessionId === null) return row.id
        const parent = yield* rowOf(row.parentSessionId)
        return parent?.parentSessionId ?? row.parentSessionId
      })

    /** The helpers under a build Session, at any depth (two at most), in the order launched. */
    const under = (reader: EngineTransaction | typeof database, rootId: string) =>
      reader
        .select()
        .from(sessions)
        .where(
          or(
            eq(sessions.parentSessionId, rootId),
            inArray(
              sessions.parentSessionId,
              reader
                .select({ id: sessions.id })
                .from(sessions)
                .where(eq(sessions.parentSessionId, rootId)),
            ),
          ),
        )
        .orderBy(asc(sessions.createdAt))
        .pipe(Effect.mapError(failed('reading the helpers')))

    /** What a helper's agent said in one turn, every message of it, in order. */
    const answerOf = (sessionId: string, turnId: string) =>
      database
        .select({ body: sessionEntries.body })
        .from(sessionEntries)
        .where(
          and(
            eq(sessionEntries.sessionId, sessionId),
            eq(sessionEntries.turnId, turnId),
            eq(sessionEntries.role, 'agent'),
            eq(sessionEntries.kind, 'message'),
          ),
        )
        .orderBy(asc(sessionEntries.seq))
        .pipe(
          Effect.map((said) =>
            said
              .map((entry) => entry.body.trim())
              .filter((body) => body !== '')
              .join('\n\n'),
          ),
          Effect.orElseSucceed(() => ''),
        )

    /** The last thing a helper's thread holds, and the last message its agent wrote. */
    const lastOf = (sessionId: string) =>
      Effect.gen(function* () {
        const entry = yield* database
          .select({ createdAt: sessionEntries.createdAt })
          .from(sessionEntries)
          .where(eq(sessionEntries.sessionId, sessionId))
          .orderBy(desc(sessionEntries.seq))
          .limit(1)
          .pipe(Effect.orElseSucceed(() => []))
        const said = yield* database
          .select({ body: sessionEntries.body })
          .from(sessionEntries)
          .where(
            and(
              eq(sessionEntries.sessionId, sessionId),
              eq(sessionEntries.role, 'agent'),
              eq(sessionEntries.kind, 'message'),
            ),
          )
          .orderBy(desc(sessionEntries.seq))
          .limit(1)
          .pipe(Effect.orElseSucceed(() => []))
        return { at: entry[0]?.createdAt ?? null, line: lastLineOf(said[0]?.body) }
      })

    const viewOf = (row: SessionRow) =>
      Effect.gen(function* () {
        const last = yield* lastOf(row.id)
        const view: HelperView = {
          id: row.id,
          parentSessionId: row.parentSessionId ?? '',
          name: row.title,
          definition: row.helper,
          depth: row.helperDepth ?? 1,
          task: row.helperTask,
          state: stateOf(row),
          lastLine: last.line,
          startedAt: row.createdAt,
          endedAt: row.helperEndedAt,
        }
        return view
      })

    const list = (sessionId: string) =>
      Effect.gen(function* () {
        const rows = yield* under(database, sessionId)
        return yield* Effect.forEach(rows, viewOf)
      })

    /**
     * A helper's work settles: its state, why, and when, and — when its launcher is told — the
     * result queued for it, with the Journal line, in one transaction. Its own running helpers stop
     * with it: nothing would be left to hand their results to. Answers false for a helper that was
     * no longer running: whoever settled it first said what it is.
     */
    const settle = (
      row: SessionRow,
      state: Exclude<HelperState, 'running'>,
      result: string,
      told: string | null,
      author: 'agent' | 'hemera' | 'human',
      drives = true,
    ) =>
      Effect.gen(function* () {
        const rootId = yield* rootOf(row)
        const parent = row.parentSessionId === null ? null : yield* rowOf(row.parentSessionId)
        // A launcher that is a helper no longer running has nobody left to read a result.
        const tells =
          told !== null &&
          parent !== null &&
          (parent.parentSessionId === null || parent.helperState === 'running')
        const at = now()
        const settled = yield* withDatabase(
          mutate('settling a helper', (transaction) =>
            Effect.gen(function* () {
              const touched = yield* transaction
                .update(sessions)
                .set({ helperState: state, helperResult: result, helperEndedAt: at })
                .where(and(eq(sessions.id, row.id), eq(sessions.helperState, 'running')))
                .returning({ id: sessions.id })
                .pipe(Effect.mapError(failed('settling the helper')))
              if (touched.length === 0) return { result: null, events: [] }
              const children = yield* transaction
                .update(sessions)
                .set({
                  helperState: 'stopped',
                  helperResult: 'Its launcher ended.',
                  helperEndedAt: at,
                })
                .where(
                  and(eq(sessions.parentSessionId, row.id), eq(sessions.helperState, 'running')),
                )
                .returning({ id: sessions.id, title: sessions.title })
                .pipe(Effect.mapError(failed('stopping the helpers of the helper')))
              if (tells && parent !== null) {
                yield* transaction
                  .insert(queuedResults)
                  .values({
                    id: crypto.randomUUID(),
                    sessionId: parent.id,
                    text: told,
                    queuedAt: at,
                  })
                  .pipe(Effect.mapError(failed('queuing the result of the helper')))
              }
              const events: NewEvent[] = [
                {
                  type: `helper.${state}`,
                  entityKind: 'session',
                  entityId: row.id,
                  source: author === 'human' ? 'ui' : 'system',
                  author,
                  projectId: row.projectId,
                  sessionId: rootId,
                  payload: {
                    name: row.title,
                    helper: row.helper,
                    task: row.helperTask,
                    result: result.slice(0, 400),
                  },
                },
                ...children.map((child): NewEvent => ({
                  type: 'helper.stopped',
                  entityKind: 'session',
                  entityId: child.id,
                  source: 'system',
                  author: 'hemera',
                  projectId: row.projectId,
                  sessionId: rootId,
                  payload: { name: child.title, because: row.id, result: 'Its launcher ended.' },
                })),
              ]
              const stopped: readonly string[] = children.map((child) => child.id)
              return { result: stopped, events }
            }),
          ),
        ).pipe(Effect.orElseSucceed(() => null))
        if (settled === null) return false
        due.delete(row.id)
        // At the engine's start nothing runs yet: the result waits for its launcher's next safe
        // point, which a build that is not paused reaches as it resumes.
        if (agent !== null && drives) {
          for (const child of settled) yield* agent.stop(child)
          yield* agent.release(row.id)
          if (tells && parent !== null) yield* agent.handOver(parent.id)
        }
        notices.helpers(rootId)
        // One fewer helper in the middle of a try: a red check held as provisional may count now.
        if (drives) yield* builds.rejudge(rootId)
        return true
      })

    /** Fails a running helper with the reason, and tells its launcher. */
    const fail = (sessionId: string, reason: string) =>
      Effect.gen(function* () {
        const row = yield* rowOf(sessionId)
        if (row === null || row.helperState !== 'running') return
        yield* settle(
          row,
          'failed',
          reason,
          `${row.title} (helper ${row.id}) failed: ${reason}.${taskWords(row)}`,
          'hemera',
        )
      })

    /** Stops a running helper, by its launcher or by the user, and lets its agent go. */
    const stopOne = (row: SessionRow, by: 'agent' | 'user') =>
      Effect.gen(function* () {
        const told =
          by === 'user'
            ? `The user stopped ${row.title} (helper ${row.id}).${taskWords(row)}`
            : null
        const settled = yield* settle(
          row,
          'stopped',
          STOPPED_BY[by],
          told,
          by === 'user' ? 'human' : 'agent',
        )
        if (settled && agent !== null) yield* agent.stop(row.id)
        return settled
      })

    const launch = (callerId: string, call: Extract<HelperCall, { tool: 'helper_launch' }>) =>
      Effect.gen(function* () {
        const caller = yield* rowOf(callerId)
        if (caller === null) return refusedAnswer('this Session is unknown')
        const depth = (caller.helperDepth ?? 0) + 1
        if (depth > HELPER_DEPTH) {
          return refusedAnswer(
            `helpers go ${HELPER_DEPTH} levels deep at most, and you are a helper's helper: do this work yourself`,
          )
        }
        const named = call.arguments.helper
        const definition = named === undefined ? null : helperNamed(named)
        if (
          named !== undefined &&
          (definition === null || !definition.missions.some((one) => one === caller.mission))
        ) {
          return refusedAnswer(
            `there is no helper named ${named} to launch here; leave helper out to launch a free one. The defined helpers of a build:\n${helpersFor('build')}`,
          )
        }
        const rootId = yield* rootOf(caller)
        const inputs = yield* builds.helperInputs(rootId, call.arguments.task ?? null)
        if ('refusal' in inputs) return refusedAnswer(inputs.refusal)
        const id = crypto.randomUUID()
        const name = definition?.name ?? titleFromMessage(call.arguments.brief)
        const task = inputs.task?.label ?? null
        const at = now()
        const refusal = yield* withDatabase(
          mutate('launching a helper', (transaction) =>
            Effect.gen(function* () {
              // Counted in the very transaction that writes the helper: two launches at once are
              // serialised by it, and never both let past the number the Project allows.
              const project = yield* transaction
                .select({ helpersAtOnce: projects.helpersAtOnce })
                .from(projects)
                .where(eq(projects.id, caller.projectId))
                .pipe(Effect.mapError(failed('reading the Project')))
              const most = project[0]?.helpersAtOnce ?? 0
              const running = (yield* under(transaction, rootId)).filter(
                (one) => one.helperState === 'running',
              )
              if (running.length >= most) {
                return {
                  result: `${running.length} helpers are running, the most this Project lets run at once: wait for one to finish, stop one, or do this work yourself`,
                  events: [],
                }
              }
              const holder =
                task === null ? undefined : running.find((one) => one.helperTask === task)
              if (holder !== undefined) {
                return {
                  result: `${task ?? ''} is already with ${holder.title} (helper ${holder.id}): read where it stands, or stop it first`,
                  events: [],
                }
              }
              yield* transaction
                .insert(sessions)
                .values({
                  id,
                  projectId: caller.projectId,
                  title: name,
                  titleSource: 'derived',
                  // The main agent's own agent and model, and what it stands on (#77).
                  provider: caller.provider,
                  model: caller.model,
                  choices: caller.choices,
                  mission: caller.mission,
                  workspaceId: caller.workspaceId,
                  createdAt: at,
                  lastWrittenAt: at,
                  parentSessionId: callerId,
                  helper: definition?.id ?? null,
                  helperDepth: depth,
                  helperTask: task,
                  helperState: 'running',
                })
                .pipe(Effect.mapError(failed('writing the helper')))
              const launched: NewEvent = {
                type: 'helper.launched',
                entityKind: 'session',
                entityId: id,
                source: 'system',
                author: 'agent',
                projectId: caller.projectId,
                sessionId: rootId,
                payload: { name, parent: callerId, helper: definition?.id ?? null, task, depth },
              }
              return { result: null, events: [launched] }
            }),
          ),
        ).pipe(
          Effect.catch((cause) =>
            Effect.succeed(`the helper could not be launched: ${cause.message}`),
          ),
        )
        if (refusal !== null) return refusedAnswer(refusal)
        due.set(
          id,
          composeHelperBrief({
            definition,
            brief: call.arguments.brief,
            depth,
            task: inputs.task,
            spec: inputs.spec,
          }),
        )
        notices.helpers(rootId)
        if (agent !== null) yield* agent.start(id)
        return completed(
          `launched ${name} (helper ${id})`,
          `${name} is launched as helper ${id}${task === null ? '' : `, on ${task}`}. It works on its own, and its result comes back to you when it is done: carry on. helper_read({ id: "${id}" }) says where it stands.`,
        )
      })

    /** A helper the caller launched, or the refusal of one it did not. */
    const ownHelper = (callerId: string, id: string) =>
      Effect.gen(function* () {
        const row = yield* rowOf(id)
        if (row === null || row.parentSessionId !== callerId) {
          return { row: null, refusal: `you launched no helper ${id}` }
        }
        return { row, refusal: null }
      })

    const read = (callerId: string, id: string) =>
      Effect.gen(function* () {
        const { row, refusal } = yield* ownHelper(callerId, id)
        if (row === null) return refusedAnswer(refusal)
        const last = yield* lastOf(row.id)
        const state = stateOf(row)
        const silent =
          last.at === null
            ? 'it has said nothing yet'
            : `it last wrote ${Math.max(0, Math.round((Date.now() - Date.parse(last.at)) / 1000))} s ago`
        const lines = [
          `${row.title} (helper ${row.id}): ${state}`,
          `Task: ${row.helperTask ?? 'none'}`,
          `Launched at ${row.createdAt}; ${silent}`,
          `Last line: ${last.line ?? 'none yet'}`,
        ]
        if (state !== 'running') lines.push(`Result:\n${row.helperResult ?? ''}`)
        return completed(`read ${row.title}: ${state}`, lines.join('\n'))
      })

    const stopAsked = (callerId: string, id: string) =>
      Effect.gen(function* () {
        const { row, refusal } = yield* ownHelper(callerId, id)
        if (row === null) return refusedAnswer(refusal)
        if (row.helperState !== 'running') {
          return refusedAnswer(`${row.title} is already ${stateOf(row)}`)
        }
        yield* stopOne(row, 'agent')
        return completed(
          `stopped ${row.title}`,
          `${row.title} (helper ${row.id}) is stopped.${taskWords(row)}`,
        )
      })

    const service: HelpersService = {
      drivenBy: (next) => {
        agent = next
      },

      tool: (sessionId, call) => {
        switch (call.tool) {
          case 'helper_launch':
            return launch(sessionId, call)
          case 'helper_stop':
            return stopAsked(sessionId, call.arguments.id)
          case 'helper_read':
            return read(sessionId, call.arguments.id)
        }
      },

      waiting: (sessionId) => due.get(sessionId) ?? null,

      taken: (sessionId) => {
        due.delete(sessionId)
      },

      turnEnded: (sessionId, turnId, stopReason) =>
        Effect.gen(function* () {
          const row = yield* rowOf(sessionId)
          if (row === null || row.helperState !== 'running') return
          // A Stop: whoever stopped it has settled it already.
          if (stopReason === 'cancelled') return
          if (stopReason !== 'end_turn') {
            return yield* fail(sessionId, `its turn ended: ${stopReason}`)
          }
          // Its own helpers still run: their results come to it, and its answer to the last of
          // them is its own.
          const children = yield* database
            .select({ id: sessions.id })
            .from(sessions)
            .where(
              and(eq(sessions.parentSessionId, sessionId), eq(sessions.helperState, 'running')),
            )
            .pipe(Effect.orElseSucceed(() => []))
          if (children.length > 0) return
          // A helper of its own ended while this turn ran: its result waits, and was never seen.
          // It is handed over, and the turn it goes out in decides.
          const waiting = yield* database
            .select({ id: queuedResults.id })
            .from(queuedResults)
            .where(eq(queuedResults.sessionId, sessionId))
            .limit(1)
            .pipe(Effect.orElseSucceed(() => []))
          if (waiting.length > 0) {
            if (agent !== null) yield* agent.handOver(sessionId)
            return
          }
          const definition = row.helper === null ? null : helperNamed(row.helper)
          const result = helperResult(definition, yield* answerOf(sessionId, turnId))
          const told = result.matched
            ? `${row.title} (helper ${row.id}) is done. Its result:\n\n${result.text}`
            : `${row.title} (helper ${row.id}) is done, but its answer does not match the shape it returns (${result.reason}). What it said:\n\n${result.text}`
          yield* settle(row, 'done', result.text, told, 'agent')
        }),

      died: (sessionId, reason) => fail(sessionId, reason),

      stop: (helperId) =>
        Effect.gen(function* () {
          const row = yield* rowOf(helperId)
          if (row === null || row.parentSessionId === null) return []
          if (row.helperState === 'running') yield* stopOne(row, 'user')
          return yield* list(yield* rootOf(row))
        }),

      list,

      answeredIn: (sessionId) =>
        Effect.gen(function* () {
          const row = yield* rowOf(sessionId)
          return row === null ? sessionId : yield* rootOf(row)
        }),

      claim: (sessionId, path) =>
        Effect.gen(function* () {
          const row = yield* rowOf(sessionId)
          if (row === null) return null
          const rootId = yield* rootOf(row)
          const mine = row.helperState === 'running' ? row.helperTask : null
          return yield* withDatabase(
            mutate('claiming a file', (transaction) =>
              Effect.gen(function* () {
                if (mine !== null) {
                  yield* transaction
                    .insert(buildClaims)
                    .values({
                      id: crypto.randomUUID(),
                      sessionId: rootId,
                      task: mine,
                      path,
                      claimedAt: now(),
                    })
                    .onConflictDoNothing()
                    .pipe(Effect.mapError(failed('claiming the file')))
                }
                const found = yield* transaction
                  .select()
                  .from(buildClaims)
                  .where(and(eq(buildClaims.sessionId, rootId), eq(buildClaims.path, path)))
                  .pipe(Effect.mapError(failed('reading the files held')))
                const claim = found[0]
                if (claim === undefined || claim.task === mine) return { result: null, events: [] }
                // Held by a task no helper works on now: the claim waits for the next one.
                const holder = (yield* under(transaction, rootId)).find(
                  (one) => one.helperState === 'running' && one.helperTask === claim.task,
                )
                if (holder === undefined) return { result: null, events: [] }
                return {
                  result: `${path} is held by ${claim.task}, which ${holder.title} (helper ${holder.id}) is working on: leave it to that task`,
                  events: [],
                }
              }),
            ),
          ).pipe(
            // A safety net that cannot be read holds: the write waits for one that can.
            Effect.catch(() =>
              Effect.succeed(
                `the files held in this build could not be read, so ${path} was not written`,
              ),
            ),
          )
        }),

      recover: Effect.gen(function* () {
        const left = yield* database
          .select()
          .from(sessions)
          .where(eq(sessions.helperState, 'running'))
          // Launchers first: a helper of a helper stops with its launcher, and is told nothing.
          .orderBy(asc(sessions.helperDepth))
          .pipe(Effect.mapError(failed('reading the helpers left running')))
        for (const row of left) {
          yield* settle(
            row,
            'failed',
            'Hemera quit while it ran.',
            `${row.title} (helper ${row.id}) failed: Hemera quit while it ran.${taskWords(row)}`,
            'hemera',
            false,
          )
        }
      }),
    }
    return service
  }),
)

/** At the engine's start: the helpers the last engine left running failed (issue #77). */
export const recoveredHelpers = Effect.gen(function* () {
  yield* (yield* Helpers).recover
})
