/**
 * The end of a turn, as the window sees it arrive (issue #223).
 *
 * The row says a turn is over from the thread's `turn` entry, and the composer draws its Stop
 * from the Session's `running`. Both are read from the agent store, over the engine on the fake
 * agent: the state that holds the `turn` entry is the one that no longer holds the turn running,
 * so "Done" and the Send are drawn in the same frame.
 */

import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, test } from 'vite-plus/test'

import { fakeAgent } from '#engine/agents/fake.ts'
import {
  type AgentSessionState,
  agentOf,
  listenToAgents,
  say,
  subscribeToAgent,
} from '#renderer/agent-store.ts'

import { withQualifiedOpenCode } from './unqualified.ts'
import { type OpenWindow, install, openWindow } from './window.ts'

let dataFolder: string
let workspace: string
let opened: OpenWindow | null = null
let stops: (() => void)[] = []

beforeEach(() => {
  dataFolder = mkdtempSync(join(tmpdir(), 'hemera-window-turn-end-'))
  workspace = mkdtempSync(join(tmpdir(), 'hemera-window-turn-end-workspace-'))
})

afterEach(async () => {
  for (const stop of stops) stop()
  stops = []
  await opened?.close()
  opened = null
  rmSync(dataFolder, { recursive: true, force: true })
  rmSync(workspace, { recursive: true, force: true })
})

describe('The turn that ends puts the Send back with its Done', () => {
  withQualifiedOpenCode()

  test('the state that holds the turn entry holds no turn running', async () => {
    opened = await openWindow(dataFolder, fakeAgent({ steps: [{ does: 'says', text: 'hello' }] }))
    install(opened.bridge)
    stops = [listenToAgents()]
    const project = await opened.bridge.invoke('projects.create', {
      name: 'Atlas',
      tone: 'primary',
      mainPath: workspace,
    })
    const session = await opened.bridge.invoke('sessions.create', {
      projectId: project.id,
      provider: 'opencode',
    })

    // Every state the window was handed, in order: each is a frame the page may draw.
    const drawn: AgentSessionState[] = []
    stops.push(subscribeToAgent(() => drawn.push(agentOf(session.id))))
    await say(session.id, 'test')

    const ended = drawn.find((held) => held.entries.some((entry) => entry.kind === 'turn'))
    expect(ended?.running).toBe(false)
  })
})
