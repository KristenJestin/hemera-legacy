/**
 * Approvals that do not block the agent (issue #304).
 *
 * A call of Hemera's that needs the human's answer waits a short grace for it while the window is
 * focused, and is answered "waiting" otherwise: the agent goes on, and the human's answer arrives
 * whenever it is given — the action done by Hemera and its result handed over as a run is, with
 * the next prompt or in a turn of its own when the agent is idle.
 *
 * The whole engine runs, with the fake agent calling the tools over MCP. The question is a write
 * outside the Workspace, which Hemera always asks about.
 */

import { existsSync, mkdtempSync, readFileSync, realpathSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, test } from 'vite-plus/test'
import { Effect, Fiber } from 'effect'
import { z } from 'zod'

import type { SessionEntry } from '@hemera/core'

import { fakeAgent, type FakeStep } from '#engine/agents/fake.ts'
import { AgentRuntime } from '#engine/agents/runtime.ts'
import { ClassifierSettings } from '#engine/classifier/settings.ts'
import { Sessions } from '#engine/sessions.ts'
import { Approvals } from '#engine/tools/approvals.ts'
import { aSessionOn, pause, threadOf, toolApplication, until } from './application.ts'

let dataFolder: string
let workspace: string
let outside: string

beforeEach(() => {
  dataFolder = mkdtempSync(join(tmpdir(), 'hemera-late-'))
  workspace = realpathSync.native(mkdtempSync(join(tmpdir(), 'hemera-late-workspace-')))
  outside = realpathSync.native(mkdtempSync(join(tmpdir(), 'hemera-late-outside-')))
})

afterEach(() => {
  for (const folder of [dataFolder, workspace, outside]) {
    rmSync(folder, { recursive: true, force: true, maxRetries: 20, retryDelay: 100 })
  }
})

/** The requests Hemera's tools asked the human, pending or answered. */
const questionsIn = (entries: readonly SessionEntry[]) =>
  entries.filter((entry) => entry.kind === 'permission_request' && entry.role === 'hemera')

const questionOf = (entry: SessionEntry | undefined) =>
  z.object({ toolCallId: z.string() }).parse(JSON.parse(entry?.payload ?? '{}'))

/** The one pending question of a Session, once it is asked. */
const asked = (sessionId: string) =>
  Effect.gen(function* () {
    const entries = yield* until(threadOf(sessionId), (seen) =>
      questionsIn(seen).some((entry) => entry.state === 'pending'),
    )
    return questionOf(questionsIn(entries).find((entry) => entry.state === 'pending')).toolCallId
  })

/** The call entries of Hemera's tools in a thread. */
const callsIn = (entries: readonly SessionEntry[]) =>
  entries.filter((entry) => entry.kind === 'hemera_tool_call')

/** The texts of the resources of each prompt the agent was sent, joined per prompt. */
const handedTo = (agent: ReturnType<typeof fakeAgent>) =>
  agent.answers.blocks.map((blocks) =>
    blocks
      .flatMap((block) =>
        block.type === 'resource' && 'text' in block.resource ? [block.resource.text] : [],
      )
      .join('\n')
      .toLowerCase(),
  )

/** The turns Hemera opened by itself to hand something over. */
const deliveryTurns = (entries: readonly SessionEntry[]) =>
  entries.filter((entry) => entry.kind === 'turn' && entry.payload.includes('"delivery"'))

/** An agent that asks to write outside the Workspace, then says it waits. */
const writer = (target: string): FakeStep[] => [
  {
    does: 'uses',
    call: 'fs_write',
    arguments: { path: target, content: 'late', key: 'w1' },
    id: 'toolu_late',
  },
  { does: 'says', text: 'I wait for the approval.' },
]

/** The window as the test wants it, and the grace the settings hold. */
const windowIs = (focused: boolean, graceSeconds?: number) =>
  Effect.gen(function* () {
    yield* (yield* Approvals).focus(focused)
    if (graceSeconds !== undefined) {
      yield* (yield* ClassifierSettings).selectGrace(graceSeconds)
    }
  })

describe('Answered within the grace, the call is synchronous', () => {
  test('the agent reads the result of the write, as it did before', async () => {
    const target = join(outside, 'notes.md')
    const agent = fakeAgent({ steps: writer(target) })

    const seen = await toolApplication(dataFolder)(agent)(
      Effect.gen(function* () {
        const runtime = yield* AgentRuntime
        yield* windowIs(true, 10)
        const session = yield* aSessionOn(workspace, 'claude')
        const turn = yield* Effect.forkScoped(runtime.prompt(session.id, 'write it'))
        const id = yield* asked(session.id)
        yield* runtime.decide(session.id, id, 'allowed')
        yield* Fiber.join(turn)
        return yield* threadOf(session.id)
      }),
    )

    expect(readFileSync(target, 'utf8')).toBe('late')
    expect(agent.answers.used[0]?.text).not.toContain('waiting for the user')
    expect(callsIn(seen).map((entry) => entry.state)).toEqual(['completed'])
    expect(deliveryTurns(seen)).toEqual([])
  })
})

describe('Not answered within the grace, the call waits without the agent', () => {
  test('the agent is told the request is waiting and nothing happened, and the thread shows it pending', async () => {
    const target = join(outside, 'notes.md')
    const agent = fakeAgent({ steps: writer(target) })

    const seen = await toolApplication(dataFolder)(agent)(
      Effect.gen(function* () {
        const runtime = yield* AgentRuntime
        yield* windowIs(true, 1)
        const session = yield* aSessionOn(workspace, 'claude')
        const began = performance.now()
        const report = yield* runtime.prompt(session.id, 'write it')
        const waited = performance.now() - began
        return { report, waited, entries: yield* threadOf(session.id) }
      }),
    )

    expect(seen.report.stopReason).toBe('end_turn')
    // The grace was waited, and no more.
    expect(seen.waited).toBeGreaterThanOrEqual(900)
    const said = agent.answers.used[0]?.text ?? ''
    expect(said.toLowerCase()).toContain("waiting for the user's approval, request #1")
    expect(said).toContain('has not happened')
    expect(existsSync(target)).toBe(false)
    expect(callsIn(seen.entries).map((entry) => entry.state)).toEqual(['pending'])
    expect(questionsIn(seen.entries).map((entry) => entry.state)).toEqual(['pending'])
  })

  test('allowed later: Hemera writes the file and hands the result over in a turn of its own', async () => {
    const target = join(outside, 'notes.md')
    const agent = fakeAgent({ steps: writer(target) })

    const seen = await toolApplication(dataFolder)(agent)(
      Effect.gen(function* () {
        const runtime = yield* AgentRuntime
        yield* windowIs(false)
        const session = yield* aSessionOn(workspace, 'claude')
        yield* runtime.prompt(session.id, 'write it')
        const id = yield* asked(session.id)
        // The agent ended its turn waiting: it is idle when the answer comes.
        yield* runtime.decide(session.id, id, 'allowed')
        const entries = yield* until(
          threadOf(session.id),
          (thread) => deliveryTurns(thread).length > 0,
        )
        return entries
      }),
    )

    expect(readFileSync(target, 'utf8')).toBe('late')
    // The agent was sent two prompts: the user's, and the answer, which carries the result.
    expect(agent.answers.prompts).toHaveLength(2)
    const handed = handedTo(agent)[1] ?? ''
    expect(handed).toContain('request #1')
    expect(handed).toContain('approved')
    expect(handed).toContain(target.toLowerCase())
    // The same entry, now done.
    expect(callsIn(seen).map((entry) => entry.state)).toEqual(['completed'])
    expect(deliveryTurns(seen)).toHaveLength(1)
  })

  test('refused later: nothing is written, and the refusal is handed over the same way', async () => {
    const target = join(outside, 'notes.md')
    const agent = fakeAgent({ steps: writer(target) })

    const seen = await toolApplication(dataFolder)(agent)(
      Effect.gen(function* () {
        const runtime = yield* AgentRuntime
        yield* windowIs(false)
        const session = yield* aSessionOn(workspace, 'claude')
        yield* runtime.prompt(session.id, 'write it')
        const id = yield* asked(session.id)
        yield* runtime.decide(session.id, id, 'refused')
        return yield* until(threadOf(session.id), (thread) => deliveryTurns(thread).length > 0)
      }),
    )

    expect(existsSync(target)).toBe(false)
    const handed = handedTo(agent)[1] ?? ''
    expect(handed).toContain('request #1')
    expect(handed).toContain('refused by the user')
    expect(handed).toContain('nothing was done')
    expect(callsIn(seen).map((entry) => entry.state)).toEqual(['refused'])
  })

  test('answered while the agent works on, the answer goes once its turn ends', async () => {
    const target = join(outside, 'notes.md')
    let answer: () => void = () => undefined
    const answered = new Promise<void>((resolve) => {
      answer = resolve
    })
    let steps = 0
    const agent = fakeAgent({
      steps: [...writer(target), { does: 'says', text: 'Meanwhile, something else.' }],
      // The turn goes on after the call answered "waiting", and holds until the human answered.
      between: () => {
        steps += 1
        return steps === 3 ? answered : Promise.resolve()
      },
    })

    const seen = await toolApplication(dataFolder)(agent)(
      Effect.gen(function* () {
        const runtime = yield* AgentRuntime
        yield* windowIs(false)
        const session = yield* aSessionOn(workspace, 'claude')
        const turn = yield* Effect.forkScoped(runtime.prompt(session.id, 'write it'))
        const id = yield* asked(session.id)
        yield* until(threadOf(session.id), () => agent.answers.used.length > 0)
        yield* runtime.decide(session.id, id, 'allowed')
        yield* until(threadOf(session.id), (thread) =>
          callsIn(thread).some((entry) => entry.state === 'completed'),
        )
        // Nothing is handed over inside the turn that is running.
        const during = agent.answers.prompts.length
        answer()
        yield* Fiber.join(turn)
        const entries = yield* until(
          threadOf(session.id),
          (thread) => deliveryTurns(thread).length > 0,
        )
        return { during, entries }
      }),
    )

    expect(seen.during).toBe(1)
    expect(handedTo(agent)[1]).toContain('request #1')
    expect(deliveryTurns(seen.entries)).toHaveLength(1)
  })
})

describe('The window is not focused: no grace', () => {
  test('the agent is answered at once, whatever the grace', async () => {
    const target = join(outside, 'notes.md')
    const agent = fakeAgent({ steps: writer(target) })

    const seen = await toolApplication(dataFolder)(agent)(
      Effect.gen(function* () {
        const runtime = yield* AgentRuntime
        yield* windowIs(false, 60)
        const session = yield* aSessionOn(workspace, 'claude')
        const began = performance.now()
        yield* runtime.prompt(session.id, 'write it')
        return performance.now() - began
      }),
    )

    expect(seen).toBeLessThan(10_000)
    expect(agent.answers.used[0]?.text).toContain('request #1')
  })
})

describe('A Stop leaves a request that no longer holds the turn', () => {
  test('the question stays, and an answer after the Stop still acts', async () => {
    const target = join(outside, 'notes.md')
    const agent = fakeAgent({ steps: writer(target) })

    const seen = await toolApplication(dataFolder)(agent)(
      Effect.gen(function* () {
        const runtime = yield* AgentRuntime
        yield* windowIs(false)
        const session = yield* aSessionOn(workspace, 'claude')
        yield* runtime.prompt(session.id, 'write it')
        const id = yield* asked(session.id)
        yield* runtime.stop(session.id)
        const after = questionsIn(yield* threadOf(session.id)).map((entry) => entry.state)
        yield* runtime.decide(session.id, id, 'allowed')
        yield* until(threadOf(session.id), (thread) => deliveryTurns(thread).length > 0)
        return after
      }),
    )

    expect(seen).toEqual(['pending'])
    expect(readFileSync(target, 'utf8')).toBe('late')
  })
})

describe('The Session ends: the request is withdrawn', () => {
  test('the agent that goes takes the question with it, and nothing is written or handed', async () => {
    const target = join(outside, 'notes.md')
    const agent = fakeAgent({ steps: writer(target) })

    const seen = await toolApplication(dataFolder)(agent)(
      Effect.gen(function* () {
        const runtime = yield* AgentRuntime
        yield* windowIs(false)
        const session = yield* aSessionOn(workspace, 'claude')
        yield* runtime.prompt(session.id, 'write it')
        const id = yield* asked(session.id)
        agent.die()
        const entries = yield* until(threadOf(session.id), (thread) =>
          questionsIn(thread).every((entry) => entry.state === 'cancelled'),
        )
        // Too late: it acts on nothing, and says nothing wrong.
        yield* runtime.decide(session.id, id, 'allowed')
        yield* pause(200)
        return { entries, prompts: agent.answers.prompts.length }
      }),
    )

    expect(questionsIn(seen.entries).map((entry) => entry.state)).toEqual(['cancelled'])
    expect(existsSync(target)).toBe(false)
    expect(seen.prompts).toBe(1)
    expect(callsIn(seen.entries).map((entry) => entry.state)).not.toContain('completed')
    expect(callsIn(seen.entries).map((entry) => entry.state)).not.toContain('pending')
  })
})

describe('Nothing is done twice', () => {
  test('a retry under the same key is told the same request, and the write happens once', async () => {
    const target = join(outside, 'notes.md')
    const call = (id: string): FakeStep => ({
      does: 'uses',
      call: 'fs_write',
      arguments: { path: target, content: 'late', key: 'k1' },
      id,
    })
    const agent = fakeAgent({
      steps: [call('toolu_first'), call('toolu_again'), { does: 'says', text: 'I wait.' }],
    })

    const seen = await toolApplication(dataFolder)(agent)(
      Effect.gen(function* () {
        const runtime = yield* AgentRuntime
        yield* windowIs(false)
        const session = yield* aSessionOn(workspace, 'claude')
        yield* runtime.prompt(session.id, 'write it')
        const id = yield* asked(session.id)
        yield* runtime.decide(session.id, id, 'allowed')
        const entries = yield* until(
          threadOf(session.id),
          (thread) => deliveryTurns(thread).length > 0,
        )
        // A second answer to the same request acts on nothing.
        yield* runtime.decide(session.id, id, 'allowed')
        yield* pause(200)
        return { entries, prompts: agent.answers.prompts.length }
      }),
    )

    expect(agent.answers.used.map((one) => one.text.includes('request #1'))).toEqual([true, true])
    expect(questionsIn(seen.entries)).toHaveLength(1)
    expect(callsIn(seen.entries).map((entry) => entry.state)).toEqual(['completed'])
    expect(seen.prompts).toBe(2)
    expect(handedTo(agent).filter((text) => text.includes('request #1'))).toHaveLength(1)
  })
})

describe('A restart leaves no question nobody can answer', () => {
  /** A request the previous run left open in the thread, as the agent's and as Hemera's. */
  const leftOpen = (sessionId: string) =>
    Effect.gen(function* () {
      const sessions = yield* Sessions
      for (const [role, id] of [
        ['agent', 'toolu_agent'],
        ['hemera', 'hemera-question'],
      ] as const) {
        yield* sessions.write(sessionId, {
          role,
          kind: 'permission_request',
          body: 'rm -rf hemera/src',
          payload: JSON.stringify({
            toolCallId: id,
            options: [
              { optionId: 'allowed', name: 'Allow once', kind: 'allow_once' },
              { optionId: 'refused', name: 'Refuse', kind: 'reject_once' },
            ],
          }),
          correlationId: `perm:${id}`,
          state: 'pending',
        })
      }
    })

  test('every request left open is withdrawn at start, and an answer to one errs nowhere', async () => {
    const first = fakeAgent({ steps: [] })
    const second = fakeAgent({ steps: [] })
    const session = await toolApplication(dataFolder)(first)(
      Effect.gen(function* () {
        const created = yield* aSessionOn(workspace, 'claude')
        yield* leftOpen(created.id)
        return created
      }),
    )

    const seen = await toolApplication(dataFolder)(second)(
      Effect.gen(function* () {
        const runtime = yield* AgentRuntime
        const entries = yield* until(threadOf(session.id), (thread) =>
          thread.every((entry) => entry.kind !== 'permission_request' || entry.state !== 'pending'),
        )
        yield* runtime.decide(session.id, 'toolu_agent', 'allowed')
        return entries
      }),
    )

    const requests = seen.filter((entry) => entry.kind === 'permission_request')
    expect(requests.map((entry) => entry.state)).toEqual(['cancelled', 'cancelled'])
    const decisions = seen.filter((entry) => entry.kind === 'permission_decision')
    expect(decisions).toHaveLength(2)
    expect(decisions.every((entry) => entry.body.startsWith('Withdrawn'))).toBe(true)
  })

  test('an answer to a request nobody waits on closes it quietly', async () => {
    const agent = fakeAgent({ steps: [] })
    const seen = await toolApplication(dataFolder)(agent)(
      Effect.gen(function* () {
        const runtime = yield* AgentRuntime
        const session = yield* aSessionOn(workspace, 'claude')
        yield* leftOpen(session.id)
        yield* runtime.decide(session.id, 'hemera-question', 'allowed')
        return yield* threadOf(session.id)
      }),
    )

    const request = seen.find(
      (entry) =>
        entry.kind === 'permission_request' && entry.correlationId === 'perm:hemera-question',
    )
    expect(request?.state).toBe('cancelled')
    const decision = seen.find((entry) => entry.correlationId === 'decision:hemera-question')
    expect(decision?.body.startsWith('Withdrawn')).toBe(true)
  })
})
