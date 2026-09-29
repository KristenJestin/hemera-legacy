import type { Project } from '@hemera/ipc'
import type { RunRepository } from '@hemera/ui'

/**
 * Where something runs, in the Project's words (issue #239): in one of its repositories, and the
 * folder under it, or in a folder of the Workspace, relative to its root. A folder that is one of
 * the Project's repositories is said as that repository and never as a plain folder.
 *
 * Kept apart from the pages, so a test can read it without a theme or a DOM.
 */
export interface RunPlaceDrawn {
  /** The repository it runs in, or undefined for a folder that is none of the Project's. */
  readonly repository: RunRepository | undefined
  /**
   * The folder, relative to the repository when it is in one and to the root otherwise, `.` for
   * the base itself — and the path as it came when it is outside the root or the root is unknown.
   */
  readonly folder: string
  /** Whether the path is the root or under it, which is what makes it relative at all. */
  readonly inside: boolean
}

/** The Project's repositories as the places of its runs name them, each with its icon. */
export function repositoriesOf(
  project: Pick<Project, 'repositories' | 'repositoryIcons'> | null,
): readonly RunRepository[] {
  if (project === null) return []
  return project.repositories.map((path) => ({ path, icon: project.repositoryIcons[path] ?? null }))
}

/** A path with `/` between its parts and no `/` at its end or `./` at its start. */
function plain(path: string): string {
  return path.replaceAll('\\', '/').replace(/^\.\//, '').replace(/\/+$/, '')
}

/** Where `path` is, relative to `root` and to the repository of `repositories` it falls in. */
export function runPlaceOf(
  path: string,
  root: string | null,
  repositories: readonly RunRepository[],
): RunPlaceDrawn {
  if (root === null) return { repository: undefined, folder: path, inside: false }
  const inside = plain(path)
  const base = plain(root)
  const relative =
    inside === base ? '.' : inside.startsWith(`${base}/`) ? inside.slice(base.length + 1) : null
  if (relative === null) return { repository: undefined, folder: path, inside: false }
  // The deepest repository holding it: a repository declared inside another is the nearer one.
  const repository = repositories
    .filter((one) => {
      const declared = plain(one.path)
      return relative === declared || relative.startsWith(`${declared}/`)
    })
    .toSorted((one, other) => plain(other.path).length - plain(one.path).length)[0]
  if (repository === undefined) return { repository: undefined, folder: relative, inside: true }
  const declared = plain(repository.path)
  return {
    repository,
    folder: relative === declared ? '.' : relative.slice(declared.length + 1),
    inside: true,
  }
}
