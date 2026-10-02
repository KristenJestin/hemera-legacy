/**
 * What the review round is handed to draw (exploration of issue #23, lot 6a).
 *
 * A round is one checkpoint of the build's result: per repository, the commit it stands on, the
 * commits of the build, the files it changed and the files Git does not track yet; the evidence
 * (the checks that passed, what the reviewers found and the build already fixed); and the
 * documentation that changed with it. Without Git there is no repository: the folder, the checks
 * and the documentation are all that is said, because they are all that is known.
 *
 * The diff and the comments on lines are left for after 1.0: a file here is its name and its
 * counts, never its content.
 */

/** Git's letter for a change: added, modified, deleted, renamed. */
export type ChangeStatus = 'A' | 'M' | 'D' | 'R'

/** One file the build changed in a repository, by name and counts. */
export interface ChangedFile {
  path: string
  status: ChangeStatus
  /** Lines added and removed; null for a binary file. */
  added: number | null
  removed: number | null
}

/** A file changed outside Hemera since the round was taken: a terminal, an editor. */
export interface StaleFile {
  path: string
  /** When Hemera saw it change. */
  at: string
}

export interface Commit {
  /** The short hash. */
  sha: string
  subject: string
}

/** The result in one repository of the Workspace, as the round froze it. */
export interface RepositoryResult {
  /** The repository's path under the Workspace. */
  path: string
  branch: string
  /** The commit the round stands on. */
  head: string
  commits: readonly Commit[]
  files: readonly ChangedFile[]
  /** Files Git does not track, which a commit would leave out. */
  untracked: readonly string[]
  /** What changed outside Hemera since the round was taken. */
  stale: readonly StaleFile[]
}

/** A check of the build that passed on the result. */
export interface PassedCheck {
  id: string
  name: string
  /** Where it ran: `''` for the Workspace root, or a repository's path. */
  place: string
  line: string
}

/** What a reviewer found, and the commit that fixed it before the round opened. */
export interface FixedFinding {
  id: string
  /** The reviewer's speciality: contract, tests, security… */
  reviewer: string
  text: string
  repository: string
  fixedIn: string
}

/** One recipe of the documentation, and what it changed, or why it changed nothing. */
export interface DocRecipe {
  id: string
  recipe: string
  files: readonly { repository: string; path: string }[]
  /** Why nothing changed, when nothing did: the agent's own words. */
  unchanged: string | null
}

/** The result the round presents. */
export interface ReviewResult {
  specKey: string
  specTitle: string
  /** 1 for the first round, 2 after the first fix pass, and so on. */
  round: number
  /** Whether the Project has a usable Git history. */
  git: boolean
  /** The Workspace's folder, which is what a Project without Git is known by. */
  folder: string
  repositories: readonly RepositoryResult[]
  checks: readonly PassedCheck[]
  /** Empty without Git: no automatic code review ran. */
  findings: readonly FixedFinding[]
  docs: readonly DocRecipe[]
}

/** A screenshot attached to a feedback, kept in the Profile rather than in the Workspace. */
export interface Shot {
  id: string
  name: string
  /** What the image is drawn from. */
  src: string
}

/** One feedback of the user, without any anchor. */
export interface Feedback {
  id: string
  text: string
  shots: readonly Shot[]
  /** A question is answered, and never becomes a task. */
  question: boolean
  /** The main agent's answer to a question, once it gave one. */
  answer: string | null
}

/** One coherent batch of fixes the main agent made of the feedback, with its sources. */
export interface FixGroup {
  id: string
  title: string
  /** The feedback it comes from, by id. */
  sources: readonly string[]
}

/** The three human acts, in the order they come. */
export type Gesture = 'accept' | 'deliver' | 'close'

/** Where the round stands on the three acts: none yet, accepted, delivered, closed. */
export type Standing = 'open' | 'accepted' | 'delivered' | 'closed'

/** How the Project runs one step of its delivery. */
export type DeliveryMode = 'automatic' | 'confirm' | 'off'

/** One step of the Project's delivery rules. */
export interface DeliveryStep {
  id: string
  label: string
  mode: DeliveryMode
}

/** How many lines a set of changes adds and removes. */
export interface LineCounts {
  added: number
  removed: number
}

/** How many lines a repository's changes add and remove, binaries left out. */
export function countsOf(files: readonly ChangedFile[]): LineCounts {
  let added = 0
  let removed = 0
  for (const file of files) {
    added += file.added ?? 0
    removed += file.removed ?? 0
  }
  return { added, removed }
}

/** Whether anything of the result changed outside Hemera since the round was taken. */
export function staleOf(result: ReviewResult): StaleFile[] {
  return result.repositories.flatMap((repository) =>
    repository.stale.map((file) => ({ ...file, path: `${repository.path}/${file.path}` })),
  )
}

/** What the fix pass would take: every feedback that is not a question. */
export function tasksOf(feedback: readonly Feedback[]): Feedback[] {
  return feedback.filter((one) => !one.question)
}

/** Whether a feedback reads as a question: the main agent's own reading, played here by its mark. */
export function readsAsQuestion(text: string): boolean {
  return text.trim().endsWith('?')
}
