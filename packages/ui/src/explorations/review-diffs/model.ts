/**
 * What the review round is handed to draw, around a real diff (exploration of issue #271).
 *
 * The round is the one of #278: a number, a state, a kind, and per repository of the Workspace
 * what the build changed from its base, frozen when the round opened. What this exploration adds
 * is the content of each file on both sides, which a diff needs and the round's rows do not keep,
 * and feedback anchored on lines. The anchor is the one #278 declared: a story or a criterion for
 * `spec`, a repository, a path, lines and a side for `code`.
 *
 * The design system imports nothing of Hemera, so the shapes of `@hemera/core` are repeated here
 * as the exploration needs them, under the same names.
 */

import type { StoryView } from '../../spec/model.ts'

/** Where a round stands: reviewed, being fixed, over (`ROUND_STATES` of the domain). */
export type RoundState = 'open' | 'fixing' | 'closed'

/** What a feedback is: about the product, general, or a question (`FEEDBACK_KINDS`). */
export type FeedbackKind = 'product' | 'general' | 'question'

/** Which side of a diff the lines of a `code` anchor are on (`DIFF_SIDES`). */
export type DiffSide = 'old' | 'new'

/** A range of lines on one side of a file, from one, both ends included. */
export interface LineRange {
  readonly start: number
  readonly end: number
}

/** What a feedback points at, or nothing (`FeedbackAnchor` of the domain). */
export type FeedbackAnchor =
  | { readonly kind: 'spec'; readonly storyId: string; readonly criterion: number | null }
  | {
      readonly kind: 'code'
      readonly repository: string
      readonly path: string
      readonly lines: LineRange | null
      readonly side: DiffSide | null
    }

/** One feedback of the round. */
export interface RoundFeedback {
  readonly id: string
  readonly kind: FeedbackKind
  readonly body: string
  readonly anchor: FeedbackAnchor | null
  readonly createdAt: string
  /** Once the user took it back: it stays in the list, crossed out, and waits for nothing. */
  readonly withdrawnAt: string | null
}

/** Git's letter for a change: added, modified, deleted, renamed. */
export type GitLetter = 'A' | 'M' | 'D' | 'R'

/** One file the build changed in a repository, with both sides of its content. */
export interface RoundFile {
  readonly path: string
  readonly status: GitLetter
  /** Lines added and removed; null for a binary file, which has no lines. */
  readonly added: number | null
  readonly removed: number | null
  /** A file Git does not track yet, which a commit would leave out. */
  readonly untracked: boolean
  /** A file whose content is not text: its size is what is said of it. */
  readonly binary: { readonly before: number | null; readonly after: number | null } | null
  /** A file a tool writes (a lockfile, a generated client): folded until it is opened. */
  readonly generated: boolean
  /** The content before the build, null for a file it added. */
  readonly before: string | null
  /** The content the round froze, null for a file it deleted. */
  readonly after: string | null
}

/** One repository of the Workspace, as the round froze it. */
export interface RoundRepository {
  /** What the repository is called in the tree: the last part of its folder. */
  readonly name: string
  /** Its folder under the Workspace. */
  readonly path: string
  /** Where it is pushed. */
  readonly remote: string
  readonly branch: string
  /** The commit the round stands on, short. */
  readonly head: string
  /** The commit its worktree was created from, short. */
  readonly base: string
  /** Whether its working tree changed since the round froze it. */
  readonly stale: boolean
  readonly files: readonly RoundFile[]
}

/** Whether one criterion of a story is met, and what shows it. */
export interface CriterionVerdict {
  readonly met: boolean
  /** The test, the check or the screenshot that shows it, in a line. */
  readonly evidence: string
}

/** The round of a build, as the review draws it. */
export interface ReviewRound {
  readonly number: number
  readonly state: RoundState
  readonly specKey: string
  readonly specTitle: string
  readonly repositories: readonly RoundRepository[]
  /** The stories of the frozen revision, which the Spec review goes through one by one. */
  readonly stories: readonly StoryView[]
  /** Per story, by id, a verdict per criterion in the story's order. */
  readonly verdicts: ReadonlyMap<string, readonly CriterionVerdict[]>
}

/** Where the round stands on the three acts of the user. */
export type Standing = 'open' | 'accepted' | 'delivered' | 'closed'

/** How many lines a set of files adds and removes, binaries left out. */
export function countsOf(files: readonly RoundFile[]) {
  let added = 0
  let removed = 0
  for (const file of files) {
    added += file.added ?? 0
    removed += file.removed ?? 0
  }
  return { added, removed }
}

/** Whether some feedback waits for a fix: one not withdrawn that is not a question. */
export function waitsForFix(feedback: readonly RoundFeedback[]): boolean {
  return feedback.some((one) => one.withdrawnAt === null && one.kind !== 'question')
}

/** Whether anything of the round changed on disk since it opened. */
export function isStale(round: ReviewRound): boolean {
  return round.repositories.some((repository) => repository.stale)
}

/** The path a file has in the tree, and the id of its diff: its repository, then its own path. */
export function treePath(repository: string, path: string): string {
  return `${repository}/${path}`
}

/** The lines of an anchor as a reader reads them: `12`, `12–18`. */
export function linesOf(lines: LineRange): string {
  return lines.start === lines.end ? String(lines.start) : `${lines.start}–${lines.end}`
}

/** Where a feedback points, in a few words, or null when it points at nothing. */
export function anchorLabel(anchor: FeedbackAnchor | null, round: ReviewRound): string | null {
  if (anchor === null) return null
  if (anchor.kind === 'code') {
    const lines = anchor.lines === null ? '' : `:${linesOf(anchor.lines)}`
    return `${anchor.repository}/${anchor.path}${lines}`
  }
  const story = round.stories.find((one) => one.id === anchor.storyId)
  if (story === undefined) return null
  return anchor.criterion === null ? story.key : `${story.key} · ${String(anchor.criterion + 1)}`
}

/**
 * The order the tree lists paths in, which the diff follows so that the file under the hand in
 * the tree is the one scrolled to next: at each level folders before files, then by name.
 */
export function inTreeOrder(left: string, right: string): number {
  const a = left.split('/')
  const b = right.split('/')
  for (let index = 0; index < Math.min(a.length, b.length); index += 1) {
    if (a[index] === b[index]) continue
    const aFolder = index < a.length - 1
    const bFolder = index < b.length - 1
    if (aFolder !== bFolder) return aFolder ? -1 : 1
    return (a[index] ?? '').localeCompare(b[index] ?? '')
  }
  return a.length - b.length
}
