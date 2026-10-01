/**
 * The review rounds of a build (issue #278): round 1, 2… of a `build` Session, each freezing the
 * build's result per repository when it opens, and collecting the user's feedback on it.
 *
 * Opening a round takes one checkpoint per repository of the Workspace — its `HEAD`, the snapshot
 * tree of its working tree (`snapshotTree`, D10-05), its base and the files from that base to the
 * tree — and copies the file list into the database, so the round stays readable once the
 * Workspace is cleaned up and Git pruned its trees. While a round is `open`, the build's agent
 * writes nothing in the Workspace: `refusal` is what the build asks before each of its calls.
 *
 * A repository whose working tree no longer matches the round's tree — changed in a terminal or an
 * editor — marks the round stale for that repository. It is checked again each time the round is
 * read, and on a timer while it is open. Hemera neither fixes it nor hides it, and the mark stays:
 * what the user reviewed is no longer what is on disk, whatever happens to the disk next.
 *
 * Feedback only accumulates: adding or withdrawing one is the user's request, and starts nothing.
 * No agent tool reaches any of it. Git runs before a transaction or after it, never inside one.
 */

import { join } from 'node:path'

import {
  type FeedbackAnchor,
  type FeedbackKind,
  ROUND_KINDS,
  ROUND_STATES,
  type RoundKind,
  type RoundState,
  type ToolName,
  anchorRefusal,
  feedbackRefusal,
  roundMoveRefusal,
  roundToolRefusal,
} from '@hemera/core'
import { and, asc, eq, inArray, isNull, max, ne, sql } from 'drizzle-orm'
import { Context, Data, Effect, Layer, Result } from 'effect'

import { StderrSink } from '../agents/supervisor.ts'
import { BuildNotices } from '../build/notices.ts'
import { changedFiles, snapshotTree } from '../build/snapshots.ts'
import { Git } from '../git.ts'
import type { NewEvent } from '../journal.ts'
import { Database, type DatabaseError, type EngineTransaction } from '../storage/database.ts'
import {
  acceptanceCriteria,
  reviewFeedback,
  reviewRoundFiles,
  reviewRoundRepositories,
  reviewRounds,
  sessions,
  userStories,
  workspaceRepositories,
} from '../storage/schema.ts'
import { failed, now } from '../specs/snapshot.ts'
import { type Mutation, mutate } from '../transaction.ts'
import { describedWorkspace } from '../workspaces/described.ts'

/** How often an open round's repositories are compared with its trees, in milliseconds. */
export const ROUND_WATCH_MS = 30_000

/** One file of a round, from the repository's base to the round's tree. */
export interface RoundFileView {
  readonly path: string
  /** Git's letter: `A`, `M`, `D`, `R`, `T`; a rename is named by its new path. */
  readonly status: string
  /** Lines added and removed; null for a binary file. */
  readonly added: number | null
  readonly removed: number | null
  /** Whether Git did not track it in the working tree when the round opened. */
  readonly untracked: boolean
}

/** The checkpoint of one repository when its round opened, and whether it went stale since. */
export interface RoundRepositoryView {
  /** Its path under the Workspace root, `''` for one at the root. */
  readonly repository: string
  /** The commit checked out. */
  readonly head: string
  /** The snapshot tree of its working tree. */
  readonly tree: string
  /** The base its worktree was created from, or null when Hemera made no worktree of it. */
  readonly base: string | null
  /** The commit its files are listed from: where its branch left the base, or `head`. */
  readonly baseCommit: string
  /** When its working tree was first found to differ from `tree`; null while it matches. */
  readonly staleAt: string | null
  readonly files: readonly RoundFileView[]
}

/** One feedback of the user's on a round. */
export interface FeedbackView {
  readonly id: string
  readonly kind: FeedbackKind
  readonly body: string
  readonly anchor: FeedbackAnchor | null
  readonly createdAt: string
  readonly withdrawnAt: string | null
}

/** A review round as the build view and `review.read` answer it. */
export interface ReviewRoundView {
  readonly id: string
  /** Counted from one per build. */
  readonly number: number
  readonly kind: RoundKind
  readonly state: RoundState
  readonly openedAt: string
  readonly fixingAt: string | null
  readonly closedAt: string | null
  /** Whether one of its repositories went stale. */
  readonly stale: boolean
  readonly repositories: readonly RoundRepositoryView[]
  readonly feedback: readonly FeedbackView[]
}

/** What was asked of a review round is refused, with the sentence the window shows. */
export class ReviewRefusedError extends Data.TaggedError('ReviewRefusedError')<{
  readonly reason: string
}> {
  override get message(): string {
    return this.reason
  }
}

/** Everything a request about a review round can be answered with. */
export type ReviewRefusal = DatabaseError | ReviewRefusedError

export interface ReviewRoundsService {
  /**
   * Opens the next round of a build — a review of its Spec — with one checkpoint per repository of
   * its Workspace. Refused while one is open or being fixed.
   */
  readonly open: (sessionId: string) => Effect.Effect<ReviewRoundView, ReviewRefusal>
  /** Moves the build's round that is not closed forward: to `fixing`, or to `closed`. */
  readonly move: (
    sessionId: string,
    to: 'fixing' | 'closed',
  ) => Effect.Effect<ReviewRoundView, ReviewRefusal>
  /** Why the build's agent may not call this tool now, or null: an open round holds the writes. */
  readonly refusal: (
    sessionId: string,
    tool: ToolName,
  ) => Effect.Effect<string | null, DatabaseError>
  /**
   * The rounds of a build in their order, the open one checked against its repositories first. A
   * Session that is no build has none.
   */
  readonly read: (sessionId: string) => Effect.Effect<readonly ReviewRoundView[], DatabaseError>
  /** A feedback of the user's on the build's open round. Nothing starts. */
  readonly addFeedback: (
    sessionId: string,
    kind: FeedbackKind,
    body: string,
    anchor: FeedbackAnchor | null,
  ) => Effect.Effect<ReviewRoundView, ReviewRefusal>
  /** A feedback of the open round withdrawn by the user: kept, and marked withdrawn. */
  readonly withdrawFeedback: (
    sessionId: string,
    feedbackId: string,
  ) => Effect.Effect<ReviewRoundView, ReviewRefusal>
}

export class ReviewRounds extends Context.Service<ReviewRounds, ReviewRoundsService>()(
  'ReviewRounds',
) {}

/** A repository as the Project declares it (`./sources/api`, `.`), as a round names it. */
function repositoryOf(declared: string): string {
  return declared === '.' ? '' : declared.replace(/^\.\//, '')
}

type RoundRow = typeof reviewRounds.$inferSelect
type FeedbackRow = typeof reviewFeedback.$inferSelect

/** A feedback row's anchor, from whichever family of columns holds one. */
function anchorOf(row: FeedbackRow): FeedbackAnchor | null {
  if (row.anchorStoryId !== null) {
    return { kind: 'spec', storyId: row.anchorStoryId, criterion: row.anchorCriterion }
  }
  if (row.anchorRepository !== null && row.anchorPath !== null) {
    return {
      kind: 'code',
      repository: row.anchorRepository,
      path: row.anchorPath,
      lines:
        row.anchorLineStart === null || row.anchorLineEnd === null
          ? null
          : { start: row.anchorLineStart, end: row.anchorLineEnd },
      side: row.anchorSide === 'old' || row.anchorSide === 'new' ? row.anchorSide : null,
    }
  }
  return null
}

/** The anchor's columns, every one of them named so a row holds one family or none. */
function anchorColumns(anchor: FeedbackAnchor | null) {
  return {
    anchorStoryId: anchor?.kind === 'spec' ? anchor.storyId : null,
    anchorCriterion: anchor?.kind === 'spec' ? anchor.criterion : null,
    anchorRepository: anchor?.kind === 'code' ? anchor.repository : null,
    anchorPath: anchor?.kind === 'code' ? anchor.path : null,
    anchorLineStart: anchor?.kind === 'code' ? (anchor.lines?.start ?? null) : null,
    anchorLineEnd: anchor?.kind === 'code' ? (anchor.lines?.end ?? null) : null,
    anchorSide: anchor?.kind === 'code' ? anchor.side : null,
  }
}

/** One repository's checkpoint as a round keeps it, its files copied beside it. */
export interface RoundCheckpoint {
  readonly repository: string
  readonly head: string
  readonly tree: string
  readonly base: string | null
  readonly baseCommit: string
  readonly files: readonly RoundFileView[]
}

/**
 * Writes the next round of a build — a review of its Spec, `open` — with its checkpoints, inside
 * the transaction the caller holds, and answers its number. `open` writes it after Git took the
 * checkpoints; a build whose Workspace has no repository opens its round with none, in the very
 * transaction that ends its `verify` (issue #279).
 */
export function insertRound(
  transaction: EngineTransaction,
  sessionId: string,
  roundId: string,
  checkpoints: readonly RoundCheckpoint[],
  at: string,
) {
  return Effect.gen(function* () {
    const last = yield* transaction
      .select({ number: max(reviewRounds.number) })
      .from(reviewRounds)
      .where(eq(reviewRounds.sessionId, sessionId))
    const number = (last[0]?.number ?? 0) + 1
    yield* transaction.insert(reviewRounds).values({
      id: roundId,
      sessionId,
      number,
      kind: 'spec',
      state: 'open',
      openedAt: at,
    })
    for (const checkpoint of checkpoints) {
      yield* transaction.insert(reviewRoundRepositories).values({
        roundId,
        repository: checkpoint.repository,
        head: checkpoint.head,
        tree: checkpoint.tree,
        base: checkpoint.base,
        baseCommit: checkpoint.baseCommit,
      })
      if (checkpoint.files.length > 0) {
        yield* transaction.insert(reviewRoundFiles).values(
          checkpoint.files.map((file) => ({
            roundId,
            repository: checkpoint.repository,
            path: file.path,
            status: file.status,
            added: file.added,
            removed: file.removed,
            untracked: file.untracked,
          })),
        )
      }
    }
    return number
  }).pipe(Effect.mapError(failed('opening a review round')))
}

export const reviewRoundsLayer = (
  everyMs: number = ROUND_WATCH_MS,
): Layer.Layer<ReviewRounds, never, Database | Git | BuildNotices | StderrSink> =>
  Layer.effect(
    ReviewRounds,
    Effect.gen(function* () {
      const database = yield* Database
      const git = yield* Git
      const notices = yield* BuildNotices
      const diagnostic = yield* StderrSink
      const scope = yield* Effect.scope

      const withDatabase = <A, E>(effect: Effect.Effect<A, E, Database>): Effect.Effect<A, E> =>
        effect.pipe(Effect.provideService(Database, database))
      const withGit = <A, E>(effect: Effect.Effect<A, E, Git>): Effect.Effect<A, E> =>
        effect.pipe(Effect.provideService(Git, git))
      const refused = (reason: string) => Effect.fail(new ReviewRefusedError({ reason }))
      /** A change and its Journal lines in one transaction, what the driver refuses said as such. */
      const written = <A, E>(
        doing: string,
        body: (transaction: EngineTransaction) => Effect.Effect<Mutation<A>, E>,
      ) =>
        withDatabase(
          mutate(doing, (transaction) => body(transaction).pipe(Effect.mapError(failed(doing)))),
        )

      /** The build Session, or null for a Session that is none. */
      const buildOf = (sessionId: string) =>
        database
          .select()
          .from(sessions)
          .where(eq(sessions.id, sessionId))
          .pipe(
            Effect.mapError(failed('reading the build Session')),
            Effect.map((found) => {
              const row = found[0]
              return row === undefined || row.mission !== 'build' ? null : row
            }),
          )

      const mustBuild = (sessionId: string) =>
        buildOf(sessionId).pipe(
          Effect.flatMap((row) =>
            row === null
              ? refused(`No build has anything named "${sessionId}".`)
              : Effect.succeed(row),
          ),
        )

      type SessionRow = NonNullable<Effect.Success<ReturnType<typeof buildOf>>>

      /** One Journal line about a round of a build Session. */
      const roundEvent = (
        session: SessionRow,
        type: string,
        human: boolean,
        payload: Record<string, string | number | boolean | null>,
      ): NewEvent => ({
        type,
        entityKind: 'session',
        entityId: session.id,
        source: human ? 'ui' : 'system',
        author: human ? 'human' : 'hemera',
        projectId: session.projectId,
        sessionId: session.id,
        specId: session.specId,
        revisionId: session.revisionId,
        payload,
      })

      /** The round of a build that is not closed yet, or null. */
      const unclosedOf = (sessionId: string) =>
        database
          .select()
          .from(reviewRounds)
          .where(and(eq(reviewRounds.sessionId, sessionId), ne(reviewRounds.state, 'closed')))
          .pipe(
            Effect.mapError(failed('reading the review round')),
            Effect.map((found) => found[0] ?? null),
          )

      /** The rounds of a build, in their order, as the window reads them. */
      const viewsOf = (sessionId: string) =>
        Effect.gen(function* () {
          const read = (doing: string) => Effect.mapError(failed(`reading the ${doing}`))
          const rounds = yield* database
            .select()
            .from(reviewRounds)
            .where(eq(reviewRounds.sessionId, sessionId))
            .orderBy(asc(reviewRounds.number))
            .pipe(read('review rounds'))
          if (rounds.length === 0) return []
          const ids = rounds.map((round) => round.id)
          const repositories = yield* database
            .select()
            .from(reviewRoundRepositories)
            .where(inArray(reviewRoundRepositories.roundId, ids))
            .orderBy(asc(reviewRoundRepositories.repository))
            .pipe(read('checkpoints of the review rounds'))
          const files = yield* database
            .select()
            .from(reviewRoundFiles)
            .where(inArray(reviewRoundFiles.roundId, ids))
            .orderBy(asc(reviewRoundFiles.repository), asc(reviewRoundFiles.path))
            .pipe(read('files of the review rounds'))
          const feedback = yield* database
            .select()
            .from(reviewFeedback)
            .where(inArray(reviewFeedback.roundId, ids))
            // Written in one millisecond, two feedbacks keep the order they were written in.
            .orderBy(asc(reviewFeedback.createdAt), sql`rowid`)
            .pipe(read('feedback of the review rounds'))
          return rounds.map((round): ReviewRoundView => {
            const held = repositories.filter((one) => one.roundId === round.id)
            return {
              id: round.id,
              number: round.number,
              kind: ROUND_KINDS.find((kind) => kind === round.kind) ?? 'spec',
              state: ROUND_STATES.find((state) => state === round.state) ?? 'closed',
              openedAt: round.openedAt,
              fixingAt: round.fixingAt,
              closedAt: round.closedAt,
              stale: held.some((one) => one.staleAt !== null),
              repositories: held.map((one) => ({
                repository: one.repository,
                head: one.head,
                tree: one.tree,
                base: one.base,
                baseCommit: one.baseCommit,
                staleAt: one.staleAt,
                files: files
                  .filter((file) => file.roundId === round.id && file.repository === one.repository)
                  .map((file) => ({
                    path: file.path,
                    status: file.status,
                    added: file.added,
                    removed: file.removed,
                    untracked: file.untracked,
                  })),
              })),
              feedback: feedback
                .filter((one) => one.roundId === round.id)
                .map((one) => ({
                  id: one.id,
                  kind: one.kind === 'product' || one.kind === 'question' ? one.kind : 'general',
                  body: one.body,
                  anchor: anchorOf(one),
                  createdAt: one.createdAt,
                  withdrawnAt: one.withdrawnAt,
                })),
            }
          })
        })

      const viewOf = (sessionId: string, roundId: string) =>
        viewsOf(sessionId).pipe(
          Effect.flatMap((views) => {
            const found = views.find((one) => one.id === roundId)
            return found === undefined
              ? Effect.fail(failed('reading the review round')('it has no row'))
              : Effect.succeed(found)
          }),
        )

      /** The repositories of a build's Workspace: where each is on disk, and its recorded base. */
      const repositoriesOf = (session: SessionRow) =>
        Effect.gen(function* () {
          const workspace = yield* describedWorkspace(
            database,
            session.projectId,
            session.workspaceId,
          )
          const bases = yield* database
            .select({ path: workspaceRepositories.relativePath, base: workspaceRepositories.base })
            .from(workspaceRepositories)
            .where(eq(workspaceRepositories.workspaceId, workspace.id))
            .pipe(Effect.mapError(failed('reading the bases of the worktrees')))
          return workspace.repositories.map((declared) => ({
            repository: repositoryOf(declared),
            path: join(workspace.path, repositoryOf(declared)),
            base: bases.find((one) => one.path === declared)?.base ?? null,
          }))
        })

      /** One repository's checkpoint, taken with Git before the transaction that writes it. */
      const checkpointOf = (place: { repository: string; path: string; base: string | null }) =>
        withGit(
          Effect.gen(function* () {
            const head = yield* git.revParse(place.path, 'HEAD')
            const tree = yield* snapshotTree(place.path)
            const baseCommit =
              place.base === null ? head : yield* git.mergeBase(place.path, place.base, head)
            const changed = yield* changedFiles(place.path, baseCommit, tree)
            const untracked = new Set(yield* git.untracked(place.path))
            return {
              repository: place.repository,
              head,
              tree,
              base: place.base,
              baseCommit,
              files: changed.map((file) => ({
                path: file.path,
                status: file.status,
                added: file.added,
                removed: file.removed,
                untracked: untracked.has(file.path),
              })),
            }
          }),
        ).pipe(
          Effect.mapError(
            (cause) =>
              new ReviewRefusedError({
                reason: `the checkpoint of ${place.repository === '' ? 'the Workspace root' : place.repository} could not be taken: ${cause.message}`,
              }),
          ),
        )

      /**
       * Compares each repository of the build's open round with its tree, and marks the ones that
       * differ. Answers whether one was marked now. A repository Git cannot read is left as it is and
       * said in the diagnostic: a read that failed is not a change.
       */
      const recheck = (sessionId: string) =>
        Effect.gen(function* () {
          const round = yield* unclosedOf(sessionId)
          if (round === null || round.state !== 'open') return false
          const session = yield* buildOf(sessionId)
          if (session === null) return false
          const repositories = yield* database
            .select()
            .from(reviewRoundRepositories)
            .where(
              and(
                eq(reviewRoundRepositories.roundId, round.id),
                isNull(reviewRoundRepositories.staleAt),
              ),
            )
            .pipe(Effect.mapError(failed('reading the checkpoints of the review round')))
          if (repositories.length === 0) return false
          const workspace = yield* describedWorkspace(
            database,
            session.projectId,
            session.workspaceId,
          )
          let marked = false
          for (const one of repositories) {
            const tree = yield* Effect.result(
              withGit(snapshotTree(join(workspace.path, one.repository))),
            )
            if (Result.isFailure(tree)) {
              yield* diagnostic.write(
                `review: round ${round.number} of ${sessionId} could not read ${one.repository || 'the Workspace root'}: ${tree.failure.message}`,
              )
              continue
            }
            if (tree.success === one.tree) continue
            const wrote = yield* written('marking the review round stale', (transaction) =>
              Effect.gen(function* () {
                const updated = yield* transaction
                  .update(reviewRoundRepositories)
                  .set({ staleAt: now(), staleTree: tree.success })
                  .where(
                    and(
                      eq(reviewRoundRepositories.roundId, round.id),
                      eq(reviewRoundRepositories.repository, one.repository),
                      isNull(reviewRoundRepositories.staleAt),
                    ),
                  )
                  .returning()
                return {
                  result: updated.length > 0,
                  events:
                    updated.length > 0
                      ? [
                          roundEvent(session, 'review.round_stale', false, {
                            number: round.number,
                            repository: one.repository,
                          }),
                        ]
                      : [],
                }
              }),
            )
            marked = marked || wrote
          }
          return marked
        })

      /** A recheck that says what it could not do rather than failing whoever asked. */
      const rechecked = (sessionId: string) =>
        recheck(sessionId).pipe(
          Effect.catch((cause) =>
            diagnostic
              .write(`review: checking the round of ${sessionId}: ${cause.message}`)
              .pipe(Effect.as(false)),
          ),
          Effect.tap((marked) =>
            marked ? Effect.sync(() => notices.changed(sessionId)) : Effect.void,
          ),
        )

      /** Every open round compared with its repositories, once. */
      const watch = Effect.gen(function* () {
        const open = yield* database
          .select({ sessionId: reviewRounds.sessionId })
          .from(reviewRounds)
          .where(eq(reviewRounds.state, 'open'))
          .pipe(Effect.mapError(failed('reading the open review rounds')))
        for (const one of open) yield* rechecked(one.sessionId)
      }).pipe(
        Effect.catch((cause) => diagnostic.write(`review: watching the rounds: ${cause.message}`)),
      )

      yield* Effect.forkIn(scope)(
        Effect.gen(function* () {
          for (;;) {
            yield* Effect.sleep(everyMs)
            yield* watch
          }
        }),
      )

      const told = (sessionId: string) => Effect.sync(() => notices.changed(sessionId))

      const open = (sessionId: string) =>
        Effect.gen(function* () {
          const session = yield* mustBuild(sessionId)
          if ((yield* unclosedOf(sessionId)) !== null) {
            return yield* refused('A review round of this build is already open.')
          }
          const places = yield* repositoriesOf(session)
          const checkpoints: Effect.Success<ReturnType<typeof checkpointOf>>[] = []
          for (const place of places) checkpoints.push(yield* checkpointOf(place))
          const roundId = crypto.randomUUID()
          yield* written('opening a review round', (transaction) =>
            insertRound(transaction, sessionId, roundId, checkpoints, now()).pipe(
              Effect.map((number) => ({
                result: number,
                events: [
                  roundEvent(session, 'review.round_opened', false, { number, kind: 'spec' }),
                ],
              })),
            ),
          )
          yield* told(sessionId)
          return yield* viewOf(sessionId, roundId)
        })

      const move = (sessionId: string, to: 'fixing' | 'closed') =>
        Effect.gen(function* () {
          const session = yield* mustBuild(sessionId)
          const round = yield* unclosedOf(sessionId)
          if (round === null) return yield* refused('This build has no review round to move.')
          const from = ROUND_STATES.find((state) => state === round.state) ?? 'closed'
          const refusal = roundMoveRefusal(from, to)
          if (refusal !== null) return yield* refused(refusal)
          yield* written('moving the review round', (transaction) =>
            Effect.gen(function* () {
              const at = now()
              yield* transaction
                .update(reviewRounds)
                .set(to === 'fixing' ? { state: to, fixingAt: at } : { state: to, closedAt: at })
                .where(eq(reviewRounds.id, round.id))
              return {
                result: undefined,
                events: [
                  roundEvent(session, 'review.round_moved', false, {
                    number: round.number,
                    state: to,
                  }),
                ],
              }
            }),
          )
          yield* told(sessionId)
          return yield* viewOf(sessionId, round.id)
        })

      /** The stories and criteria of the revision a build was started on. */
      const revisionOf = (session: SessionRow) =>
        Effect.gen(function* () {
          const stories = yield* database
            .select()
            .from(userStories)
            .where(eq(userStories.revisionId, session.revisionId ?? ''))
            .pipe(Effect.mapError(failed('reading the stories of the revision')))
          const criteria =
            stories.length === 0
              ? []
              : yield* database
                  .select()
                  .from(acceptanceCriteria)
                  .where(
                    inArray(
                      acceptanceCriteria.storyId,
                      stories.map((story) => story.id),
                    ),
                  )
                  .pipe(Effect.mapError(failed('reading the criteria of the revision')))
          return { stories, criteria }
        })

      const addFeedback = (
        sessionId: string,
        kind: FeedbackKind,
        body: string,
        anchor: FeedbackAnchor | null,
      ) =>
        Effect.gen(function* () {
          const session = yield* mustBuild(sessionId)
          const round = yield* unclosedOf(sessionId)
          const state = ROUND_STATES.find((one) => one === round?.state) ?? null
          const refusal = feedbackRefusal(state, body)
          if (refusal !== null || round === null) {
            return yield* refused(refusal ?? 'this build has no review round')
          }
          const roundKind = ROUND_KINDS.find((one) => one === round.kind) ?? 'spec'
          const misplaced = anchorRefusal(roundKind, anchor, yield* revisionOf(session))
          if (misplaced !== null) return yield* refused(misplaced)
          yield* written('adding a feedback', (transaction) =>
            Effect.gen(function* () {
              const id = crypto.randomUUID()
              yield* transaction.insert(reviewFeedback).values({
                id,
                roundId: round.id,
                kind,
                body,
                ...anchorColumns(anchor),
                createdAt: now(),
              })
              return {
                result: id,
                events: [
                  roundEvent(session, 'review.feedback_added', true, {
                    number: round.number,
                    feedback: id,
                    kind,
                  }),
                ],
              }
            }),
          )
          yield* told(sessionId)
          return yield* viewOf(sessionId, round.id)
        })

      const withdrawFeedback = (sessionId: string, feedbackId: string) =>
        Effect.gen(function* () {
          const session = yield* mustBuild(sessionId)
          const found = yield* database
            .select({ feedback: reviewFeedback, round: reviewRounds })
            .from(reviewFeedback)
            .innerJoin(reviewRounds, eq(reviewRounds.id, reviewFeedback.roundId))
            .where(and(eq(reviewFeedback.id, feedbackId), eq(reviewRounds.sessionId, sessionId)))
            .pipe(Effect.mapError(failed('reading the feedback')))
          const held: { feedback: FeedbackRow; round: RoundRow } | undefined = found[0]
          if (held === undefined) return yield* refused(`No feedback is named "${feedbackId}".`)
          const state = ROUND_STATES.find((one) => one === held.round.state) ?? null
          const refusal = feedbackRefusal(state, held.feedback.body)
          if (refusal !== null) return yield* refused(refusal)
          if (held.feedback.withdrawnAt !== null) {
            return yield* refused('This feedback was already withdrawn.')
          }
          yield* written('withdrawing a feedback', (transaction) =>
            Effect.gen(function* () {
              yield* transaction
                .update(reviewFeedback)
                .set({ withdrawnAt: now() })
                .where(eq(reviewFeedback.id, feedbackId))
              return {
                result: undefined,
                events: [
                  roundEvent(session, 'review.feedback_withdrawn', true, {
                    number: held.round.number,
                    feedback: feedbackId,
                  }),
                ],
              }
            }),
          )
          yield* told(sessionId)
          return yield* viewOf(sessionId, held.round.id)
        })

      return {
        open,
        move,
        refusal: (sessionId, tool) =>
          unclosedOf(sessionId).pipe(
            Effect.map((round) =>
              roundToolRefusal(ROUND_STATES.find((one) => one === round?.state) ?? null, tool),
            ),
          ),
        read: (sessionId) =>
          Effect.gen(function* () {
            yield* rechecked(sessionId)
            return yield* viewsOf(sessionId)
          }),
        addFeedback,
        withdrawFeedback,
      }
    }),
  )
