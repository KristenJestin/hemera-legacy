/**
 * Which face an agent's work wears (issue #140), in the row above the box.
 *
 * Read off the thread the way the row reads what the turn is doing, so the entries here are the
 * ones the engine writes: a tool call of the agent's with the kind ACP gave it, a call of one of
 * Hemera's tools, a question of the Spec and its answer, a turn's end.
 */

import { describe, expect, test } from 'vite-plus/test'

import type { SessionEntry } from '@hemera/ipc'
import { callFaceOf } from '#renderer/agent-face.ts'
import { activityOf } from '#renderer/agent-store.ts'

/** One entry of a thread, as the engine pushes it. */
function entry(
  id: string,
  kind: SessionEntry['kind'],
  body: string,
  more: Partial<SessionEntry> = {},
): SessionEntry {
  return {
    id,
    sessionId: 'session-1',
    seq: 1,
    role: 'agent',
    kind,
    body,
    payload: '{}',
    correlationId: null,
    turnId: 'turn-1',
    state: null,
    origin: 'live',
    createdAt: 0,
    ...more,
  }
}

const SAID = entry('e1', 'message', 'Look at the export', { role: 'user' })

/** A call of the agent's own, in flight, of the kind ACP gave it. */
function call(kind: string | null, title = 'a call'): SessionEntry {
  return entry('e2', 'tool_call', title, {
    state: 'in_progress',
    payload: JSON.stringify({ call: { title, kind } }),
  })
}

/** A question of the Spec asked in the thread, and its answer. */
function question(id: string): SessionEntry {
  return {
    ...entry(`q-${id}`, 'spec_question', 'Which format?'),
    role: 'hemera',
    correlationId: id,
  }
}
function answer(id: string): SessionEntry {
  return { ...entry(`a-${id}`, 'spec_answer', 'CSV'), role: 'user', correlationId: id }
}

const TURN = entry('e9', 'turn', 'end_turn', { state: 'end_turn' })

describe('The row above the box wears the face of the work, not only of the state', () => {
  test('an agent call wears the face of the kind ACP gave it', () => {
    expect(callFaceOf(call('read'))).toBe('reading')
    expect(callFaceOf(call('search'))).toBe('reading')
    expect(callFaceOf(call('fetch'))).toBe('reading')
    expect(callFaceOf(call('edit'))).toBe('writing')
    expect(callFaceOf(call('delete'))).toBe('writing')
    expect(callFaceOf(call('move'))).toBe('writing')
    expect(callFaceOf(call('execute'))).toBe('running')
    expect(callFaceOf(call('think'))).toBe('thinking')
    // A kind nobody named, or none at all, is a tool running.
    expect(callFaceOf(call('other'))).toBe('running')
    expect(callFaceOf(call(null))).toBe('running')
    expect(callFaceOf(entry('e2', 'tool_call', 'x', { payload: 'not json' }))).toBe('running')
  })

  test("one of Hemera's tools wears the face of what it does, read off its mark", () => {
    expect(callFaceOf(call(null, 'mcp__hemera__spec_write'))).toBe('writing')
    expect(callFaceOf(call(null, 'mcp__hemera__spec_propose'))).toBe('writing')
    expect(callFaceOf(call(null, 'mcp__hemera__fs_edit'))).toBe('writing')
    expect(callFaceOf(call(null, 'mcp__hemera__spec_read'))).toBe('reading')
    expect(callFaceOf(call(null, 'mcp__hemera__search'))).toBe('reading')
    expect(callFaceOf(call(null, 'mcp__hemera__commands_output'))).toBe('reading')
    expect(callFaceOf(call(null, 'mcp__hemera__commands_run'))).toBe('running')
  })

  test('the row hands the face of the call it is on', () => {
    expect(activityOf([SAID, call('read', 'Read recap.md')])).toEqual({
      state: 'running',
      detail: 'Read recap.md',
      face: 'reading',
    })
    expect(activityOf([SAID, call(null, 'mcp__hemera__spec_write')]).face).toBe('writing')
  })

  test('a turn that ended on a question left unanswered is waiting for the answer', () => {
    expect(activityOf([SAID, question('q1'), TURN])).toEqual({ state: 'question' })
    // Answered, the turn is simply done.
    expect(activityOf([SAID, question('q1'), TURN, answer('q1')]).state).toBe('done')
    // A question of an earlier turn is not what this one ended on.
    const again = entry('e5', 'message', 'Go on', { role: 'user' })
    expect(activityOf([question('q0'), again, TURN]).state).toBe('done')
  })
})
