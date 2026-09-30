import type { ReactNode } from 'react'

import { IconGitBranch } from '../icons.ts'
import type { RepositoryIcon } from '../project/model.ts'
import { REPOSITORY_ICON_GLYPHS } from '../project/repository-dialog.tsx'

/**
 * Where a command runs, said the way the Project says it (issue #239): in one of its repositories,
 * named as the Project declares it and drawn with its icon, or in a plain folder of the Workspace.
 * A folder that is one of the Project's repositories is never called a folder.
 */

/** One of the Project's repositories: its path as the Project declares it, and its icon. */
export interface RunRepository {
  path: string
  /** The icon chosen in its dialog; null draws the branch, which is what a repository is. */
  icon: RepositoryIcon | null
}

/** The mark of a repository: its chosen icon, or the branch. */
export function RepositoryGlyph({ icon }: { icon: RepositoryIcon | null }): ReactNode {
  const Glyph = icon === null ? IconGitBranch : REPOSITORY_ICON_GLYPHS[icon]
  return (
    <span className="flex shrink-0 text-muted-foreground">
      <Glyph size="sm" aria-hidden="true" />
    </span>
  )
}

/** What a place reads as: the repository, then the folder under it when it is not the base. */
export function placeText(repository: RunRepository | undefined, folder: string): string {
  if (repository === undefined) return folder
  return folder === '.' ? repository.path : `${repository.path}/${folder}`
}

/** A place on one line: the repository's mark before it when it is one, and nothing otherwise. */
export function RunPlace({
  repository,
  folder,
}: {
  repository?: RunRepository | undefined
  folder: string
}): ReactNode {
  return (
    <span className="flex min-w-0 items-center gap-1">
      {repository !== undefined && <RepositoryGlyph icon={repository.icon} />}
      <span className="min-w-0 truncate">{placeText(repository, folder)}</span>
    </span>
  )
}
