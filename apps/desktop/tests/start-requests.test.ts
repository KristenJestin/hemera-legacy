/**
 * What the window reads once as it opens, and asks again when the first answer does not come.
 *
 * The main process gives a question five seconds, and a window opening beside a Session's agent
 * being started, on a loaded machine, heard `agents.list` time out: the agent menu was drawn
 * empty and stayed empty, and a Session could not be made. The bridge here answers from a script,
 * one answer per call, so a suite can say what the first attempt got and what the next one did.
 * The waits between attempts are the window's own, in real time.
 */

import { afterAll, beforeEach, describe, expect, test } from 'vite-plus/test'

import type { AgentAvailability, EngineEvent, Project } from '@hemera/ipc'

import { agentSnapshot, listenToAgents, loadAgents } from '#renderer/agent-store.ts'
import { loadProjects, projectsSnapshot } from '#renderer/projects-store.ts'

/** What the main process rejects a question with when the engine did not answer in time. */
const TIMED_OUT = new Error('the application did not answer in time')

/** One agent, as `agents.list` answers it. */
function agent(
  id: AgentAvailability['id'],
  label: string,
  version: string | null = null,
): AgentAvailability {
  return {
    id,
    label,
    found: true,
    version,
    authenticated: true,
    installHint: '',
    loginHint: '',
    installer: 'npm',
    latest: null,
    bareMode: { means: 'flag', qualified: true, reason: null, private: '' },
  }
}

const AGENTS = [
  agent('claude', 'Claude Code'),
  agent('codex', 'Codex'),
  agent('opencode', 'OpenCode'),
]

/** What each channel answers, call after call: a value, or an error to reject with. */
let script: Map<string, unknown[]>

/** Every channel asked, in the order it was asked. */
let asked: string[]

/** What the engine would push, once the store is listening. */
let push: (event: EngineEvent) => void = () => undefined

beforeEach(() => {
  script = new Map()
  asked = []
  // The one place a test reaches into the page: the preload is not there, so the bridge is.
  Object.defineProperty(globalThis, 'window', {
    configurable: true,
    value: {
      hemera: {
        invoke: async (name: string) => {
          asked.push(name)
          const answers = script.get(name) ?? []
          // The last answer of a script is the one every later call gets.
          const answer = answers.length > 1 ? answers.shift() : answers[0]
          if (answer instanceof Error) throw answer
          return await Promise.resolve(answer)
        },
        on: (listener: (event: EngineEvent) => void) => {
          push = listener
          return () => undefined
        },
      },
    },
  })
})

const stop = { listening: (): void => undefined }

afterAll(() => {
  stop.listening()
})

describe('agents.list is asked again until the menu has something to draw', () => {
  test('a list that never answers is said to have failed, and Retry fills it', async () => {
    script.set('agents.list', [TIMED_OUT])
    expect(agentSnapshot().listing).toBe('looking')

    await loadAgents()

    // Asked again, then given up on: the menu says it could not list the agents rather than
    // drawing an empty list, and offers to ask once more.
    expect(asked.filter((name) => name === 'agents.list').length).toBeGreaterThan(1)
    expect(agentSnapshot()).toMatchObject({ listing: 'failed', agents: [] })

    script.set('agents.list', [{ agents: AGENTS }])
    const retried = loadAgents()
    expect(agentSnapshot().listing).toBe('looking')
    await retried
    expect(agentSnapshot().listing).toBe('listed')
    expect(agentSnapshot().agents.map((one) => one.id)).toEqual(['claude', 'codex', 'opencode'])
  }, 20_000)

  test('a first timeout is followed by a retry that fills the list', async () => {
    script.set('agents.list', [TIMED_OUT, { agents: [AGENTS[0]] }])

    await loadAgents()

    expect(asked).toEqual(['agents.list', 'agents.list'])
    expect(agentSnapshot().listing).toBe('listed')
    expect(agentSnapshot().agents.map((one) => one.id)).toEqual(['claude'])
    expect(agentSnapshot().refusal).toBeNull()
  })

  test('the list is read again when the engine says the agents changed', async () => {
    stop.listening = listenToAgents()
    const versioned = [
      agent('claude', 'Claude Code', '2.0.31'),
      agent('codex', 'Codex', '2.0.31'),
      agent('opencode', 'OpenCode', '2.0.31'),
    ]
    script.set('agents.list', [{ agents: versioned }])

    push({ event: 'agents.changed' })

    await expect.poll(() => agentSnapshot().agents.length).toBe(3)
    expect(agentSnapshot().agents.every((one) => one.version === '2.0.31')).toBe(true)
  })
})

describe('the Projects are asked again when the first answer does not come', () => {
  test('a first timeout is followed by a retry that fills the bar', async () => {
    const atlas: Pick<Project, 'id' | 'name'> = { id: 'atlas', name: 'Atlas' }
    script.set('projects.list', [TIMED_OUT, [atlas]])

    expect(await loadProjects()).toBe(true)

    expect(asked).toEqual(['projects.list', 'projects.list'])
    expect(projectsSnapshot()).toMatchObject({ loaded: true, refusal: null, projects: [atlas] })
  })
})
