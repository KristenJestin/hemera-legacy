/**
 * The app tester mode reaches a Session's agent (#300): while it is on, the agent is given the
 * standing brief with its first prompt and lent the two tools, and the Context view shows the
 * brief; while it is off, nothing of it reaches the agent.
 */

import { mkdtempSync, realpathSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, test } from 'vite-plus/test'
import { Effect } from 'effect'

import { APP_TESTER_BRIEF, TESTER_TOOLS, contextUri } from '@hemera/core'

import { fakeAgent } from '#engine/agents/fake.ts'
import { AgentRuntime } from '#engine/agents/runtime.ts'
import { Context as AgentContext } from '#engine/context/service.ts'
import { Preferences } from '#engine/preferences.ts'
import { ToolAccess } from '#engine/tools/access.ts'
import { application, aSessionOn } from './application.ts'

let dataFolder: string
let workingDirectory: string
let opened: ReturnType<typeof application>

beforeEach(() => {
  dataFolder = realpathSync.native(mkdtempSync(join(tmpdir(), 'hemera-tester-')))
  workingDirectory = realpathSync.native(mkdtempSync(join(tmpdir(), 'hemera-workspace-')))
  opened = application(dataFolder)
})

afterEach(() => {
  rmSync(dataFolder, { recursive: true, force: true })
  rmSync(workingDirectory, { recursive: true, force: true })
})

/** An agent that answers every turn with one line. */
const answering = () => fakeAgent({ steps: [{ does: 'says', text: 'done' }] })

/**
 * Two turns of a new Session on Claude Code: what it was provided afterwards, and what its agent
 * was lent, read from the grant its token names.
 */
const twoTurns = (agent: ReturnType<typeof answering>, tester: boolean) =>
  Effect.gen(function* () {
    if (tester) yield* (yield* Preferences).write({ appTester: true })
    const runtime = yield* AgentRuntime
    const session = yield* aSessionOn(workingDirectory, 'claude')
    yield* runtime.prompt(session.id, 'start on the reader')
    yield* runtime.prompt(session.id, 'carry on')
    const bearer = agent.answers.mcpServers[0]?.[0]?.headers[0]?.value ?? ''
    const grant = yield* (yield* ToolAccess).byToken(bearer.replace(/^Bearer /, ''))
    return {
      provided: yield* (yield* AgentContext).provided(session.id),
      offered: grant?.offered ?? [],
    }
  })

describe('While the app tester mode is on', () => {
  test("a new Session's agent is given the brief with its first prompt, once", async () => {
    const agent = answering()
    const seen = await opened(agent)(twoTurns(agent, true))

    const first = agent.answers.blocks[0] ?? []
    expect(first).toContainEqual({
      type: 'resource',
      resource: { uri: contextUri('app-tester'), mimeType: 'text/plain', text: APP_TESTER_BRIEF },
    })
    expect(first.at(-1)).toEqual({ type: 'text', text: 'start on the reader' })
    expect(agent.answers.blocks[1]).toEqual([{ type: 'text', text: 'carry on' }])

    // The Context view lists it as Hemera's own words, with how it reached the agent.
    expect(seen.provided.filter((one) => one.path === 'app-tester')).toEqual([
      expect.objectContaining({ kind: 'notice', reached: 'embedded_resource' }),
    ])
    // And the agent is lent the two tools.
    for (const tool of TESTER_TOOLS) expect(seen.offered).toContain(tool)
  })
})

describe('While the app tester mode is off', () => {
  test('no brief and no tester tool reach the agent', async () => {
    const agent = answering()
    const seen = await opened(agent)(twoTurns(agent, false))

    expect(agent.answers.blocks.flat().some((block) => block.type === 'resource')).toBe(false)
    expect(seen.provided.some((one) => one.path === 'app-tester')).toBe(false)
    for (const tool of TESTER_TOOLS) expect(seen.offered).not.toContain(tool)
  })
})
