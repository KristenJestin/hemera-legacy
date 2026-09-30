/**
 * One entry a call (review of #250): the permission a one-off waited on, its decision and its run,
 * and the proposal a `commands_propose` left, are carried by the call they belong to, and drawn no
 * more on their own. The thread of these tests is the one a Session of the recette wrote.
 */

import { describe, expect, test } from 'vite-plus/test'

import type { SessionEntry } from '@hemera/ipc'
import { foldedCallsOf } from '#renderer/agent-tool-payloads.ts'
import { callLinksOf } from '#renderer/call-links.ts'

let seq = 0

function entry(
  kind: SessionEntry['kind'],
  payload: string,
  id: string,
  state: string | null = null,
  body: string = kind,
): SessionEntry {
  seq += 1
  return {
    id,
    sessionId: 'session-1',
    seq,
    role: kind === 'tool_call' ? 'agent' : 'hemera',
    kind,
    body,
    payload,
    correlationId: null,
    turnId: null,
    state,
    origin: 'live',
    createdAt: seq,
  }
}

const LINE = 'bash -c "echo test de permission && date"'

const report = (id: string, tool: string, args: string, callId: string): SessionEntry => ({
  ...entry(
    'tool_call',
    JSON.stringify({
      call: {
        title: `mcp__hemera__${tool}`,
        kind: 'other',
        status: 'completed',
        locations: [],
        content: [],
        rawInput: { text: args, truncated: false, length: args.length },
        rawOutput: null,
      },
    }),
    id,
    'completed',
    `mcp__hemera__${tool}`,
  ),
  correlationId: `call:${callId}`,
})

const hemera = (
  id: string,
  tool: string,
  args: string,
  callId: string,
  body: string,
): SessionEntry =>
  entry(
    'hemera_tool_call',
    JSON.stringify({
      tool,
      state: 'completed',
      key: null,
      callId,
      session: 'session-1',
      caller: 'c',
      agent: 'claude',
      ms: 1,
      paths: [],
      arguments: args,
    }),
    id,
    'completed',
    body,
  )

describe('A call carries what became of it (#250)', () => {
  test('a one-off asked for: its request, its decision and its run are the call’s', () => {
    const args = JSON.stringify({ line: LINE })
    const thread = [
      report('report', 'commands_run', args, 'toolu_1'),
      entry(
        'permission_request',
        JSON.stringify({ toolCallId: 'q1', options: [], tool: 'commands_run', line: LINE }),
        'request',
        'decided',
      ),
      entry(
        'permission_decision',
        JSON.stringify({ toolCallId: 'q1', optionId: 'allowed' }),
        'decision',
      ),
      entry(
        'command_run',
        JSON.stringify({ runId: 'run-1', line: LINE, startedBy: 'agent', state: 'exited' }),
        'run',
      ),
      hemera('answer', 'commands_run', args, 'toolu_1', 'bash is exited (run-1)'),
    ]
    const links = callLinksOf(thread, foldedCallsOf(thread))
    const [link] = [...links.byCall.values()]
    expect(links.byCall.size).toBe(1)
    expect(link?.request?.id).toBe('request')
    expect(link?.decision?.id).toBe('decision')
    expect(link?.run?.id).toBe('run')
    expect([...links.absorbed].toSorted()).toEqual(['decision', 'request', 'run'])
  })

  test('a one-off run without asking, beside a proposal, each to its own call', () => {
    const run = JSON.stringify({ line: 'echo hi' })
    const proposed = JSON.stringify({ name: 'v2 format:check', line: 'bun run format:check' })
    const thread = [
      report('report-run', 'commands_run', run, 'toolu_2'),
      report('report-propose', 'commands_propose', proposed, 'toolu_3'),
      entry(
        'permission_decision',
        JSON.stringify({
          toolCallId: 'u1',
          optionId: 'allowed',
          unasked: true,
          tool: 'commands_run',
          line: 'echo hi',
        }),
        'unasked',
      ),
      entry(
        'command_run',
        JSON.stringify({ runId: 'run-2', line: 'echo hi', startedBy: 'agent' }),
        'run',
      ),
      hemera('answer-run', 'commands_run', run, 'toolu_2', 'echo is exited (run-2)'),
      entry('command_proposal', JSON.stringify({ name: 'v2 format:check' }), 'proposal'),
      hemera('answer-propose', 'commands_propose', proposed, 'toolu_3', 'proposed v2 format:check'),
    ]
    const links = callLinksOf(thread, foldedCallsOf(thread))
    const byTool = [...links.byCall.values()]
    expect(byTool.find((one) => one.run !== undefined)?.decision?.id).toBe('unasked')
    expect(byTool.find((one) => one.proposal !== undefined)?.proposal?.id).toBe('proposal')
    expect([...links.absorbed].toSorted()).toEqual(['proposal', 'run', 'unasked'])
  })

  test('a run the reader started is no call’s, and keeps its row', () => {
    const thread = [
      entry(
        'command_run',
        JSON.stringify({ runId: 'run-3', line: 'bun run check', startedBy: 'user' }),
        'run',
      ),
    ]
    expect(callLinksOf(thread, foldedCallsOf(thread)).absorbed.size).toBe(0)
  })
})
