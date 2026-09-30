/**
 * A Workspace as the engine works in it: its row and the repositories it holds (D8-08,
 * Decided 16).
 *
 * One reading, shared: the Sessions read it to start an agent and root its tools, the Workspaces
 * service to ask Git about each repository. Two copies of it were two answers to "which
 * repositories does this Workspace hold" waiting to disagree.
 */

import { MAIN_WORKSPACE } from '@hemera/core'
import { and, asc, eq } from 'drizzle-orm'
import { Effect } from 'effect'

import { DatabaseError, type EngineDatabase, type EngineTransaction } from '../storage/database.ts'
import { projectRepositories, specs, workspaceRepositories, workspaces } from '../storage/schema.ts'

/** A Workspace was asked for by an identifier nothing answers to. */
export class UnknownWorkspaceError extends Error {
  constructor(readonly id: string) {
    super(`no Workspace has the identifier "${id}"`)
    this.name = 'UnknownWorkspaceError'
  }
}

/**
 * A Workspace made for another Spec, asked for a Spec it was not made for: one Spec, one
 * Workspace (D8-12). The engine refuses it itself, whatever the window offers.
 */
export class WorkspaceTakenError extends Error {
  constructor(
    readonly workspace: string,
    readonly key: string,
  ) {
    super(
      `the Workspace ${workspace} was made for ${key}: a Spec is built in a Workspace of its own`,
    )
    this.name = 'WorkspaceTakenError'
  }
}

/** Where a Workspace is, and the repositories it holds relative to its root. */
export interface DescribedWorkspace {
  /**
   * The Workspace's own row: `main`'s when none is named, so the variables set on `main` are the
   * ones its runs are given (D8-06).
   */
  readonly id: string
  readonly name: string
  readonly path: string
  readonly repositories: readonly string[]
}

const failed = (doing: string) => (cause: unknown) => new DatabaseError({ doing, cause })

/**
 * The Spec a Workspace was made for, when it is not `specId` (D8-12): its key, which is what the
 * refusal names, or null when the Workspace is free for it — made by hand, `main`, or its own.
 */
export const takenBy = (
  transaction: EngineDatabase | EngineTransaction,
  workspaceId: string,
  specId: string,
): Effect.Effect<string | null, DatabaseError> =>
  transaction
    .select({ owner: workspaces.specId, key: specs.key })
    .from(workspaces)
    .innerJoin(specs, eq(specs.id, workspaces.specId))
    .where(eq(workspaces.id, workspaceId))
    .pipe(
      Effect.mapError(failed('reading the Spec the Workspace was made for')),
      Effect.map((rows) => {
        const made = rows[0]
        return made === undefined || made.owner === specId ? null : made.key
      }),
    )

/**
 * A Workspace of a Project (D8-08): its row — `main` for null, which is also what a row written
 * before Workspaces were real reads as — and its repositories. A dedicated Workspace holds the
 * worktrees it was made with; `main` and a folder the user picked hold the repositories the
 * Project declares.
 */
export const describedWorkspace = (
  database: EngineDatabase,
  projectId: string,
  workspaceId: string | null,
) =>
  Effect.gen(function* () {
    const found = yield* database
      .select()
      .from(workspaces)
      .where(
        workspaceId === null
          ? and(eq(workspaces.projectId, projectId), eq(workspaces.name, MAIN_WORKSPACE))
          : eq(workspaces.id, workspaceId),
      )
      .limit(1)
      .pipe(Effect.mapError(failed('reading the Workspace')))
    const workspace = found[0]
    if (workspace === undefined) {
      return yield* Effect.fail(
        new DatabaseError({ doing: 'reading the Workspace', cause: 'it has no row' }),
      )
    }
    const worktrees = yield* database
      .select({ path: workspaceRepositories.relativePath })
      .from(workspaceRepositories)
      .where(eq(workspaceRepositories.workspaceId, workspace.id))
      .orderBy(asc(workspaceRepositories.relativePath))
      .pipe(Effect.mapError(failed('reading the worktrees')))
    const held =
      worktrees.length > 0
        ? worktrees
        : yield* database
            .select({ path: projectRepositories.relativePath })
            .from(projectRepositories)
            .where(eq(projectRepositories.projectId, projectId))
            .orderBy(asc(projectRepositories.rank))
            .pipe(Effect.mapError(failed('reading the repositories')))
    return {
      id: workspace.id,
      name: workspace.name,
      path: workspace.path,
      repositories: held.map((one) => one.path),
    } satisfies DescribedWorkspace
  })
