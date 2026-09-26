/**
 * The commands a Project runs each time Hemera opens (#114).
 *
 * Each suite is named after a scenario of the issue. Nothing is mocked: the engine is the real
 * one over a database in a temporary folder, the runs are real children of this machine — `node`
 * itself, reached without the `PATH` — and what is read is what the engine wrote: the runs' rows
 * and the Journal lines of the Project.
 */

import { mkdirSync, mkdtempSync, realpathSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vite-plus/test'
import { Effect } from 'effect'

import { runAtOpen } from '#engine/commands/at-open.ts'
import { Commands } from '#engine/commands/service.ts'
import { Journal } from '#engine/journal.ts'
import { Sessions } from '#engine/sessions.ts'
import { Database } from '#engine/storage/database.ts'
import { commandRuns, workspaces } from '#engine/storage/schema.ts'

import { until } from './application.ts'
import { atlas, workspaceEngine } from './workspace-engine.ts'

let folder: string
let main: string

beforeEach(() => {
  // The engine spells a path the way the filesystem does, so the fixture is settled the same way.
  folder = realpathSync.native(mkdtempSync(join(tmpdir(), 'hemera-at-open-')))
  main = join(folder, 'main')
  mkdirSync(main, { recursive: true })
})

afterEach(() => {
  // A run may still be closing, and Windows hands its folder back a beat late.
  rmSync(folder, { recursive: true, force: true, maxRetries: 20, retryDelay: 100 })
})

/** A line of `node` itself, reached without the `PATH`: a line is run, not interpreted. */
const node = (code: string) => `"${process.execPath}" -e "${code}"`

/** A script that ends well, as `docker compose up -d` does. */
const ENDS_WELL = node('console.log(process.cwd())')

/** A script that ends badly, saying why. */
const FAILS = node("process.stderr.write('no daemon\\n');process.exit(3)")

/** A service that publishes nothing and stays up. */
const STAYS_UP = node('setInterval(()=>{},1000)')

/** A command of the catalogue, marked to run at open or not, at the Workspace root. */
const aCommand = (
  projectId: string,
  name: string,
  line: string,
  type: 'serve' | 'script',
  atOpen: boolean,
  folderUnder: string | null = null,
) =>
  Effect.gen(function* () {
    const commands = yield* Commands
    return yield* commands.save(
      {
        projectId,
        name,
        line,
        type,
        lineWindows: null,
        lineLinux: null,
        folderBase: null,
        folder: folderUnder,
        scope: 'workspace',
        portless: false,
        portlessName: null,
        runAtOpen: atOpen,
      },
      false,
    )
  })

/** A dedicated Workspace of the Project, `ready`, beside `main`: one it must not run in. */
const aDedicatedWorkspace = (projectId: string) =>
  Effect.gen(function* () {
    const database = yield* Database
    const path = join(folder, 'login-form')
    mkdirSync(path, { recursive: true })
    yield* database.insert(workspaces).values({
      id: crypto.randomUUID(),
      projectId,
      name: 'login-form',
      path,
      createdAt: new Date().toISOString(),
      state: 'ready',
    })
  })

/** Every run of the engine's database, oldest first. */
const allRuns = Effect.gen(function* () {
  const database = yield* Database
  return yield* database.select().from(commandRuns).orderBy(commandRuns.startedAt)
})

/** The Journal lines of a Project's runs, newest first. */
const runLines = (projectId: string) =>
  Effect.gen(function* () {
    const journal = yield* Journal
    const read = yield* journal.read({ projectId })
    return read.entries.filter((entry) => entry.type.startsWith('command.run_'))
  })

describe('A command marked to run when Hemera opens runs once in main at start', () => {
  it('runs up once, in main, with no Session, and leaves the unmarked command alone', async () => {
    const seen = await workspaceEngine(folder)(
      Effect.gen(function* () {
        const project = yield* atlas(main, [])
        yield* aDedicatedWorkspace(project.id)
        yield* aCommand(project.id, 'up', ENDS_WELL, 'script', true)
        yield* aCommand(project.id, 'lint', ENDS_WELL, 'script', false)
        const refused = yield* runAtOpen
        const runs = yield* until(allRuns, (rows) => rows.every((row) => row.state !== 'running'))
        const home = yield* (yield* Sessions).mainOf(project.id)
        return { refused, runs, home, lines: yield* runLines(project.id) }
      }),
    )

    expect(seen.refused).toEqual([])
    expect(seen.runs.map((run) => [run.name, run.state, run.exitCode])).toEqual([
      ['up', 'exited', 0],
    ])
    const [up] = seen.runs
    expect(up?.workspaceId).toBe(seen.home.id)
    expect(up?.cwd).toBe(main)
    expect(up?.sessionId).toBeNull()
    expect(up?.output).toContain(main)
    // Shown in the Project's activity as any other run, started and ended.
    expect(seen.lines.map((line) => line.type).sort()).toEqual([
      'command.run_ended',
      'command.run_started',
    ])
  })
})

describe('A service still running at start is stopped and started again', () => {
  it('stops the running db in main and starts a new one in its place', async () => {
    const seen = await workspaceEngine(folder)(
      Effect.gen(function* () {
        const commands = yield* Commands
        const project = yield* atlas(main, [])
        yield* aCommand(project.id, 'db', STAYS_UP, 'serve', true)
        // Left from the last time: the run this engine still sees as its own.
        yield* runAtOpen
        const [before] = yield* commands.runningIn(null, project.id)
        yield* runAtOpen
        const running = yield* commands.runningIn(null, project.id)
        const first = yield* commands.runOf(project.id, before?.id ?? '')
        return { before, running, first }
      }),
    )

    expect(seen.before?.state).toBe('running')
    expect(seen.first.state).toBe('stopped')
    expect(seen.running.map((run) => run.name)).toEqual(['db'])
    expect(seen.running[0]?.id).not.toBe(seen.before?.id)
    expect(seen.running[0]?.state).toBe('running')
  })
})

describe('A failed run at start does not stop the engine from starting', () => {
  it('shows the failed run red, says what could not start, and runs the rest', async () => {
    const seen = await workspaceEngine(folder)(
      Effect.gen(function* () {
        const commands = yield* Commands
        const project = yield* atlas(main, [])
        yield* aCommand(project.id, 'daemon', FAILS, 'script', true)
        // A folder that climbs out of the Workspace: refused before anything starts.
        yield* aCommand(project.id, 'astray', ENDS_WELL, 'script', true, '../../elsewhere')
        yield* aCommand(project.id, 'up', ENDS_WELL, 'script', true)
        const refused = yield* runAtOpen
        const runs = yield* until(allRuns, (rows) => rows.every((row) => row.state !== 'running'))
        const lines = yield* runLines(project.id)
        // The engine still answers.
        const catalogue = yield* commands.list(project.id)
        return { refused, runs, lines, catalogue }
      }),
    )

    expect(seen.refused).toHaveLength(1)
    expect(seen.refused[0]).toContain('Atlas: astray was not run at open')
    expect(seen.runs.map((run) => [run.name, run.state]).sort()).toEqual([
      ['daemon', 'failed'],
      ['up', 'exited'],
    ])
    expect(seen.runs.find((run) => run.name === 'daemon')?.output).toContain('no daemon')
    const ended = seen.lines.filter((line) => line.type === 'command.run_ended')
    expect(ended.map((line) => JSON.stringify(line.payload)).join()).toContain('"state":"failed"')
    expect(seen.catalogue.map((one) => one.name).sort()).toEqual(['astray', 'daemon', 'up'])
  })
})
