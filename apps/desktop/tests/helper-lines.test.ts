/**
 * A build's helpers on its line (issue #77): each a live chip read from the engine's view of it and
 * from what the window heard of its own Session, placed among the runs where its launch puts it,
 * kept or taken off the line by the line's own rules, and never a build of its own.
 */

import { describe, expect, test } from 'vite-plus/test'

import type { CommandRun, HelperView, SessionEntry } from '@hemera/ipc'
import type { AgentSessionState } from '#renderer/agent-store.ts'
import { helperAsking, waitingAs } from '#renderer/notices.ts'
import { goingOnOf, helperOf, lineOf, overBefore, withHelpers } from '#renderer/session-details.ts'

const START = Date.parse('2026-10-01T09:00:00.000Z')

function aHelper(more: Partial<HelperView> = {}): HelperView {
  return {
    id: 'helper-1',
    parentSessionId: 'build-1',
    name: 'Write the reader',
    definition: null,
    depth: 1,
    task: 'T2',
    state: 'running',
    lastLine: 'Reading the exporter.',
    startedAt: new Date(START).toISOString(),
    endedAt: null,
    ...more,
  }
}

function anEntry(id: string, more: Partial<SessionEntry>): SessionEntry {
  return {
    id,
    sessionId: 'helper-1',
    seq: 1,
    role: 'agent',
    kind: 'message',
    body: '',
    payload: '{}',
    correlationId: null,
    turnId: 'turn-1',
    state: null,
    origin: 'live',
    createdAt: START,
    ...more,
  }
}

const QUIET: AgentSessionState = {
  entries: [],
  running: false,
  stopReason: null,
  latest: null,
  heardAt: null,
}

function aRun(id: string, startedAt: number): CommandRun {
  return {
    id,
    projectId: 'atlas',
    sessionId: 'build-1',
    commandId: 'command-test',
    name: 'test',
    line: 'pnpm test',
    type: 'test',
    scope: 'workspace',
    cwd: '/home/ana/atlas',
    folder: null,
    workspaceId: null,
    workspaceName: 'main',
    environment: {},
    state: 'running',
    pid: 1,
    url: null,
    readyAt: null,
    readiness: null,
    portConflict: null,
    heldAgainst: [],
    exitCode: null,
    startedBy: 'agent',
    output: '',
    dropped: 0,
    startedAt: new Date(startedAt).toISOString(),
    endedAt: null,
    joined: false,
  }
}

describe('A helper is a live chip of its build’s line', () => {
  test('at work: what it is doing and what it last said, from its own Session', () => {
    const heard: AgentSessionState = {
      ...QUIET,
      running: true,
      entries: [
        anEntry('said', { body: 'First.\nThe reader streams the rows.' }),
        anEntry('call', {
          kind: 'tool_call',
          body: 'mcp__hemera__fs_edit',
          state: 'in_progress',
          payload: JSON.stringify({ call: { kind: 'edit' } }),
        }),
      ],
      latest: 'call',
    }
    expect(helperOf(aHelper(), heard)).toMatchObject({
      kind: 'agent',
      id: 'helper-1',
      name: 'Write the reader',
      state: 'running',
      step: 'Editing a file',
      last: 'The reader streams the rows.',
      startedAt: START,
      endedAt: null,
    })
  })

  test('nothing heard yet: its last line as the engine read it, and never asleep while it works', () => {
    const chip = helperOf(aHelper(), QUIET)
    expect(chip.last).toBe('Reading the exporter.')
    expect(chip.face).toBe('thinking')
    expect(chip.step).toBeUndefined()
  })

  test('over: done, failed and stopped each end on their own mark and face', () => {
    const ended = { endedAt: new Date(START + 60_000).toISOString() }
    expect(helperOf(aHelper({ state: 'done', ...ended }), QUIET)).toMatchObject({
      state: 'finished',
      face: 'done',
      endedAt: START + 60_000,
    })
    expect(helperOf(aHelper({ state: 'failed', ...ended }), QUIET)).toMatchObject({
      state: 'failed',
      face: 'error',
    })
    expect(helperOf(aHelper({ state: 'stopped', ...ended }), QUIET)).toMatchObject({
      state: 'stopped',
      face: 'asleep',
    })
  })

  test('placed among the runs where its launch puts it', () => {
    const runs = goingOnOf([aRun('r1', START - 1000), aRun('r2', START + 1000)], [], null)
    const items = withHelpers(runs, [helperOf(aHelper(), QUIET)])
    expect(items.map((item) => item.id)).toEqual(['r1', 'helper-1', 'r2'])
  })

  test('a helper stopped stays on the line as one over, until taken out or seen before', () => {
    const stopped = helperOf(
      aHelper({ state: 'stopped', endedAt: new Date(START + 1000).toISOString() }),
      QUIET,
    )
    const marks = { removed: new Set<string>(), before: new Set<string>() }
    expect(lineOf([stopped], marks).map((item) => item.id)).toEqual(['helper-1'])
    expect(lineOf([stopped], { ...marks, removed: new Set(['helper-1']) })).toEqual([])
    const before = overBefore([], [], START + 2000, [stopped])
    expect(lineOf([stopped], { ...marks, before })).toEqual([])
  })
})

describe('A helper’s permission says who asks', () => {
  const asked = (
    payload: Readonly<
      Record<string, string | readonly string[] | { sessionId: string; name: string }>
    >,
  ) =>
    anEntry('request', {
      role: 'hemera',
      kind: 'permission_request',
      state: 'pending',
      payload: JSON.stringify({ toolCallId: 'q1', options: [], ...payload }),
    })

  test('the helper named in the request, and nobody for the main agent’s own', () => {
    expect(
      helperAsking(asked({ helper: { sessionId: 'helper-1', name: 'Write the reader' } })),
    ).toEqual({
      sessionId: 'helper-1',
      name: 'Write the reader',
    })
    expect(helperAsking(asked({}))).toBeNull()
    expect(waitingAs(asked({}), [asked({})], null, null)).toBe('permission')
  })
})
