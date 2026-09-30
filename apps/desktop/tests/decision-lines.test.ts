/**
 * Hemera Auto's decisions as the Developer section lists them (#294): read from the stored
 * `permission_decision` entries the engine hands back, never from `diagnostic.log`.
 */

import { describe, expect, test } from 'vite-plus/test'

import type { SessionEntry } from '@hemera/ipc'
import { decisionLineOf, isDecision } from '#renderer/decision-lines.ts'

function stored(payload: string, state: string | null = 'completed'): SessionEntry {
  return {
    id: 'e1',
    sessionId: 's1',
    seq: 4,
    role: 'hemera',
    kind: 'permission_decision',
    body: 'ran without asking, Hemera Auto mode',
    payload,
    correlationId: 'decision:1',
    turnId: null,
    state,
    origin: 'live',
    createdAt: 1_000,
  }
}

const SESSION = { id: 's1', title: 'Fix the parser' }
const AT = (ms: number) => `at ${ms}`

describe('A Hemera Auto decision becomes one row', () => {
  test('a judge that allowed a command: its line, scores, model and round trip', () => {
    const line = decisionLineOf(
      {
        entry: stored(
          JSON.stringify({
            tool: 'commands_run',
            resolved: '/work/atlas',
            line: 'pnpm test',
            answer: 'allowed',
            by: 'judge',
            model: 'jev-1',
            scores: { risk: 1, approval: 0.2, userRequested: 0.9 },
            roundTripMs: 820,
          }),
        ),
        session: SESSION,
      },
      AT,
    )
    expect(line).toMatchObject({
      id: 'e1',
      at: 'at 1000',
      sessionId: 's1',
      session: 'Fix the parser',
      tool: 'commands_run',
      call: 'pnpm test',
      by: 'judge',
      verdict: 'allowed',
      model: 'jev-1',
      scores: { risk: 1, approval: 0.2, userRequested: 0.9 },
      roundTripMs: 820,
    })
    expect(line?.record).toContain('"by": "judge"')
  })

  test('a path stands for the call when there is no line; a refusal is refused', () => {
    const line = decisionLineOf(
      {
        entry: stored(
          JSON.stringify({
            tool: 'fs_write',
            resolved: '/work/a.ts',
            answer: 'refused',
            by: 'expired',
          }),
          'refused',
        ),
        session: SESSION,
      },
      AT,
    )
    expect(line).toMatchObject({ call: '/work/a.ts', by: 'expired', verdict: 'refused' })
    expect(line?.roundTripMs).toBeUndefined()
  })

  test('a human asked because the judge did not answer says so', () => {
    const line = decisionLineOf(
      {
        entry: stored(
          JSON.stringify({
            tool: 'fs_edit',
            named: 'b.ts',
            answer: 'cancelled',
            by: 'human',
            judged: 'nobody',
          }),
          'cancelled',
        ),
        session: SESSION,
      },
      AT,
    )
    expect(line).toMatchObject({
      call: 'b.ts',
      by: 'human',
      judged: 'nobody',
      verdict: 'cancelled',
    })
  })

  test('an entry that is not one of Hemera Auto’s decisions is no row', () => {
    const agents = stored(JSON.stringify({ toolCallId: 'x', optionId: 'allow' }))
    expect(decisionLineOf({ entry: agents, session: SESSION }, AT)).toBeNull()
    expect(isDecision(agents)).toBe(false)
    expect(isDecision(stored(JSON.stringify({ by: 'rules', tool: 'fs_write' })))).toBe(true)
  })
})
