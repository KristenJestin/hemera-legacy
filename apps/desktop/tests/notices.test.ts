/**
 * What waits for a human in a Session, and how the thread keeps it (issue #237).
 *
 * The page gathers into the Session's notices every entry that waits for someone's decision — a
 * permission, a command the agent proposes, the Spec it proposes, a question of the Spec — and the
 * thread keeps a quiet record of each. `notices.ts` says which entries wait, in which kind, and how
 * a permission was answered; it is pure, so it is tested here.
 */

import { describe, expect, test } from 'vite-plus/test'

import type { SessionEntry } from '@hemera/ipc'
import {
  asksToRunALine,
  decidesARequest,
  NOTICE_KINDS,
  permissionStandingOf,
  waitingAs,
} from '#renderer/notices.ts'

function entry(
  kind: SessionEntry['kind'],
  payload: string,
  id: string,
  state: string | null = null,
): SessionEntry {
  return {
    id,
    sessionId: 'session-1',
    seq: 1,
    role: 'hemera',
    kind,
    body: kind,
    payload,
    correlationId: null,
    turnId: null,
    state,
    origin: 'live',
    createdAt: 0,
  }
}

const OPTIONS = [
  { optionId: 'refused', name: 'Refuse', kind: 'reject_once' },
  { optionId: 'allowed', name: 'Allow once', kind: 'allow_once' },
]

const asked = (state: string): SessionEntry =>
  entry(
    'permission_request',
    JSON.stringify({ toolCallId: 'q1', options: OPTIONS }),
    'request',
    state,
  )

const decided = (optionId: string | null): SessionEntry =>
  entry('permission_decision', JSON.stringify({ toolCallId: 'q1', optionId }), 'decision')

const proposed = (state: string, id: string): SessionEntry =>
  entry(
    'command_proposal',
    JSON.stringify({
      proposalId: id,
      name: id,
      line: `pnpm ${id}`,
      type: 'script',
      folder: null,
      why: 'Because.',
      state,
    }),
    id,
  )

const QUESTION = entry(
  'spec_question',
  JSON.stringify({
    id: 'q-date',
    body: 'Which date decides the month?',
    blocking: true,
    phase: null,
    options: [{ id: 'issue', label: 'The issue date' }],
    answer: null,
  }),
  'question',
)

const SPEC = entry(
  'spec_proposal',
  JSON.stringify({ title: 'Export the Journal', type: 'feature' }),
  'spec',
)

describe('Everything that waits for a human goes to the notices', () => {
  test('a pending permission, a pending proposal, a proposed Spec and an open question wait', () => {
    const thread = [asked('pending'), proposed('pending', 'dev'), SPEC, QUESTION]
    expect(thread.map((one) => waitingAs(one, thread, null, new Set(['q-date'])))).toEqual([
      'permission',
      'proposal',
      'spec',
      'question',
    ])
  })

  test('several proposals and a permission wait at once, each in its kind', () => {
    const thread = [proposed('pending', 'dev'), proposed('pending', 'test'), asked('pending')]
    expect(thread.map((one) => waitingAs(one, thread, null, null))).toEqual([
      'proposal',
      'proposal',
      'permission',
    ])
  })

  test('what was answered waits no more', () => {
    const thread = [asked('decided'), decided('allowed'), proposed('accepted', 'dev')]
    expect(thread.map((one) => waitingAs(one, thread, null, null))).toEqual([null, null, null])
    // A request whose decision is already written waits no more, whatever state it was read in.
    expect(waitingAs(asked('pending'), [asked('pending'), decided('allowed')], null, null)).toBe(
      null,
    )
  })

  test('the permission comes first, and the proposals last', () => {
    expect(NOTICE_KINDS).toEqual(['permission', 'question', 'spec', 'proposal', 'setup'])
  })
})

describe('The thread keeps a quiet record of each permission', () => {
  test('a permission is allowed, refused, stopped or still asked, as its decision says', () => {
    expect(permissionStandingOf(asked('decided'), [asked('decided'), decided('allowed')])).toBe(
      'allowed',
    )
    expect(permissionStandingOf(asked('decided'), [asked('decided'), decided('refused')])).toBe(
      'refused',
    )
    expect(permissionStandingOf(asked('cancelled'), [asked('cancelled'), decided(null)])).toBe(
      'stopped',
    )
    expect(permissionStandingOf(asked('pending'), [asked('pending')])).toBe('pending')
    // Left by an agent that died with the question open: closed, and nothing decided.
    expect(permissionStandingOf(asked('cancelled'), [asked('cancelled')])).toBe('stopped')
  })

  test('a decision is said by its request, unless a one-off went through without one', () => {
    expect(decidesARequest(decided('allowed'), [asked('decided'), decided('allowed')])).toBe(true)
    expect(decidesARequest(decided('allowed'), [decided('allowed')])).toBe(false)
  })
})

describe("The permissions' group says what accepting does (#250)", () => {
  test('a one-off line is run once; any other question is allowed once', () => {
    const line = entry(
      'permission_request',
      JSON.stringify({ toolCallId: 'q2', options: OPTIONS, tool: 'commands_run' }),
      'line',
      'pending',
    )
    expect(asksToRunALine(line)).toBe(true)
    expect(asksToRunALine(asked('pending'))).toBe(false)
  })
})

describe('What waits is one list, closed with its turn (#250)', () => {
  test('a request still marked pending in a turn that has ended waits no more', () => {
    // Seen in a Session of the recette: the request of a turn the agent gave up on, never
    // rewritten, and a turn that ended after it.
    const ended = entry('turn', JSON.stringify({ stopReason: 'end_turn' }), 'end', 'end_turn')
    const thread = [asked('pending'), ended]
    expect(waitingAs(asked('pending'), thread, null, null)).toBe(null)
    // While its turn runs, it waits.
    expect(waitingAs(asked('pending'), [asked('pending')], null, null)).toBe('permission')
  })
})
