/**
 * What an agent may change of a Project's setup, and how a change is said (issue #218).
 *
 * An agent reads the setup freely and changes nothing of it: every change it wants is a proposal
 * the human accepts, one card per change, applied through the very use cases the Project settings
 * call. Several changes proposed in one call are one batch, which the human may accept in one
 * press (Decided 1 of #218).
 *
 * A change is said the same way on its card, in the Journal and in the answer the agent reads: a
 * title, and the details under it. A variable's value is never part of either — the agent may
 * write one it was given (Decided 2 of #218), and what is shown is only that it was set.
 */

import type { CommandScope, CommandType } from './commands.ts'
import type { RecipeKind } from './workspace.ts'

/** Every kind of change a proposal can carry. */
export const SETUP_CHANGE_KINDS = [
  'repository',
  'command',
  'step',
  'variable',
  'workspace_create',
  'workspace_prepare',
  'workspace_resume',
  'workspace_cleanup',
] as const

export type SetupChangeKind = (typeof SETUP_CHANGE_KINDS)[number]

/** A repository the Project would declare, relative to its root. */
export interface RepositoryChange {
  readonly kind: 'repository'
  readonly path: string
}

/** A command of the catalogue, added, or rewritten when the catalogue already holds its name. */
export interface CommandChange {
  readonly kind: 'command'
  readonly name: string
  readonly line: string
  readonly lineWindows: string | null
  readonly lineLinux: string | null
  readonly type: CommandType
  /** The repository it runs under, as the Project declares it; null for the Workspace root. */
  readonly repository: string | null
  /** A folder under that repository, and null for the repository itself. */
  readonly folder: string | null
  readonly scope: CommandScope
  readonly portless: boolean
  readonly portlessName: string | null
  readonly runAtOpen: boolean
  /** Whether the catalogue held this name when it was proposed: a rewrite, not an addition. */
  readonly replaces: boolean
}

/** A step added at the end of the Project's preparation recipe. */
export interface StepChange {
  readonly kind: 'step'
  readonly step: RecipeKind
  /** The repository a copy, a link or a line applies under; null for the Workspace root. */
  readonly repository: string | null
  /** The file or folder a copy or a link names, or the folder a line runs in. */
  readonly path: string | null
  /** The catalogue command a run starts, by name; null for a copy, a link and a line. */
  readonly command: string | null
  readonly line: string | null
  readonly lineWindows: string | null
  readonly lineLinux: string | null
}

/** A variable set on the Project, or on one of its Workspaces. Its value is never held here. */
export interface VariableChange {
  readonly kind: 'variable'
  readonly name: string
  /** The Workspace it is set on, by name; null for the Project's own scope. */
  readonly workspace: string | null
  /** Whether that scope held the name when it was proposed: a new value, not a new variable. */
  readonly replaces: boolean
}

/** A dedicated Workspace created with no Spec, then prepared, as the settings create one. */
export interface WorkspaceCreateChange {
  readonly kind: 'workspace_create'
  readonly name: string
}

/** A Workspace of the Project prepared, resumed after a failure, or cleaned up. */
export interface WorkspaceActChange {
  readonly kind: 'workspace_prepare' | 'workspace_resume' | 'workspace_cleanup'
  readonly workspace: string
}

export type SetupChange =
  | RepositoryChange
  | CommandChange
  | StepChange
  | VariableChange
  | WorkspaceCreateChange
  | WorkspaceActChange

/** One line under a change's title: what it is, and what it would be. */
export interface SetupDetail {
  readonly label: string
  readonly value: string
}

/** Where a change applies under the Workspace root, as a reader reads it. */
function placeOf(repository: string | null, folder: string | null): string {
  const parts = [repository, folder].filter((part): part is string => part !== null && part !== '')
  return parts.length === 0 ? 'Workspace root' : parts.join('/').replaceAll('/./', '/')
}

/** The one line a change is said in: on its card, in the Journal, and to the agent. */
export function setupChangeTitle(change: SetupChange): string {
  switch (change.kind) {
    case 'repository':
      return `Declare the repository ${change.path}`
    case 'command':
      return change.replaces
        ? `Change the command ${change.name}`
        : `Add the command ${change.name}`
    case 'step':
      if (change.step === 'run') {
        return change.command === null
          ? 'Add a preparation step that runs a line'
          : `Add a preparation step that runs ${change.command}`
      }
      return `Add a preparation step that ${change.step === 'copy' ? 'copies' : 'links'} ${change.path ?? ''}`
    case 'variable':
      return `Set the variable ${change.name}${change.workspace === null ? '' : ` on ${change.workspace}`}`
    case 'workspace_create':
      return `Create and prepare the Workspace ${change.name}`
    case 'workspace_prepare':
      return `Prepare the Workspace ${change.workspace}`
    case 'workspace_resume':
      return `Resume the preparation of ${change.workspace}`
    case 'workspace_cleanup':
      return `Clean up the Workspace ${change.workspace}`
  }
}

/**
 * What accepting a change does, in the words the Session's notices unfold it with: a verb and what
 * it acts on — `Add service`, `Change variable`, `Clean up Workspace`.
 */
export function setupChangeVerb(change: SetupChange): string {
  switch (change.kind) {
    case 'repository':
      return 'Add repository'
    case 'command': {
      const what = change.type === 'serve' ? 'service' : 'command'
      return `${change.replaces ? 'Change' : 'Add'} ${what}`
    }
    case 'step':
      return 'Add step'
    case 'variable':
      return change.replaces ? 'Change variable' : 'Add variable'
    case 'workspace_create':
      return 'Create Workspace'
    case 'workspace_prepare':
      return 'Prepare Workspace'
    case 'workspace_resume':
      return 'Resume preparation'
    case 'workspace_cleanup':
      return 'Clean up Workspace'
  }
}

/** What a change is about, and whether that is a path. */
export interface SetupSubject {
  readonly text: string
  readonly path: boolean
}

/**
 * What a change is about, in one short line: a command's or a variable's name, a repository's or
 * a step's path, a Workspace's name; and whether it is a path, set in the terminal's letters.
 */
export function setupChangeSubject(change: SetupChange): SetupSubject {
  switch (change.kind) {
    case 'repository':
      return { text: change.path, path: true }
    case 'command':
      return { text: change.name, path: false }
    case 'step':
      if (change.step !== 'run') return { text: change.path ?? '', path: true }
      return change.command === null
        ? { text: change.line ?? '', path: true }
        : { text: change.command, path: false }
    case 'variable':
      return { text: change.name, path: false }
    case 'workspace_create':
      return { text: change.name, path: false }
    case 'workspace_prepare':
    case 'workspace_resume':
    case 'workspace_cleanup':
      return { text: change.workspace, path: false }
  }
}

/** Everything the change would write, said field by field; never a variable's value. */
export function setupChangeDetails(change: SetupChange): readonly SetupDetail[] {
  switch (change.kind) {
    case 'repository':
      return [{ label: 'Path', value: change.path }]
    case 'command': {
      const details: SetupDetail[] = [
        { label: 'Type', value: change.type },
        { label: 'Line', value: change.line },
      ]
      if (change.lineWindows !== null) details.push({ label: 'Windows', value: change.lineWindows })
      if (change.lineLinux !== null) details.push({ label: 'Linux', value: change.lineLinux })
      details.push({ label: 'Runs in', value: placeOf(change.repository, change.folder) })
      if (change.type === 'serve') {
        details.push({
          label: 'Scope',
          value: change.scope === 'project' ? 'one for the Project, in main' : 'one per Workspace',
        })
      }
      if (change.portless) {
        details.push({ label: 'Portless', value: change.portlessName ?? "the Project's name" })
      }
      if (change.runAtOpen) details.push({ label: 'Runs when Hemera opens', value: 'yes' })
      return details
    }
    case 'step': {
      if (change.step !== 'run') {
        return [
          { label: change.step === 'copy' ? 'Copies' : 'Links', value: change.path ?? '' },
          { label: 'Under', value: placeOf(change.repository, null) },
        ]
      }
      if (change.command !== null) return [{ label: 'Command', value: change.command }]
      const details: SetupDetail[] = [{ label: 'Line', value: change.line ?? '' }]
      if (change.lineWindows !== null) details.push({ label: 'Windows', value: change.lineWindows })
      if (change.lineLinux !== null) details.push({ label: 'Linux', value: change.lineLinux })
      details.push({ label: 'Runs in', value: placeOf(change.repository, change.path) })
      return details
    }
    case 'variable':
      return [
        { label: 'Scope', value: change.workspace ?? 'the Project' },
        // The value itself is the agent's to write and the human's to read in the settings, never
        // the thread's (Decided 2 of #218).
        { label: 'Value', value: change.replaces ? 'replaced, not shown' : 'set, not shown' },
      ]
    case 'workspace_create':
      return [{ label: 'Name', value: change.name }]
    case 'workspace_prepare':
    case 'workspace_resume':
    case 'workspace_cleanup':
      return [{ label: 'Workspace', value: change.workspace }]
  }
}
