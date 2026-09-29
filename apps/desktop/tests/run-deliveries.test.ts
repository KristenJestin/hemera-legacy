/**
 * Every run of a Session reaches its agent, in its own history (issue #238).
 *
 * What the user sees in the thread — a run started from the line, a chip, or by the agent — the
 * agent is handed at the next prompt, as a resource behind Hemera's marker: its name and line,
 * its folder, who started it, how it ended and the end of what it printed. What the agent already
 * read in the answer of its own tool is not handed to it a second time, and nothing is.
 *
 * Every suite runs the engine whole, the fake provider as the agent and real children as runs;
 * what is read is what the agent was sent, prompt by prompt.
 */

import { mkdtempSync, realpathSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, test } from 'vite-plus/test'
import { Effect, Fiber } from 'effect'
import { z } from 'zod'
import type { ContentBlock } from '@agentclientprotocol/sdk'

import { type CommandType, DELIVERY_MARKER, type SessionEntry } from '@hemera/core'

import { fakeAgent } from '#engine/agents/fake.ts'
import { AgentRuntime } from '#engine/agents/runtime.ts'
import { runFromPanel } from '#engine/commands/panel.ts'
import { Commands } from '#engine/commands/service.ts'
import { aSessionOn, gated, pause, threadOf, toolApplication, until } from './application.ts'

let dataFolder: string
let workspace: string

beforeEach(() => {
  dataFolder = mkdtempSync(join(tmpdir(), 'hemera-run-deliveries-'))
  workspace = realpathSync.native(mkdtempSync(join(tmpdir(), 'hemera-run-workspace-')))
})

afterEach(() => {
  rmSync(dataFolder, { recursive: true, force: true, maxRetries: 20, retryDelay: 100 })
  rmSync(workspace, { recursive: true, force: true, maxRetries: 20, retryDelay: 100 })
})

/** A check that says what is missing and ends badly, as `v2 check` did without `uv`. */
const FAILS = `"${process.execPath}" -e "console.log('checking');process.stderr.write('uv not found\\n');process.exit(1)"`

/** A line that ends well, and says so. */
const PASSES = `"${process.execPath}" -e "console.log('all good')"`

/** A line that takes a moment, then ends badly: what the agent leaves in the background. */
const SLOW = `"${process.execPath}" -e "setTimeout(()=>{console.log('late');process.exit(4)},300)"`

/** A line that prints far more than a prompt should carry. */
const VERBOSE = `"${process.execPath}" -e "for(let i=1;i<=500;i++)console.log('line '+i)"`

/** An agent that answers every turn of the user's with one line. */
const answering = () => fakeAgent({ steps: [{ does: 'says', text: 'done' }] })

/** A command of the Project's catalogue, as the user adds it in the settings. */
const inCatalogue = (projectId: string, name: string, line: string, type: CommandType) =>
  Effect.gen(function* () {
    const commands = yield* Commands
    return yield* commands.save(
      {
        projectId,
        name,
        line,
        lineWindows: null,
        lineLinux: null,
        type,
        folderBase: null,
        folder: null,
        scope: 'workspace',
        portless: false,
        portlessName: null,
        runAtOpen: false,
      },
      false,
    )
  })

/** A run of the Session, from the line, waited for until it ended. */
const ranFromTheLine = (sessionId: string, line: string) =>
  Effect.gen(function* () {
    const commands = yield* Commands
    const started = yield* runFromPanel(sessionId, undefined, line)
    return yield* commands.awaited(sessionId, started.id, 5_000)
  })

/** A resource of a prompt, as the protocol carries it. */
const RESOURCE = z.object({
  type: z.literal('resource'),
  resource: z.object({ uri: z.string(), text: z.string() }),
})

/** The texts of the runs a prompt carried, in the order it carried them. */
const runsIn = (blocks: readonly ContentBlock[] | undefined): string[] =>
  (blocks ?? []).flatMap((block) => {
    const read = RESOURCE.safeParse(block)
    return read.success && read.data.resource.uri.startsWith('hemera://context/run/')
      ? [read.data.resource.text]
      : []
  })

/** Every run every prompt carried, oldest prompt first. */
const allRuns = (blocks: readonly (readonly ContentBlock[])[]): string[] =>
  blocks.flatMap((one) => runsIn(one))

/** The lines of the thread that say a run went to the agent. */
const runLines = (entries: readonly SessionEntry[]) =>
  entries.filter(
    (entry) => entry.kind === 'context_delivery' && (entry.payload ?? '').includes('"kind":"run"'),
  )

describe('A run the user started from the line reaches the agent with the next prompt', () => {
  test('the failure, its line, its folder, who started it, its exit code and its output', async () => {
    const agent = answering()

    const seen = await toolApplication(dataFolder)(agent)(
      Effect.gen(function* () {
        const runtime = yield* AgentRuntime
        const session = yield* aSessionOn(workspace, 'claude')
        yield* runtime.prompt(session.id, 'propose a check')
        const run = yield* ranFromTheLine(session.id, FAILS)
        yield* runtime.prompt(session.id, 'do you see the output of the command?')
        return { run, entries: yield* threadOf(session.id) }
      }),
    )

    expect(seen.run.state).toBe('failed')
    // Nothing went with the first prompt: no run had happened yet.
    expect(runsIn(agent.answers.blocks[0])).toEqual([])
    // The run went right before the question, behind Hemera's marker, as a delivery.
    const delivery = agent.answers.blocks[1]
    expect(delivery?.[0]).toEqual({ type: 'text', text: DELIVERY_MARKER })
    const [text] = runsIn(delivery)
    expect(text).toContain(seen.run.id)
    expect(text).toContain('node')
    expect(text).toContain(FAILS)
    expect(text).toContain(workspace)
    expect(text).toContain('the user')
    expect(text).toContain('exit code 1')
    expect(text).toContain('uv not found')
    // The question itself follows it.
    expect(agent.answers.prompts.at(-1)).toBe('do you see the output of the command?')
    // And the thread says it went.
    expect(runLines(seen.entries)).toHaveLength(1)
    expect(runLines(seen.entries)[0]?.state).toBeNull()
  })

  test('several runs go in the order they happened, the last named as the most recent', async () => {
    const agent = answering()

    const seen = await toolApplication(dataFolder)(agent)(
      Effect.gen(function* () {
        const runtime = yield* AgentRuntime
        const session = yield* aSessionOn(workspace, 'claude')
        yield* runtime.prompt(session.id, 'hello')
        const first = yield* ranFromTheLine(session.id, PASSES)
        const second = yield* ranFromTheLine(session.id, FAILS)
        yield* runtime.prompt(session.id, 'what happened?')
        return { first, second }
      }),
    )

    const texts = allRuns(agent.answers.blocks)
    expect(texts).toHaveLength(2)
    expect(texts[0]).toContain(seen.first.id)
    expect(texts[1]).toContain(seen.second.id)
    expect(texts[0]).not.toContain('most recent')
    expect(texts[1]).toContain('most recent')
  })

  test('a long output goes as its tail, with what was cut and how to read the rest', async () => {
    const agent = answering()

    const run = await toolApplication(dataFolder)(agent)(
      Effect.gen(function* () {
        const runtime = yield* AgentRuntime
        const session = yield* aSessionOn(workspace, 'claude')
        yield* runtime.prompt(session.id, 'hello')
        const ran = yield* ranFromTheLine(session.id, VERBOSE)
        yield* runtime.prompt(session.id, 'what did it print?')
        return ran
      }),
    )

    const [text = ''] = allRuns(agent.answers.blocks)
    expect(text).toContain('line 500')
    expect(text).not.toContain('line 1\n')
    expect(text).toMatch(/\d+ earlier lines? not shown/)
    expect(text).toContain(`commands_output`)
    expect(text).toContain(run.id)
  })
})

describe('A run the user started from a chip reaches the agent with the next prompt', () => {
  test('a command of the catalogue, by its name, goes as a run from the line does', async () => {
    const agent = answering()

    const run = await toolApplication(dataFolder)(agent)(
      Effect.gen(function* () {
        const runtime = yield* AgentRuntime
        const commands = yield* Commands
        const session = yield* aSessionOn(workspace, 'claude')
        yield* inCatalogue(session.projectId, 'check', FAILS, 'test')
        yield* runtime.prompt(session.id, 'hello')
        const started = yield* runFromPanel(session.id, 'check', undefined)
        const ended = yield* commands.awaited(session.id, started.id, 5_000)
        yield* runtime.prompt(session.id, 'did the check pass?')
        return ended
      }),
    )

    const texts = allRuns(agent.answers.blocks)
    expect(texts).toHaveLength(1)
    expect(texts[0]).toContain(run.id)
    expect(texts[0]).toContain('name: check')
    expect(texts[0]).toContain('the user')
    expect(texts[0]).toContain('exit code 1')
    expect(texts[0]).toContain('uv not found')
  })
})

describe('A run that ends during a turn arrives with the next prompt', () => {
  test('nothing is pushed into the turn nor sent alone after it; the next prompt carries it once', async () => {
    const gate = gated(1)
    const agent = fakeAgent({
      steps: [
        { does: 'says', text: 'working' },
        { does: 'says', text: 'done' },
      ],
      between: gate.between,
    })

    const seen = await toolApplication(dataFolder)(agent)(
      Effect.gen(function* () {
        const runtime = yield* AgentRuntime
        const session = yield* aSessionOn(workspace, 'claude')
        const turn = yield* Effect.forkScoped(runtime.prompt(session.id, 'start'))
        yield* until(threadOf(session.id), (entries) =>
          entries.some((entry) => entry.body.includes('working')),
        )
        // The user runs a line while the agent works, and it ends before the turn does.
        const run = yield* ranFromTheLine(session.id, FAILS)
        gate.carryOn()
        yield* Fiber.join(turn)
        // Its end is a safe point: a run is no reason for a turn of its own.
        yield* pause(200)
        const afterTheTurn = agent.answers.prompts.length
        yield* runtime.prompt(session.id, 'what happened?')
        return { run, afterTheTurn }
      }),
    )

    expect(seen.afterTheTurn).toBe(1)
    expect(runsIn(agent.answers.blocks[0])).toEqual([])
    const texts = allRuns(agent.answers.blocks)
    expect(texts).toHaveLength(1)
    expect(texts[0]).toContain(seen.run.id)
    expect(agent.answers.prompts.at(-1)).toBe('what happened?')
  })
})

describe('The rest of a long output can be read', () => {
  test('the lines left out of the delivery are read with commands_output from the first', async () => {
    const agent = fakeAgent({
      turns: [
        [{ does: 'says', text: 'hello' }],
        [{ does: 'uses', call: 'commands_output', arguments: { from: 1 } }],
      ],
    })

    await toolApplication(dataFolder)(agent)(
      Effect.gen(function* () {
        const runtime = yield* AgentRuntime
        const session = yield* aSessionOn(workspace, 'claude')
        yield* runtime.prompt(session.id, 'hello')
        yield* ranFromTheLine(session.id, VERBOSE)
        yield* runtime.prompt(session.id, 'what did it print first?')
      }),
    )

    const [text = ''] = allRuns(agent.answers.blocks)
    expect(text).toContain('commands_output')
    expect(text).toContain('from: 1')
    const read = agent.answers.used[0]?.text ?? ''
    expect(read).toContain('line 1\n')
    expect(read).toContain('lines 1 to 200 of 500')
    expect(read).not.toContain('line 201')
  })
})

describe('A run the agent started reaches it once', () => {
  test('a run it waited for is not handed over again: its tool answered it', async () => {
    const agent = fakeAgent({
      turns: [
        [{ does: 'uses', call: 'commands_run', arguments: { name: 'check', key: 'check-1' } }],
        [{ does: 'says', text: 'done' }],
      ],
    })

    await toolApplication(dataFolder)(agent)(
      Effect.gen(function* () {
        const runtime = yield* AgentRuntime
        const session = yield* aSessionOn(workspace, 'claude')
        yield* inCatalogue(session.projectId, 'check', FAILS, 'test')
        yield* runtime.prompt(session.id, 'run the check')
        yield* runtime.prompt(session.id, 'and now?')
      }),
    )

    expect(agent.answers.used[0]?.text).toContain('exit code 1')
    expect(allRuns(agent.answers.blocks)).toEqual([])
  })

  test('a run it left in the background is handed over once it ended', async () => {
    const agent = fakeAgent({
      turns: [
        [
          {
            does: 'uses',
            call: 'commands_run',
            arguments: { name: 'slow', key: 'slow-1', background: true },
          },
        ],
        [{ does: 'says', text: 'done' }],
        [{ does: 'says', text: 'done' }],
      ],
    })

    const run = await toolApplication(dataFolder)(agent)(
      Effect.gen(function* () {
        const runtime = yield* AgentRuntime
        const commands = yield* Commands
        const session = yield* aSessionOn(workspace, 'claude')
        yield* inCatalogue(session.projectId, 'slow', SLOW, 'script')
        yield* runtime.prompt(session.id, 'start it in the background')
        const recent = yield* until(commands.recent(session.id), (runs) =>
          runs.some((one) => one.state !== 'running'),
        )
        yield* runtime.prompt(session.id, 'how did it end?')
        yield* runtime.prompt(session.id, 'anything else?')
        return recent[0]
      }),
    )

    expect(agent.answers.used[0]?.text).toContain('still running')
    const texts = allRuns(agent.answers.blocks)
    expect(texts).toHaveLength(1)
    expect(texts[0]).toContain(run?.id ?? 'no run')
    expect(texts[0]).toContain('you, through commands_run')
    expect(texts[0]).toContain('exit code 4')
    expect(texts[0]).toContain('late')
  })
})

describe('Nothing is delivered twice', () => {
  test('a run handed over is not carried by the prompts after it', async () => {
    const agent = answering()

    const entries = await toolApplication(dataFolder)(agent)(
      Effect.gen(function* () {
        const runtime = yield* AgentRuntime
        const session = yield* aSessionOn(workspace, 'claude')
        yield* runtime.prompt(session.id, 'hello')
        yield* ranFromTheLine(session.id, FAILS)
        yield* runtime.prompt(session.id, 'did it fail?')
        yield* runtime.prompt(session.id, 'and now?')
        yield* runtime.prompt(session.id, 'still nothing new?')
        return yield* threadOf(session.id)
      }),
    )

    expect(allRuns(agent.answers.blocks)).toHaveLength(1)
    expect(runLines(entries)).toHaveLength(1)
  })
})
