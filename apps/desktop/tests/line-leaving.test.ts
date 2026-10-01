/**
 * An agent's one-off command leaves the line 30 s after it ends (issue #321).
 *
 * A command the agent started that is not in the catalogue stays on the Session's line for 30 s
 * once it ended, success or failure, so its end can be seen, then leaves as if its × had been
 * pressed. Removed by hand meanwhile, run again, or held by its glance, nothing happens twice; a
 * command of the catalogue and a one-off the user started keep the rule they had. Every suite runs
 * on a fake clock: nothing here waits for real.
 */

import { afterEach, beforeEach, describe, expect, test, vi } from 'vite-plus/test'

import type { CommandRun } from '@hemera/ipc'
import {
  glanceClosed,
  glanceOpened,
  leaveOnTheirOwn,
  marksOf,
  removeFromLine,
  subscribeToLines,
} from '#renderer/line-store.ts'
import {
  ONE_OFF_LINGERS_MS,
  endedAgentOneOffs,
  goingOnOf,
  lineOf,
} from '#renderer/session-details.ts'

const START = Date.parse('2026-10-01T09:00:00.000Z')

/** A run of the Session, as the window holds it. */
function aRun(id: string, more: Partial<CommandRun> = {}): CommandRun {
  return {
    id,
    projectId: 'atlas',
    sessionId: 'session-1',
    commandId: null,
    name: 'vitest',
    line: 'pnpm vitest run csv',
    type: 'test',
    scope: 'workspace',
    cwd: '/home/ana/atlas',
    folder: null,
    workspaceId: null,
    workspaceName: 'main',
    environment: {},
    state: 'exited',
    pid: 4242,
    url: null,
    readyAt: null,
    readiness: null,
    portConflict: null,
    heldAgainst: [],
    exitCode: 0,
    startedBy: 'agent',
    output: '✓ 3 passed',
    dropped: 0,
    startedAt: new Date(START - 5000).toISOString(),
    endedAt: new Date(START).toISOString(),
    joined: false,
    ...more,
  }
}

let session = 0
/** A Session of its own per suite: the line's marks live as long as the window. */
let sessionId = ''

beforeEach(() => {
  vi.useFakeTimers()
  vi.setSystemTime(START)
  session += 1
  sessionId = `session-${session}`
})

afterEach(() => {
  vi.useRealTimers()
})

/** Whether the line of the Session still holds the run. */
const onTheLine = (run: CommandRun) =>
  lineOf(goingOnOf([run], [], '/home/ana/atlas'), {
    ...marksOf(sessionId),
    before: new Set(),
  }).some((item) => item.id === run.id)

describe('An agent’s one-off leaves the line 30 s after it ends', () => {
  test('removed 30 s after a success', () => {
    const run = aRun('r1')
    leaveOnTheirOwn(sessionId, endedAgentOneOffs([run]))
    vi.advanceTimersByTime(ONE_OFF_LINGERS_MS - 1)
    expect(onTheLine(run)).toBe(true)
    vi.advanceTimersByTime(1)
    expect(onTheLine(run)).toBe(false)
    expect(marksOf(sessionId).removed.has('r1')).toBe(true)
  })

  test('removed 30 s after a failure', () => {
    const run = aRun('r2', { state: 'failed', exitCode: 1 })
    leaveOnTheirOwn(sessionId, endedAgentOneOffs([run]))
    expect(onTheLine(run)).toBe(true)
    vi.advanceTimersByTime(ONE_OFF_LINGERS_MS)
    expect(onTheLine(run)).toBe(false)
  })

  test('the 30 s run from its end, and seeing it again does not start them over', () => {
    // Seen 20 s after it ended: it leaves 10 s later, and a render that sees it again changes nothing.
    vi.setSystemTime(START + 20_000)
    const run = aRun('r3')
    leaveOnTheirOwn(sessionId, endedAgentOneOffs([run]))
    vi.advanceTimersByTime(5_000)
    leaveOnTheirOwn(sessionId, endedAgentOneOffs([run]))
    vi.advanceTimersByTime(5_000)
    expect(onTheLine(run)).toBe(false)
  })

  test('removed by hand at 10 s: nothing happens at 30 s', () => {
    const run = aRun('r4')
    leaveOnTheirOwn(sessionId, endedAgentOneOffs([run]))
    vi.advanceTimersByTime(10_000)
    removeFromLine(sessionId, 'r4')
    let told = 0
    const stop = subscribeToLines(() => {
      told += 1
    })
    vi.advanceTimersByTime(ONE_OFF_LINGERS_MS)
    stop()
    expect(told).toBe(0)
    expect(onTheLine(run)).toBe(false)
  })

  test('glance open at 30 s: removed when it closes', () => {
    const run = aRun('r5')
    leaveOnTheirOwn(sessionId, endedAgentOneOffs([run]))
    glanceOpened(sessionId, 'r5')
    vi.advanceTimersByTime(ONE_OFF_LINGERS_MS + 5_000)
    expect(onTheLine(run)).toBe(true)
    glanceClosed(sessionId, 'r5')
    expect(onTheLine(run)).toBe(false)
  })

  test('a glance opened and closed before 30 s leaves it to its time', () => {
    const run = aRun('r6')
    leaveOnTheirOwn(sessionId, endedAgentOneOffs([run]))
    glanceOpened(sessionId, 'r6')
    glanceClosed(sessionId, 'r6')
    expect(onTheLine(run)).toBe(true)
    vi.advanceTimersByTime(ONE_OFF_LINGERS_MS)
    expect(onTheLine(run)).toBe(false)
  })

  test('run again meanwhile: the new run keeps its place, and its own 30 s', () => {
    const first = aRun('r7')
    const again = aRun('r8', {
      state: 'running',
      exitCode: null,
      startedAt: new Date(START + 10_000).toISOString(),
      endedAt: null,
    })
    leaveOnTheirOwn(sessionId, endedAgentOneOffs([first, again]))
    vi.advanceTimersByTime(ONE_OFF_LINGERS_MS)
    const line = lineOf(goingOnOf([first, again], [], '/home/ana/atlas'), {
      ...marksOf(sessionId),
      before: new Set(),
    })
    expect(line.map((item) => item.id)).toEqual(['r8'])
  })

  test('a catalogue command stays', () => {
    const run = aRun('r9', { commandId: 'command-test', name: 'test' })
    expect(endedAgentOneOffs([run])).toEqual([])
    leaveOnTheirOwn(sessionId, endedAgentOneOffs([run]))
    vi.advanceTimersByTime(ONE_OFF_LINGERS_MS * 2)
    expect(onTheLine(run)).toBe(true)
  })

  test('a one-off I started stays', () => {
    const run = aRun('r10', { startedBy: 'user' })
    expect(endedAgentOneOffs([run])).toEqual([])
    vi.advanceTimersByTime(ONE_OFF_LINGERS_MS * 2)
    expect(onTheLine(run)).toBe(true)
  })

  test('a one-off still running is left alone', () => {
    const run = aRun('r11', { state: 'running', exitCode: null, endedAt: null })
    expect(endedAgentOneOffs([run])).toEqual([])
  })
})
