/**
 * The tools Hemera lends an agent, and the one door every call goes through (D6-03 to D6-05).
 *
 * Every suite here is named after the scenario of the issue's Spec section that it covers, and
 * none of it is mocked: the engine is the real one — the Projects, the Sessions, the commands and
 * the catalogue over a database in a temporary folder — and the two things that are scripted are
 * the human (a question about a path outside the root is answered by this suite, not by a window)
 * and nothing else. The commands run for real, as children of the machine running the tests.
 *
 * What is read is what the agent would read: the answer of the call, the thread the window draws,
 * and the Journal line. A refusal is asserted as an answer and not as a failure, because a tool
 * that refuses is a tool that answered.
 */

import {
  existsSync,
  linkSync,
  mkdirSync,
  readFileSync,
  realpathSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vite-plus/test'
import { Deferred, Effect, Fiber, Layer } from 'effect'
import type { Scope } from 'effect'
import { eq } from 'drizzle-orm'
import { z } from 'zod'

import { READ_PAGE_BYTES, SEARCH_MATCH_LIMIT, TOOL_NAMES, type ToolName } from '@hemera/core'

import {
  StderrSink,
  hostProcessesLayer,
  processSupervisorLayer,
} from '#engine/agents/supervisor.ts'
import { heldWordsLayer } from '#engine/agents/held.ts'
import { SessionModes, type StandingMode, sessionModesLayer } from '#engine/agents/modes.ts'
import { NoNotices } from '#engine/agents/notices.ts'
import { hostLookup } from '#engine/commands/line.ts'
import { Commands, ProgramLookup, commandsLayer } from '#engine/commands/service.ts'
import { ClassifierSettings, classifierSettingsLayer } from '#engine/classifier/settings.ts'
import {
  JEV_MODEL,
  JevTransportPort,
  type JevTransport,
  typeSafeTransport,
} from '#engine/classifier/jev.ts'
import { Journal, journalLayer } from '#engine/journal.ts'
import { openProfile } from '#engine/migrate.ts'
import { Projects, projectsLayer } from '#engine/projects.ts'
import { Sessions, sessionsLayer } from '#engine/sessions.ts'
import { domainEventsLayer } from '#engine/domain-events.ts'
import { NoSpecNotices } from '#engine/specs/notices.ts'
import { specsLayer } from '#engine/specs/specs.ts'
import { Database, databaseLayer } from '#engine/storage/database.ts'
import type { SqliteClient } from '#engine/storage/database.ts'
import { sessions as sessionRows } from '#engine/storage/schema.ts'
import { ToolCatalogue, toolCatalogueLayer } from '#engine/tools/catalogue.ts'
import type { ToolArguments } from '#engine/tools/arguments.ts'
import type { ToolOutcome } from '#engine/tools/catalogue.ts'
import { ToolAccess, toolAccessLayer } from '#engine/tools/access.ts'
import { approvalsLayer } from '#engine/tools/approvals.ts'
import { ToolPermissions } from '#engine/tools/permissions.ts'
import type { OutsideAnswer, OutsideRequest } from '#engine/tools/permissions.ts'
import { Variables, variablesLayer } from '#engine/workspaces/variables.ts'
import { setupPlaces } from './application.ts'

import { answersAQuestion } from '#renderer/agent-store.ts'
import { waitingAs } from '#renderer/notices.ts'

import { idleBuilds } from './build-harness.ts'

const SHIPPED = join(import.meta.dirname, '..', 'drizzle')

/** The version the shipped migrations are opened with, as the engine opens them. */
const VERSION = '0.4.0'

/** What the engine wrote to its diagnostic log in the current test. */
const diagnostics: string[] = []

let folder: string
let root: string

beforeEach(() => {
  diagnostics.length = 0
  folder = join(tmpdir(), `hemera-tools-${String(Date.now())}-${String(Math.random())}`)
  mkdirSync(join(folder, 'workspace'), { recursive: true })
  // The Workspace as the disk spells it, which is how a Project keeps its root.
  folder = realpathSync.native(folder)
  root = join(folder, 'workspace')
})

afterEach(() => {
  rmSync(folder, { recursive: true, force: true })
})

/** The human, scripted: what they answer to the next question, and what they were asked. */
interface Human {
  readonly service: {
    readonly askOutside: (asked: OutsideRequest) => Effect.Effect<OutsideAnswer>
    readonly answer: () => Effect.Effect<boolean>
    readonly withdrawn: () => Effect.Effect<void>
  }
  readonly asked: OutsideRequest[]
}

/**
 * A human who answers in order, and refuses once they have run out of answers.
 *
 * The questions are kept rather than thrown away: "a permission block appears in the thread" is
 * asserted on what was asked, and a suite that let a tool through without asking would have an
 * empty list to show for it.
 */
function humanSaying(...answers: readonly OutsideAnswer[]): Human {
  const asked: OutsideRequest[] = []
  let next = 0
  return {
    asked,
    service: {
      askOutside: (question) =>
        Effect.sync(() => {
          asked.push(question)
          const answer = answers[next] ?? 'refused'
          next += 1
          return answer
        }),
      answer: () => Effect.succeed(false),
      // This human answers where they are asked: nothing here is left standing for a window.
      withdrawn: () => Effect.void,
    },
  }
}

/** Everything a program of these suites may ask: the engine, and nothing of the window. */
type Engine =
  | ClassifierSettings
  | Projects
  | Sessions
  | Commands
  | Journal
  | ToolCatalogue
  | ToolAccess
  | ToolPermissions
  | SessionModes
  | Database
  | SqliteClient
  | Variables

/**
 * One run of this engine, over one database in the suite's folder.
 *
 * The same composition the engine process builds, minus what needs a window: the commands are on
 * the real supervisor, so a run of a command is a real process of this machine, and the human is
 * the layer this suite hands over rather than a default that would let a tool through.
 */
function engine(
  human: Human,
  transport: JevTransport = typeSafeTransport,
  lookup: Layer.Layer<never> = Layer.empty,
) {
  const sink = Layer.succeed(StderrSink, {
    write: (line: string) => Effect.sync(() => void diagnostics.push(line)),
  })
  const processes = processSupervisorLayer.pipe(
    Layer.provideMerge(Layer.mergeAll(hostProcessesLayer, sink)),
  )
  const services: Layer.Layer<Engine> = toolCatalogueLayer.pipe(
    Layer.provideMerge(classifierSettingsLayer),
    // No build runs here: a Session that is none passes through the builds untouched.
    Layer.provide(idleBuilds),
    Layer.provideMerge(journalLayer),
    Layer.provideMerge(toolAccessLayer),
    Layer.provideMerge(Layer.succeed(ToolPermissions, human.service)),
    Layer.provide(approvalsLayer),
    Layer.provideMerge(commandsLayer),
    Layer.provideMerge(variablesLayer),
    Layer.provide(setupPlaces(folder)),
    Layer.provideMerge(
      Layer.mergeAll(
        projectsLayer,
        sessionsLayer,
        specsLayer.pipe(Layer.provide(NoSpecNotices)),
      ).pipe(
        Layer.provideMerge(
          Layer.mergeAll(databaseLayer(join(folder, 'hemera.sqlite')), domainEventsLayer),
        ),
      ),
    ),
    Layer.provide(processes),
    Layer.provide(heldWordsLayer),
    // No agent runs here: a suite that needs a mode hands the reader over itself.
    Layer.provideMerge(sessionModesLayer),
    // Nobody is watching: these suites read the thread and the runs, not what was pushed.
    Layer.provide(NoNotices),
    Layer.provide(Layer.succeed(JevTransportPort, transport)),
    Layer.provide(lookup),
  )
  return <A, E>(program: Effect.Effect<A, E, Engine | Scope.Scope>): Promise<A> =>
    Effect.runPromise(
      Effect.scoped(
        Effect.provide(
          Effect.gen(function* () {
            yield* openProfile(folder, SHIPPED, VERSION)
            return yield* program
          }),
          services,
        ),
      ),
    )
}

/** A Project on the suite's Workspace and one Session of it, as the window would make them. */
const opened = Effect.gen(function* () {
  const projects = yield* Projects
  const sessions = yield* Sessions
  const project = yield* projects.create({ name: 'Atlas', tone: 'primary', mainPath: root })
  const session = yield* sessions.create(project.id, 'claude')
  // An agent holds the Session's token, as it does once `session/new` has answered.
  const access = yield* ToolAccess
  yield* access.granted(session.id, 'agent-1', 'free')
  return { projectId: project.id, sessionId: session.id }
})

/** The key an agent sent among its arguments, read as the server reads it: a string, or none. */
const keySent = (sent: ToolArguments) => {
  const read = z.object({ key: z.string().min(1) }).safeParse(sent)
  return read.success ? read.data.key : null
}

/** One call of one tool, as the server hands it over once the token has been read. */
const calling = (asked: {
  readonly sessionId: string
  readonly tool: string
  readonly arguments: ToolArguments
  readonly key?: string | undefined
  readonly offered?: readonly ToolName[] | undefined
}) =>
  Effect.gen(function* () {
    const catalogue = yield* ToolCatalogue
    const outcome: ToolOutcome = yield* catalogue.call({
      sessionId: asked.sessionId,
      tool: asked.tool,
      // The key travels in the arguments, as an agent sends it, and beside them, as the server
      // hands it over once it has read it.
      arguments: asked.key === undefined ? asked.arguments : { ...asked.arguments, key: asked.key },
      key: asked.key ?? keySent(asked.arguments),
      offered: asked.offered ?? TOOL_NAMES,
      caller: 'a1b2c3d4e5f6',
    })
    return outcome
  })

/** The entries of a Session's thread, oldest first. */
const threadEntries = (sessionId: string) =>
  Effect.gen(function* () {
    const sessions = yield* Sessions
    const page = yield* sessions.read(sessionId)
    return page.entries
  })

/** The Journal lines of a Project, newest first, as the bell reads them. */
const journalLines = (projectId: string) =>
  Effect.gen(function* () {
    const journal = yield* Journal
    const read = yield* journal.read({ projectId })
    return read.entries
  })

/** A file inside the root, written by the suite rather than by a tool. */
const fileInRoot = (name: string, content: string) => {
  const path = join(root, name)
  mkdirSync(join(path, '..'), { recursive: true })
  writeFileSync(path, content)
  return path
}

function jevResponse(risk: number, approval = 0.2, userRequested = 0.9): Response {
  return Response.json({
    model: JEV_MODEL,
    answers: {
      risk: {
        type: 'score',
        score: risk,
        confidence: 0.9,
        legend: { '0': 'read', '1': 'limited', '2': 'significant', '3': 'destructive' },
        probabilities: { '0': 0.1, '1': 0.9, '2': 0, '3': 0 },
      },
      approval: { type: 'noul', noul: approval },
      user_requested: { type: 'noul', noul: userRequested },
    },
  })
}

describe('every tool name is one the model APIs accept', () => {
  it('is letters, digits, underscores or hyphens, 64 characters at most, and no dot', () => {
    // The Anthropic and OpenAI APIs refuse a tool name outside this pattern, and an agent hands
    // the model `mcp__hemera__<name>` or `hemera_<name>`: a dot would reach it and be refused.
    for (const name of TOOL_NAMES) expect(name).toMatch(/^[a-zA-Z0-9_-]{1,64}$/)
  })
})

describe('A read inside the Workspace goes through on its own', () => {
  it('returns the content, and the call is an entry of the thread and a line of the Journal', async () => {
    fileInRoot('notes.md', 'the answer is 42\n')
    const human = humanSaying()
    const seen = await engine(human)(
      Effect.gen(function* () {
        const session = yield* opened
        const answer = yield* calling({
          sessionId: session.sessionId,
          tool: 'fs_read',
          arguments: { path: 'notes.md' },
        })
        return {
          answer,
          entries: yield* threadEntries(session.sessionId),
          lines: yield* journalLines(session.projectId),
        }
      }),
    )

    expect(seen.answer.ok).toBe(true)
    expect(seen.answer.text).toContain('the answer is 42')
    expect(seen.answer.paths).toEqual(['notes.md'])

    const calls = seen.entries.filter((entry) => entry.kind === 'hemera_tool_call')
    expect(calls).toHaveLength(1)
    expect(calls[0]?.body).toContain('notes.md')

    const written = seen.lines.filter((line) => line.type.startsWith('tool.'))
    expect(written.map((line) => line.type)).toEqual(['tool.completed'])
    // Nothing was asked of the human: a read inside the root is what Hemera promises.
    expect(human.asked).toHaveLength(0)
  })
})

describe('Hemera Auto classifies one admitted tool call before execution', () => {
  it('allows an inside read locally and asks once for an inside write without a Jev key', async () => {
    fileInRoot('read-me.md', 'readable')
    const human = humanSaying('allowed')
    const result = await engine(human)(
      Effect.gen(function* () {
        const session = yield* opened
        yield* (yield* ClassifierSettings).select('hemera-auto')
        yield* (yield* ClassifierSettings).select('hemera-auto')
        const read = yield* calling({
          sessionId: session.sessionId,
          tool: 'fs_read',
          arguments: { path: 'read-me.md' },
        })
        const write = yield* calling({
          sessionId: session.sessionId,
          tool: 'fs_write',
          arguments: { path: 'written.md', content: 'written once', key: 'auto-write' },
        })
        return {
          read,
          write,
          lines: yield* journalLines(session.projectId),
          entries: yield* threadEntries(session.sessionId),
        }
      }),
    )
    expect(result.read.state).toBe('completed')
    expect(result.write.state).toBe('completed')
    expect(human.asked).toHaveLength(1)
    expect(readFileSync(join(root, 'written.md'), 'utf8')).toBe('written once')
    expect(result.lines.filter((line) => line.type === 'classifier.decision')).toHaveLength(2)
    const userDecisions = result.lines.filter((line) => line.type === 'tool.permission_decision')
    expect(userDecisions).toHaveLength(1)
    expect(userDecisions[0]).toMatchObject({
      author: 'human',
      payload: { tool: 'fs_write', answer: 'allowed' },
    })
    expect(userDecisions[0]?.payload.classifier).toBe(
      result.lines.find(
        (line) => line.type === 'classifier.decision' && line.payload.verdict === 'ask',
      )?.payload.correlationId,
    )
    expect(result.lines.filter((line) => line.type === 'classifier.mode_changed')).toMatchObject([
      {
        entityKind: 'profile',
        author: 'human',
        payload: { from: 'agent-default', to: 'hemera-auto' },
      },
    ])
    // The read leaves no record, as under Agent default; the write Hemera Auto could not
    // judge asked the human once, through the permission block the notices list.
    expect(result.entries.filter((entry) => entry.kind === 'permission_request')).toHaveLength(1)
    expect(
      result.entries
        .filter((entry) => entry.kind === 'permission_decision')
        .map((entry) => entry.state),
    ).toEqual(['completed'])
    // The human's answer is one of Hemera Auto's decisions too: it says who decided, what the
    // classifier had settled before asking, and the decision it answers (#294).
    const answered = result.entries.find((entry) => entry.kind === 'permission_decision')
    expect(JSON.parse(answered?.payload ?? '{}')).toMatchObject({
      tool: 'fs_write',
      answer: 'allowed',
      by: 'human',
      judged: 'nobody',
      classifier: userDecisions[0]?.payload.classifier,
    })
  })

  it('refuses a destructive one-off before asking or starting it', async () => {
    const human = humanSaying('allowed')
    const result = await engine(human)(
      Effect.gen(function* () {
        const session = yield* opened
        yield* (yield* ClassifierSettings).select('hemera-auto')
        return yield* calling({
          sessionId: session.sessionId,
          tool: 'commands_run',
          arguments: { line: 'rm -rf .git', key: 'destructive' },
        })
      }),
    )
    expect(result.state).toBe('refused')
    expect(human.asked).toHaveLength(0)
  })

  it('sends a bounded action to fake Jev and executes only its valid allow', async () => {
    const human = humanSaying()
    const sent: string[] = []
    const transport: JevTransport = {
      send: async (body, key) => {
        sent.push(body)
        expect(key).toBe('private-key')
        return jevResponse(1)
      },
    }
    const result = await engine(
      human,
      transport,
    )(
      Effect.gen(function* () {
        const session = yield* opened
        const settings = yield* ClassifierSettings
        yield* settings.replaceKey('ciphertext', 'private-key')
        yield* settings.setConsent(true)
        yield* settings.select('hemera-auto')
        const answer = yield* calling({
          sessionId: session.sessionId,
          tool: 'fs_write',
          arguments: { path: 'jev.md', content: 'safe content', key: 'jev-write' },
        })
        return {
          answer,
          lines: yield* journalLines(session.projectId),
          entries: yield* threadEntries(session.sessionId),
        }
      }),
    )
    expect(result.answer.state).toBe('completed')
    expect(human.asked).toHaveLength(0)
    expect(sent).toHaveLength(1)
    expect(sent[0]).toContain('jev.md')
    expect(sent[0]).not.toContain('private-key')
    expect(readFileSync(join(root, 'jev.md'), 'utf8')).toBe('safe content')
    expect(result.lines.find((line) => line.type === 'classifier.decision')?.payload).toMatchObject(
      {
        risk: 1,
        approval: 0.2,
        userRequested: 0.9,
        model: JEV_MODEL,
      },
    )
    // One quiet record, as a mode that runs leaves one, with who decided and on what.
    const record = result.entries.find((entry) => entry.kind === 'permission_decision')
    expect(record?.body).toBe('ran without asking, Hemera Auto mode')
    expect(JSON.parse(record?.payload ?? '{}')).toMatchObject({
      tool: 'fs_write',
      unasked: true,
      answer: 'allowed',
      mode: 'Hemera Auto',
      by: 'judge',
      model: JEV_MODEL,
      scores: { risk: 1, approval: 0.2, userRequested: 0.9 },
      roundTripMs: expect.any(Number),
    })
  })

  it('asks the human for a risky Jev score, and never treats an invalid reply as approval', async () => {
    // The first call is scored as the `rm -rf` judged live was: Jev refuses nothing on its own.
    const human = humanSaying('refused', 'allowed')
    let calls = 0
    const transport: JevTransport = {
      send: async () => {
        calls += 1
        return calls === 1
          ? jevResponse(2.96, 0.88, 0.18)
          : Response.json({ model: JEV_MODEL, answers: {} })
      },
    }
    const result = await engine(
      human,
      transport,
    )(
      Effect.gen(function* () {
        const session = yield* opened
        const settings = yield* ClassifierSettings
        yield* settings.replaceKey('ciphertext', 'private-key')
        yield* settings.setConsent(true)
        yield* settings.select('hemera-auto')
        const denied = yield* calling({
          sessionId: session.sessionId,
          tool: 'fs_write',
          arguments: { path: 'denied.md', content: 'no', key: 'denied' },
        })
        const invalid = yield* calling({
          sessionId: session.sessionId,
          tool: 'fs_write',
          arguments: { path: 'asked.md', content: 'yes', key: 'asked' },
        })
        return { denied, invalid }
      }),
    )
    expect(result.denied.state).toBe('refused')
    expect(existsSync(join(root, 'denied.md'))).toBe(false)
    expect(result.invalid.state).toBe('completed')
    expect(human.asked).toHaveLength(2)
    expect(calls).toBe(2)
  })

  it('discards a Jev allow received after the global mode changes', async () => {
    let signalStarted: (() => void) | undefined
    const started = new Promise<void>((resolve) => {
      signalStarted = resolve
    })
    let release: (() => void) | undefined
    const held = new Promise<void>((resolve) => {
      release = resolve
    })
    const transport: JevTransport = {
      send: async () => {
        signalStarted?.()
        await held
        return jevResponse(1)
      },
    }
    const human = humanSaying()
    const result = await engine(
      human,
      transport,
    )(
      Effect.gen(function* () {
        const session = yield* opened
        const settings = yield* ClassifierSettings
        yield* settings.replaceKey('ciphertext', 'private-key')
        yield* settings.setConsent(true)
        yield* settings.select('hemera-auto')
        const call = yield* Effect.forkScoped(
          calling({
            sessionId: session.sessionId,
            tool: 'fs_write',
            arguments: { path: 'late.md', content: 'no', key: 'late' },
          }),
        )
        yield* Effect.promise(() => started)
        const evaluating = yield* threadEntries(session.sessionId)
        yield* settings.select('agent-default')
        release?.()
        const answer = yield* Fiber.join(call)
        return { answer, evaluating, entries: yield* threadEntries(session.sessionId) }
      }),
    )
    expect(result.answer.state).toBe('refused')
    // Nothing is said while Jev judges; the stale allow leaves a refusal, never a run.
    expect(result.evaluating.some((entry) => entry.kind === 'permission_decision')).toBe(false)
    const record = result.entries.find((entry) => entry.kind === 'permission_decision')
    expect(record?.state).toBe('refused')
    expect(JSON.parse(record?.payload ?? '{}')).toMatchObject({ unasked: true, optionId: null })
    expect(existsSync(join(root, 'late.md'))).toBe(false)
    expect(human.asked).toHaveLength(0)
  })

  it('discards a human grant received after the global mode changes', async () => {
    let signalAsked: (() => void) | undefined
    const asked = new Promise<void>((resolve) => {
      signalAsked = resolve
    })
    let release: (() => void) | undefined
    const held = new Promise<void>((resolve) => {
      release = resolve
    })
    const human: Human = {
      asked: [],
      service: {
        askOutside: (question) =>
          Effect.promise(async () => {
            human.asked.push(question)
            signalAsked?.()
            await held
            return 'allowed' as const
          }),
        answer: () => Effect.succeed(false),
        withdrawn: () => Effect.void,
      },
    }
    const result = await engine(human)(
      Effect.gen(function* () {
        const session = yield* opened
        const settings = yield* ClassifierSettings
        yield* settings.select('hemera-auto')
        const call = yield* Effect.forkScoped(
          calling({
            sessionId: session.sessionId,
            tool: 'fs_write',
            arguments: { path: 'late-human.md', content: 'no', key: 'late-human' },
          }),
        )
        yield* Effect.promise(() => asked)
        yield* settings.select('agent-default')
        release?.()
        return yield* Fiber.join(call)
      }),
    )
    expect(human.asked).toHaveLength(1)
    expect(result.state).toBe('refused')
    expect(existsSync(join(root, 'late-human.md'))).toBe(false)
  })
})

describe('A run that cannot start is written failed in either mode', () => {
  it.each(['agent-default', 'hemera-auto'] as const)(
    'under %s, names Portless in a failed run and asks nobody',
    async (mode) => {
      const empty = join(folder, 'no-portless')
      mkdirSync(empty, { recursive: true })
      const human = humanSaying('allowed')
      const seen = await engine(
        human,
        typeSafeTransport,
        Layer.succeed(ProgramLookup, (cwd: string) => ({ ...hostLookup(cwd), path: empty })),
      )(
        Effect.gen(function* () {
          const session = yield* opened
          yield* (yield* ClassifierSettings).select(mode)
          const commands = yield* Commands
          yield* commands.save(
            {
              projectId: session.projectId,
              name: 'web',
              line: 'node -e 0',
              type: 'serve',
              lineWindows: null,
              lineLinux: null,
              scope: 'workspace',
              portless: true,
              portlessName: null,
              folderBase: null,
              folder: null,
              runAtOpen: false,
            },
            false,
          )
          const ran = yield* calling({
            sessionId: session.sessionId,
            tool: 'commands_run',
            arguments: { name: 'web', key: 'no-portless' },
          })
          return { ran, entries: yield* threadEntries(session.sessionId) }
        }),
      )
      // The run is written, failed, and its box says why, as it was before Hemera Auto.
      const run = seen.entries.find((entry) => entry.kind === 'command_run')
      expect(JSON.parse(run?.payload ?? '{}')).toMatchObject({ state: 'failed' })
      expect(seen.ran.text).toContain('portless was not found')
      expect(human.asked).toHaveLength(0)
    },
  )
})

describe('Local rules settle only understood calls', () => {
  // `ls` is on the PATH of every POSIX machine; a Windows one has it only with Git's tools.
  it.skipIf(process.platform === 'win32')(
    'runs a contained listing and refuses a deletion of .git without Jev or a question',
    async () => {
      fileInRoot('src/index.ts', 'export {}')
      const human = humanSaying('allowed')
      let evaluated = 0
      const transport: JevTransport = {
        send: async () => {
          evaluated += 1
          return jevResponse(1)
        },
      }
      const result = await engine(
        human,
        transport,
      )(
        Effect.gen(function* () {
          const session = yield* opened
          const settings = yield* ClassifierSettings
          yield* settings.replaceKey('ciphertext', 'private-key')
          yield* settings.setConsent(true)
          yield* settings.select('hemera-auto')
          const listing = yield* calling({
            sessionId: session.sessionId,
            tool: 'commands_run',
            arguments: { line: 'ls -la src', key: 'listing' },
          })
          const deletion = yield* calling({
            sessionId: session.sessionId,
            tool: 'commands_run',
            arguments: { line: 'rm -fr .git/', key: 'deletion' },
          })
          const outside = yield* calling({
            sessionId: session.sessionId,
            tool: 'commands_run',
            arguments: { line: 'ls ..', key: 'outside' },
          })
          return { listing, deletion, outside, lines: yield* journalLines(session.projectId) }
        }),
      )
      // Each decision names the Session's agent, the same for a command as for any other tool.
      expect(
        result.lines
          .filter((line) => line.type === 'classifier.decision')
          .map((line) => line.payload.agent),
      ).toEqual(['claude', 'claude', 'claude'])
      expect(result.listing.state).toBe('completed')
      expect(result.deletion.state).toBe('refused')
      expect(result.outside.state).toBe('completed')
      // Only the listing that leaves the Workspace went to the judge; no question was asked.
      expect(evaluated).toBe(1)
      expect(human.asked).toHaveLength(0)
    },
  )
})

describe("Hemera's own workflow tools are not judged again", () => {
  it('writes a proposal without a permission question or a classifier decision', async () => {
    const human = humanSaying('allowed')
    const seen = await engine(human)(
      Effect.gen(function* () {
        const session = yield* opened
        yield* (yield* ClassifierSettings).select('hemera-auto')
        const proposed = yield* calling({
          sessionId: session.sessionId,
          tool: 'commands_propose',
          arguments: { name: 'lint', line: 'pnpm lint', type: 'script', why: 'to lint' },
        })
        return {
          proposed,
          entries: yield* threadEntries(session.sessionId),
          lines: yield* journalLines(session.projectId),
        }
      }),
    )
    expect(seen.proposed.state).toBe('completed')
    expect(human.asked).toHaveLength(0)
    expect(
      seen.entries.some(
        (entry) => entry.kind === 'permission_decision' || entry.kind === 'permission_request',
      ),
    ).toBe(false)
    expect(seen.lines.some((line) => line.type === 'classifier.decision')).toBe(false)
  })
})

describe('Unavailable context asks instead of refusing', () => {
  it('lets a build Session whose build does not read still read locally and ask for a write', async () => {
    fileInRoot('notes.md', 'notes')
    const human = humanSaying('allowed')
    const seen = await engine(human)(
      Effect.gen(function* () {
        const session = yield* opened
        // A build Session whose build cannot be read: its frozen Spec is out of reach.
        const database = yield* Database
        yield* database
          .update(sessionRows)
          .set({ mission: 'build' })
          .where(eq(sessionRows.id, session.sessionId))
        yield* (yield* ToolAccess).granted(session.sessionId, 'agent-1', 'build')
        yield* (yield* ClassifierSettings).select('hemera-auto')
        const read = yield* calling({
          sessionId: session.sessionId,
          tool: 'fs_read',
          arguments: { path: 'notes.md' },
        })
        const write = yield* calling({
          sessionId: session.sessionId,
          tool: 'fs_write',
          arguments: { path: 'out.md', content: 'out', key: 'build-write' },
        })
        return { read, write }
      }),
    )
    expect(seen.read.state).toBe('completed')
    expect(seen.write.state).toBe('completed')
    expect(human.asked).toHaveLength(1)
  })
})

describe('New human instructions invalidate stale context', () => {
  it('keeps the grant the human gave after writing a new message', async () => {
    const asked = Promise.withResolvers<void>()
    const answer = Promise.withResolvers<void>()
    const human: Human = {
      asked: [],
      service: {
        askOutside: (question) =>
          Effect.promise(async () => {
            human.asked.push(question)
            asked.resolve()
            await answer.promise
            return 'allowed' as const
          }),
        answer: () => Effect.succeed(false),
        withdrawn: () => Effect.void,
      },
    }
    const result = await engine(human)(
      Effect.gen(function* () {
        const session = yield* opened
        yield* (yield* ClassifierSettings).select('hemera-auto')
        const call = yield* Effect.forkScoped(
          calling({
            sessionId: session.sessionId,
            tool: 'fs_write',
            arguments: { path: 'granted.md', content: 'yes', key: 'granted' },
          }),
        )
        yield* Effect.promise(() => asked.promise)
        // The user writes while the question is open, then answers it: their yes is newer.
        yield* (yield* Sessions).write(session.sessionId, {
          role: 'user',
          kind: 'message',
          body: 'go ahead and write it',
        })
        answer.resolve()
        return yield* Fiber.join(call)
      }),
    )
    expect(result.state).toBe('completed')
    expect(readFileSync(join(root, 'granted.md'), 'utf8')).toBe('yes')
  })
  it('does not dispatch an automatic allow judged before a newer message', async () => {
    const started = Promise.withResolvers<void>()
    const release = Promise.withResolvers<void>()
    const transport: JevTransport = {
      send: async () => {
        started.resolve()
        await release.promise
        return jevResponse(1)
      },
    }
    const human = humanSaying()
    const result = await engine(
      human,
      transport,
    )(
      Effect.gen(function* () {
        const session = yield* opened
        const settings = yield* ClassifierSettings
        yield* settings.replaceKey('ciphertext', 'private-key')
        yield* settings.setConsent(true)
        yield* settings.select('hemera-auto')
        const call = yield* Effect.forkScoped(
          calling({
            sessionId: session.sessionId,
            tool: 'fs_write',
            arguments: { path: 'stale.md', content: 'no', key: 'stale' },
          }),
        )
        yield* Effect.promise(() => started.promise)
        yield* (yield* Sessions).write(session.sessionId, {
          role: 'user',
          kind: 'message',
          body: 'actually, do not write anything',
        })
        release.resolve()
        return yield* Fiber.join(call)
      }),
    )
    expect(result.state).toBe('refused')
    expect(existsSync(join(root, 'stale.md'))).toBe(false)
  })
})

describe('Concurrent calls keep independent decisions', () => {
  it('evaluates calls of two Sessions together and gives each its own verdict', async () => {
    // Jev answers nobody until both calls have reached it: calls queued behind one another
    // would never get there.
    const bodies: string[] = []
    const both = Promise.withResolvers<void>()
    const transport: JevTransport = {
      send: async (body) => {
        bodies.push(body)
        if (bodies.length === 2) both.resolve()
        await both.promise
        return jevResponse(body.includes('refused.md') ? 2.5 : 1)
      },
    }
    const human = humanSaying()
    const seen = await engine(
      human,
      transport,
    )(
      Effect.gen(function* () {
        const first = yield* opened
        const sessions = yield* Sessions
        const other = yield* sessions.create(first.projectId, 'codex')
        yield* (yield* ToolAccess).granted(other.id, 'agent-2', 'free')
        yield* sessions.write(first.sessionId, {
          role: 'user',
          kind: 'message',
          body: 'first Session only',
        })
        const settings = yield* ClassifierSettings
        yield* settings.replaceKey('ciphertext', 'private-key')
        yield* settings.setConsent(true)
        yield* settings.select('hemera-auto')
        const [allowed, refused] = yield* Effect.all(
          [
            calling({
              sessionId: first.sessionId,
              tool: 'fs_write',
              arguments: { path: 'allowed.md', content: 'yes', key: 'first' },
            }),
            calling({
              sessionId: other.id,
              tool: 'fs_write',
              arguments: { path: 'refused.md', content: 'no', key: 'second' },
            }),
          ],
          { concurrency: 'unbounded' },
        ).pipe(Effect.timeout('5 seconds'))
        return { allowed, refused, otherId: other.id }
      }),
    )
    expect(seen.allowed.state).toBe('completed')
    expect(seen.refused.state).toBe('refused')
    expect(existsSync(join(root, 'refused.md'))).toBe(false)
    // The risky one asked its own Session's human, who refused it: Jev refuses nothing (#298).
    expect(human.asked.map((question) => question.sessionId)).toEqual([seen.otherId])
    // Context from another Session is never included.
    const other = bodies.find((body) => body.includes('refused.md'))
    expect(other).not.toContain('first Session only')
  })
})

describe('Mandatory guards survive an allowing judge', () => {
  it('refuses a tool the mission does not offer and asks before writing outside', async () => {
    let evaluated = 0
    const transport: JevTransport = {
      send: async () => {
        evaluated += 1
        return jevResponse(0)
      },
    }
    const human = humanSaying('refused')
    const outside = join(folder, 'outside.md')
    const seen = await engine(
      human,
      transport,
    )(
      Effect.gen(function* () {
        const session = yield* opened
        const settings = yield* ClassifierSettings
        yield* settings.replaceKey('ciphertext', 'private-key')
        yield* settings.setConsent(true)
        yield* settings.select('hemera-auto')
        const unoffered = yield* calling({
          sessionId: session.sessionId,
          tool: 'fs_write',
          arguments: { path: 'unoffered.md', content: 'no', key: 'unoffered' },
          offered: ['fs_read'],
        })
        const escaped = yield* calling({
          sessionId: session.sessionId,
          tool: 'fs_write',
          arguments: { path: outside, content: 'no', key: 'escaped' },
        })
        return { unoffered, escaped }
      }),
    )
    expect(seen.unoffered.state).toBe('refused')
    expect(existsSync(join(root, 'unoffered.md'))).toBe(false)
    // The judge allowed the outside write; the root still asks, and the human said no.
    expect(evaluated).toBe(1)
    expect(human.asked).toHaveLength(1)
    expect(seen.escaped.state).not.toBe('completed')
    expect(existsSync(outside)).toBe(false)
  })
})

describe('Every invalid or unavailable evaluation asks', () => {
  it.each([
    ['a 5xx', async () => new Response('down', { status: 503 })],
    ['a rate limit', async () => new Response('slow down', { status: 429 })],
    ['a network failure', async (): Promise<Response> => Promise.reject(new Error('offline'))],
    ['a malformed answer', async () => Response.json({ model: JEV_MODEL, answers: {} })],
  ])('asks the human after %s, and executes nothing when they refuse', async (_, send) => {
    const human = humanSaying('refused')
    const seen = await engine(human, { send })(
      Effect.gen(function* () {
        const session = yield* opened
        const settings = yield* ClassifierSettings
        yield* settings.replaceKey('ciphertext', 'private-key')
        yield* settings.setConsent(true)
        yield* settings.select('hemera-auto')
        return yield* calling({
          sessionId: session.sessionId,
          tool: 'fs_write',
          arguments: { path: 'failed.md', content: 'no', key: 'failed' },
        })
      }),
    )
    expect(human.asked).toHaveLength(1)
    expect(seen.state).toBe('refused')
    expect(existsSync(join(root, 'failed.md'))).toBe(false)
  })
})

describe('Reflected provider errors cannot leak secrets', () => {
  it('keeps an echoed key and request out of the thread and the Journal', async () => {
    const transport: JevTransport = {
      send: async (body, key) => new Response(`invalid key ${key} for ${body}`, { status: 401 }),
    }
    const seen = await engine(
      humanSaying('refused'),
      transport,
    )(
      Effect.gen(function* () {
        const session = yield* opened
        const settings = yield* ClassifierSettings
        yield* settings.replaceKey('ciphertext', 'private-key')
        yield* settings.setConsent(true)
        yield* settings.select('hemera-auto')
        yield* calling({
          sessionId: session.sessionId,
          tool: 'fs_write',
          arguments: { path: 'echo.md', content: 'echoed-request-text', key: 'echo' },
        })
        return {
          entries: yield* threadEntries(session.sessionId),
          lines: yield* journalLines(session.projectId),
        }
      }),
    )
    const written = JSON.stringify([seen.entries, seen.lines])
    expect(written).not.toContain('private-key')
    expect(written).not.toContain('invalid key')
    expect(written).not.toContain('"questions"')
  })
})

describe('Cancellation makes late answers inert', () => {
  const held = () => {
    const started = Promise.withResolvers<void>()
    const release = Promise.withResolvers<void>()
    let aborted = false
    const transport: JevTransport = {
      send: async (_, __, signal) => {
        signal.addEventListener('abort', () => {
          aborted = true
        })
        started.resolve()
        await release.promise
        return jevResponse(0)
      },
    }
    return { started, release, transport, aborted: () => aborted }
  }

  it('executes nothing when the Session ends while Jev evaluates', async () => {
    const jev = held()
    const seen = await engine(
      humanSaying(),
      jev.transport,
    )(
      Effect.gen(function* () {
        const session = yield* opened
        const settings = yield* ClassifierSettings
        yield* settings.replaceKey('ciphertext', 'private-key')
        yield* settings.setConsent(true)
        yield* settings.select('hemera-auto')
        const call = yield* Effect.forkScoped(
          calling({
            sessionId: session.sessionId,
            tool: 'fs_write',
            arguments: { path: 'ended.md', content: 'no', key: 'ended' },
          }),
        )
        yield* Effect.promise(() => jev.started.promise)
        yield* (yield* ToolAccess).revoked(session.sessionId)
        jev.release.resolve()
        return yield* Fiber.join(call)
      }),
    )
    expect(seen.state).toBe('refused')
    expect(existsSync(join(root, 'ended.md'))).toBe(false)
  })

  it('aborts the evaluation and executes nothing when the turn stops the call', async () => {
    const jev = held()
    const seen = await engine(
      humanSaying(),
      jev.transport,
    )(
      Effect.gen(function* () {
        const session = yield* opened
        const settings = yield* ClassifierSettings
        yield* settings.replaceKey('ciphertext', 'private-key')
        yield* settings.setConsent(true)
        yield* settings.select('hemera-auto')
        const call = yield* Effect.forkScoped(
          calling({
            sessionId: session.sessionId,
            tool: 'fs_write',
            arguments: { path: 'stopped.md', content: 'no', key: 'stopped' },
          }),
        )
        yield* Effect.promise(() => jev.started.promise)
        // A stopped turn interrupts the calls it was waiting on.
        yield* Fiber.interrupt(call)
        jev.release.resolve()
        yield* Effect.sleep('50 millis')
        return yield* threadEntries(session.sessionId)
      }),
    )
    expect(jev.aborted()).toBe(true)
    expect(existsSync(join(root, 'stopped.md'))).toBe(false)
    // The call was stopped: no decision is recorded for what never ran.
    expect(seen.some((entry) => entry.kind === 'permission_decision')).toBe(false)
  })
})

describe('Audit distinguishes a verdict from execution', () => {
  it('keeps an allow verdict apart from the failed call it let through', async () => {
    fileInRoot('edited.md', 'before')
    const seen = await engine(humanSaying(), { send: async () => jevResponse(1) })(
      Effect.gen(function* () {
        const session = yield* opened
        const settings = yield* ClassifierSettings
        yield* settings.replaceKey('ciphertext', 'private-key')
        yield* settings.setConsent(true)
        yield* settings.select('hemera-auto')
        const edit = yield* calling({
          sessionId: session.sessionId,
          tool: 'fs_edit',
          arguments: { path: 'edited.md', old: 'absent', new: 'after', key: 'edit' },
        })
        return { edit, lines: yield* journalLines(session.projectId) }
      }),
    )
    expect(seen.edit.state).toBe('failed')
    const types = seen.lines.map((line) => line.type)
    expect(seen.lines.find((line) => line.type === 'classifier.decision')?.payload).toMatchObject({
      verdict: 'allow',
      source: 'jev',
      policy: '2',
      model: JEV_MODEL,
    })
    expect(types).toContain('tool.failed')
    expect(types).not.toContain('tool.completed')
  })
})

describe('A build does not wait on Jev more than it must', () => {
  it('reuses a verdict for the same call within a turn, and asks Jev again after it', async () => {
    let evaluated = 0
    const transport: JevTransport = {
      send: async () => {
        evaluated += 1
        return jevResponse(1)
      },
    }
    const seen = await engine(
      humanSaying(),
      transport,
    )(
      Effect.gen(function* () {
        const session = yield* opened
        const settings = yield* ClassifierSettings
        yield* settings.replaceKey('ciphertext', 'private-key')
        yield* settings.setConsent(true)
        yield* settings.select('hemera-auto')
        const write = (key: string, content = 'same') =>
          calling({
            sessionId: session.sessionId,
            tool: 'fs_write',
            arguments: { path: 'same.md', content, key },
          })
        const first = yield* write('one')
        const again = yield* write('two')
        const other = yield* write('three', 'different')
        const inTurn = evaluated
        // The turn ends: what was judged in it is judged again in the next one.
        yield* (yield* Sessions).write(session.sessionId, {
          role: 'hemera',
          kind: 'turn',
          body: 'The agent finished its turn.',
          state: 'end_turn',
        })
        const next = yield* write('four')
        return { states: [first, again, other, next].map((one) => one.state), inTurn }
      }),
    )
    expect(seen.states).toEqual(['completed', 'completed', 'completed', 'completed'])
    expect(seen.inTurn).toBe(2)
    expect(evaluated).toBe(3)
  })
})

describe("Hemera Auto's decisions are quiet records, and what it cannot decide waits in the notices", () => {
  it('records an allow and a refusal where they happened, and lists a question in the notices', async () => {
    const human: Human = {
      asked: [],
      service: {
        // Nobody answers while the thread is read: the question stays open, as in the window.
        askOutside: (question) =>
          Effect.sync(() => human.asked.push(question)).pipe(Effect.andThen(Effect.never)),
        answer: () => Effect.succeed(false),
        withdrawn: () => Effect.void,
      },
    }
    const transport: JevTransport = {
      send: async (body) =>
        body.includes('asked.md')
          ? Response.json({ model: JEV_MODEL, answers: {} })
          : jevResponse(1),
    }
    const seen = await engine(
      human,
      transport,
    )(
      Effect.gen(function* () {
        const session = yield* opened
        const settings = yield* ClassifierSettings
        yield* settings.replaceKey('ciphertext', 'private-key')
        yield* settings.setConsent(true)
        yield* settings.select('hemera-auto')
        const write = (path: string) =>
          calling({
            sessionId: session.sessionId,
            tool: 'fs_write',
            arguments: { path, content: 'x', key: path },
          })
        const allowed = yield* write('allowed.md')
        // Only the local rules refuse (#298).
        const refused = yield* calling({
          sessionId: session.sessionId,
          tool: 'commands_run',
          arguments: { line: 'rm -rf .git', key: 'refused' },
        })
        yield* Effect.forkScoped(write('asked.md'))
        yield* Effect.promise(async () => {
          for (let tries = 0; tries < 100 && human.asked.length === 0; tries += 1) {
            // oxlint-disable-next-line no-await-in-loop -- waiting for the question to be asked
            await new Promise((resolve) => setTimeout(resolve, 10))
          }
        })
        return { allowed, refused, entries: yield* threadEntries(session.sessionId) }
      }),
    )
    expect(seen.allowed.state).toBe('completed')
    expect(seen.refused.state).toBe('refused')
    const records = seen.entries.filter((entry) => entry.kind === 'permission_decision')
    expect(records.map((entry) => [entry.state, entry.body])).toEqual([
      ['completed', 'ran without asking, Hemera Auto mode'],
      ['refused', 'refused by Hemera Auto'],
    ])
    for (const record of records) {
      expect(answersAQuestion(record)).toBe(false)
    }
    const question = seen.entries.find((entry) => entry.kind === 'permission_request')
    expect(question === undefined ? null : waitingAs(question, seen.entries, null, null)).toBe(
      'permission',
    )
  })
})

describe('Every Hemera Auto decision leaves one line in the diagnostic log', () => {
  it('says the call, who decided, the verdict, the policy, the model, the scores and the time', async () => {
    let calls = 0
    const transport: JevTransport = {
      send: async () => {
        calls += 1
        return calls === 1 ? jevResponse(1) : new Response('down', { status: 503 })
      },
    }
    const human = humanSaying('allowed')
    await engine(
      human,
      transport,
    )(
      Effect.gen(function* () {
        const session = yield* opened
        yield* (yield* Variables).set(session.projectId, null, 'API_TOKEN', 'tok-very-private')
        const settings = yield* ClassifierSettings
        yield* settings.replaceKey('ciphertext', 'private-key')
        yield* settings.setConsent(true)
        yield* settings.select('hemera-auto')
        yield* calling({
          sessionId: session.sessionId,
          tool: 'fs_write',
          arguments: { path: 'judged.md', content: 'FILE-CONTENT tok-very-private', key: 'j' },
        })
        yield* calling({
          sessionId: session.sessionId,
          tool: 'commands_run',
          arguments: {
            line: 'node -e 0 "Authorization: Bearer sk-live-SECRET"',
            key: 'c',
          },
        })
        yield* calling({
          sessionId: session.sessionId,
          tool: 'commands_run',
          arguments: { line: 'rm -rf .git', key: 'd' },
        })
      }),
    )
    const lines = diagnostics.filter((line) => line.startsWith('hemera-auto:'))
    const all = lines.join('\n')
    for (const leaked of ['FILE-CONTENT', 'tok-very-private', 'sk-live-SECRET', 'private-key']) {
      expect(all).not.toContain(leaked)
    }
    // The judged write: its path, the judge, its verdict, policy, model, scores and time.
    expect(lines[0]).toMatch(/fs_write .*judged\.md/)
    expect(lines[0]).toContain('by=judge verdict=allow')
    expect(lines[0]).toContain('policy=2')
    expect(lines[0]).toContain(`model=${JEV_MODEL}`)
    expect(lines[0]).toContain('risk=1 approval=0.2 userRequested=0.9')
    expect(lines[0]).toMatch(/jev=\d+ms/)
    // The command Jev failed on: the failure, the fall back to asking, then the human's answer.
    expect(lines[1]).toMatch(/commands_run node -e 0/)
    expect(lines[1]).toContain('verdict=ask')
    expect(lines[1]).toContain('failure=http 503')
    expect(lines[1]).toContain('fallback=ask')
    expect(lines[2]).toContain('by=human verdict=allow')
    // The deletion the rules refused, with no call to Jev.
    expect(lines[3]).toContain('commands_run rm -rf .git')
    expect(lines[3]).toContain('by=rules verdict=deny')
    expect(lines).toHaveLength(4)
  })
})

describe('Changing the strictness applies to the next call, in every Session', () => {
  it('asks for a significant change at normal, and lets it through once permissive', async () => {
    // A significant change nobody asked for, as Jev scores it every time.
    const transport: JevTransport = { send: async () => jevResponse(2, 0.2, 0.18) }
    const human = humanSaying('refused')
    const seen = await engine(
      human,
      transport,
    )(
      Effect.gen(function* () {
        const first = yield* opened
        const sessions = yield* Sessions
        const other = yield* sessions.create(first.projectId, 'codex')
        yield* (yield* ToolAccess).granted(other.id, 'agent-2', 'free')
        const settings = yield* ClassifierSettings
        yield* settings.replaceKey('ciphertext', 'private-key')
        yield* settings.setConsent(true)
        yield* settings.select('hemera-auto')
        const write = (sessionId: string, path: string) =>
          calling({ sessionId, tool: 'fs_write', arguments: { path, content: 'x', key: path } })
        const asked = yield* write(first.sessionId, 'normal.md')
        yield* settings.selectStrictness('permissive')
        const elsewhere = yield* write(other.id, 'elsewhere.md')
        const again = yield* write(first.sessionId, 'again.md')
        return {
          states: [asked, elsewhere, again].map((one) => one.state),
          lines: yield* journalLines(first.projectId),
          entries: yield* threadEntries(first.sessionId),
        }
      }),
    )
    expect(seen.states).toEqual(['refused', 'completed', 'completed'])
    expect(human.asked).toHaveLength(1)
    // Each decision says the level it was taken at, as the policy it belongs to.
    const decisions = seen.lines
      .filter((line) => line.type === 'classifier.decision')
      .map((line) => line.payload)
      .reverse()
    expect(decisions).toMatchObject([
      { verdict: 'ask', policy: '2', strictness: 'normal' },
      { verdict: 'allow', policy: '2', strictness: 'permissive' },
      { verdict: 'allow', policy: '2', strictness: 'permissive' },
    ])
    const record = seen.entries.find(
      (entry) => entry.kind === 'permission_decision' && entry.state === 'completed',
    )
    expect(JSON.parse(record?.payload ?? '{}')).toMatchObject({
      policyVersion: '2',
      strictness: 'permissive',
    })
    const lines = diagnostics.filter(
      (line) => line.startsWith('hemera-auto: fs_write') && line.includes('by=judge'),
    )
    expect(lines).toHaveLength(3)
    expect(lines[0]).toContain('policy=2 strictness=normal')
    expect(lines[1]).toContain('policy=2 strictness=permissive')
    expect(lines[2]).toContain('policy=2 strictness=permissive')
  })
})

describe('Secrets are masked before any evaluation', () => {
  it('masks a Workspace credential in any tool, and keeps a plain variable readable', async () => {
    const sent: string[] = []
    const transport: JevTransport = {
      send: async (body) => {
        sent.push(body)
        return jevResponse(1)
      },
    }
    const result = await engine(
      humanSaying(),
      transport,
    )(
      Effect.gen(function* () {
        const session = yield* opened
        const variables = yield* Variables
        yield* variables.set(session.projectId, null, 'DEPLOY_TOKEN', 'tok-very-private')
        yield* variables.set(session.projectId, null, 'PORT', '3000')
        const settings = yield* ClassifierSettings
        yield* settings.replaceKey('ciphertext', 'private-key')
        yield* settings.setConsent(true)
        yield* settings.select('hemera-auto')
        const write = yield* calling({
          sessionId: session.sessionId,
          tool: 'fs_write',
          arguments: {
            path: 'deploy.sh',
            content: 'curl -H "Authorization: Bearer sk-live-SECRET" -d tok-very-private :3000',
            key: 'masked-write',
          },
        })
        const run = yield* calling({
          sessionId: session.sessionId,
          tool: 'commands_run',
          arguments: { line: 'node -e "process.exit(0)" 3000', key: 'plain-port' },
        })
        return { write, run }
      }),
    )
    expect(result.write.state).toBe('completed')
    expect(sent).toHaveLength(2)
    expect(sent[0]).not.toContain('tok-very-private')
    expect(sent[0]).not.toContain('sk-live-SECRET')
    expect(sent[0]).toContain('deploy.sh')
    // A port is no secret: the line reaches the judge whole instead of turning into a question.
    expect(sent[1]).toContain('3000')
  })
})

describe('A tool not offered is refused all the same', () => {
  it('is refused with a reason, and the refusal is recorded like any call', async () => {
    const human = humanSaying()
    const seen = await engine(human)(
      Effect.gen(function* () {
        const session = yield* opened
        const offered = TOOL_NAMES.filter((name) => name !== 'fs_write')
        const answer = yield* calling({
          sessionId: session.sessionId,
          tool: 'fs_write',
          arguments: { path: 'kept.md', content: 'written anyway' },
          offered,
        })
        return { answer, entries: yield* threadEntries(session.sessionId) }
      }),
    )

    expect(seen.answer.ok).toBe(false)
    expect(seen.answer.state).toBe('refused')
    expect(seen.answer.summary).toContain('not offered')
    const calls = seen.entries.filter((entry) => entry.kind === 'hemera_tool_call')
    expect(calls.map((entry) => entry.state)).toEqual(['refused'])
  })
})

describe('No human-only action is reachable', () => {
  it('is refused, which is how an action reserved to the human stays unreachable', async () => {
    const seen = await engine(humanSaying())(
      Effect.gen(function* () {
        const session = yield* opened
        return yield* calling({
          sessionId: session.sessionId,
          tool: 'shell.run',
          arguments: { line: 'rm -rf /' },
        })
      }),
    )

    expect(seen.ok).toBe(false)
    expect(seen.summary).toBe('Hemera has no tool named shell.run')
  })
})

describe('The same write twice has one effect', () => {
  it('happens once, and the second call answers what the first one did', async () => {
    const human = humanSaying()
    const seen = await engine(human)(
      Effect.gen(function* () {
        const session = yield* opened
        const write = () =>
          calling({
            sessionId: session.sessionId,
            tool: 'fs_write',
            arguments: { path: 'once.txt', content: 'first' },
            key: 'write-1',
          })
        const first = yield* write()
        yield* Effect.sync(() => writeFileSync(join(root, 'once.txt'), 'changed since'))
        const second = yield* write()
        return {
          first,
          second,
          entries: yield* threadEntries(session.sessionId),
          lines: yield* journalLines(session.projectId),
        }
      }),
    )

    expect(seen.first.ok).toBe(true)
    expect(seen.first.repeated).toBe(false)
    expect(seen.second.repeated).toBe(true)
    expect(seen.second.summary).toBe(seen.first.summary)
    // Nothing was written the second time: the file holds what the suite put there since.
    expect(readFileSync(join(root, 'once.txt'), 'utf8')).toBe('changed since')
    // One entry in the thread, and the Journal says the second call was a repeat.
    const calls = seen.entries.filter((entry) => entry.kind === 'hemera_tool_call')
    expect(calls).toHaveLength(1)
    expect(
      seen.lines.filter((line) => line.type.startsWith('tool.')).map((line) => line.type),
    ).toEqual(['tool.repeated', 'tool.completed'])
  })
})

describe('A key used again', () => {
  it('with other arguments is refused, says why, and writes nothing', async () => {
    const seen = await engine(humanSaying())(
      Effect.gen(function* () {
        const session = yield* opened
        const write = (content: string) =>
          calling({
            sessionId: session.sessionId,
            tool: 'fs_write',
            arguments: { path: 'once.txt', content },
            key: 'write-1',
          })
        yield* write('first')
        const other = yield* write('second')
        return { other, entries: yield* threadEntries(session.sessionId) }
      }),
    )

    expect(seen.other.state).toBe('refused')
    expect(seen.other.summary).toContain('the key "write-1" was already used')
    expect(readFileSync(join(root, 'once.txt'), 'utf8')).toBe('first')
    // Two calls, two entries: the refusal is recorded like any call, and the first entry stays.
    const calls = seen.entries.filter((entry) => entry.kind === 'hemera_tool_call')
    expect(calls.map((entry) => entry.state)).toEqual(['completed', 'refused'])
    expect(new Set(calls.map((entry) => entry.correlationId)).size).toBe(2)
  })

  it('after a refusal is answered the refusal, and nothing is written over its entry', async () => {
    const outside = join(folder, 'refused.txt')
    const human = humanSaying('refused', 'allowed')
    const seen = await engine(human)(
      Effect.gen(function* () {
        const session = yield* opened
        const write = () =>
          calling({
            sessionId: session.sessionId,
            tool: 'fs_write',
            arguments: { path: outside, content: 'no' },
            key: 'out-1',
          })
        const first = yield* write()
        const second = yield* write()
        return { first, second, entries: yield* threadEntries(session.sessionId) }
      }),
    )

    expect(human.asked).toHaveLength(1)
    expect(seen.second.repeated).toBe(true)
    expect(seen.second.ok).toBe(false)
    expect(existsSync(outside)).toBe(false)
    expect(
      seen.entries.filter((entry) => entry.kind === 'hemera_tool_call').map((entry) => entry.state),
    ).toEqual(['failed'])
  })
})

describe('An edit needs a unique match', () => {
  it('writes nothing and says how many matches were found', async () => {
    fileInRoot('twice.txt', 'same\nother\nsame\n')
    const human = humanSaying()
    const seen = await engine(human)(
      Effect.gen(function* () {
        const session = yield* opened
        const twice = yield* calling({
          sessionId: session.sessionId,
          tool: 'fs_edit',
          arguments: { path: 'twice.txt', old: 'same', new: 'changed', key: 'edit-1' },
          key: 'edit-1',
        })
        const none = yield* calling({
          sessionId: session.sessionId,
          tool: 'fs_edit',
          arguments: { path: 'twice.txt', old: 'absent', new: 'changed', key: 'edit-2' },
          key: 'edit-2',
        })
        const once = yield* calling({
          sessionId: session.sessionId,
          tool: 'fs_edit',
          arguments: { path: 'twice.txt', old: 'other', new: 'changed', key: 'edit-3' },
          key: 'edit-3',
        })
        return { twice, none, once }
      }),
    )

    expect(seen.twice.ok).toBe(false)
    expect(seen.twice.summary).toContain('2')
    expect(seen.none.ok).toBe(false)
    expect(seen.none.summary).toContain('0')
    expect(seen.once.ok).toBe(true)
    expect(readFileSync(join(root, 'twice.txt'), 'utf8')).toBe('same\nchanged\nsame\n')
  })
})

describe('A long read is paginated', () => {
  it('is read in a page, and the answer says which bytes and where the next page starts', async () => {
    const body = 'x'.repeat(READ_PAGE_BYTES + 1024)
    fileInRoot('long.txt', body)
    const human = humanSaying()
    const seen = await engine(human)(
      Effect.gen(function* () {
        const session = yield* opened
        const first = yield* calling({
          sessionId: session.sessionId,
          tool: 'fs_read',
          arguments: { path: 'long.txt' },
        })
        const second = yield* calling({
          sessionId: session.sessionId,
          tool: 'fs_read',
          arguments: { path: 'long.txt', offset: READ_PAGE_BYTES },
        })
        return { first, second }
      }),
    )

    expect(seen.first.summary).toContain(`bytes 0-${String(READ_PAGE_BYTES)}`)
    expect(seen.first.summary).toContain(`of ${String(body.length)}`)
    expect(seen.first.text).toContain(`the next page starts at offset ${String(READ_PAGE_BYTES)}`)
    expect(seen.second.summary).toContain('bytes 262144-')
    // The range is fields as well as words: what the Spec asks a long read to carry.
    expect(seen.first.range).toEqual({
      offset: 0,
      end: READ_PAGE_BYTES,
      size: body.length,
      truncated: true,
      next: READ_PAGE_BYTES,
    })
    expect(seen.second.range?.truncated).toBe(false)
    expect(seen.second.range?.next).toBeNull()
  })
})

describe('a file read in pages', () => {
  it('numbers its lines, and each page starts on the line after the last one', async () => {
    const lines = Array.from({ length: 40 }, (_, index) => `line ${String(index + 1)} of the file`)
    fileInRoot('lines.txt', `${lines.join('\n')}\n`)
    const seen = await engine(humanSaying())(
      Effect.gen(function* () {
        const session = yield* opened
        const first = yield* calling({
          sessionId: session.sessionId,
          tool: 'fs_read',
          arguments: { path: 'lines.txt', limit: 100 },
        })
        const second = yield* calling({
          sessionId: session.sessionId,
          tool: 'fs_read',
          arguments: { path: 'lines.txt', offset: first.range?.next ?? 0, limit: 100 },
        })
        return { first, second }
      }),
    )

    const numberedLines = (text: string) => text.split('\n').filter((one) => /^ *\d+\t/.test(one))
    const first = numberedLines(seen.first.text)
    const second = numberedLines(seen.second.text)
    expect(first[0]).toBe('     1\tline 1 of the file')
    // The first page stopped after a whole line, and the second picks up at the next one.
    const last = Number.parseInt(first.at(-1) ?? '', 10)
    expect(second[0]).toBe(
      `${String(last + 1).padStart(6, ' ')}\tline ${String(last + 1)} of the file`,
    )
  })

  it('never cuts a character in two, and the pages put together are the file', async () => {
    // Two bytes a character and no newline: a page of an odd number of bytes would cut one.
    const body = 'é'.repeat(300)
    fileInRoot('accents.txt', body)
    const seen = await engine(humanSaying())(
      Effect.gen(function* () {
        const session = yield* opened
        const first = yield* calling({
          sessionId: session.sessionId,
          tool: 'fs_read',
          arguments: { path: 'accents.txt', limit: 101 },
        })
        const second = yield* calling({
          sessionId: session.sessionId,
          tool: 'fs_read',
          arguments: { path: 'accents.txt', offset: first.range?.next ?? 0 },
        })
        return { first, second }
      }),
    )

    const textOf = (text: string) => (text.split('\n')[0] ?? '').replace(/^ *\d+\t/, '')
    expect(seen.first.text).not.toContain('�')
    expect(seen.second.text).not.toContain('�')
    expect(seen.first.range?.end).toBe(100)
    expect(textOf(seen.first.text) + textOf(seen.second.text)).toBe(body)
  })
})

describe('A search is bounded and says so', () => {
  it('stops at the match limit, says which limit it hit, and offers a cursor', async () => {
    const lines = Array.from({ length: SEARCH_MATCH_LIMIT + 20 }, () => 'needle in a line')
    fileInRoot('many.txt', `${lines.join('\n')}\n`)
    const seen = await engine(humanSaying())(
      Effect.gen(function* () {
        const session = yield* opened
        return yield* calling({
          sessionId: session.sessionId,
          tool: 'search',
          arguments: { query: 'needle' },
        })
      }),
    )

    expect(seen.ok).toBe(true)
    expect(seen.text).toContain(`${String(SEARCH_MATCH_LIMIT)} match(es)`)
    expect(seen.text).toContain('stopped by the match limit')
    expect(seen.text).toContain('continue from cursor')
  })
})

describe('the commands of a Project', () => {
  it('are listed for the agent, and a one-off line runs inside the root', async () => {
    const human = humanSaying()
    const seen = await engine(human)(
      Effect.gen(function* () {
        const session = yield* opened
        const commands = yield* Commands
        yield* commands.save(
          {
            projectId: session.projectId,
            name: 'dev',
            // A line is not a shell line: what it names is the program and the rest are its
            // arguments, so the program to evaluate is one token.
            line: 'node -e console.log(process.cwd())',
            type: 'script',
            lineWindows: null,
            lineLinux: null,
            scope: 'workspace',
            portless: false,
            portlessName: null,
            runAtOpen: false,
            folderBase: null,
            folder: null,
          },
          false,
        )
        const listed = yield* calling({
          sessionId: session.sessionId,
          tool: 'commands_list',
          arguments: {},
        })
        const ran = yield* calling({
          sessionId: session.sessionId,
          tool: 'commands_run',
          arguments: { name: 'dev', key: 'run-1' },
          key: 'run-1',
        })
        // A `check` or a `utility` ends on its own: the agent reads it once it has ended, which
        // is the whole reason its exit code is kept.
        let outcome = yield* calling({
          sessionId: session.sessionId,
          tool: 'commands_output',
          arguments: {},
        })
        for (let tries = 0; tries < 50 && outcome.text.includes('still running'); tries += 1) {
          yield* Effect.sleep('50 millis')
          outcome = yield* calling({
            sessionId: session.sessionId,
            tool: 'commands_output',
            arguments: {},
          })
        }
        return { listed, ran, outcome, projectId: session.projectId }
      }),
    )

    expect(seen.listed.ok).toBe(true)
    expect(seen.listed.text).toContain('dev')
    expect(seen.ran.ok).toBe(true)
    expect(seen.outcome.text).toContain('exit code 0')
    expect(seen.outcome.text).toContain(root)
    expect(human.asked).toHaveLength(0)
  })
})

describe('A command outside the Workspace asks the human', () => {
  it('asks the human before anything runs, and starts nothing when they refuse', async () => {
    const human = humanSaying('refused')
    const seen = await engine(human)(
      Effect.gen(function* () {
        const session = yield* opened
        const answer = yield* calling({
          sessionId: session.sessionId,
          tool: 'commands_run',
          arguments: { line: 'node -e "console.log(1)"', folder: '../elsewhere', key: 'run-2' },
          key: 'run-2',
        })
        const commands = yield* Commands
        const running = yield* commands.running(session.sessionId)
        return { answer, running }
      }),
    )

    expect(human.asked).toHaveLength(1)
    expect(human.asked[0]?.named).toContain('elsewhere')
    expect(seen.answer.ok).toBe(false)
    expect(seen.running).toHaveLength(0)
  })
})

describe('A write outside the root asks the human', () => {
  it('asks the human about the place it leads to, not the text the agent wrote', async () => {
    const human = humanSaying('allowed')
    const seen = await engine(human)(
      Effect.gen(function* () {
        const session = yield* opened
        const answer = yield* calling({
          sessionId: session.sessionId,
          tool: 'fs_write',
          arguments: { path: 'src/../../elsewhere.txt', content: 'allowed once', key: 'out-1' },
        })
        return { answer, entries: yield* threadEntries(session.sessionId) }
      }),
    )

    const where = join(realpathSync.native(folder), 'elsewhere.txt')
    expect(human.asked).toHaveLength(1)
    expect(human.asked[0]?.named).toBe(where)
    const asked = seen.entries.find((entry) => entry.kind === 'permission_request')
    expect(asked?.body).toContain(where)
    expect(seen.answer.ok).toBe(true)
    expect(readFileSync(where, 'utf8')).toBe('allowed once')
  })
})

describe('A write through a link inside the root that leads outside asks the human', () => {
  it('asks about the place the link points at, and writes nothing there when refused', async () => {
    // A junction to a folder that does not exist yet: `realpath` fails on it, and it is inside.
    symlinkSync(join(folder, 'planted'), join(root, 'notes'), 'junction')
    const human = humanSaying('refused')
    const seen = await engine(human)(
      Effect.gen(function* () {
        const session = yield* opened
        const write = yield* calling({
          sessionId: session.sessionId,
          tool: 'fs_write',
          arguments: { path: 'notes/keys.txt', content: 'planted', key: 'link-1' },
        })
        const edit = yield* calling({
          sessionId: session.sessionId,
          tool: 'fs_edit',
          arguments: { path: 'notes/keys.txt', old: 'a', new: 'b', key: 'link-2' },
        })
        return { write, edit }
      }),
    )

    expect(human.asked.map((one) => one.named)).toEqual([
      join(folder, 'planted', 'keys.txt'),
      join(folder, 'planted', 'keys.txt'),
    ])
    expect(seen.write.ok).toBe(false)
    expect(seen.edit.ok).toBe(false)
    expect(existsSync(join(folder, 'planted'))).toBe(false)
  })
})

describe('A write to a hard link inside the root', () => {
  it('replaces the name inside the root and leaves the file outside as it was', async () => {
    const outside = join(folder, 'shared.txt')
    writeFileSync(outside, 'outside')
    linkSync(outside, join(root, 'written.txt'))
    linkSync(outside, join(root, 'edited.txt'))
    const seen = await engine(humanSaying())(
      Effect.gen(function* () {
        const session = yield* opened
        const write = yield* calling({
          sessionId: session.sessionId,
          tool: 'fs_write',
          arguments: { path: 'written.txt', content: 'inside', key: 'hard-1' },
        })
        const edit = yield* calling({
          sessionId: session.sessionId,
          tool: 'fs_edit',
          arguments: { path: 'edited.txt', old: 'outside', new: 'edited', key: 'hard-2' },
        })
        return { write, edit }
      }),
    )

    expect(seen.write.ok).toBe(true)
    expect(seen.edit.ok).toBe(true)
    expect(readFileSync(join(root, 'written.txt'), 'utf8')).toBe('inside')
    expect(readFileSync(join(root, 'edited.txt'), 'utf8')).toBe('edited')
    expect(readFileSync(outside, 'utf8')).toBe('outside')
  })
})

describe('an edit whose new text carries replacement patterns', () => {
  it('writes the new text as it was sent', async () => {
    fileInRoot('price.txt', 'price: TBD\n')
    const seen = await engine(humanSaying())(
      Effect.gen(function* () {
        const session = yield* opened
        return yield* calling({
          sessionId: session.sessionId,
          tool: 'fs_edit',
          arguments: { path: 'price.txt', old: 'TBD', new: "$& costs $$5, $' and $`", key: 'e-1' },
        })
      }),
    )

    expect(seen.ok).toBe(true)
    expect(readFileSync(join(root, 'price.txt'), 'utf8')).toBe("price: $& costs $$5, $' and $`\n")
  })
})

describe('an edit whose old and new texts are the same', () => {
  it('is refused, and the file is left as it was', async () => {
    fileInRoot('same.txt', 'unchanged\n')
    const seen = await engine(humanSaying())(
      Effect.gen(function* () {
        const session = yield* opened
        return yield* calling({
          sessionId: session.sessionId,
          tool: 'fs_edit',
          arguments: { path: 'same.txt', old: 'unchanged', new: 'unchanged', key: 'e-2' },
        })
      }),
    )

    expect(seen.ok).toBe(false)
    expect(seen.summary).toContain('changes nothing')
    expect(readFileSync(join(root, 'same.txt'), 'utf8')).toBe('unchanged\n')
  })
})

describe('the same write twice at the same time', () => {
  it('runs once: the second call waits for the first and is answered what it was', async () => {
    const decision = Deferred.makeUnsafe<OutsideAnswer>()
    const asked: OutsideRequest[] = []
    const human: Human = {
      asked,
      service: {
        askOutside: (question) =>
          Effect.gen(function* () {
            asked.push(question)
            return yield* Deferred.await(decision)
          }),
        answer: () => Effect.succeed(false),
        withdrawn: () => Effect.void,
      },
    }
    const outside = join(folder, 'shared.txt')
    const seen = await engine(human)(
      Effect.gen(function* () {
        const session = yield* opened
        const write = (content: string) =>
          calling({
            sessionId: session.sessionId,
            tool: 'fs_write',
            arguments: { path: outside, content },
            key: 'same-key',
          })
        // The first call waits on the human; the retry arrives while it does.
        const first = yield* Effect.forkChild(write('first'))
        yield* Effect.sleep('50 millis')
        const second = yield* Effect.forkChild(write('first'))
        yield* Effect.sleep('50 millis')
        Deferred.doneUnsafe(decision, Effect.succeed<OutsideAnswer>('allowed'))
        return { first: yield* Fiber.join(first), second: yield* Fiber.join(second) }
      }),
    )

    expect(asked).toHaveLength(1)
    expect(seen.first.repeated).toBe(false)
    expect(seen.second.repeated).toBe(true)
    expect(readFileSync(outside, 'utf8')).toBe('first')
  })
})

describe('a write without an idempotency key', () => {
  it('is refused before anything is written', async () => {
    const seen = await engine(humanSaying())(
      Effect.gen(function* () {
        const session = yield* opened
        return yield* calling({
          sessionId: session.sessionId,
          tool: 'fs_write',
          arguments: { path: 'keyless.txt', content: 'no key' },
        })
      }),
    )

    expect(seen.state).toBe('refused')
    expect(seen.summary).toContain('key')
  })
})

describe('the answers a Session keeps against a retry', () => {
  it('are bounded, the least recently asked let go of first', async () => {
    const seen = await engine(humanSaying())(
      Effect.gen(function* () {
        const session = yield* opened
        const write = (key: string, content: string) =>
          calling({
            sessionId: session.sessionId,
            tool: 'fs_write',
            arguments: { path: `kept/${key}.txt`, content, key },
          })
        yield* write('oldest', 'first')
        yield* Effect.forEach(
          Array.from({ length: 256 }, (_, index) => `k${String(index)}`),
          (key) => write(key, 'filler'),
        )
        // 257 keys were answered: the oldest is gone, and asking it again writes again.
        return yield* write('oldest', 'second')
      }),
    )

    expect(seen.repeated).toBe(false)
    expect(readFileSync(join(root, 'kept', 'oldest.txt'), 'utf8')).toBe('second')
    // 258 real writes, each a file and a thread entry: the Windows runner needs more than 30 s.
  }, 120_000)
})

describe('A one-off command asks the human before it runs', () => {
  it('shows the line in a permission block, and starts nothing when the human refuses', async () => {
    const human = humanSaying('refused')
    const seen = await engine(human)(
      Effect.gen(function* () {
        const session = yield* opened
        const answer = yield* calling({
          sessionId: session.sessionId,
          tool: 'commands_run',
          arguments: { line: 'node -e console.log(1)', key: 'one-off-1' },
        })
        const commands = yield* Commands
        return {
          answer,
          running: yield* commands.running(session.sessionId),
          recent: yield* commands.recent(session.sessionId),
          entries: yield* threadEntries(session.sessionId),
        }
      }),
    )

    expect(human.asked).toHaveLength(1)
    const block = seen.entries.find((entry) => entry.kind === 'permission_request')
    expect(block?.body).toContain('node -e console.log(1)')
    expect(seen.answer.ok).toBe(false)
    expect(seen.running).toHaveLength(0)
    expect(seen.recent).toHaveLength(0)
  })

  it('runs the line once the human allows it', async () => {
    const human = humanSaying('allowed')
    const seen = await engine(human)(
      Effect.gen(function* () {
        const session = yield* opened
        const answer = yield* calling({
          sessionId: session.sessionId,
          tool: 'commands_run',
          arguments: { line: 'node -e console.log(1)', key: 'one-off-2' },
        })
        const commands = yield* Commands
        return { answer, recent: yield* commands.recent(session.sessionId) }
      }),
    )

    expect(human.asked).toHaveLength(1)
    expect(seen.answer.ok).toBe(true)
    expect(seen.recent).toHaveLength(1)
  })
})

describe('A catalogue command inside the root runs on its own', () => {
  it('starts without a question to the human', async () => {
    const human = humanSaying()
    const seen = await engine(human)(
      Effect.gen(function* () {
        const session = yield* opened
        const commands = yield* Commands
        yield* commands.save(
          {
            projectId: session.projectId,
            name: 'hello',
            line: 'node -e console.log(1)',
            type: 'script',
            lineWindows: null,
            lineLinux: null,
            scope: 'workspace',
            portless: false,
            portlessName: null,
            runAtOpen: false,
            folderBase: null,
            folder: null,
          },
          false,
        )
        const answer = yield* calling({
          sessionId: session.sessionId,
          tool: 'commands_run',
          arguments: { name: 'hello', key: 'cat-1' },
        })
        return { answer, recent: yield* commands.recent(session.sessionId) }
      }),
    )

    expect(human.asked).toHaveLength(0)
    expect(seen.answer.ok).toBe(true)
    expect(seen.recent).toHaveLength(1)
  })
})

describe("A catalogue command's folder is the Project's", () => {
  it('is refused with the folder it runs in when the agent names another, and nothing starts', async () => {
    const human = humanSaying('allowed')
    const seen = await engine(human)(
      Effect.gen(function* () {
        const session = yield* opened
        const commands = yield* Commands
        yield* commands.save(
          {
            projectId: session.projectId,
            name: 'hello',
            line: 'node -e console.log(1)',
            type: 'script',
            lineWindows: null,
            lineLinux: null,
            scope: 'workspace',
            portless: false,
            portlessName: null,
            runAtOpen: false,
            folderBase: null,
            folder: null,
          },
          false,
        )
        const elsewhere = yield* calling({
          sessionId: session.sessionId,
          tool: 'commands_run',
          arguments: { name: 'hello', folder: folder, key: 'cat-2' },
        })
        const same = yield* calling({
          sessionId: session.sessionId,
          tool: 'commands_run',
          arguments: { name: 'hello', folder: '.', key: 'cat-3' },
        })
        return { elsewhere, same, recent: yield* commands.recent(session.sessionId) }
      }),
    )

    expect(seen.elsewhere.ok).toBe(false)
    expect(seen.elsewhere.text).toContain('hello runs in the Workspace root')
    expect(human.asked).toHaveLength(0)
    // Its own folder named again is no override: it runs, once.
    expect(seen.same.ok).toBe(true)
    expect(seen.recent).toHaveLength(1)
  })
})

describe('A run asked for before its Session ended', () => {
  it('does not start once the Session has ended, even if the human then allows it', async () => {
    // The Session ends while the human is being asked: its token is revoked and its runs are
    // swept, as the runtime does when the agent goes, and only then does the human answer.
    let ending: Effect.Effect<void> = Effect.void
    const asked: OutsideRequest[] = []
    const human: Human = {
      asked,
      service: {
        askOutside: (question) =>
          Effect.gen(function* () {
            asked.push(question)
            yield* ending
            return 'allowed' as const
          }),
        answer: () => Effect.succeed(false),
        withdrawn: () => Effect.void,
      },
    }
    const seen = await engine(human)(
      Effect.gen(function* () {
        const session = yield* opened
        const access = yield* ToolAccess
        const commands = yield* Commands
        ending = Effect.gen(function* () {
          yield* access.revoked(session.sessionId)
          yield* commands.stopped(session.sessionId).pipe(Effect.ignore)
        })
        const answer = yield* calling({
          sessionId: session.sessionId,
          tool: 'commands_run',
          arguments: { line: 'node -e setInterval(()=>{},1000)', key: 'late-1' },
        })
        return { answer, recent: yield* commands.recent(session.sessionId) }
      }),
    )

    expect(asked).toHaveLength(1)
    expect(seen.answer.ok).toBe(false)
    expect(seen.answer.summary).toContain('ended')
    expect(seen.recent).toHaveLength(0)
  })
})

describe('A short command answers with its output; a long one is left running', () => {
  it('waits for a short one, and leaves one that outlasts the wait running with its run id', async () => {
    const human = humanSaying()
    const seen = await engine(human)(
      Effect.gen(function* () {
        const session = yield* opened
        const commands = yield* Commands
        const save = (name: string, line: string) =>
          commands.save(
            {
              projectId: session.projectId,
              name,
              line,
              type: 'test',
              lineWindows: null,
              lineLinux: null,
              folderBase: null,
              folder: null,
              scope: 'workspace',
              portless: false,
              portlessName: null,
              runAtOpen: false,
            },
            false,
          )
        yield* save('short', 'node -e console.log(42)')
        yield* save('long', 'node -e setInterval(()=>{},1000)')
        const short = yield* calling({
          sessionId: session.sessionId,
          tool: 'commands_run',
          arguments: { name: 'short', key: 'wait-1' },
        })
        const long = yield* calling({
          sessionId: session.sessionId,
          tool: 'commands_run',
          arguments: { name: 'long', key: 'wait-2', timeout: 300 },
        })
        const began = Date.now()
        const background = yield* calling({
          sessionId: session.sessionId,
          tool: 'commands_run',
          arguments: { name: 'long', key: 'wait-3', background: true },
        })
        const waited = Date.now() - began
        yield* commands.stopped(session.sessionId)
        return { short, long, background, waited }
      }),
    )

    // The short one is answered once it has ended: its exit code and what it printed.
    expect(seen.short.text).toContain('exit code 0')
    expect(seen.short.text).toContain('42')
    // The long one outlasted the wait: it is still running, and the answer says which run it is.
    expect(seen.long.text).toContain('still running, left in the background')
    expect(seen.long.text).toMatch(/run id [0-9a-f-]{36}/)
    // Asked for in the background, it is answered as soon as it has started, not 30 s later.
    expect(seen.background.text).toContain('still running')
    expect(seen.waited).toBeLessThan(5_000)
  })
})

/**
 * The Session's agent standing on `standing`, as the runtime would report it, for as long as the
 * suite leaves it there: the object is read at every call, so moving it is changing the mode.
 */
const standingOn = (standing: { current: StandingMode | null }) =>
  Effect.gen(function* () {
    const modes = yield* SessionModes
    modes.heldBy(() => standing.current)
  })

const AUTO: StandingMode = { agent: 'claude', mode: 'auto', name: 'Auto' }
const MANUAL: StandingMode = { agent: 'claude', mode: 'default', name: 'Manual' }

describe('A one-off inside the Workspace in Auto runs without a question', () => {
  it('starts the line, asks nothing, and leaves a quiet line saying why', async () => {
    const human = humanSaying()
    const seen = await engine(human)(
      Effect.gen(function* () {
        yield* standingOn({ current: AUTO })
        const session = yield* opened
        const answer = yield* calling({
          sessionId: session.sessionId,
          tool: 'commands_run',
          arguments: { line: 'node -e console.log(1)', key: 'auto-1' },
        })
        const commands = yield* Commands
        return {
          answer,
          recent: yield* commands.recent(session.sessionId),
          entries: yield* threadEntries(session.sessionId),
        }
      }),
    )

    expect(human.asked).toHaveLength(0)
    expect(seen.answer.ok).toBe(true)
    expect(seen.recent).toHaveLength(1)
    expect(seen.entries.some((entry) => entry.kind === 'permission_request')).toBe(false)
    const record = seen.entries.find((entry) => entry.kind === 'permission_decision')
    expect(record?.body).toBe('ran without asking, Auto mode')
    expect(record?.role).toBe('hemera')
    expect(JSON.parse(record?.payload ?? '{}')).toMatchObject({
      inside: true,
      mode: 'Auto',
      unasked: true,
    })
  })
})

describe('The same one-off in Ask before edits asks', () => {
  it('asks the human before the line runs', async () => {
    const human = humanSaying('refused')
    const seen = await engine(human)(
      Effect.gen(function* () {
        yield* standingOn({ current: MANUAL })
        const session = yield* opened
        const answer = yield* calling({
          sessionId: session.sessionId,
          tool: 'commands_run',
          arguments: { line: 'node -e console.log(1)', key: 'manual-1' },
        })
        const commands = yield* Commands
        return { answer, recent: yield* commands.recent(session.sessionId) }
      }),
    )

    expect(human.asked).toHaveLength(1)
    expect(seen.answer.ok).toBe(false)
    expect(seen.recent).toHaveLength(0)
  })
})

describe('A one-off outside the Workspace asks in every mode', () => {
  it.each([
    AUTO,
    { agent: 'claude', mode: 'bypassPermissions', name: 'Bypass permissions' },
    { agent: 'codex', mode: 'agent-full-access', name: 'Full access' },
    MANUAL,
  ] satisfies StandingMode[])('asks in $name', async (mode) => {
    const human = humanSaying('refused')
    const seen = await engine(human)(
      Effect.gen(function* () {
        yield* standingOn({ current: mode })
        const session = yield* opened
        const answer = yield* calling({
          sessionId: session.sessionId,
          tool: 'commands_run',
          arguments: { line: 'node -e console.log(1)', folder: '../elsewhere', key: 'out-run' },
        })
        const commands = yield* Commands
        return { answer, recent: yield* commands.recent(session.sessionId) }
      }),
    )

    expect(human.asked).toHaveLength(1)
    expect(seen.answer.ok).toBe(false)
    expect(seen.recent).toHaveLength(0)
  })
})

describe('An unknown mode asks', () => {
  it.each([
    { agent: 'claude', mode: 'something-new', name: 'Something new' },
    { agent: 'someone-else', mode: 'auto', name: 'Auto' },
    null,
  ] satisfies (StandingMode | null)[])('asks when the Session stands on %o', async (mode) => {
    const human = humanSaying('refused')
    await engine(human)(
      Effect.gen(function* () {
        yield* standingOn({ current: mode })
        const session = yield* opened
        yield* calling({
          sessionId: session.sessionId,
          tool: 'commands_run',
          arguments: { line: 'node -e console.log(1)', key: 'unknown-1' },
        })
      }),
    )

    expect(human.asked).toHaveLength(1)
  })
})

describe('Changing the mode during a Session applies to the next call', () => {
  it('asks in Manual, then runs on its own once the mode is Auto, then asks again', async () => {
    const human = humanSaying('refused', 'refused')
    const seen = await engine(human)(
      Effect.gen(function* () {
        const standing = { current: MANUAL }
        yield* standingOn(standing)
        const session = yield* opened
        const run = (key: string) =>
          calling({
            sessionId: session.sessionId,
            tool: 'commands_run',
            arguments: { line: 'node -e console.log(1)', key },
          })
        const first = yield* run('switch-1')
        standing.current = AUTO
        const second = yield* run('switch-2')
        standing.current = MANUAL
        const third = yield* run('switch-3')
        return { first, second, third }
      }),
    )

    expect(seen.first.ok).toBe(false)
    expect(seen.second.ok).toBe(true)
    expect(seen.third.ok).toBe(false)
    expect(human.asked).toHaveLength(2)
  })
})
