/**
 * What the Session's line and its details draw (design D6-10, D6-12, issue #219): what goes on in
 * the Session under its title, the tab the details open on, and the Context tab.
 *
 * The page imports the design system's components, which need a browser; what is read here is
 * the pure module the page hands them from — the runs and the agent's own shell commands as the
 * line lists them, the tab a Session opens on, and the instructions and tools of the Context view —
 * and, over the whole engine on the fake agent, the stores those are read from.
 */

import { mkdtempSync, realpathSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, test } from 'vite-plus/test'

import { AGENTS_FILE } from '@hemera/core'
import type { CommandRun, ContextView, Provided } from '@hemera/ipc'

import { fakeAgent } from '#engine/agents/fake.ts'
import { type AgentShellCall, agentShellCallsOf } from '#renderer/agent-tool-payloads.ts'
import { agentOf, listenToAgents, say } from '#renderer/agent-store.ts'
import {
  contextListsOf,
  detailsTabsOf,
  goingOnOf,
  lineOf,
  openingTabOf,
  overBefore,
} from '#renderer/session-details.ts'
import { contextOf, listenToTools, readContext, runCommand, runsOf } from '#renderer/tools-store.ts'

import { withQualifiedOpenCode } from './unqualified.ts'
import { type OpenWindow, install, openWindow } from './window.ts'

/** A run as the engine pushes one. */
function aRun(id: string, cwd: string, state: CommandRun['state'], commandId: string | null) {
  return {
    id,
    projectId: 'atlas',
    sessionId: 'session-1',
    commandId,
    name: 'dev',
    line: 'pnpm dev',
    type: 'serve' as const,
    scope: 'workspace' as const,
    cwd,
    folder: null,
    workspaceId: null,
    workspaceName: 'main',
    environment: {},
    state,
    pid: 4242,
    url: state === 'running' ? 'http://localhost:5173' : null,
    readyAt: null,
    readiness: state === 'running' ? ('starting' as const) : null,
    portConflict: null,
    heldAgainst: [],
    exitCode: state === 'running' ? null : 0,
    startedBy: 'agent' as const,
    output: 'ready\n',
    dropped: 0,
    startedAt: '2026-09-23T08:00:00.000Z',
    endedAt: null,
    joined: false,
  } satisfies CommandRun
}

/** `HH:MM` of a moment, in the zone the test runs in, which is the one the window reads in. */
function clockOf(at: string | number): string {
  return new Date(at).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })
}

/** A command the agent ran in its own shell, as the thread reads one. */
function aShell(id: string, at: number, state: AgentShellCall['state']): AgentShellCall {
  return { id, command: 'pnpm vitest run csv', state, output: '✓ 3 passed', at }
}

describe('The agent starts the app and the user opens it', () => {
  test('the line lists each run with its folder under the root, its address and its output', () => {
    const runs = [
      aRun('r1', '/home/ana/atlas', 'running', 'c1'),
      aRun('r2', '/home/ana/atlas/api', 'exited', null),
      aRun('r3', 'C:\\Users\\ana\\atlas\\web', 'stopped', 'c2'),
    ]

    expect(goingOnOf(runs.slice(0, 2), [], '/home/ana/atlas')).toEqual([
      expect.objectContaining({
        kind: 'run',
        id: 'r1',
        folder: '.',
        state: 'running',
        url: 'http://localhost:5173',
        output: 'ready\n',
        oneOff: false,
        startedBy: 'agent',
        workspace: 'main',
        at: clockOf('2026-09-23T08:00:00.000Z'),
      }),
      expect.objectContaining({ id: 'r2', folder: 'api', state: 'finished', oneOff: true }),
    ])
    // A Windows root reads the same way.
    expect(goingOnOf(runs.slice(2), [], 'C:\\Users\\ana\\atlas')[0]).toMatchObject({
      folder: 'web',
    })
    // A root not known yet shows the folder as the run was started in it.
    expect(goingOnOf(runs.slice(1, 2), [], null)[0]).toMatchObject({
      folder: '/home/ana/atlas/api',
    })
  })

  test('the line holds the agent’s own shell commands beside the runs, in the order they began', () => {
    const run = aRun('r1', '/home/ana/atlas', 'running', 'c1')
    const before = Date.parse(run.startedAt) - 60_000
    const after = Date.parse(run.startedAt) + 60_000

    const items = goingOnOf(
      [run],
      [aShell('s2', after, 'running'), aShell('s1', before, 'finished')],
      '/home/ana/atlas',
    )

    expect(items.map((item) => item.id)).toEqual(['s1', 'r1', 's2'])
    expect(items[0]).toEqual({
      kind: 'shell',
      id: 's1',
      command: 'pnpm vitest run csv',
      folder: '.',
      workspace: 'main',
      state: 'finished',
      output: '✓ 3 passed',
      exitCode: undefined,
      at: clockOf(before),
    })
  })

  test('the line counts a run’s seconds from when it started, and to when it ended', () => {
    const running = aRun('r1', '/home/ana/atlas', 'running', 'c1')
    const ended = {
      ...aRun('r2', '/home/ana/atlas', 'exited', 'c2'),
      endedAt: '2026-09-23T08:01:24.000Z',
    }

    expect(goingOnOf([running, ended], [], '/home/ana/atlas')).toEqual([
      expect.objectContaining({
        id: 'r1',
        startedAt: Date.parse(running.startedAt),
        endedAt: null,
      }),
      expect.objectContaining({
        id: 'r2',
        startedAt: Date.parse('2026-09-23T08:00:00.000Z'),
        endedAt: Date.parse('2026-09-23T08:01:24.000Z'),
      }),
    ])
  })

  test('the details open on the Activity when the turn has one, and on the Context otherwise', () => {
    expect(openingTabOf(detailsTabsOf(1, 0, null))).toBe('activity')
    expect(openingTabOf(detailsTabsOf(0, 0, null))).toBe('context')
  })
})

describe('A URL is ready only after it answers', () => {
  test('the line carries the readiness the run was pushed with', () => {
    const starting = aRun('r1', '/home/ana/atlas', 'running', 'c1')
    const ready = { ...starting, readiness: 'ready' as const, readyAt: '2026-09-23T08:00:02.000Z' }
    expect(goingOnOf([starting], [], '/home/ana/atlas')[0]).toMatchObject({
      readiness: 'starting',
    })
    expect(goingOnOf([ready], [], '/home/ana/atlas')[0]).toMatchObject({ readiness: 'ready' })
    // A run with no address has no readiness to say.
    expect(goingOnOf([aRun('r2', '/a', 'exited', 'c1')], [], '/a')[0]).toMatchObject({
      readiness: undefined,
    })
  })
})

describe('A run shows what it ran', () => {
  test('the line carries its variables and the Workspace it runs in', () => {
    const run = {
      ...aRun('r1', '/home/ana/login-form', 'running', 'c1'),
      workspaceName: 'login-form',
      environment: { PORT: '3001' },
      startedBy: 'user' as const,
    }
    expect(goingOnOf([run], [], '/home/ana/login-form')[0]).toMatchObject({
      environment: { PORT: '3001' },
      workspace: 'login-form',
      startedBy: 'user',
    })
  })
})

/** What the engine answers of a Session's context, with the sources and the catalogue given. */
function aView(
  provided: ContextView['provided'][number]['kind'][],
  commands: ContextView['commands'] = [],
): ContextView {
  return {
    provided: provided.map((kind) => ({
      kind,
      path: kind === 'base' ? '' : 'AGENTS.md',
      fingerprint: 'f'.repeat(64),
      deliveredAt: '2026-09-23T08:00:00.000Z',
      reached: kind === 'base' ? 'embedded_resource' : 'read_natively',
    })),
    tools: [{ name: 'fs_read', bound: '256 KiB' }],
    commands,
  }
}

describe('The details open on the tab that has something', () => {
  test('a fresh Session whose context is only the base and the tools has no tab with something', () => {
    const tabs = detailsTabsOf(0, 0, aView(['base']))

    expect(tabs).toEqual({ activity: false, context: false })
    expect(openingTabOf(tabs)).toBe('context')
  })

  test('AGENTS.md given at the start or read by the agent is no delivery', () => {
    expect(detailsTabsOf(0, 0, aView(['base', 'provided'])).context).toBe(false)
    expect(detailsTabsOf(0, 0, aView(['base', 'native'])).context).toBe(false)
  })

  test('with no plan, no file and no context known, they open on the Context', () => {
    const tabs = detailsTabsOf(0, 0, null)

    expect(tabs).toEqual({ activity: false, context: false })
    expect(openingTabOf(tabs)).toBe('context')
  })

  test('a delivery makes them open on the Context tab', () => {
    const tabs = detailsTabsOf(0, 0, aView(['base', 'provided', 'instructions']))

    expect(tabs).toEqual({ activity: false, context: true })
    expect(openingTabOf(tabs)).toBe('context')
  })

  test('a plan makes them open on the Activity tab, over a delivery', () => {
    const tabs = detailsTabsOf(2, 1, aView(['base', 'instructions']))

    expect(tabs.activity).toBe(true)
    expect(openingTabOf(tabs)).toBe('activity')
  })
})

/** One thing a Session was provided, at the time given, reached the way its kind says. */
function aSource(
  kind: Provided['kind'],
  reached: Provided['reached'],
  deliveredAt = '2026-09-23T08:00:00.000Z',
): Provided {
  return {
    kind,
    path: kind === 'base' ? '' : 'AGENTS.md',
    fingerprint: 'f'.repeat(64),
    deliveredAt,
    reached,
  }
}

/** A view with the sources given, the tools of a fresh Session and an empty catalogue. */
function aViewOf(provided: Provided[]): ContextView {
  return {
    provided,
    tools: [{ name: 'search', bound: '200 matches and 1 MiB scanned a call' }],
    commands: [],
  }
}

/** `HH:MM` of a moment, in the zone the test runs in, which is the one the window reads in. */
function timeOf(iso: string): string {
  return new Date(iso).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })
}

/** `DD Mon HH:MM` of a moment, in the zone the test runs in, which is the one the window reads in. */
function atOf(iso: string): string {
  const at = new Date(iso)
  const day = at.toLocaleDateString('en-GB', { day: '2-digit', month: 'short' })
  return `${day} ${timeOf(iso)}`
}

/** The root the page reads its Workspace at. */
const ROOT = '/home/someone/projects/atlas'

/** When the fixtures of this block were provided, unless they say otherwise. */
const STARTED = '2026-09-23T08:00:00.000Z'

describe('The Context tab says how the instructions reached the agent', () => {
  test('AGENTS.md given at the start is one line, and the base one line after it, each with its time', () => {
    const view = aViewOf([
      aSource('base', 'embedded_resource'),
      aSource('provided', 'session_start'),
    ])

    expect(contextListsOf(view, ROOT).instructions).toEqual([
      {
        label: 'AGENTS.md',
        file: true,
        detail: 'given at the start of the Session',
        at: atOf(STARTED),
      },
      { label: 'The base', detail: 'as a resource of the first prompt', at: atOf(STARTED) },
    ])
  })

  test('AGENTS.md read by the agent says so, and the base goes through its system prompt', () => {
    const view = aViewOf([aSource('base', 'system_prompt'), aSource('native', 'read_natively')])

    expect(contextListsOf(view, ROOT).instructions).toEqual([
      { label: 'AGENTS.md', file: true, detail: 'read by the agent', at: atOf(STARTED) },
      { label: 'The base', detail: 'through its system prompt', at: atOf(STARTED) },
    ])
  })

  test('a Workspace without AGENTS.md says so in a sentence', () => {
    const view = aViewOf([aSource('base', 'embedded_resource')])

    expect(contextListsOf(view, ROOT).instructions).toEqual([
      { label: 'This Workspace has no AGENTS.md' },
      { label: 'The base', detail: 'as a resource of the first prompt', at: atOf(STARTED) },
    ])
  })

  test('the last change is the latest delivery, with its time, and the file says it changed then', () => {
    const view = aViewOf([
      aSource('base', 'embedded_resource'),
      aSource('provided', 'session_start'),
      aSource('instructions', 'delivery_prompt', '2026-09-23T10:05:00.000Z'),
      aSource('instructions', 'delivery_prompt', '2026-09-23T12:40:00.000Z'),
    ])

    const [file, change, base] = contextListsOf(view, ROOT).instructions
    expect(file).toEqual({
      label: 'AGENTS.md',
      file: true,
      detail: 'given at the start of the Session',
      at: atOf(STARTED),
      changed: atOf('2026-09-23T12:40:00.000Z'),
    })
    expect(change?.label).toBe('Last change')
    expect(change?.detail).toBe('delivered between two turns')
    expect(change?.at).toMatch(/^\d\d Sep/)
    expect(change?.at?.endsWith(timeOf('2026-09-23T12:40:00.000Z'))).toBe(true)
    expect(base?.label).toBe('The base')
  })

  test('a file written during the Session had none at the start, and its delivery is the change', () => {
    const view = aViewOf([
      aSource('base', 'embedded_resource'),
      aSource('instructions', 'delivery_prompt', '2026-09-23T12:40:00.000Z'),
    ])

    const lines = contextListsOf(view, ROOT).instructions
    expect(lines.map((line) => [line.label, line.detail])).toEqual([
      ['AGENTS.md', 'none at the start of the Session'],
      ['Last change', 'delivered between two turns'],
      ['The base', 'as a resource of the first prompt'],
    ])
    expect(lines[0]?.changed).toBe(atOf('2026-09-23T12:40:00.000Z'))
  })

  test('nothing is listed before anything has gone to the agent', () => {
    expect(contextListsOf(aViewOf([]), ROOT).instructions).toEqual([])
  })

  test('the tools and the catalogue are listed as the engine answered them', () => {
    const view: ContextView = {
      ...aViewOf([]),
      commands: [{ name: 'check', line: 'pnpm check' }],
    }

    const lists = contextListsOf(view, ROOT)
    expect(lists.tools).toEqual([{ name: 'search', bound: '200 matches and 1 MiB scanned a call' }])
    expect(lists.commands).toEqual([{ name: 'check', command: 'pnpm check' }])
  })

  test('the Workspace is the main one, at the root the page reads', () => {
    expect(contextListsOf(aViewOf([]), ROOT).workspace).toEqual({ name: 'main', path: ROOT })
  })

  test("the Workspace is the Session's own when the composer chose another", () => {
    expect(contextListsOf(aViewOf([]), ROOT, 'login-form').workspace).toEqual({
      name: 'login-form',
      path: ROOT,
    })
  })

  test('the tools were lent when the base went in, and have no time before it', () => {
    expect(contextListsOf(aViewOf([]), ROOT).lentAt).toBeUndefined()
    const view = aViewOf([aSource('base', 'embedded_resource', '2026-09-23T09:30:00.000Z')])
    expect(contextListsOf(view, ROOT).lentAt).toBe(atOf('2026-09-23T09:30:00.000Z'))
  })
})

/** Something a `define` Session handed its agent between two turns, named as the engine names it. */
function aHanding(kind: Provided['kind'], path: string, deliveredAt: string): Provided {
  return { kind, path, fingerprint: 'f'.repeat(64), deliveredAt, reached: 'delivery_prompt' }
}

describe('The Context tab lists what a define Session handed its agent', () => {
  test('a phase change, an edit, an answer and a sub-agent result are four lines in plain words, each with its time', () => {
    const view = aViewOf([
      aSource('base', 'embedded_resource'),
      aHanding('brief', 'plan · revision 1 · writer', '2026-09-23T13:40:00.000Z'),
      aHanding('edit', 'scope,expected_outcome', '2026-09-23T14:02:00.000Z'),
      aHanding('answer', 'Which format?', '2026-09-23T14:05:00.000Z'),
      aHanding('internal', '', '2026-09-23T14:30:00.000Z'),
    ])

    const lists = contextListsOf(view, ROOT)
    expect(lists.handed).toEqual([
      {
        label: 'The instructions for the Plan phase went to the agent',
        at: atOf('2026-09-23T13:40:00.000Z'),
      },
      {
        label: 'Your edits to Scope, Expected outcome went to the agent',
        at: atOf('2026-09-23T14:02:00.000Z'),
      },
      {
        label: 'Your answer to “Which format?” went to the agent',
        at: atOf('2026-09-23T14:05:00.000Z'),
      },
      {
        label: 'The result of a sub-agent went to the agent',
        at: atOf('2026-09-23T14:30:00.000Z'),
      },
    ])
    // They are not instructions: the instructions still read as the file and the base.
    expect(lists.instructions.map((line) => line.label)).toEqual([
      'This Workspace has no AGENTS.md',
      'The base',
    ])
  })

  test('a brief after a Rework names its revision, and one with no phase names the Spec', () => {
    const view = aViewOf([
      aHanding('brief', 'shape · revision 2 · reader', STARTED),
      aHanding('brief', 'no phase · revision 1 · writer', STARTED),
    ])

    expect(contextListsOf(view, ROOT).handed.map((line) => line.label)).toEqual([
      'The instructions for the Shape phase of revision 2 went to the agent',
      'The instructions for the Spec went to the agent',
    ])
  })

  test('an edit or an answer recorded before it was named is said without the name', () => {
    const view = aViewOf([aHanding('edit', '', STARTED), aHanding('answer', '', STARTED)])

    expect(contextListsOf(view, ROOT).handed.map((line) => line.label)).toEqual([
      'Your edits to the Spec went to the agent',
      'Your answers went to the agent',
    ])
  })

  test('a Session that is not defining a Spec was handed nothing more', () => {
    const view = aViewOf([
      aSource('base', 'embedded_resource'),
      aSource('provided', 'session_start'),
      aSource('instructions', 'delivery_prompt'),
    ])

    expect(contextListsOf(view, ROOT).handed).toEqual([])
  })
})

describe('The Context tab lists what Hemera said to the agent of its own', () => {
  test('a declined proposal and the New Spec request are each a line with its time', () => {
    const view = aViewOf([
      { ...aHanding('request', '', '2026-09-23T13:40:00.000Z'), reached: 'embedded_resource' },
      aHanding('notice', '', '2026-09-23T13:45:00.000Z'),
    ])

    expect(contextListsOf(view, ROOT).handed).toEqual([
      {
        label: 'The New Spec request went to the agent',
        at: atOf('2026-09-23T13:40:00.000Z'),
      },
      {
        label: 'Hemera told the agent you declined its proposal',
        at: atOf('2026-09-23T13:45:00.000Z'),
      },
    ])
  })
})

describe('A one-off command shows and is not promoted', () => {
  withQualifiedOpenCode()

  let dataFolder: string
  let workspace: string
  let opened: OpenWindow | null = null
  let stops: (() => void)[] = []

  beforeEach(() => {
    dataFolder = mkdtempSync(join(tmpdir(), 'hemera-session-details-'))
    workspace = realpathSync(mkdtempSync(join(tmpdir(), 'hemera-session-details-workspace-')))
  })

  afterEach(async () => {
    for (const stop of stops) stop()
    stops = []
    await opened?.close()
    opened = null
    rmSync(dataFolder, { recursive: true, force: true })
    rmSync(workspace, { recursive: true, force: true })
  })

  test('a line run from Run shows on the line and in the Context tab the catalogue is unchanged', async () => {
    writeFileSync(join(workspace, AGENTS_FILE), '# Atlas\n')
    opened = await openWindow(dataFolder, fakeAgent({ steps: [{ does: 'says', text: 'ok' }] }))
    install(opened.bridge)
    stops = [listenToAgents(), listenToTools()]
    const { bridge } = opened
    const project = await bridge.invoke('projects.create', {
      name: 'Atlas',
      tone: 'primary',
      mainPath: workspace,
    })
    const session = await bridge.invoke('sessions.create', {
      projectId: project.id,
      provider: 'opencode',
    })
    await readContext(session.id)
    // Nothing was given before the first turn, and the tools are lent all the same.
    expect(contextOf(session.id)?.provided).toEqual([])
    expect(contextOf(session.id)?.tools.length).toBeGreaterThan(0)

    await say(session.id, 'hello')
    // The turn ended, and the view the window holds was read again: the base and the file.
    for (let tries = 0; tries < 200 && (contextOf(session.id)?.provided.length ?? 0) < 2; tries++) {
      // oxlint-disable-next-line no-await-in-loop -- a poll: each look waits for the one before it
      await new Promise((resolve) => setTimeout(resolve, 25))
    }
    expect(contextOf(session.id)?.provided.map((one) => one.kind)).toEqual(['base', 'provided'])

    const line = `"${process.execPath}" -e "console.log('once')"`
    expect(await runCommand(session.id, { line })).toBeNull()
    expect(runsOf(session.id).map((one) => [one.commandId, one.line])).toEqual([[null, line]])
    expect(goingOnOf(runsOf(session.id), [], workspace)[0]).toMatchObject({ oneOff: true })
    expect(contextOf(session.id)?.commands).toEqual([])
  })
})

/** One tool call of the thread, as the runtime writes and the window reads it. */
function aCall(
  id: string,
  title: string,
  kind: string,
  status: string,
  rawInput: string | null,
  rawOutput: string | null,
  createdAt = 1_000,
) {
  return {
    id,
    sessionId: 'session-1',
    seq: 1,
    role: 'agent' as const,
    kind: 'tool_call' as const,
    body: title,
    payload: JSON.stringify({
      call: {
        title,
        kind,
        status,
        locations: [],
        content: [],
        rawInput:
          rawInput === null ? null : { text: rawInput, truncated: false, length: rawInput.length },
        rawOutput:
          rawOutput === null
            ? null
            : { text: rawOutput, truncated: false, length: rawOutput.length },
      },
    }),
    correlationId: `tool:${id}`,
    turnId: 'turn-1',
    state: status,
    origin: 'live' as const,
    createdAt,
  }
}

describe('The agent’s own shell commands reach the line', () => {
  test('a call of kind execute is one, its line from what it was called with, its output from what it answered', () => {
    const calls = agentShellCallsOf([
      aCall(
        'e1',
        'Run the tests',
        'execute',
        'in_progress',
        '{"command":"pnpm vitest run csv"}',
        null,
      ),
      aCall(
        'e2',
        'List',
        'execute',
        'completed',
        '{"command":"ls src"}',
        '{"output":"a.ts\\nb.ts"}',
      ),
      aCall('e3', 'Failing', 'execute', 'failed', '{"cmd":"false"}', '"exit 1"'),
    ])

    expect(calls).toEqual([
      { id: 'e1', command: 'pnpm vitest run csv', state: 'running', output: '', at: 1_000 },
      { id: 'e2', command: 'ls src', state: 'finished', output: 'a.ts\nb.ts', at: 1_000 },
      { id: 'e3', command: 'false', state: 'failed', output: 'exit 1', at: 1_000 },
    ])
  })

  test('a call of Hemera’s own tools is a run already, and a call of another kind is none', () => {
    expect(
      agentShellCallsOf([
        aCall('h1', 'mcp__hemera__commands_run', 'execute', 'completed', '{"name":"test"}', null),
        aCall('r1', 'Read', 'read', 'completed', '{"path":"a.ts"}', null),
      ]),
    ).toEqual([])
  })

  test('a call with no line said stands by its title', () => {
    expect(
      agentShellCallsOf([aCall('e1', 'pnpm build', 'execute', 'pending', null, null)]),
    ).toEqual([{ id: 'e1', command: 'pnpm build', state: 'running', output: '', at: 1_000 }])
  })
})

describe('The agent runs a command in its own shell, and the line shows it', () => {
  withQualifiedOpenCode()

  let dataFolder: string
  let workspace: string
  let opened: OpenWindow | null = null
  let stops: (() => void)[] = []

  beforeEach(() => {
    dataFolder = mkdtempSync(join(tmpdir(), 'hemera-going-on-'))
    workspace = realpathSync(mkdtempSync(join(tmpdir(), 'hemera-going-on-workspace-')))
  })

  afterEach(async () => {
    for (const stop of stops) stop()
    stops = []
    await opened?.close()
    opened = null
    rmSync(dataFolder, { recursive: true, force: true })
    rmSync(workspace, { recursive: true, force: true })
  })

  test('its line and its output reach the line under the title, over the whole engine', async () => {
    const agent = fakeAgent({
      steps: [
        {
          does: 'calls',
          call: {
            id: 'bash-1',
            title: 'Run the CSV tests',
            kind: 'execute',
            status: 'in_progress',
            rawInput: { command: 'pnpm vitest run csv' },
          },
        },
        {
          does: 'updates',
          call: { id: 'bash-1', status: 'completed', rawOutput: { output: '✓ 3 passed' } },
        },
        { does: 'says', text: 'The tests pass.' },
      ],
    })
    opened = await openWindow(dataFolder, agent)
    install(opened.bridge)
    stops = [listenToAgents(), listenToTools()]
    const project = await opened.bridge.invoke('projects.create', {
      name: 'Atlas',
      tone: 'primary',
      mainPath: workspace,
    })
    const session = await opened.bridge.invoke('sessions.create', {
      projectId: project.id,
      provider: 'opencode',
    })

    await say(session.id, 'run the tests')

    const shells = agentShellCallsOf(agentOf(session.id).entries)
    expect(goingOnOf(runsOf(session.id), shells, workspace)).toEqual([
      expect.objectContaining({
        kind: 'shell',
        command: 'pnpm vitest run csv',
        state: 'finished',
        output: '✓ 3 passed',
        folder: '.',
      }),
    ])
  })
})

describe('A run is said in the repository it runs in', () => {
  const repositories = [
    { path: 'v2', icon: null },
    { path: 'sources/api', icon: 'server' as const },
  ]

  test('a run in a repository names the repository, and a folder under it relative to it', () => {
    const items = goingOnOf(
      [
        aRun('r1', '/home/someone/media-library/v2', 'running', 'c1'),
        aRun('r2', '/home/someone/media-library/sources/api/scripts', 'exited', null),
      ],
      [],
      '/home/someone/media-library',
      'main',
      repositories,
    )
    expect(items[0]).toMatchObject({ repository: { path: 'v2', icon: null }, folder: '.' })
    expect(items[1]).toMatchObject({
      repository: { path: 'sources/api', icon: 'server' },
      folder: 'scripts',
    })
  })

  test('a run in a plain folder is said as a folder, and no repository', () => {
    const items = goingOnOf(
      [
        aRun('r1', '/home/someone/media-library/tools', 'running', 'c1'),
        // A folder whose name only begins like a repository's is not in it.
        aRun('r2', '/home/someone/media-library/v2-old', 'running', 'c1'),
      ],
      [],
      '/home/someone/media-library',
      'main',
      repositories,
    )
    expect(items[0]).toMatchObject({ repository: undefined, folder: 'tools' })
    expect(items[1]).toMatchObject({ repository: undefined, folder: 'v2-old' })
  })
})

/** How a run ended, by how it stands: 1 for a failure, 0 for the rest, nothing while it runs. */
const EXITS: Record<CommandRun['state'], number | null> = {
  running: null,
  exited: 0,
  failed: 1,
  stopped: 0,
}

describe('The line keeps what matters now (#237)', () => {
  const ATLAS = '/home/ana/atlas'
  /** A run of the catalogue or a one-off, running, over or failed. */
  const ran = (
    id: string,
    state: CommandRun['state'],
    commandId: string | null,
    name = 'dev',
    line = 'pnpm dev',
  ): CommandRun => ({
    ...aRun(id, ATLAS, state, commandId),
    name,
    line,
    exitCode: EXITS[state],
    endedAt: state === 'running' ? null : '2026-09-23T08:01:00.000Z',
  })
  const nothing = { removed: new Set<string>(), before: new Set<string>() }
  const ids = (runs: readonly CommandRun[], marks = nothing): string[] =>
    lineOf(goingOnOf(runs, [], ATLAS), marks).map((item) => item.id)

  test('what runs is a chip, and a one-off over stays until it is taken out (#250)', () => {
    const runs = [ran('sleep', 'exited', null, 'sleep', 'sleep 120'), ran('dev', 'running', 'c1')]
    // Its glance or its details read change nothing: reading is not taking out.
    expect(ids(runs)).toEqual(['sleep', 'dev'])
    expect(ids(runs, { ...nothing, removed: new Set(['sleep']) })).toEqual(['dev'])
  })

  test('a one-off that ended before the Session was opened is not on the line', () => {
    const runs = [ran('sleep', 'exited', null, 'sleep', 'sleep 120')]
    expect(ids(runs, { ...nothing, before: new Set(['sleep']) })).toEqual([])
  })

  test('a one-off leaves once the same line runs as a command of the catalogue (#250)', () => {
    const runs = [
      ran('once', 'exited', null, 'bun', 'bun run check'),
      ran('named', 'exited', 'c9', 'check', 'bun run check'),
    ]
    expect(ids(runs)).toEqual(['named'])
  })

  test('a failed run stays until it is taken out, or run again, whenever it failed (#250)', () => {
    const runs = [ran('check', 'failed', null, 'check', 'bun run check')]
    expect(ids(runs, { ...nothing, before: new Set(['check']) })).toEqual(['check'])
    expect(ids(runs, { ...nothing, removed: new Set(['check']) })).toEqual([])
    // Run again, the same line: the new run takes its place.
    const again = [...runs, ran('check-2', 'running', null, 'check', 'bun run check')]
    expect(ids(again)).toEqual(['check-2'])
  })

  test('a catalogue command that ran stays as its shortcut, one chip for its newest run', () => {
    const runs = [ran('lint-1', 'exited', 'c2', 'lint'), ran('lint-2', 'exited', 'c2', 'lint')]
    expect(ids(runs)).toEqual(['lint-2'])
  })

  test('a chip taken out by hand leaves, and comes back when its command runs again', () => {
    const once = [ran('lint-1', 'exited', 'c2', 'lint')]
    expect(ids(once, { ...nothing, removed: new Set(['lint-1']) })).toEqual([])
    const again = [...once, ran('lint-2', 'running', 'c2', 'lint')]
    expect(ids(again, { ...nothing, removed: new Set(['lint-1']) })).toEqual(['lint-2'])
    // What runs can be taken out too: it stays in the history.
    expect(ids([ran('dev', 'running', 'c1')], { ...nothing, removed: new Set(['dev']) })).toEqual(
      [],
    )
  })

  test('what was over when the Session opened is read off when each ended', () => {
    const opened = Date.parse('2026-09-23T08:05:00.000Z')
    const runs = [
      ran('old', 'exited', null),
      { ...ran('new', 'exited', null), endedAt: '2026-09-23T08:06:00.000Z' },
      ran('live', 'running', 'c1'),
    ]
    const shells = [aShell('s1', opened - 1000, 'finished'), aShell('s2', opened - 1000, 'running')]
    expect([...overBefore(runs, shells, opened)]).toEqual(['old', 's1'])
  })
})
