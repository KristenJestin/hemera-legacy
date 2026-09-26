import type { Command, Project } from '@hemera/ipc'
import type { CommandLine, RepositoryLine } from '@hemera/ui'

/**
 * What the Commands and Repositories sections of a Project's settings draw from the engine's
 * views, and what they hand back to it (D6-12, D8-04, D8-07, D8-10, recette 1 and 2).
 *
 * Both ways, and nothing lost on the way: a command read and saved unchanged is written as it was
 * read. Kept apart from the page, which imports the components, so a test reads it without a DOM.
 */

/**
 * A command of the catalogue, as its row and its dialog draw it: its base, its folder under it
 * without the leading `./` the engine keeps, and the name Portless serves it under.
 */
export function commandLineOf(command: Command): CommandLine {
  return {
    id: command.name,
    name: command.name,
    command: command.line,
    lineWindows: command.lineWindows,
    lineLinux: command.lineLinux,
    type: command.type,
    scope: command.scope,
    portless: command.portless,
    portlessName: command.portlessName,
    folderBase: command.folderBase,
    folder: command.folder?.replace(/^\.\//, '') ?? '',
  }
}

/** What the engine writes a command from: every field the dialog edits (D8-07, D8-10). */
export type CommandWrite = Pick<
  Command,
  | 'name'
  | 'line'
  | 'lineWindows'
  | 'lineLinux'
  | 'type'
  | 'folderBase'
  | 'folder'
  | 'scope'
  | 'portless'
  | 'portlessName'
>

/** A row as the engine writes it: the base itself is no folder at all, and is null. */
export function commandWriteOf(line: CommandLine): CommandWrite {
  return {
    name: line.name,
    line: line.command,
    lineWindows: line.lineWindows,
    lineLinux: line.lineLinux,
    type: line.type,
    folderBase: line.folderBase,
    folder: line.folder === '' ? null : line.folder,
    scope: line.scope,
    portless: line.portless,
    portlessName: line.portlessName,
  }
}

/**
 * The segments of a path, whichever separator its system writes and whatever `.` it carries.
 *
 * The engine compares paths with the tools of the system; the renderer has no disk to ask, and a
 * command's folder is written by hand here. Segments are all it needs, and pure string work is
 * what it can do.
 */
function segmentsOf(path: string): string[] {
  return path
    .replaceAll('\\', '/')
    .split('/')
    .filter((segment) => segment !== '' && segment !== '.')
}

/** Whether a path is one Windows writes: a drive letter, or the two backslashes a share starts with. */
function windowsPath(path: string): boolean {
  return /^[a-zA-Z]:[\\/]/.test(path) || path.startsWith('\\\\')
}

/**
 * The folder a command runs from, as its own system writes it: the folder of the main Workspace,
 * or one of the Project's repositories under it (recette 2).
 *
 * `mainPath` is the folder of the main Workspace, which a base is relative to; `base` is null for
 * the Workspace root and one of the Project's repositories otherwise, as the dialog names it. It
 * is the folder the field's own answer is relative to, and the one the system's picker opens on,
 * joined the way the main folder is written: a Windows path keeps its backslashes, a POSIX one
 * its slash.
 */
export function folderBasePath(mainPath: string, base: string | null): string {
  const under = segmentsOf(base ?? '')
  if (under.length === 0) return mainPath
  return [mainPath, ...under].join(windowsPath(mainPath) ? '\\' : '/')
}

/** What the disk says of one declared location, as `repositories.status` answers it. */
export interface LocationFound {
  readonly path: string
  readonly git: string | null
  readonly exists: boolean
}

/**
 * The declared repositories as their section lists them: what the disk says of each, and what the
 * Project says — whether a dedicated Workspace takes it (D8-04) and the icon it wears.
 */
export function repositoryLinesOf(
  found: readonly LocationFound[],
  project: Pick<Project, 'included' | 'repositoryIcons'>,
): RepositoryLine[] {
  return found.map((one) => ({
    path: one.path,
    branch: one.git,
    exists: one.exists,
    includedByDefault: project.included.includes(one.path),
    icon: project.repositoryIcons[one.path] ?? null,
  }))
}
