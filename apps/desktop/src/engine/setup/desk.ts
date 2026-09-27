/**
 * What the setup tools read the Workspaces through, as one service (issue #218).
 *
 * The tools are built beneath the Workspaces: a preparation runs its steps through the very
 * commands the tools run, and the Workspaces start the builds of the agents the tools serve. The
 * catalogue cannot name the Workspaces' module without naming itself through it, so what it
 * needs of them is handed to it here — the Workspaces, the recipe, the steps of a Workspace and
 * the values a proposal holds — and built where the engine composes both.
 */

import type { WorkspaceStep } from '@hemera/core'
import { Context, type Effect } from 'effect'

import type { RecipeService } from '../workspaces/recipe.ts'
import type { WorkspacesService } from '../workspaces/workspaces.ts'
import type { SetupValuesService } from './values.ts'

export interface SetupDeskService {
  readonly workspaces: WorkspacesService
  readonly recipe: RecipeService
  readonly values: SetupValuesService
  /** The steps of one Workspace, in their order; none when they did not read. */
  readonly steps: (workspaceId: string) => Effect.Effect<WorkspaceStep[]>
}

export class SetupDesk extends Context.Service<SetupDesk, SetupDeskService>()('SetupDesk') {}
