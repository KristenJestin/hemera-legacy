import type { FileTreeRowDecoration, GitStatus, GitStatusEntry } from '@pierre/trees'
import { FileTree, useFileTree } from '@pierre/trees/react'
import { type ReactNode, useMemo } from 'react'

import { StatusDot } from '../../components/status-dot/status-dot.tsx'
import { IconChecklist, IconSearch } from '../../icons.ts'
import {
  type GitLetter,
  type ReviewRound,
  type RoundRepository,
  countsOf,
  treePath,
} from './model.ts'

/**
 * The left of the review: the Spec, then what the round changed, repository by repository.
 *
 * The Spec comes first because the round is a Spec review: its entry opens the stories one by one
 * in the centre, a dot saying whether every criterion is shown met. Under it, one tree
 * (`@pierre/trees`, virtualised, searched from the field above it): each repository is a folder at the root, its
 * files under it with their Git letter and the lines they add and remove, and the repository's
 * own row carries its totals, and the stale mark when its working tree moved since the round
 * opened. The remote and the branch are the repository row's title.
 */

const GIT: Record<GitLetter, GitStatus> = {
  A: 'added',
  M: 'modified',
  D: 'deleted',
  R: 'renamed',
}

/** The colours of the counts, the design system's own roles, read by the tree inside its root. */
const ADDED = 'var(--success-muted-foreground)'
const REMOVED = 'var(--destructive-muted-foreground)'
const STALE = 'var(--warning-muted-foreground)'

function statuses(repositories: readonly RoundRepository[]): GitStatusEntry[] {
  return repositories.flatMap((repository) =>
    repository.files.map((file) => ({
      path: treePath(repository.name, file.path),
      status: file.untracked ? 'untracked' : GIT[file.status],
    })),
  )
}

/** `+12 −3`, or nothing to count for a binary file. */
function counts(added: number | null, removed: number | null): FileTreeRowDecoration | null {
  if (added === null || removed === null) return { text: 'bin', title: 'Binary' }
  const parts = []
  if (added > 0) parts.push({ text: `+${String(added)}`, color: ADDED })
  if (removed > 0) parts.push({ text: `−${String(removed)}`, color: REMOVED })
  return {
    text: parts.map((part) => part.text).join(' '),
    parts: parts.flatMap((part, index) => (index === 0 ? [part] : [{ text: ' ' }, part])),
  }
}

/** The field the tree is searched from: the design system's own box, the tree's search off. */
const FIND =
  'h-control-sm w-full rounded-md border border-input bg-muted pr-2 pl-6 text-sm text-foreground outline-none placeholder:text-muted-foreground'

const SPEC =
  'flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm outline-none focus-ring hover:bg-accent aria-[current=true]:bg-primary-muted'

export interface ChangesTreeProps {
  round: ReviewRound
  /** Whether the Spec review is what the centre shows. */
  specShown: boolean
  onSpec: () => void
  /** A file was chosen: its path in the tree, which is also the id of its diff. */
  onFile: (id: string) => void
}

export function ChangesTree({ round, specShown, onSpec, onFile }: ChangesTreeProps): ReactNode {
  const paths = useMemo(
    () =>
      round.repositories.flatMap((repository) =>
        repository.files.map((file) => treePath(repository.name, file.path)),
      ),
    [round],
  )
  const files = useMemo(() => {
    const index = new Map<string, { added: number | null; removed: number | null }>()
    for (const repository of round.repositories) {
      for (const file of repository.files) {
        index.set(treePath(repository.name, file.path), file)
      }
    }
    return index
  }, [round])
  const unmet = [...round.verdicts.values()].some((one) => one.some((criterion) => !criterion.met))

  const { model } = useFileTree({
    paths,
    gitStatus: statuses(round.repositories),
    initialExpansion: 'open',
    flattenEmptyDirectories: true,
    fileTreeSearchMode: 'hide-non-matches',
    density: 'compact',
    onSelectionChange: (selected) => {
      const chosen = selected.at(-1)
      if (chosen !== undefined && files.has(chosen)) onFile(chosen)
    },
    renderRowDecoration: ({ item, row }) => {
      if (item.kind === 'file') {
        const file = files.get(item.path)
        return file === undefined ? null : counts(file.added, file.removed)
      }
      if (row.depth !== 0) return null
      const repository = round.repositories.find((one) => one.name === item.name)
      if (repository === undefined) return null
      const total = countsOf(repository.files)
      const tally = counts(total.added, total.removed)
      const where = `${repository.remote} · ${repository.branch} · ${repository.head}`
      const parts = tally !== null && 'parts' in tally ? (tally.parts ?? []) : []
      if (!repository.stale)
        return { text: tally !== null && 'text' in tally ? tally.text : '', parts, title: where }
      return {
        text: `● ${tally !== null && 'text' in tally ? tally.text : ''}`,
        title: `Changed on disk since the round opened · ${where}`,
        parts: [{ text: '●', color: STALE }, { text: ' ' }, ...parts],
      }
    },
  })

  return (
    <nav aria-label="What the round changed" className="flex min-h-0 flex-1 flex-col gap-1">
      <div className="px-2 pt-2">
        <button type="button" aria-current={specShown} className={SPEC} onClick={onSpec}>
          <IconChecklist size="sm" aria-hidden="true" />
          <span className="flex-1 font-medium">Spec</span>
          <StatusDot
            status={unmet ? 'failure' : 'success'}
            size="sm"
            label={unmet ? 'A criterion is not shown met' : 'Every criterion is shown met'}
          />
        </button>
      </div>
      <div className="relative mx-2 flex items-center rounded-md focus-ring">
        <span className="pointer-events-none absolute left-2 flex text-muted-foreground">
          <IconSearch size="sm" aria-hidden="true" />
        </span>
        <input
          type="search"
          aria-label="Find a file"
          placeholder="Find a file"
          className={FIND}
          onChange={(event) => {
            const value = event.target.value.trim()
            model.setSearch(value === '' ? null : value)
          }}
        />
      </div>
      <FileTree model={model} data-review-tree="" className="min-h-0 flex-1" />
    </nav>
  )
}
