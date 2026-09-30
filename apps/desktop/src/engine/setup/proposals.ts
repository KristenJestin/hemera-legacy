/**
 * What a human decides of a change to the Project's setup the agent proposed (issue #218).
 *
 * The agent proposes through `setup_propose`, which writes one `setup_proposal` entry per change
 * and nothing else; this is the other half, and the only one that changes the setup. Accepting
 * applies the change through the very use case the Project settings call — a repository added,
 * a command saved, a step added to the recipe, a variable set, a Workspace created and prepared,
 * resumed or cleaned up — so the engine refuses what the settings refuse, with the same reason,
 * and the proposal stays `pending` for the human to decline. Declining changes nothing.
 *
 * The changes of one call are one batch, and `acceptAll` accepts every one still waiting, in
 * the order they were proposed, stopping at the first refusal (Decided 1 of #218). Each accepted
 * change is journaled as the human's acceptance of the agent's proposal, beside the event of the
 * use case itself. A variable's value is read from `SetupValues`, never from the entry, and never
 * written anywhere but the variable (Decided 2 of #218).
 */

import { setupChangeTitle } from '@hemera/core'
import { type SetupChange, type SetupProposal, setupProposalSchema } from '@hemera/ipc'
import { and, asc, eq } from 'drizzle-orm'
import { Context, Data, Effect, Layer } from 'effect'

import { AgentNotices } from '../agents/notices.ts'
import { createCommand, updateCommand } from '../commands/panel.ts'
import { ProposalDecidedError, UnknownProposalError } from '../commands/proposals.ts'
import { Commands } from '../commands/service.ts'
import { Projects } from '../projects.ts'
import { Sessions } from '../sessions.ts'
import { Database, DatabaseError } from '../storage/database.ts'
import { sessionEntries, workspaceSteps } from '../storage/schema.ts'
import { Preparation } from '../workspaces/preparation.ts'
import { Recipe } from '../workspaces/recipe.ts'
import { Variables } from '../workspaces/variables.ts'
import { Workspaces, stepOf } from '../workspaces/workspaces.ts'
import { SetupDesk } from './desk.ts'
import { SetupValues } from './values.ts'

/** A change the settings' use case refused when the human accepted it, in its own words. */
export class SetupRefusedError extends Data.TaggedError('SetupRefusedError')<{
  readonly reason: string
}> {
  override get message(): string {
    return this.reason
  }
}

/** What deciding a proposal can be refused with. */
type Refusal = DatabaseError | UnknownProposalError | ProposalDecidedError | SetupRefusedError

/** What an acceptance answers: the Project it changed, and how many changes it applied. */
export interface Accepted {
  readonly projectId: string
  readonly accepted: number
}

export interface SetupProposalsService {
  /** Applies one proposed change through the settings' use case, and marks it `accepted`. */
  readonly accept: (sessionId: string, proposalId: string) => Effect.Effect<Accepted, Refusal>
  /** Accepts every change of a batch still waiting, in order, up to the first refused. */
  readonly acceptAll: (sessionId: string, batchId: string) => Effect.Effect<Accepted, Refusal>
  /** Marks the proposal `declined`: nothing of the setup changes. */
  readonly decline: (sessionId: string, proposalId: string) => Effect.Effect<void, Refusal>
}

export class SetupProposals extends Context.Service<SetupProposals, SetupProposalsService>()(
  'SetupProposals',
) {}

/**
 * What the setup tools read the Workspaces through (#218), over the very Workspaces, recipe and
 * values the engine holds.
 */
export const setupDeskLayer: Layer.Layer<
  SetupDesk,
  never,
  Workspaces | Recipe | SetupValues | Database
> = Layer.effect(
  SetupDesk,
  Effect.gen(function* () {
    const database = yield* Database
    return {
      workspaces: yield* Workspaces,
      recipe: yield* Recipe,
      values: yield* SetupValues,
      steps: (workspaceId) =>
        database
          .select()
          .from(workspaceSteps)
          .where(eq(workspaceSteps.workspaceId, workspaceId))
          .orderBy(asc(workspaceSteps.position))
          .pipe(
            Effect.map((rows) => rows.map(stepOf)),
            Effect.orElseSucceed(() => []),
          ),
    }
  }),
)

export const setupProposalsLayer: Layer.Layer<
  SetupProposals,
  never,
  | Database
  | Sessions
  | Projects
  | Commands
  | Workspaces
  | Preparation
  | Recipe
  | Variables
  | SetupValues
  | AgentNotices
> = Layer.effect(
  SetupProposals,
  Effect.gen(function* () {
    const database = yield* Database
    const sessions = yield* Sessions
    const projects = yield* Projects
    const commands = yield* Commands
    const workspaces = yield* Workspaces
    const preparation = yield* Preparation
    const recipe = yield* Recipe
    const variables = yield* Variables
    const values = yield* SetupValues
    const notices = yield* AgentNotices

    /** The proposals being decided now: a second press on one waits for nothing and is refused. */
    const deciding = new Set<string>()

    /** A refusal of a use case, as the sentence the settings would have shown. */
    const refused = <A, E extends Error, R>(effect: Effect.Effect<A, E, R>) =>
      effect.pipe(
        Effect.mapError((cause) =>
          cause instanceof DatabaseError ? cause : new SetupRefusedError({ reason: cause.message }),
        ),
      )

    /** Every setup proposal of a Session, in the order they were written. */
    const proposalsOf = (sessionId: string) =>
      database
        .select({ payload: sessionEntries.payload })
        .from(sessionEntries)
        .where(
          and(eq(sessionEntries.sessionId, sessionId), eq(sessionEntries.kind, 'setup_proposal')),
        )
        .orderBy(asc(sessionEntries.seq))
        .pipe(
          Effect.mapError((cause) => new DatabaseError({ doing: 'reading the proposals', cause })),
          Effect.map((rows) =>
            rows.flatMap((row) => {
              const read = setupProposalSchema.safeParse(JSON.parse(row.payload))
              return read.success ? [read.data] : []
            }),
          ),
        )

    /** The proposal a Session holds under that identifier, still `pending`. */
    const pending = (sessionId: string, proposalId: string) =>
      Effect.gen(function* () {
        const rows = yield* database
          .select({ payload: sessionEntries.payload })
          .from(sessionEntries)
          .where(
            and(
              eq(sessionEntries.sessionId, sessionId),
              eq(sessionEntries.correlationId, `setup:${proposalId}`),
            ),
          )
          .limit(1)
          .pipe(
            Effect.mapError((cause) => new DatabaseError({ doing: 'reading the proposal', cause })),
          )
        const read = setupProposalSchema.safeParse(JSON.parse(rows[0]?.payload ?? 'null'))
        if (!read.success) return yield* Effect.fail(new UnknownProposalError(proposalId))
        if (read.data.state !== 'pending') {
          return yield* Effect.fail(new ProposalDecidedError(proposalId, read.data.state))
        }
        return read.data
      })

    /** The Project a Session belongs to, which is the setup its proposals change. */
    const projectOf = (sessionId: string) =>
      sessions.one(sessionId).pipe(
        Effect.mapError((cause) =>
          cause instanceof DatabaseError
            ? cause
            : new DatabaseError({ doing: 'reading the Session of a proposal', cause }),
        ),
        Effect.map(({ session }) => session.projectId),
      )

    /** A Workspace of the Project by the name the proposal gave it, not cleaned up. */
    const workspaceNamed = (projectId: string, name: string) =>
      Effect.gen(function* () {
        const listed = yield* workspaces.list(projectId)
        const found = listed.find((one) => one.name === name && one.state !== 'cleaned')
        if (found === undefined) {
          return yield* Effect.fail(
            new SetupRefusedError({
              reason: `the Project has no Workspace named ${name} any more`,
            }),
          )
        }
        return found
      })

    /** The change applied through the use case the settings call for it. */
    const apply = (projectId: string, proposalId: string, change: SetupChange) =>
      Effect.gen(function* () {
        switch (change.kind) {
          case 'repository': {
            const all = yield* projects.list(true)
            const project = all.find((one) => one.id === projectId)
            if (project === undefined) {
              return yield* Effect.fail(new SetupRefusedError({ reason: 'the Project is gone' }))
            }
            yield* refused(projects.addRepository(project.id, project.version, change.path))
            return
          }

          case 'command': {
            const draft = {
              projectId,
              name: change.name,
              line: change.line,
              lineWindows: change.lineWindows,
              lineLinux: change.lineLinux,
              type: change.type,
              folderBase: change.repository,
              folder: change.folder,
              scope: change.scope,
              portless: change.portless,
              portlessName: change.portlessName,
              runAtOpen: change.runAtOpen,
            }
            // A name taken since the proposal is refused by `create`, a name gone since by
            // `update`: the proposal said which one it was, and the card said it too.
            yield* refused(change.replaces ? updateCommand(draft) : createCommand(draft)).pipe(
              Effect.provideService(Projects, projects),
              Effect.provideService(Commands, commands),
            )
            return
          }

          case 'step': {
            // A run of a command names it; the recipe holds its identifier, read now.
            const catalogue = yield* commands.list(projectId)
            const commandId =
              change.command === null
                ? null
                : (catalogue.find((one) => one.name === change.command)?.id ?? null)
            if (change.command !== null && commandId === null) {
              return yield* Effect.fail(
                new SetupRefusedError({
                  reason: `the Project has no command named "${change.command}" any more`,
                }),
              )
            }
            yield* refused(
              recipe.add(projectId, {
                kind: change.step,
                base: change.repository,
                path: change.path,
                commandId,
                line: change.line,
                lineWindows: change.lineWindows,
                lineLinux: change.lineLinux,
              }),
            )
            return
          }

          case 'variable': {
            const value = yield* values.peek(proposalId)
            if (value === undefined) {
              return yield* Effect.fail(
                new SetupRefusedError({
                  reason:
                    'the value of this variable was not kept since Hemera restarted: decline it, and ask the agent to propose it again',
                }),
              )
            }
            const scope =
              change.workspace === null
                ? null
                : (yield* workspaceNamed(projectId, change.workspace)).id
            yield* refused(variables.set(projectId, scope, change.name, value))
            return
          }

          case 'workspace_create': {
            // As the settings create a dedicated Workspace with no Spec (D8-04): the plan the
            // dialog opens on, each repository as it proposes it, then the preparation (D8-05).
            const plan = yield* refused(workspaces.plan(projectId, null, change.name))
            const worktrees = []
            for (const path of plan.repositories) {
              const one = yield* workspaces.planRepository(projectId, null, change.name, path)
              if (one.included && one.holdsRepository && one.base !== null) {
                worktrees.push({
                  relativePath: one.relativePath,
                  branch: one.branch,
                  base: one.base,
                })
              }
            }
            const made = yield* refused(
              workspaces.create(projectId, {
                specId: null,
                name: change.name,
                root: null,
                repositories: worktrees,
              }),
            )
            // Created is created: a preparation that does not start is resumed from the settings.
            yield* preparation.begin(made.id, false).pipe(Effect.ignore)
            return
          }

          case 'workspace_prepare':
          case 'workspace_resume': {
            const place = yield* workspaceNamed(projectId, change.workspace)
            yield* refused(preparation.begin(place.id, change.kind === 'workspace_resume'))
            return
          }

          case 'workspace_cleanup': {
            const place = yield* workspaceNamed(projectId, change.workspace)
            yield* refused(workspaces.cleanup(place.id))
            return
          }
        }
      })

    /**
     * The proposal's entry in its outcome, with the Journal line that says it, in one write, and
     * the window told as it is of any entry.
     */
    const decided = (
      sessionId: string,
      projectId: string,
      proposal: SetupProposal,
      outcome: 'accepted' | 'declined',
    ) =>
      Effect.gen(function* () {
        const title = setupChangeTitle(proposal.change)
        const written = yield* sessions
          .write(sessionId, {
            role: 'hemera',
            kind: 'setup_proposal',
            body: title,
            payload: JSON.stringify({ ...proposal, state: outcome }),
            correlationId: `setup:${proposal.proposalId}`,
            state: outcome,
            events: [
              {
                type: `setup.${outcome}`,
                entityKind: 'project',
                entityId: projectId,
                source: 'ui',
                author: 'human',
                projectId,
                sessionId,
                payload: {
                  proposal: proposal.proposalId,
                  batch: proposal.batchId,
                  change: proposal.change.kind,
                  title,
                },
              },
            ],
          })
          .pipe(
            Effect.mapError((cause) =>
              cause instanceof DatabaseError
                ? cause
                : new DatabaseError({ doing: 'writing the proposal', cause }),
            ),
          )
        notices.wrote(sessionId, written.entry)
        yield* values.drop(proposal.proposalId)
      })

    /** One decision at a time per proposal: a double press is refused, not applied twice. */
    const once = <A, E>(
      proposalId: string,
      decide: Effect.Effect<A, E>,
    ): Effect.Effect<A, E | ProposalDecidedError> =>
      Effect.suspend((): Effect.Effect<A, E | ProposalDecidedError> => {
        if (deciding.has(proposalId)) {
          return Effect.fail(new ProposalDecidedError(proposalId, 'being decided'))
        }
        deciding.add(proposalId)
        return decide.pipe(Effect.ensuring(Effect.sync(() => deciding.delete(proposalId))))
      })

    const accept = (sessionId: string, proposalId: string) =>
      once(
        proposalId,
        Effect.gen(function* () {
          const proposal = yield* pending(sessionId, proposalId)
          const projectId = yield* projectOf(sessionId)
          yield* apply(projectId, proposalId, proposal.change).pipe(
            Effect.mapError((cause) =>
              cause instanceof DatabaseError || cause instanceof SetupRefusedError
                ? cause
                : new SetupRefusedError({ reason: cause.message }),
            ),
          )
          yield* decided(sessionId, projectId, proposal, 'accepted')
          return { projectId, accepted: 1 } satisfies Accepted
        }),
      )

    return {
      accept,

      acceptAll: (sessionId, batchId) =>
        Effect.gen(function* () {
          const projectId = yield* projectOf(sessionId)
          const waiting = (yield* proposalsOf(sessionId)).filter(
            (one) => one.batchId === batchId && one.state === 'pending',
          )
          if (waiting.length === 0) return yield* Effect.fail(new UnknownProposalError(batchId))
          // In the order proposed, because a later change may lean on an earlier one; the first
          // refusal stops the batch, and what was accepted before it stays accepted.
          for (const one of waiting) yield* accept(sessionId, one.proposalId)
          return { projectId, accepted: waiting.length } satisfies Accepted
        }),

      decline: (sessionId, proposalId) =>
        once(
          proposalId,
          Effect.gen(function* () {
            const proposal = yield* pending(sessionId, proposalId)
            yield* decided(sessionId, yield* projectOf(sessionId), proposal, 'declined')
          }),
        ),
    }
  }),
)
