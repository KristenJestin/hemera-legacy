/**
 * The app tester's findings (#300): files in a folder of the data folder, and nothing in the
 * database.
 *
 * `<data folder>/tester/findings/<number>-<slug>.md` holds one finding each, a front matter over a
 * Markdown body, and `<data folder>/tester/README.md` is the index, written again after every
 * change. A report is read against the files as they stand: the same kind, the same place and a
 * similar title is one more occurrence of that file, anything else a new file. The folder is the
 * whole of the state: a file the maintainer deletes is a finding gone, and one they edit is read
 * as they left it.
 *
 * Every write goes to a file beside its target and is renamed over it, so a reader never sees half
 * a file, and the reports of every Session go one at a time: two agents reporting the same problem
 * at once are two occurrences of one finding, never two findings or one lost count.
 *
 * What a finding holds is masked here, at the one place it is written: a secret by its shape, a
 * credential of the Workspace by its value, a credential field of the arguments whole (D59-06).
 */

import { mkdir, readFile, readdir, rename, rm, writeFile } from 'node:fs/promises'
import { release, type as systemType } from 'node:os'
import { join } from 'node:path'
import {
  FINDING_KINDS,
  FINDING_SEVERITIES,
  type Finding,
  type FindingContext,
  type FindingHead,
  type ReportedFinding,
  findingFileName,
  findingsIndex,
  matchingFinding,
  newFinding,
  recordOccurrence,
  writeFindingFile,
} from '@hemera/core'
import { Context, Data, Effect, Layer, Semaphore } from 'effect'
import { z } from 'zod'

import { FINDINGS_FOLDER, TESTER_INDEX, testerFolderOf } from '../../main/diagnostic.ts'
import { redactRecord, redactText } from '../classifier/redaction.ts'

/** The folder could not be read or written. */
export class TesterFilesError extends Data.TaggedError('TesterFilesError')<{
  readonly doing: string
  readonly cause: unknown
}> {
  override get message(): string {
    return `The app tester folder refused while ${this.doing}: ${String(this.cause)}`
  }
}

/** A finding as its file holds it, and the name of that file. */
export interface FindingFile extends Finding {
  readonly file: string
}

/** What a report became: a new finding, or one more occurrence of one. */
export interface ReportAnswer {
  readonly number: number
  readonly added: boolean
  readonly occurrences: number
  readonly file: string
  readonly title: string
}

export interface TesterFindingsService {
  /** The folder, `<data folder>/tester`. */
  readonly folder: string
  /** What this Hemera is, as every occurrence records it. */
  readonly hemera: FindingContext['hemera']
  /**
   * Records a report, masked with the Workspace's secrets, against the findings as they stand;
   * then writes the index again.
   */
  readonly report: (
    reported: ReportedFinding,
    context: FindingContext,
    secrets: readonly string[],
  ) => Effect.Effect<ReportAnswer, TesterFilesError>
  /** Every finding of the folder, the latest seen first. */
  readonly list: Effect.Effect<FindingFile[], TesterFilesError>
}

export class TesterFindings extends Context.Service<TesterFindings, TesterFindingsService>()(
  'TesterFindings',
) {}

/** A value of the front matter as a finding reads it: JSON, as written, or a bare word. */
const frontValue = z.union([z.string(), z.number(), z.null(), z.array(z.string())])

const optionalText = z.string().nullable().catch(null)
const text = z.string().catch('')

/** The front matter a finding needs to be one; the rest reads as empty when a hand removed it. */
const headSchema = z.object({
  number: z.number().int().min(1),
  title: z.string().min(1),
  kind: z.enum(FINDING_KINDS),
  place: text,
  severity: z.enum(FINDING_SEVERITIES),
  occurrences: z.number().int().min(1).catch(1),
  first_seen: text,
  last_seen: text,
  sessions: z.array(z.string()).catch([]),
  version: text,
  channel: text,
  commit: optionalText,
  os: text,
  platform: text,
  agent: text,
  agent_version: optionalText,
  model: optionalText,
  effort: optionalText,
  mode: optionalText,
  auto: text,
  project: text,
  project_id: text,
  workspace: text,
  workspace_path: text,
})

/** One value of the front matter: JSON when it reads as JSON, the text itself otherwise. */
function frontValueOf(written: string): z.infer<typeof frontValue> {
  try {
    // SAFETY: JSON.parse is validated by the schema of a front matter value on the next line.
    const read = frontValue.safeParse(JSON.parse(written))
    return read.success ? read.data : written
  } catch {
    return written
  }
}

/** A finding read back from its file, or null for a file that is not one. */
export function readFindingFile(written: string): Finding | null {
  const lines = written.replace(/\r\n/g, '\n')
  if (!lines.startsWith('---\n')) return null
  const end = lines.indexOf('\n---\n', 3)
  if (end < 0) return null
  const fields = Object.fromEntries(
    lines
      .slice(4, end)
      .split('\n')
      .flatMap((line) => {
        const colon = line.indexOf(':')
        return colon <= 0
          ? []
          : [[line.slice(0, colon).trim(), frontValueOf(line.slice(colon + 1).trim())] as const]
      }),
  )
  const read = headSchema.safeParse(fields)
  if (!read.success) return null
  const front = read.data
  const head: FindingHead = {
    number: front.number,
    title: front.title,
    kind: front.kind,
    place: front.place,
    severity: front.severity,
    occurrences: front.occurrences,
    firstSeen: front.first_seen,
    lastSeen: front.last_seen,
    sessions: front.sessions,
    version: front.version,
    channel: front.channel,
    commit: front.commit,
    os: front.os,
    platform: front.platform,
    agent: front.agent,
    agentVersion: front.agent_version,
    model: front.model,
    effort: front.effort,
    mode: front.mode,
    auto: front.auto,
    project: front.project,
    projectId: front.project_id,
    workspace: front.workspace,
    workspacePath: front.workspace_path,
  }
  return { head, body: lines.slice(end + 5) }
}

/** A report as it is written: every text masked by its shape and by the Workspace's secrets. */
export function maskedReport(
  reported: ReportedFinding,
  context: FindingContext,
  secrets: readonly string[],
): { reported: ReportedFinding; context: FindingContext } {
  const mask = (value: string) => redactText(value, secrets)
  const maybe = (value: string | null) => (value === null ? null : mask(value))
  return {
    reported: {
      ...reported,
      title: mask(reported.title),
      place: mask(reported.place),
      trying: mask(reported.trying),
      happened: mask(reported.happened),
      expected: mask(reported.expected),
      steps: mask(reported.steps),
      files: reported.files.map(mask),
      callId: maybe(reported.callId),
      error: maybe(reported.error),
      code: maybe(reported.code),
    },
    context: {
      ...context,
      session: { ...context.session, title: mask(context.session.title) },
      call:
        context.call === null
          ? null
          : {
              ...context.call,
              summary: maybe(context.call.summary),
              // A credential field is masked whole, then every value by its shape and the secrets.
              arguments:
                context.call.arguments === null ? null : mask(redactRecord(context.call.arguments)),
            },
    },
  }
}

/** What the engine that writes the findings is: its data folder, its version and its channel. */
export interface TesterIdentity {
  readonly directory: string
  readonly version: string
  readonly channel: string
}

/**
 * The commit a version was described from, when it was: a development run is `git describe`'s
 * `0.5.0-dev.3-g1a2b3c4`; a packaged one carries no commit.
 */
export function commitOf(version: string): string | null {
  return /-g([0-9a-f]{7,40})$/.exec(version)?.[1] ?? null
}

/** Where a finding's number is read from its file's name, whatever its front matter says. */
const NUMBERED = /^(\d+)-.*\.md$/

/**
 * The findings of a folder, on files, written one report at a time.
 *
 * `changed` is told after every write, which is how the Developer section of an open window reads
 * the folder again.
 */
export function testerFindingsLayer(
  identity: TesterIdentity,
  changed: () => void = () => undefined,
): Layer.Layer<TesterFindings> {
  return Layer.sync(TesterFindings, () => {
    const folder = testerFolderOf(identity.directory)
    const findings = join(folder, FINDINGS_FOLDER)
    const writing = Semaphore.makeUnsafe(1)

    const attempt = <A>(doing: string, run: () => Promise<A>) =>
      Effect.tryPromise({ try: run, catch: (cause) => new TesterFilesError({ doing, cause }) })

    /** A file replaced whole: written beside it, then renamed over it. */
    const replaced = (path: string, content: string) =>
      attempt(`writing ${path}`, async () => {
        const beside = `${path}.${crypto.randomUUID()}.tmp`
        try {
          await writeFile(beside, content, 'utf8')
          await rename(beside, path)
        } catch (cause) {
          await rm(beside, { force: true })
          throw cause
        }
      })

    /** The names of the findings' files; none before the first report. */
    const names = attempt('listing the findings', () =>
      readdir(findings).then(
        (all) => all.filter((name) => NUMBERED.test(name)).toSorted(),
        (cause: unknown) => {
          if (cause instanceof Error && 'code' in cause && cause.code === 'ENOENT') return []
          throw cause
        },
      ),
    )

    /** Every finding of these files; a file that does not read as one is left out, not lost. */
    const readAll = (files: readonly string[]) =>
      Effect.gen(function* () {
        const read: FindingFile[] = []
        for (const file of files) {
          const written = yield* attempt(`reading ${file}`, () =>
            readFile(join(findings, file), 'utf8'),
          )
          const finding = readFindingFile(written)
          if (finding !== null) read.push({ file, ...finding })
        }
        return read
      })

    /** The number the next finding takes: one past the highest a file is named with. */
    const nextNumber = (files: readonly string[]) =>
      1 + Math.max(0, ...files.map((file) => Number(NUMBERED.exec(file)?.[1] ?? 0)))

    const report = (
      reported: ReportedFinding,
      context: FindingContext,
      secrets: readonly string[],
    ) =>
      writing.withPermits(1)(
        Effect.gen(function* () {
          const clean = maskedReport(reported, context, secrets)
          yield* attempt('making the findings folder', () => mkdir(findings, { recursive: true }))
          const files = yield* names
          const existing = yield* readAll(files)
          const found = matchingFinding(
            existing.map((one) => ({ ...one.head, one })),
            clean.reported,
          )
          // A new finding's number is read from every name, so a file that no longer reads as a
          // finding never has its number taken again.
          const number = nextNumber(files)
          const final: FindingFile =
            found === null
              ? {
                  file: findingFileName(number, clean.reported.title),
                  ...newFinding(number, clean.reported, clean.context),
                }
              : {
                  file: found.one.file,
                  ...recordOccurrence(found.one, clean.reported, clean.context),
                }
          yield* replaced(join(findings, final.file), writeFindingFile(final.head, final.body))
          const all = [...existing.filter((one) => one.file !== final.file), final]
          yield* replaced(
            join(folder, TESTER_INDEX),
            findingsIndex(all.map(({ head, file }) => ({ head, file }))),
          )
          changed()
          return {
            number: final.head.number,
            added: found !== null,
            occurrences: final.head.occurrences,
            file: final.file,
            title: final.head.title,
          }
        }),
      )

    return {
      folder,
      hemera: {
        version: identity.version,
        channel: identity.channel,
        commit: commitOf(identity.version),
        os: `${systemType()} ${release()}`,
        platform: `${process.platform}-${process.arch}`,
      },
      report,
      list: names.pipe(
        Effect.flatMap(readAll),
        Effect.map((all) =>
          all.toSorted((one, other) => (one.head.lastSeen < other.head.lastSeen ? 1 : -1)),
        ),
      ),
    } satisfies TesterFindingsService
  })
}
