/**
 * The setup proposals of a thread, as the window reads them off their entries (issue #218).
 *
 * What waits is answered among the Session's notices: one row a change, after the setup's tile,
 * and Accept all for the changes waiting (Decided 1 of #218). The thread keeps one quiet entry, the
 * call that proposed them, carrying each change with its answer. `agent-blocks.tsx` draws both and
 * needs a browser to import; what this suite checks is what they are handed: the change said in the
 * domain's words, never a variable's value (Decided 2 of #218), and which call carries which change.
 */

import { describe, expect, test } from 'vite-plus/test'

import type { SessionEntry } from '@hemera/ipc'

import { groupingOf } from '#renderer/action-groups.ts'
import { foldedCallsOf, setupProposalOf } from '#renderer/agent-tool-payloads.ts'
import { callLinksOf } from '#renderer/call-links.ts'
import { NOTICE_KINDS, setupBatchesWaiting, waitingAs } from '#renderer/notices.ts'
import { argumentsShown, changesShown, rawInputShown } from '#engine/setup/hidden.ts'

let seq = 0

/** A `setup_proposal` entry of a batch, in a state. */
function card(
  id: string,
  batchId: string,
  state: 'pending' | 'accepted' | 'declined',
  change: Record<string, string | boolean | null>,
  body = '',
): SessionEntry {
  seq += 1
  return {
    id,
    sessionId: 'session-1',
    seq,
    role: 'hemera',
    kind: 'setup_proposal',
    body,
    payload: JSON.stringify({
      proposalId: `proposal-${id}`,
      batchId,
      change,
      why: 'the README says so',
      state,
    }),
    correlationId: `setup:proposal-${id}`,
    turnId: null,
    state,
    origin: 'live',
    createdAt: seq,
  }
}

/** Hemera's answer to a `setup_propose` call, as the engine writes it. */
function proposing(id: string, titles: readonly string[]): SessionEntry {
  seq += 1
  const text = [
    'proposed: the user accepts or declines each change in the Session, or all of them at once; nothing is changed yet',
    ...titles.map((title) => `- ${title}`),
  ].join('\n')
  return {
    id,
    sessionId: 'session-1',
    seq,
    role: 'hemera',
    kind: 'hemera_tool_call',
    body: text,
    payload: JSON.stringify({
      tool: 'setup_propose',
      state: 'completed',
      key: null,
      callId: `call-${id}`,
      session: 'session-1',
      caller: 'c',
      agent: 'claude',
      ms: 1,
      paths: [],
      arguments: JSON.stringify({ changes: '[]', why: 'asked', key: id }),
    }),
    correlationId: null,
    turnId: null,
    state: 'completed',
    origin: 'live',
    createdAt: seq,
  }
}

/** The value the agent was given for a variable: never to be read anywhere but the variable. */
const SECRET = 'sk-live-7f3a9c'

const REPOSITORY = { kind: 'repository', path: './sources/front' }
const VARIABLE = { kind: 'variable', name: 'API_KEY', workspace: null, replaces: false }
const SERVICE = {
  kind: 'command',
  name: 'web',
  line: 'pnpm dev',
  lineWindows: null,
  lineLinux: null,
  type: 'serve',
  repository: './sources/front',
  folder: null,
  scope: 'workspace',
  portless: true,
  portlessName: null,
  runAtOpen: false,
  replaces: false,
}

describe('Every change is a proposal the user accepts', () => {
  test('a change is said as a row of the notices: its verb, what it is about, its fields', () => {
    expect(setupProposalOf(card('entry-1', 'batch-1', 'pending', REPOSITORY))).toEqual({
      proposalId: 'proposal-entry-1',
      batchId: 'batch-1',
      title: 'Declare the repository ./sources/front',
      verb: 'Add repository',
      subject: './sources/front',
      mono: true,
      line: undefined,
      details: [],
      why: 'the README says so',
      state: 'pending',
    })
    const service = setupProposalOf(card('entry-2', 'batch-1', 'pending', SERVICE))
    expect([service?.verb, service?.subject, service?.mono, service?.line]).toEqual([
      'Add service',
      'web',
      false,
      'pnpm dev',
    ])
    // The line opens in its block; the other fields are said under it, never the line twice.
    expect(service?.details.map((one) => one.label)).toEqual([
      'Type',
      'Runs in',
      'Scope',
      'Portless',
    ])
    const rewritten = setupProposalOf(
      card('entry-3', 'batch-1', 'pending', { ...SERVICE, type: 'test', replaces: true }),
    )
    expect(rewritten?.verb).toBe('Change command')
  })

  test('a payload that does not read is left out rather than drawn from a guess', () => {
    const broken = { ...card('entry-1', 'batch-1', 'pending', REPOSITORY), payload: '{}' }
    expect(setupProposalOf(broken)).toBeNull()
  })

  test('a change waits among the notices, in a kind of its own, until it is answered', () => {
    expect(NOTICE_KINDS).toContain('setup')
    const pending = card('entry-1', 'batch-1', 'pending', REPOSITORY)
    expect(waitingAs(pending, [pending], null, null)).toBe('setup')
    for (const state of ['accepted', 'declined'] as const) {
      const answered = card('entry-2', 'batch-1', state, REPOSITORY)
      expect(waitingAs(answered, [answered], null, null)).toBeNull()
    }
  })
})

describe('Several changes proposed together are accepted in one press', () => {
  test('Accept all answers every batch that still waits, in the order they were proposed', () => {
    const thread = [
      card('entry-1', 'batch-1', 'accepted', REPOSITORY),
      card('entry-2', 'batch-2', 'pending', VARIABLE),
      card('entry-3', 'batch-3', 'declined', REPOSITORY),
      card('entry-4', 'batch-1', 'pending', REPOSITORY),
      card('entry-5', 'batch-2', 'pending', REPOSITORY),
    ]
    expect(setupBatchesWaiting(thread)).toEqual(['batch-2', 'batch-1'])
  })
})

describe('The thread keeps one entry for the call that proposed the changes', () => {
  test('a call carries every change it proposed, and each is drawn no more on its own', () => {
    const first = [
      card('a1', 'batch-1', 'accepted', REPOSITORY, 'Declare the repository ./sources/front'),
      card('a2', 'batch-1', 'pending', VARIABLE, 'Set the variable API_KEY'),
    ]
    const second = [card('b1', 'batch-2', 'pending', SERVICE, 'Add the command web')]
    const thread = [
      ...first,
      proposing('call-1', ['Declare the repository ./sources/front', 'Set the variable API_KEY']),
      ...second,
      proposing('call-2', ['Add the command web']),
    ]
    const links = callLinksOf(thread, foldedCallsOf(thread))
    expect(links.byCall.get('call-1')?.setup?.map((one) => one.id)).toEqual(['a1', 'a2'])
    expect(links.byCall.get('call-2')?.setup?.map((one) => one.id)).toEqual(['b1'])
    expect([...links.absorbed].toSorted()).toEqual(['a1', 'a2', 'b1'])
  })

  test('a change folds into the work around it, as every quiet record does', () => {
    expect(groupingOf(card('entry-1', 'batch-1', 'pending', REPOSITORY))).toBe('member')
  })
})

describe("A variable's value is never shown back", () => {
  test('a value written into a proposal by mistake is never handed to the window', () => {
    const leaked = card('entry-1', 'batch-1', 'pending', { ...VARIABLE, value: SECRET })
    const withValue = {
      ...leaked,
      payload: leaked.payload.replace('"why"', `"value":"${SECRET}","why"`),
    }
    expect(withValue.payload).toContain(SECRET)
    const drawn = setupProposalOf(withValue)
    expect(drawn?.details).toEqual([
      { label: 'Scope', value: 'the Project' },
      { label: 'Value', value: 'set, not shown' },
    ])
    expect(JSON.stringify(drawn)).not.toContain(SECRET)
  })

  test('the arguments of a proposal and the agent report of it hide every value', () => {
    const changes = JSON.stringify([
      { kind: 'variable', name: 'API_KEY', value: SECRET },
      { kind: 'repository', path: 'web' },
    ])
    const hidden = JSON.stringify([
      { kind: 'variable', name: 'API_KEY', value: '(hidden)' },
      { kind: 'repository', path: 'web' },
    ])
    expect(changesShown(changes)).toBe(hidden)
    expect(argumentsShown('setup_propose', { changes, key: 'k' })).toEqual({
      changes: hidden,
      key: 'k',
    })
    expect(
      JSON.parse(rawInputShown('mcp__hemera__setup_propose', JSON.stringify({ changes }))),
    ).toEqual({ changes: hidden })
    // What does not read might hold a value anywhere: it is hidden whole.
    expect(rawInputShown('setup_propose', '{"changes": "[{\\"value\\": \\"sk-li')).not.toContain(
      'sk-li',
    )
    // Every other tool is shown as it was sent.
    expect(argumentsShown('fs_write', { changes, key: 'k' })).toEqual({ changes, key: 'k' })
  })

  test("Codex's report of the call, its arguments under `arguments`, hides every value", () => {
    const changes = JSON.stringify([{ kind: 'variable', name: 'API_KEY', value: SECRET }])
    const hidden = JSON.stringify([{ kind: 'variable', name: 'API_KEY', value: '(hidden)' }])
    // codex-acp reports a dynamic tool's call as `{ arguments }`, the arguments as sent inside it.
    const reported = JSON.stringify({ arguments: { changes, why: 'asked', key: 'k' } })

    const shown = rawInputShown('hemera_setup_propose', reported)

    expect(shown).not.toContain(SECRET)
    expect(JSON.parse(shown)).toEqual({ arguments: { changes: hidden, why: 'asked', key: 'k' } })
  })
})
