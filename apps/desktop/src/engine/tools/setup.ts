/**
 * The setup tools: the Project's setup read freely, and changes to it proposed (issue #218).
 *
 * `setup_read` answers what the Project settings show — repositories with their Git state,
 * Workspaces with their state and preparation, the recipe, the commands and services, and the
 * variables by name only. `setup_propose` changes nothing: each change becomes a card of the
 * thread the human accepts or declines, the way a command proposal does (D8-11), and the
 * changes of one call are one batch the human may accept in one press (Decided 1 of #218).
 *
 * Every change is checked as the settings would check it before anything is written, and a call
 * holding one the settings would refuse is refused whole, with the settings' own reason, so the
 * agent reads it and proposes again. What only the disk or Git can say at the moment of acting
 * is said when the human accepts, by the use case itself. A variable's value is held in memory
 * until then, and never written in the thread or the Journal (Decided 2 of #218).
 */

import {
  InvalidCommandFolderError,
  InvalidRepositoryPathError,
  MAIN_WORKSPACE,
  ROOT_REPOSITORY,
  type SetupChange,
  commandFolder,
  commandLine,
  commandName,
  commandPlace,
  portlessName,
  repositoryPath,
  setupChangeTitle,
  variableKey,
  workspaceName,
} from '@hemera/core'
import { Effect } from 'effect'
import { existsSync } from 'node:fs'
import { join } from 'node:path'

import { UnknownCommandFolderError } from '../commands/panel.ts'
import type { CommandsService } from '../commands/service.ts'
import type { ProjectsService } from '../projects.ts'
import type { SessionsService, ThreadWrite, Written } from '../sessions.ts'
import type { SetupDeskService } from '../setup/desk.ts'
import type { SpecsService } from '../specs/specs.ts'
import { WorkspaceTakenError } from '../workspaces/described.ts'
import type { VariablesService } from '../workspaces/variables.ts'
import type { WorkspaceView } from '../workspaces/workspaces.ts'
import { CHANGE_SENT, type ChangeSent, jsonList } from './arguments.ts'

/** What the setup tools read and write through: the services the settings call. */
export interface SetupToolsNeeds {
  readonly projects: ProjectsService
  readonly sessions: SessionsService
  readonly commands: CommandsService
  readonly variables: VariablesService
  readonly specs: SpecsService
  readonly desk: SetupDeskService
  /** Writes an entry of a Session's thread, as the catalogue writes every entry of a call. */
  readonly inThread: (sessionId: string, entry: ThreadWrite) => Effect.Effect<Written, unknown>
}

/** A change that passed the settings' checks, and the value a variable carries beside it. */
interface Planned {
  readonly change: SetupChange
  readonly value: string | null
}

/**
 * What a setup tool answers, as the catalogue writes it down: the catalogue's `Answer`, said again
 * here rather than imported, since the catalogue is what imports this.
 */
export interface SetupAnswer {
  readonly ok: boolean
  readonly refused?: boolean
  readonly summary: string
  readonly text: string
  readonly paths: readonly string[]
}

/** What checking a whole call answered: every change planned, or the first one refused. */
type Plan =
  | { readonly ok: true; readonly planned: readonly Planned[] }
  | { readonly ok: false; readonly reason: string }

/** A rule of the domain that throws, as its sentence, or the value it answered. */
function ruled<A>(rule: () => A): { ok: true; value: A } | { ok: false; reason: string } {
  try {
    return { ok: true, value: rule() }
  } catch (refused) {
    return { ok: false, reason: refused instanceof Error ? refused.message : String(refused) }
  }
}

/** A repository named by an agent, where `.` and nothing are the Workspace root. */
function rootOrPath(named: string | null): string | null {
  const said = named?.trim() ?? ''
  return said === '' || said === '.' || said === './' ? null : said
}

/** Yes or no, as a line of `setup_read` reads. */
const yesNo = (value: boolean) => (value ? 'yes' : 'no')

export function setupTools(needs: SetupToolsNeeds) {
  const { projects, sessions, commands, variables, specs, desk } = needs
  const { workspaces, recipe, values } = desk

  /** Something the settings read, or undefined when it did not read. */
  const answered = <A, E>(effect: Effect.Effect<A, E>): Effect.Effect<A | undefined> =>
    effect.pipe(Effect.match({ onFailure: () => undefined, onSuccess: (value: A) => value }))

  const projectOf = (projectId: string) =>
    answered(projects.list(true)).pipe(
      Effect.map((all) => all?.find((one) => one.id === projectId)),
    )

  /** Every variable name of one scope, never a value. */
  const namesIn = (projectId: string, workspaceId: string | null) =>
    answered(variables.list(projectId, workspaceId)).pipe(
      Effect.map((listed) => (listed ?? []).map((one) => one.key)),
    )

  const read = (projectId: string): Effect.Effect<SetupAnswer> =>
    Effect.gen(function* () {
      const project = yield* projectOf(projectId)
      if (project === undefined) {
        return {
          ok: false,
          summary: 'the Project did not read',
          text: 'the Project did not read',
          paths: [],
        }
      }
      const catalogue = (yield* answered(commands.list(projectId))) ?? []
      const steps = (yield* answered(recipe.list(projectId))) ?? []
      const places = (yield* answered(workspaces.list(projectId))) ?? []
      const keys = new Map(
        ((yield* answered(specs.list(projectId))) ?? []).map((one) => [one.id, one.key]),
      )
      const main = places.find((one) => one.main)
      const states = main === undefined ? [] : ((yield* answered(workspaces.status(main.id))) ?? [])

      const lines = [
        `project: ${project.name} (${project.id})`,
        `main: ${project.mainPath}`,
        `Workspaces are made under: ${project.workspacesRoot ?? "Hemera's own folder"}`,
        `branch prefix: ${project.branchPrefix ?? 'the Project name as a slug'}`,
      ]

      lines.push(
        project.repositories.length === 0
          ? 'repositories: none declared; the Workspace root is the only one'
          : `repositories (${project.repositories.length}):`,
      )
      for (const path of project.repositories) {
        const state = states.find((one) => one.relativePath === path)
        const git =
          state === undefined || state.git === null
            ? 'Git state not read'
            : state.git.ok
              ? `on ${state.git.branch} at ${state.git.commit}, ${state.git.staged} staged, ${state.git.unstaged} changed, ${state.git.untracked} untracked`
              : `Git: ${state.git.error}`
        const icon = project.repositoryIcons[path]
        lines.push(
          `  ${path}  included in a new Workspace: ${yesNo(project.included.includes(path))}${icon === undefined ? '' : `  icon: ${icon}`}  ${git}`,
        )
      }

      lines.push(catalogue.length === 0 ? 'commands: none' : `commands (${catalogue.length}):`)
      for (const command of catalogue) {
        const extra = [
          command.type === 'serve' ? `scope ${command.scope}` : null,
          command.portless ? `portless as ${command.portlessName ?? 'the Project name'}` : null,
          command.runAtOpen ? 'runs when Hemera opens' : null,
          command.lineWindows === null ? null : `on Windows: ${command.lineWindows}`,
          command.lineLinux === null ? null : `on Linux: ${command.lineLinux}`,
        ].filter((part) => part !== null)
        lines.push(
          `  ${command.name}  ${command.type}  in ${commandPlace(command) ?? 'the Workspace root'}  ${command.line}${extra.length === 0 ? '' : `  (${extra.join('; ')})`}`,
        )
      }

      lines.push(
        steps.length === 0
          ? 'preparation recipe: no step; a new Workspace gets its worktrees only'
          : `preparation recipe (${steps.length} steps, in order):`,
      )
      steps.forEach((step, index) => {
        const under = step.base ?? 'the Workspace root'
        const said =
          step.kind === 'run'
            ? step.commandId === null
              ? `runs the line ${step.line ?? ''} in ${[step.base, step.path].filter((one) => one !== null).join('/') || 'the Workspace root'}`
              : `runs the command ${catalogue.find((one) => one.id === step.commandId)?.name ?? '(removed)'}`
            : `${step.kind === 'copy' ? 'copies' : 'links'} ${step.path ?? ''} under ${under}`
        lines.push(`  ${index + 1}. ${said}`)
      })

      const projectNames = yield* namesIn(projectId, null)
      lines.push(
        projectNames.length === 0
          ? 'variables of the Project: none'
          : `variables of the Project (names only): ${projectNames.join(', ')}`,
      )

      lines.push(`Workspaces (${places.length}):`)
      for (const place of places) {
        const spec = place.specId === null ? '' : `  made for ${keys.get(place.specId) ?? 'a Spec'}`
        const preparing =
          place.state === 'preparing'
            ? place.live
              ? '  being prepared now'
              : '  preparation interrupted, resume it'
            : ''
        lines.push(`  ${place.name}  ${place.state}${spec}${preparing}  ${place.path}`)
        if (place.state === 'cleaned') continue
        const placeSteps = yield* desk.steps(place.id)
        for (const step of placeSteps) {
          lines.push(
            `    step ${step.position}: ${step.kind} ${step.target}  ${step.state}${step.message === null ? '' : `: ${step.message}`}`,
          )
        }
        const names = yield* namesIn(projectId, place.id)
        if (names.length > 0) lines.push(`    variables (names only): ${names.join(', ')}`)
        const running =
          (yield* answered(commands.services(projectId, place.main ? null : place.id))) ?? []
        for (const run of running) {
          lines.push(`    service running: ${run.name}${run.url === null ? '' : ` at ${run.url}`}`)
        }
      }

      return {
        ok: true,
        summary: `read the setup of ${project.name}`,
        text: lines.join('\n'),
        paths: [],
      }
    })

  /**
   * Every change of a call checked as the settings would, in order: a change may lean on one
   * proposed before it in the same call — a command in a repository the call declares, a step
   * running a command it adds — since the human accepts them in that order.
   */
  const plan = (
    projectId: string,
    sessionSpec: string | null,
    sent: readonly ChangeSent[],
  ): Effect.Effect<Plan> =>
    Effect.gen(function* () {
      const project = yield* projectOf(projectId)
      if (project === undefined) return { ok: false, reason: 'the Project did not read' }
      const catalogue = (yield* answered(commands.list(projectId))) ?? []
      const places = ((yield* answered(workspaces.list(projectId))) ?? []).filter(
        (one) => one.state !== 'cleaned',
      )
      const keys = new Map(
        ((yield* answered(specs.list(projectId))) ?? []).map((one) => [one.id, one.key]),
      )
      const declared = new Set(project.repositories)
      /** The commands there will be once the changes before this one are accepted, by name. */
      const types = new Map(catalogue.map((one) => [one.name, one.type]))
      const proposedCommands = new Set<string>()
      const proposedWorkspaces = new Set<string>()
      const planned: Planned[] = []

      /** A repository a change names, declared by the Project or by a change before it. */
      const repositoryIn = (named: string | null) => {
        const said = rootOrPath(named)
        if (said === null) return { ok: true as const, value: null }
        const path = ruled(() => repositoryPath(said))
        if (!path.ok) return path
        if (!declared.has(path.value)) {
          return { ok: false as const, reason: new UnknownCommandFolderError(said).message }
        }
        return { ok: true as const, value: path.value }
      }

      /** A Workspace of the Project by name, and whether the rules let this Session act on it. */
      const placeNamed = (named: string) => {
        const place = places.find((one) => one.name === named)
        if (place === undefined) {
          return { ok: false as const, reason: `the Project has no Workspace named ${named}` }
        }
        // One Spec, one Workspace (D8-12): a Session of a Spec does not act on the Workspace made
        // for another one, as the engine refuses a build there.
        if (sessionSpec !== null && place.specId !== null && place.specId !== sessionSpec) {
          return {
            ok: false as const,
            reason: new WorkspaceTakenError(place.name, keys.get(place.specId) ?? 'another Spec')
              .message,
          }
        }
        return { ok: true as const, value: place }
      }

      for (const [index, change] of sent.entries()) {
        const refuse = (reason: string): Plan => ({
          ok: false,
          reason: `change ${index + 1} (${change.kind}) is refused: ${reason}`,
        })

        switch (change.kind) {
          case 'repository': {
            const path = ruled(() => repositoryPath(change.path))
            if (!path.ok) return refuse(path.reason)
            if (declared.has(path.value)) {
              return refuse(
                new InvalidRepositoryPathError(change.path, 'it is declared twice').message,
              )
            }
            declared.add(path.value)
            planned.push({ change: { kind: 'repository', path: path.value }, value: null })
            break
          }

          case 'command': {
            const named = ruled(() => ({
              name: commandName(change.name),
              line: commandLine(change.line),
              portlessName: portlessName(change.portlessName),
            }))
            if (!named.ok) return refuse(named.reason)
            const folder = ruled(() => commandFolder(change.folder))
            if (!folder.ok) {
              return refuse(
                new InvalidCommandFolderError(change.folder ?? '', folder.reason).message,
              )
            }
            const repository = repositoryIn(change.repository)
            if (!repository.ok) return refuse(repository.reason)
            if (proposedCommands.has(named.value.name)) {
              return refuse(`the command ${named.value.name} is proposed twice in this call`)
            }
            proposedCommands.add(named.value.name)
            const replaces = catalogue.some((one) => one.name === named.value.name)
            types.set(named.value.name, change.type)
            planned.push({
              change: {
                kind: 'command',
                name: named.value.name,
                line: named.value.line,
                lineWindows: change.lineWindows,
                lineLinux: change.lineLinux,
                type: change.type,
                repository: repository.value,
                folder: folder.value,
                scope: change.scope,
                portless: change.portless,
                portlessName: named.value.portlessName,
                runAtOpen: change.runAtOpen,
                replaces,
              },
              value: null,
            })
            break
          }

          case 'step': {
            const repository = repositoryIn(change.repository)
            if (!repository.ok) return refuse(repository.reason)
            if (change.step === 'run') {
              if (change.command !== null && change.line !== null) {
                return refuse(
                  'a run step starts a command of this Project or runs a line, not both',
                )
              }
              if (change.command !== null) {
                const type = types.get(change.command)
                if (type === undefined) {
                  return refuse(`the Project has no command named "${change.command}"`)
                }
                // A step waits for its command to end, and a service is up until it is stopped:
                // the recipe refuses a `serve` (D8-05, D8-07).
                if (type === 'serve') {
                  return refuse(
                    'a service never ends: a preparation step waits for its command to end',
                  )
                }
              } else if (change.line === null) {
                return refuse(
                  'a run step starts a command of this Project, or carries a line of its own, and neither was named',
                )
              }
              const path =
                change.command !== null || change.path === null
                  ? { ok: true as const, value: null }
                  : ruled(() => repositoryPath(change.path ?? ''))
              if (!path.ok) return refuse(path.reason)
              planned.push({
                change: {
                  kind: 'step',
                  step: 'run',
                  repository: change.command === null ? repository.value : null,
                  path: path.value,
                  command: change.command,
                  line: change.command === null ? change.line : null,
                  lineWindows: change.command === null ? change.lineWindows : null,
                  lineLinux: change.command === null ? change.lineLinux : null,
                },
                value: null,
              })
              break
            }
            const path = ruled(() => repositoryPath(change.path ?? ''))
            if (!path.ok) return refuse(path.reason)
            if (path.value === ROOT_REPOSITORY) {
              return refuse(
                `a ${change.step} names a file or a folder under its base, not the base`,
              )
            }
            // The source of a copy or a link is in `main`, as the recipe checks it (D8-05 as
            // amended by recette 1).
            const source = join(project.mainPath, repository.value ?? '', path.value)
            if (!existsSync(source)) {
              return refuse(`${source} does not exist in main: a ${change.step} needs its source`)
            }
            planned.push({
              change: {
                kind: 'step',
                step: change.step,
                repository: repository.value,
                path: path.value,
                command: null,
                line: null,
                lineWindows: null,
                lineLinux: null,
              },
              value: null,
            })
            break
          }

          case 'variable': {
            const key = ruled(() => variableKey(change.name))
            if (!key.ok) return refuse(key.reason)
            const scope = change.workspace === null ? null : placeNamed(change.workspace)
            if (scope !== null && !scope.ok) return refuse(scope.reason)
            const place = scope === null ? null : scope.value
            // `main`'s variables are its own scope, as the settings set them on its row (D8-06).
            const names = yield* namesIn(projectId, place === null ? null : place.id)
            planned.push({
              change: {
                kind: 'variable',
                name: key.value,
                workspace: place === null ? null : place.name,
                replaces: names.includes(key.value),
              },
              value: change.value,
            })
            break
          }

          case 'workspace_create': {
            const name = ruled(() => workspaceName(change.name))
            if (!name.ok) return refuse(name.reason)
            if (
              places.some((one) => one.name === name.value) ||
              proposedWorkspaces.has(name.value)
            ) {
              return refuse(`a Workspace named ${name.value} already exists in this Project`)
            }
            proposedWorkspaces.add(name.value)
            planned.push({ change: { kind: 'workspace_create', name: name.value }, value: null })
            break
          }

          case 'workspace_prepare':
          case 'workspace_resume':
          case 'workspace_cleanup': {
            const found = placeNamed(change.workspace)
            if (!found.ok) return refuse(found.reason)
            const place = found.value
            const refusal =
              change.kind === 'workspace_cleanup'
                ? yield* answered(workspaces.cleanupRefusal(place.id))
                : preparationRefusal(place, change.kind === 'workspace_resume')
            if (refusal === undefined) return refuse(`${place.name} did not read`)
            if (refusal !== null) return refuse(refusal)
            planned.push({ change: { kind: change.kind, workspace: place.name }, value: null })
            break
          }
        }
      }
      return { ok: true, planned }
    })

  const propose = (
    sessionId: string,
    projectId: string,
    projectName: string,
    arguments_: { readonly changes: string; readonly why: string },
  ): Effect.Effect<SetupAnswer> =>
    Effect.gen(function* () {
      const listed = jsonList(CHANGE_SENT).safeParse(arguments_.changes)
      // The schema of the tool already read the list; this is the same reading, to use it.
      if (!listed.success) {
        return {
          ok: false,
          summary: 'the changes do not read',
          text: 'the changes do not read',
          paths: [],
        }
      }
      const session = yield* answered(sessions.one(sessionId))
      const checked = yield* plan(projectId, session?.session.specId ?? null, listed.data)
      if (!checked.ok) {
        // A rule saying no, as the settings would have said it: the agent reads it and proposes
        // again, and nothing of the call was written.
        return {
          ok: false,
          refused: true,
          summary: checked.reason,
          text: checked.reason,
          paths: [],
        }
      }
      const batchId = crypto.randomUUID()
      const titles: string[] = []
      for (const { change, value } of checked.planned) {
        const proposalId = crypto.randomUUID()
        const title = setupChangeTitle(change)
        // The value waits in memory, never in the entry (Decided 2 of #218).
        if (value !== null) yield* values.hold(proposalId, value)
        const written = yield* answered(
          needs.inThread(sessionId, {
            role: 'hemera',
            kind: 'setup_proposal',
            body: title,
            payload: JSON.stringify({
              proposalId,
              batchId,
              change,
              why: arguments_.why,
              state: 'pending',
            }),
            correlationId: `setup:${proposalId}`,
            state: 'pending',
            events: [
              {
                type: 'setup.proposed',
                entityKind: 'project',
                entityId: projectId,
                source: 'system',
                author: 'agent',
                projectId,
                sessionId,
                payload: { proposal: proposalId, batch: batchId, change: change.kind, title },
              },
            ],
          }),
        )
        if (written === undefined) {
          yield* values.drop(proposalId)
          return {
            ok: false,
            summary: 'the proposal was not written',
            text: `the thread of this Session refused it after ${titles.length} of ${checked.planned.length} change(s) were proposed`,
            paths: [],
          }
        }
        titles.push(title)
      }
      return {
        ok: true,
        summary: `proposed ${titles.length} change(s) to the setup of ${projectName}`,
        text: [
          'proposed: the user accepts or declines each change in the Session, or all of them at once; nothing is changed yet',
          ...titles.map((title) => `- ${title}`),
        ].join('\n'),
        paths: [],
      }
    })

  return { read, propose }
}

/**
 * Why a Workspace cannot be prepared, or resumed, now, and null when it can (D8-05): `main` and
 * a folder of the user's have nothing to prepare, a ready one is prepared, and one preparation
 * runs at a time.
 */
function preparationRefusal(place: WorkspaceView, resume: boolean): string | null {
  if (place.main || !place.dedicated) {
    return `${place.name === MAIN_WORKSPACE ? MAIN_WORKSPACE : place.name} is not a Workspace Hemera made: it has nothing to prepare`
  }
  if (place.live) return 'this Workspace is already being prepared'
  if (place.state === 'ready') return `${place.name} is already ready`
  if (resume && place.state !== 'failed' && place.state !== 'preparing') {
    return `${place.name} has no preparation to resume`
  }
  if (!resume && place.state === 'failed') {
    return `the preparation of ${place.name} failed: resume it rather than prepare it again`
  }
  return null
}
