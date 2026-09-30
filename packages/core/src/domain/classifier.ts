/**
 * The version recorded beside every Hemera Auto decision (D59-03). Version 2 (#298): the judge
 * never refuses, and its thresholds follow the strictness the user chose.
 */
export const CLASSIFIER_POLICY_VERSION = '2'

export type ClassifierVerdict = 'allow' | 'ask' | 'deny'
/** What the judge may answer: only the local rules refuse (#298). */
export type JudgeVerdict = Exclude<ClassifierVerdict, 'deny'>

/** How often Hemera Auto asks when Jev judged a call, from most to least often (#298). */
export const CLASSIFIER_STRICTNESS_LEVELS = ['careful', 'normal', 'permissive'] as const
export type ClassifierStrictness = (typeof CLASSIFIER_STRICTNESS_LEVELS)[number]
export const DEFAULT_CLASSIFIER_STRICTNESS: ClassifierStrictness = 'normal'
export type LocalVerdict = 'allow' | 'deny' | 'defer'

/** A command after the runner has selected its platform line and resolved its invocation. */
export interface ResolvedCommand {
  /** The first word of the line, as written. */
  readonly program: string
  /** The words after it, as the runner splits them: no shell reads them. */
  readonly args: readonly string[]
  /** True when the line goes through `cmd.exe` (a Windows shim): then nothing is allowed here. */
  readonly shell: boolean
  readonly platform: string
  /** The file the runner starts for `program`, found along the `PATH`; null when none is. */
  readonly resolved: string | null
}

/** Only a resolved, contained destination may earn a local allow. */
export interface LocalAction {
  readonly tool: string
  /** For a command: its folder and every path it names, resolved by the caller. */
  readonly target: 'inside' | 'outside' | 'unknown'
  readonly command?: ResolvedCommand
}

/** The tools that only read inside the Workspace, settled without the evaluator. */
const READ_ONLY_TOOLS = new Set(['fs_read', 'fs_list', 'search'])

/** The tools that read or change files, or start a process: the only ones Hemera Auto judges. */
const JUDGED_TOOLS = new Set([
  'fs_read',
  'fs_list',
  'search',
  'fs_write',
  'fs_edit',
  'commands_run',
])

/**
 * Whether Hemera Auto judges a call of this tool. Hemera's own workflow — a task report, a
 * proposal the human decides on, a Spec edit under its write right, a stop of the Session's own
 * run, a read of its state — already has its interaction and its guards: judging it again would
 * ask twice, or stall a build on every report.
 */
export function judgedByClassifier(tool: string): boolean {
  return JUDGED_TOOLS.has(tool)
}

/** What deletes, on POSIX, in `cmd.exe` and in PowerShell, by its own name or an alias. */
const DELETERS = new Set([
  'rm',
  'unlink',
  'rmdir',
  'rd',
  'del',
  'erase',
  'remove-item',
  'ri',
  'shred',
])
const LISTERS = new Set(['ls', 'dir'])
/** `ls` flags that only change how a listing is shown. */
const LISTING_FLAGS = /^-[aAlhR1tSrdFGinp]+$/
/** A plain relative path: no expansion, no operator, no way up. */
const PLAIN_PATH = /^[A-Za-z0-9._@+/\\-]+$/

/** A program's name without its folder, its case on Windows, or an executable extension. */
function programName(program: string): string {
  const base = program.replaceAll('\\', '/').split('/').at(-1) ?? ''
  return base.toLowerCase().replace(/\.(?:exe|cmd|bat|com)$/, '')
}

/** Whether a word names `.git` or anything under it, however it is spelled. */
function namesGit(word: string): boolean {
  return word.replaceAll('\\', '/').toLowerCase().split('/').includes('.git')
}

/**
 * The words of a command, a word holding several (the string after `sh -c`, `cmd /c` or
 * `-Command`) split again on spaces, quotes and operators. Only to find a deletion wherever it
 * hides: this reads no shell grammar and allows nothing.
 */
function wordsWithin(words: readonly string[]): string[] {
  return words.flatMap((word) => word.split(/[\s"'`;&|()]+/).filter((part) => part.length > 0))
}

/**
 * Deliberately narrow: an unfamiliar call goes to the evaluator. This is not a shell parser;
 * the caller supplies the invocation the runner will execute, including whether it uses a shell.
 */
export function localClassifierVerdict(action: LocalAction): LocalVerdict {
  if (action.tool === 'commands_run') {
    const command = action.command
    if (command === undefined) return 'defer'
    // A deletion of the repository is refused wherever it hides: behind a wrapper (`portless`,
    // `sudo`), inside a shell's string, in any spelling of the path or of the program.
    const words = wordsWithin([command.program, ...command.args])
    const deletes = words.some(
      (word, at) => DELETERS.has(programName(word)) && words.slice(at + 1).some(namesGit),
    )
    if (deletes) return 'deny'
    if (action.target !== 'inside' || command.shell || command.resolved === null) return 'defer'
    const name = programName(command.program)
    const written = command.program.replaceAll('\\', '/')
    if (
      LISTERS.has(name) &&
      programName(command.resolved) === name &&
      // A bare name found on the PATH, or the very file it resolved to: never `./ls`.
      (!written.includes('/') || written === command.resolved.replaceAll('\\', '/')) &&
      command.args.every(
        (arg) =>
          LISTING_FLAGS.test(arg) ||
          (PLAIN_PATH.test(arg) &&
            !arg.startsWith('-') &&
            !arg.startsWith('/') &&
            !arg.startsWith('\\') &&
            !/^[A-Za-z]:/.test(arg) &&
            !arg.replaceAll('\\', '/').split('/').includes('..')),
      )
    ) {
      return 'allow'
    }
    return 'defer'
  }

  if (action.target !== 'inside') return 'defer'
  return READ_ONLY_TOOLS.has(action.tool) ? 'allow' : 'defer'
}

/**
 * The Jev thresholds of each level (#298). Risk is Jev's 0–3 scale (read-only, limited
 * reversible change, significant change, destructive); approval and user-requested are 0–1.
 *
 * - `alwaysAsks`: from this risk, the call asks even when the user asked for it;
 * - `risk` and `approval`: from either, the call asks unless the user clearly asked for it.
 */
const STRICTNESS: Record<
  ClassifierStrictness,
  { readonly alwaysAsks: number; readonly risk: number; readonly approval: number }
> = {
  careful: { alwaysAsks: 1.5, risk: 0.75, approval: 0.5 },
  normal: { alwaysAsks: 2.5, risk: 1.5, approval: 0.75 },
  permissive: {
    alwaysAsks: Number.POSITIVE_INFINITY,
    risk: 2.5,
    approval: Number.POSITIVE_INFINITY,
  },
}

/** How sure Jev must be that the user asked for this exact call before it lifts a question. */
const USER_REQUESTED = 0.85

/**
 * The verdict from Jev's scores at a strictness level; all structural validation happens
 * before calling this (D59-03). It never refuses: a call Jev finds risky asks the human, and only
 * the local rules refuse (#298).
 */
export function classifierVerdictFromScores(
  scores: {
    readonly risk: number
    readonly approval: number
    readonly userRequested: number
    readonly hasHumanContext: boolean
  },
  strictness: ClassifierStrictness,
): JudgeVerdict {
  const { risk, approval, userRequested, hasHumanContext } = scores
  if (
    !Number.isFinite(risk) ||
    risk < 0 ||
    risk > 3 ||
    !Number.isFinite(approval) ||
    approval < 0 ||
    approval > 1 ||
    !Number.isFinite(userRequested) ||
    userRequested < 0 ||
    userRequested > 1
  ) {
    return 'ask'
  }
  const level = STRICTNESS[strictness]
  if (risk >= level.alwaysAsks) return 'ask'
  if (risk >= level.risk || approval >= level.approval) {
    return hasHumanContext && userRequested >= USER_REQUESTED ? 'allow' : 'ask'
  }
  return 'allow'
}
