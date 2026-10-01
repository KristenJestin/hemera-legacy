/**
 * Helper agents (issue #77): a build's main agent launches, reads and stops helpers through
 * Hemera's tools; a helper is a child Session, hidden from the sidebar, read-only for the user and
 * attached to its build; it may launch helpers of its own, two levels deep at most; and the Project
 * caps how many run at once, refusing a launch above it rather than queueing it.
 *
 * Every suite runs the whole engine on fake agents: the build's main agent, then one fake per
 * helper, in the order they start. A helper is driven by its brief alone, as a build's agent is.
 */

import { mkdtempSync, realpathSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { Effect } from 'effect'
import { afterEach, beforeEach, describe, expect, test } from 'vite-plus/test'

import { fakeAgent, type FakeStep } from '#engine/agents/fake.ts'
import { AgentRuntime } from '#engine/agents/runtime.ts'
import { Helpers, recoveredHelpers } from '#engine/helpers/helpers.ts'
import { Projects } from '#engine/projects.ts'
import { Sessions } from '#engine/sessions.ts'
import { SqliteClient } from '#engine/storage/database.ts'

import { gated, threadOf } from './application.ts'
import {
  THREE,
  aReadySpec,
  buildAgent,
  buildOf,
  eventually,
  finished,
  launched,
  statesOf,
} from './build-harness.ts'
import { type OpenWindow, openWindow } from './window.ts'

let dataFolder: string
let opened: OpenWindow | undefined

beforeEach(() => {
  dataFolder = realpathSync.native(mkdtempSync(join(tmpdir(), 'hemera-helpers-')))
})

afterEach(async () => {
  await opened?.close()
  opened = undefined
  rmSync(dataFolder, { recursive: true, force: true })
})

/** `helper_launch`, as an agent calls it. */
const launch = (brief: string, more: Readonly<Record<string, string>> = {}): FakeStep => ({
  does: 'uses',
  call: 'helper_launch',
  arguments: { brief, ...more },
})

/** Whether a delivery is a helper's brief, as Hemera hands it. */
const isBrief = (handed: string) => handed.includes('# Mission: helper')

/** Whether a delivery carries a helper's result back to its launcher. */
const isResult = (handed: string) => handed.includes('# Internal result')

/**
 * A main agent that launches what `launches` says when the tasks are handed, and does nothing with
 * a helper's result but keep what it was handed.
 */
const orchestrator = (launches: readonly FakeStep[]) =>
  buildAgent({ execute: (_labels, handed) => (isResult(handed) ? [] : launches) })

/** A helper whose brief is answered with the steps given, and every text it was handed. */
const aHelper = (answer: readonly FakeStep[], script: Parameters<typeof fakeAgent>[0] = {}) => {
  const handed: string[] = []
  const agent = fakeAgent({
    listsTools: true,
    ...script,
    answersDeliveryWith: (text) => {
      handed.push(text)
      return isBrief(text) ? answer : []
    },
  })
  return { agent, handed }
}

/** The helpers of a build, as its line of what goes on reads them. */
const helpersOf = (sessionId: string) =>
  Effect.gen(function* () {
    return yield* (yield* Helpers).list(sessionId)
  })

describe('The main agent launches a helper as a child Session', () => {
  test('the helper is briefed, carries its task, and its answer comes back to the main agent', async () => {
    const main = orchestrator([launch('Write the reader of the journal.', { task: 'T2' })])
    const helper = aHelper([finished('T2'), { does: 'says', text: 'Wrote src/reader.ts.' }])
    opened = await openWindow(dataFolder, main.agent, helper.agent)
    const seen = await opened.running(
      Effect.gen(function* () {
        const spec = yield* aReadySpec(dataFolder, THREE)
        const sessionId = yield* launched(spec.specId, spec.workspaceId)
        const helpers = yield* eventually(helpersOf(sessionId), (all) =>
          all.some((one) => one.state === 'done'),
        )
        const view = yield* eventually(buildOf(sessionId), (one) => statesOf(one).T2 === 'done')
        yield* eventually(
          Effect.sync(() => main.handed),
          (all) => all.some(isResult),
        )
        const id = helpers[0]?.id ?? ''
        const { session } = yield* (yield* Sessions).one(id)
        return {
          sessionId,
          helpers,
          view,
          session,
          thread: yield* threadOf(id),
          listed: yield* (yield* Sessions).list(spec.projectId),
        }
      }),
    )
    expect(seen.helpers).toMatchObject([
      {
        parentSessionId: seen.sessionId,
        name: 'Write the reader of the journal.',
        definition: null,
        depth: 1,
        task: 'T2',
        state: 'done',
        lastLine: 'Wrote src/reader.ts.',
      },
    ])
    expect(seen.session.helper).toEqual({
      parentSessionId: seen.sessionId,
      definition: null,
      depth: 1,
      task: 'T2',
    })
    expect(seen.session.mission).toBe('build')
    // Its brief is the helper mission, its launcher's words and its task, in its own thread.
    expect(helper.handed[0]).toContain('# Your brief\n\nWrite the reader of the journal.')
    expect(helper.handed[0]).toContain('## T2 · Write the reader')
    expect(seen.thread.find((entry) => entry.kind === 'mission_brief')?.body).toContain(
      '# Mission: helper',
    )
    // It carried its task to `task_finished`, which Hemera checked on the build itself.
    expect(helper.agent.answers.used[0]).toMatchObject({ tool: 'task_finished', isError: false })
    expect(statesOf(seen.view).T2).toBe('done')
    // Its result reached the main agent as an internal delivery, never as a message of the user's.
    expect(main.handed.find(isResult)).toContain('Wrote src/reader.ts.')
    // Hidden from the sidebar: the build is listed, its helper is not.
    expect(seen.listed.map((one) => one.id)).toContain(seen.sessionId)
    expect(seen.listed.map((one) => one.id)).not.toContain(seen.helpers[0]?.id)
  })

  test('a defined helper is launched by name, and its answer is read against its shape', async () => {
    const main = orchestrator([launch('Review the tests of T1.', { helper: 'review-tests' })])
    const helper = aHelper([
      { does: 'says', text: '```json\n{ "verdict": "pass", "findings": [] }\n```' },
    ])
    opened = await openWindow(dataFolder, main.agent, helper.agent)
    const seen = await opened.running(
      Effect.gen(function* () {
        const spec = yield* aReadySpec(dataFolder, THREE)
        const sessionId = yield* launched(spec.specId, spec.workspaceId)
        const helpers = yield* eventually(helpersOf(sessionId), (all) =>
          all.some((one) => one.state === 'done'),
        )
        yield* eventually(
          Effect.sync(() => main.handed),
          (all) => all.some(isResult),
        )
        return helpers
      }),
    )
    expect(seen).toMatchObject([{ name: 'Test review', definition: 'review-tests' }])
    expect(helper.handed[0]).toContain('# Your role: Test review')
    // Read-only: a reviewer is lent no write tool, and no helper of its own beyond its depth's.
    expect(helper.agent.answers.tools[0]).not.toContain('fs_write')
    expect(helper.agent.answers.tools[0]).toContain('helper_launch')
    expect(main.handed.find(isResult)).toContain('"verdict": "pass"')
  })

  test('a helper Hemera does not ship is refused, naming the ones it does', async () => {
    const main = orchestrator([launch('Do it.', { helper: 'wizard' })])
    opened = await openWindow(dataFolder, main.agent)
    await opened.running(
      Effect.gen(function* () {
        const spec = yield* aReadySpec(dataFolder, THREE)
        yield* launched(spec.specId, spec.workspaceId)
        yield* eventually(
          Effect.sync(() => main.agent.answers.used),
          (used) => used.length > 0,
        )
      }),
    )
    expect(main.agent.answers.used[0]).toMatchObject({ tool: 'helper_launch', isError: true })
    expect(main.agent.answers.used[0]?.text).toContain('there is no helper named wizard')
    expect(main.agent.answers.used[0]?.text).toContain('review-tests (Test review)')
  })
})

describe('The main agent reads a helper and stops it', () => {
  test('helper_read says it runs and what it said; helper_stop stops it, its task kept', async () => {
    const main = orchestrator([launch('Write the reader.', { task: 'T2' })])
    // The helper says a word, then is held in the middle of its work.
    const gate = gated(1)
    const helper = aHelper(
      [
        { does: 'says', text: 'Reading the exporter first.' },
        { does: 'uses', call: 'fs_list' },
      ],
      { between: gate.between },
    )
    opened = await openWindow(dataFolder, main.agent, helper.agent)
    const seen = await opened.running(
      Effect.gen(function* () {
        const spec = yield* aReadySpec(dataFolder, THREE)
        const sessionId = yield* launched(spec.specId, spec.workspaceId)
        const [running] = yield* eventually(helpersOf(sessionId), (all) =>
          all.some((one) => one.lastLine !== null),
        )
        const id = running?.id ?? ''
        const helpers = yield* Helpers
        const read = yield* helpers.tool(sessionId, { tool: 'helper_read', arguments: { id } })
        const stopped = yield* helpers.tool(sessionId, { tool: 'helper_stop', arguments: { id } })
        const after = yield* helpers.tool(sessionId, { tool: 'helper_read', arguments: { id } })
        const again = yield* helpers.tool(sessionId, { tool: 'helper_stop', arguments: { id } })
        // A helper of another launcher is none of this one's business.
        const foreign = yield* helpers.tool(id, { tool: 'helper_read', arguments: { id } })
        gate.carryOn()
        return {
          read,
          stopped,
          after,
          again,
          foreign,
          helpers: yield* helpersOf(sessionId),
          view: yield* buildOf(sessionId),
        }
      }),
    )
    expect(seen.read.text).toContain(': running')
    expect(seen.read.text).toContain('Task: T2')
    expect(seen.read.text).toContain('Last line: Reading the exporter first.')
    expect(seen.read.text).toMatch(/it last wrote \d+ s ago/)
    expect(seen.stopped).toMatchObject({ ok: true })
    expect(seen.stopped.text).toContain('T2 stays in progress')
    expect(seen.after.text).toContain(': stopped')
    expect(seen.after.text).toContain('Stopped by its launcher.')
    expect(seen.again).toMatchObject({ ok: false, refused: true })
    expect(seen.foreign).toMatchObject({ ok: false, refused: true })
    expect(seen.helpers).toMatchObject([{ state: 'stopped' }])
    // Stopped, not finished: its task stays in progress with its attempt open.
    expect(statesOf(seen.view).T2).toBe('in_progress')
    expect(seen.view.tasks[1]?.attempts.at(-1)?.endedAt).toBeNull()
  })

  test('the user’s × stops a helper, and the main agent is told', async () => {
    const main = orchestrator([launch('Write the reader.')])
    const gate = gated(0)
    const helper = aHelper([{ does: 'says', text: 'Working.' }], { between: gate.between })
    opened = await openWindow(dataFolder, main.agent, helper.agent)
    const seen = await opened.running(
      Effect.gen(function* () {
        const spec = yield* aReadySpec(dataFolder, THREE)
        const sessionId = yield* launched(spec.specId, spec.workspaceId)
        const [running] = yield* eventually(helpersOf(sessionId), (all) => all.length === 1)
        const left = yield* (yield* Helpers).stop(running?.id ?? '')
        gate.carryOn()
        yield* eventually(
          Effect.sync(() => main.handed),
          (all) => all.some(isResult),
        )
        return left
      }),
    )
    expect(seen).toMatchObject([{ state: 'stopped' }])
    expect(main.handed.find(isResult)).toContain('The user stopped Write the reader.')
  })

  test('a helper whose agent dies fails, its task stays in progress, and the main agent is told', async () => {
    const main = orchestrator([launch('Write the reader.', { task: 'T2' })])
    const gate = gated(1)
    const helper = aHelper(
      [
        { does: 'says', text: 'Starting.' },
        { does: 'says', text: 'Never said.' },
      ],
      { between: gate.between },
    )
    opened = await openWindow(dataFolder, main.agent, helper.agent)
    const seen = await opened.running(
      Effect.gen(function* () {
        const spec = yield* aReadySpec(dataFolder, THREE)
        const sessionId = yield* launched(spec.specId, spec.workspaceId)
        yield* eventually(helpersOf(sessionId), (all) => all.some((one) => one.lastLine !== null))
        helper.agent.die()
        const helpers = yield* eventually(helpersOf(sessionId), (all) =>
          all.some((one) => one.state === 'failed'),
        )
        yield* eventually(
          Effect.sync(() => main.handed),
          (all) => all.some(isResult),
        )
        return { helpers, view: yield* buildOf(sessionId) }
      }),
    )
    expect(seen.helpers).toMatchObject([{ state: 'failed', task: 'T2' }])
    expect(statesOf(seen.view).T2).toBe('in_progress')
    const told = main.handed.find(isResult) ?? ''
    expect(told).toContain('failed: the agent exited')
    expect(told).toContain('Its task T2 stays in progress')
  })
})

describe('The Project caps how many helpers run at once', () => {
  test('a launch above the cap is refused with the reason, never queued', async () => {
    const main = orchestrator([launch('Write the exporter.'), launch('Write the reader.')])
    const gate = gated(0)
    const helper = aHelper([{ does: 'says', text: 'Done.' }], { between: gate.between })
    opened = await openWindow(dataFolder, main.agent, helper.agent)
    const seen = await opened.running(
      Effect.gen(function* () {
        const spec = yield* aReadySpec(dataFolder, THREE)
        const projects = yield* Projects
        const project = (yield* projects.list()).find((one) => one.id === spec.projectId)
        yield* projects.setHelpersAtOnce(spec.projectId, project?.version ?? 0, 1)
        const sessionId = yield* launched(spec.specId, spec.workspaceId)
        yield* eventually(
          Effect.sync(() => main.agent.answers.used),
          (used) => used.length === 2,
        )
        const helpers = yield* helpersOf(sessionId)
        gate.carryOn()
        return helpers
      }),
    )
    expect(main.agent.answers.used.map((one) => one.isError)).toEqual([false, true])
    expect(main.agent.answers.used[1]?.text).toContain(
      '1 helpers are running, the most this Project lets run at once',
    )
    expect(seen).toHaveLength(1)
  })

  test('three by default, and the setting takes one to six', async () => {
    opened = await openWindow(dataFolder, fakeAgent())
    const seen = await opened.running(
      Effect.gen(function* () {
        const projects = yield* Projects
        const project = yield* projects.create({
          name: 'Atlas',
          tone: 'primary',
          mainPath: dataFolder,
        })
        const refused = yield* Effect.flip(
          projects.setHelpersAtOnce(project.id, project.version, 7),
        )
        const six = yield* projects.setHelpersAtOnce(project.id, project.version, 6)
        return { initial: project.helpersAtOnce, refused: refused.message, six: six.helpersAtOnce }
      }),
    )
    expect(seen).toEqual({
      initial: 3,
      refused: 'Helpers at once takes a whole number from 1 to 6, not 7.',
      six: 6,
    })
  })
})

describe('A helper launches its own helpers, two levels deep at most', () => {
  test('its helper answers to it, is lent no helper tool, and it is done once its helper is', async () => {
    const main = orchestrator([launch('Write the reader, with help.')])
    const first = aHelper([launch('Count the rows of the journal.')])
    const second = aHelper([launch('Help me count.'), { does: 'says', text: 'There are 42 rows.' }])
    opened = await openWindow(dataFolder, main.agent, first.agent, second.agent)
    const seen = await opened.running(
      Effect.gen(function* () {
        const spec = yield* aReadySpec(dataFolder, THREE)
        const sessionId = yield* launched(spec.specId, spec.workspaceId)
        const helpers = yield* eventually(
          helpersOf(sessionId),
          (all) => all.length === 2 && all.every((one) => one.state === 'done'),
        )
        yield* eventually(
          Effect.sync(() => main.handed),
          (all) => all.some(isResult),
        )
        return helpers
      }),
    )
    const [parent, child] = seen
    expect(parent).toMatchObject({ depth: 1, name: 'Write the reader, with help.' })
    expect(child).toMatchObject({ depth: 2, parentSessionId: parent?.id, state: 'done' })
    // The helper's helper is lent no helper tool, and its own launch is refused.
    expect(second.agent.answers.tools[0]).not.toContain('helper_launch')
    expect(second.agent.answers.used[0]).toMatchObject({ tool: 'helper_launch', isError: true })
    // Its result went to the helper that launched it, not to the main agent.
    expect(first.handed.find(isResult)).toContain('There are 42 rows.')
    expect(main.handed.filter(isResult)).toHaveLength(1)
    expect(main.handed.find(isResult)).toContain('Write the reader, with help. (helper')
  })
})

describe('A helper Session is read-only for the user', () => {
  test('a message written into it is refused, and no turn of the user’s is started there', async () => {
    const main = orchestrator([launch('Write the reader.')])
    const gate = gated(0)
    const helper = aHelper([{ does: 'says', text: 'Working.' }], { between: gate.between })
    opened = await openWindow(dataFolder, main.agent, helper.agent)
    const seen = await opened.running(
      Effect.gen(function* () {
        const spec = yield* aReadySpec(dataFolder, THREE)
        const sessionId = yield* launched(spec.specId, spec.workspaceId)
        const [running] = yield* eventually(helpersOf(sessionId), (all) => all.length === 1)
        const id = running?.id ?? ''
        const written = yield* Effect.flip((yield* Sessions).append(id, 'Hello, helper.'))
        const prompted = yield* Effect.flip((yield* AgentRuntime).prompt(id, 'Hello, helper.'))
        gate.carryOn()
        return {
          written: written.message,
          prompted: prompted.message,
          thread: yield* threadOf(id),
        }
      }),
    )
    expect(seen.written).toBe('A helper is read-only: write to the main agent instead.')
    expect(seen.prompted).toContain('A helper is read-only')
    expect(seen.thread.some((entry) => entry.role === 'user')).toBe(false)
  })
})

describe('A restart fails the helpers the last engine left running', () => {
  test('the helper failed, its task stays in progress, and its result waits for the main agent', async () => {
    const main = orchestrator([launch('Write the reader.', { task: 'T2' })])
    const gate = gated(0)
    const helper = aHelper([{ does: 'says', text: 'Never said.' }], { between: gate.between })
    opened = await openWindow(dataFolder, main.agent, helper.agent)
    const sessionId = await opened.running(
      Effect.gen(function* () {
        const spec = yield* aReadySpec(dataFolder, THREE)
        const build = yield* launched(spec.specId, spec.workspaceId)
        yield* eventually(helpersOf(build), (all) => all.length === 1)
        return build
      }),
    )
    // The engine quits while the helper works.
    await opened.close()
    opened = await openWindow(dataFolder, fakeAgent())
    const seen = await opened.running(
      Effect.gen(function* () {
        yield* recoveredHelpers
        const sql = yield* SqliteClient
        const queued = yield* sql<{
          text: string
        }>`SELECT text FROM queued_results WHERE session_id = ${sessionId}`
        return { helpers: yield* helpersOf(sessionId), queued, view: yield* buildOf(sessionId) }
      }),
    )
    expect(seen.helpers).toMatchObject([{ state: 'failed', task: 'T2' }])
    expect(seen.queued.map((one) => one.text)).toEqual([
      expect.stringContaining('failed: Hemera quit while it ran. Its task T2 stays in progress'),
    ])
    expect(statesOf(seen.view).T2).toBe('in_progress')
  })
})
