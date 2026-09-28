/**
 * The setup cards of a thread, as the window reads them off their entries (issue #218).
 *
 * `agent-blocks.tsx` draws each `setup_proposal` entry as a `SetupProposal` card, which needs a
 * browser to import; what this suite checks is what the card is handed: the change said in the
 * domain's words, never a variable's value, and Accept all on the last card of a batch alone,
 * while more than one of its changes waits (Decided 1 and 2 of #218).
 */

import { describe, expect, test } from 'vite-plus/test'

import type { SessionEntry } from '@hemera/ipc'

import { setupProposalOf, waitingInBatch } from '#renderer/agent-tool-payloads.ts'
import { argumentsShown, changesShown, rawInputShown } from '#engine/setup/hidden.ts'

/** A `setup_proposal` entry of a batch, in a state, at a place of the thread. */
function card(
  id: string,
  batchId: string,
  state: 'pending' | 'accepted' | 'declined',
  change: Record<string, string | boolean | null>,
): SessionEntry {
  return {
    id,
    sessionId: 'session-1',
    seq: Number(id.replace('entry-', '')),
    role: 'hemera',
    kind: 'setup_proposal',
    body: '',
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
    createdAt: 0,
  }
}

const REPOSITORY = { kind: 'repository', path: './sources/front' }
const VARIABLE = { kind: 'variable', name: 'API_KEY', workspace: null, replaces: false }

describe('Every change is a proposal the user accepts', () => {
  test('a card says the change in the domain words, and a variable without its value', () => {
    expect(setupProposalOf(card('entry-1', 'batch-1', 'pending', REPOSITORY))).toEqual({
      proposalId: 'proposal-entry-1',
      batchId: 'batch-1',
      title: 'Declare the repository ./sources/front',
      details: [{ label: 'Path', value: './sources/front' }],
      why: 'the README says so',
      state: 'pending',
    })
    expect(setupProposalOf(card('entry-2', 'batch-1', 'pending', VARIABLE))?.details).toEqual([
      { label: 'Scope', value: 'the Project' },
      { label: 'Value', value: 'set, not shown' },
    ])
  })

  test('a payload that does not read is left out rather than drawn from a guess', () => {
    const broken = { ...card('entry-1', 'batch-1', 'pending', REPOSITORY), payload: '{}' }
    expect(setupProposalOf(broken)).toBeNull()
  })
})

describe('Several changes proposed together are accepted in one press', () => {
  test('the last card of a batch counts what still waits, and no other card does', () => {
    const thread = [
      card('entry-1', 'batch-1', 'accepted', REPOSITORY),
      card('entry-2', 'batch-1', 'pending', VARIABLE),
      card('entry-3', 'batch-2', 'pending', REPOSITORY),
      card('entry-4', 'batch-1', 'pending', REPOSITORY),
    ]
    const waiting = thread.map((entry) => {
      const drawn = setupProposalOf(entry)
      return drawn === null ? null : waitingInBatch(thread, entry, drawn)
    })
    expect(waiting).toEqual([undefined, undefined, 1, 2])
  })
})

describe("A variable's value is never shown back", () => {
  test('the arguments of a proposal and the agent report of it hide every value', () => {
    const changes = JSON.stringify([
      { kind: 'variable', name: 'API_KEY', value: 'sk-live' },
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
    const changes = JSON.stringify([{ kind: 'variable', name: 'API_KEY', value: 'sk-live' }])
    const hidden = JSON.stringify([{ kind: 'variable', name: 'API_KEY', value: '(hidden)' }])
    // codex-acp reports a dynamic tool's call as `{ arguments }`, the arguments as sent inside it.
    const reported = JSON.stringify({ arguments: { changes, why: 'asked', key: 'k' } })

    const shown = rawInputShown('hemera_setup_propose', reported)

    expect(shown).not.toContain('sk-live')
    expect(JSON.parse(shown)).toEqual({ arguments: { changes: hidden, why: 'asked', key: 'k' } })
  })
})
