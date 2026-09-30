/**
 * What a human decides of the changes to a Project's setup the agent proposed (#218).
 *
 * The engine applies an accepted change through the use case the settings call and writes the
 * card in its outcome, which reaches the thread as any entry does. What the window holds of the
 * setup — the Project and its repositories, the catalogue, the recipe, the Workspaces and the
 * Project's variables — is read again for the Session's Project, refused or not: a batch stopped
 * by its third change applied the first two. Each answers the engine's sentence when it refuses,
 * or null.
 */

import { loadProjects } from './projects-store.ts'
import { readCatalogue } from './tools-store.ts'
import { readProjectVariables, readRecipe, readWorkspaces } from './workspaces-store.ts'

/** The Session a decision is made in, and the Project whose setup it changes. */
export interface Deciding {
  readonly id: string
  readonly projectId: string
}

/** What a refusal says, without the shape of whatever carried it. */
function message(cause: unknown): string {
  return cause instanceof Error ? cause.message : String(cause)
}

/** Reads again everything of the Project's setup the window holds. */
async function readSetup(projectId: string): Promise<void> {
  await Promise.all([
    loadProjects(),
    readCatalogue(projectId),
    readRecipe(projectId),
    readWorkspaces(projectId),
    readProjectVariables(projectId),
  ])
}

/** One decision, answered as the engine's refusal or null, and the setup read again after it. */
async function deciding(
  session: Deciding,
  decide: () => Promise<object | void>,
): Promise<string | null> {
  try {
    await decide()
    return null
  } catch (cause) {
    return message(cause)
  } finally {
    await readSetup(session.projectId)
  }
}

/** Applies one proposed change. */
export async function acceptSetup(session: Deciding, proposalId: string): Promise<string | null> {
  return await deciding(
    session,
    async () => await window.hemera.invoke('setup.accept', { sessionId: session.id, proposalId }),
  )
}

/**
 * Applies every change of a batch still waiting, in the order proposed (Decided 1 of #218). The
 * first refusal stops it: what was accepted before stays accepted, and the refusal is answered.
 */
export async function acceptSetupBatch(session: Deciding, batchId: string): Promise<string | null> {
  return await deciding(
    session,
    async () => await window.hemera.invoke('setup.acceptAll', { sessionId: session.id, batchId }),
  )
}

/** Declines one: nothing of the setup changes. */
export async function declineSetup(session: Deciding, proposalId: string): Promise<string | null> {
  try {
    await window.hemera.invoke('setup.decline', { sessionId: session.id, proposalId })
    return null
  } catch (cause) {
    return message(cause)
  }
}
