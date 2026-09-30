/**
 * The tool calls of a turn, folded into one group between two things the agent said (recette of
 * 26 September 2026, issue #149).
 *
 * The page draws the group with `@hemera/ui`'s `ActionGroup`, which needs a browser and is proved
 * in Storybook; what is tested here is `action-groups.ts`, which decides what goes in a group and
 * what its line says.
 */

import { describe, expect, test } from 'vite-plus/test'

import type { SessionEntry } from '@hemera/ipc'
import { type Grouping, groupActions, groupingOf } from '#renderer/action-groups.ts'

function entryOf(kind: SessionEntry['kind'], payload: string, id: string = kind): SessionEntry {
  return {
    id,
    sessionId: 'session-1',
    seq: 1,
    role: 'agent',
    kind,
    body: '',
    payload,
    correlationId: null,
    turnId: null,
    state: null,
    origin: 'live',
    createdAt: 0,
  }
}

/** The agent's report of a call, as the runtime stores it. */
function call(kind: string | null, status = 'completed', title = 'Read a file'): string {
  return JSON.stringify({ call: { title, kind, status, locations: [], content: [] } })
}

const READ: Grouping = { kind: 'read', status: 'completed', label: 'Read a file' }
const RUN: Grouping = { kind: 'execute', status: 'completed', label: 'pnpm test' }
const HEMERA: Grouping = { kind: 'hemera', status: 'completed', label: 'Write the Spec' }

describe('Tool calls between two agent texts are one folded group', () => {
  test('every run of two calls or more between two texts is one group, whatever the tools', () => {
    const pieces = groupActions([
      { item: 'text-1', grouping: null },
      { item: 'read-1', grouping: READ },
      { item: 'read-2', grouping: READ },
      { item: 'hemera', grouping: HEMERA },
      { item: 'run', grouping: RUN },
      { item: 'text-2', grouping: null },
    ])
    expect(pieces).toEqual([
      { kind: 'one', item: 'text-1' },
      {
        kind: 'group',
        items: ['read-1', 'read-2', 'hemera', 'run'],
        count: 4,
        status: 'completed',
        latest: 'pnpm test',
        unit: 'actions',
      },
      { kind: 'one', item: 'text-2' },
    ])
  })

  test('a thought or a diff between two calls stays in the group, uncounted', () => {
    const pieces = groupActions([
      { item: 'read-1', grouping: READ },
      { item: 'thought', grouping: 'companion' },
      { item: 'read-2', grouping: READ },
    ])
    expect(pieces).toEqual([
      {
        kind: 'group',
        items: ['read-1', 'thought', 'read-2'],
        count: 2,
        status: 'completed',
        latest: 'Read a file',
        unit: 'actions',
      },
    ])
  })

  test('a thought before the first call and a diff after the last stay outside the group', () => {
    const pieces = groupActions([
      { item: 'thought', grouping: 'companion' },
      { item: 'read-1', grouping: READ },
      { item: 'read-2', grouping: READ },
      { item: 'diff', grouping: 'companion' },
    ])
    expect(pieces.map((one) => one.kind)).toEqual(['one', 'group', 'one'])
  })

  test('a single call stays its own row, and anything that is not a call ends the run', () => {
    expect(
      groupActions([
        { item: 'read-1', grouping: READ },
        { item: 'question', grouping: null },
        { item: 'read-2', grouping: READ },
      ]),
    ).toEqual([
      { kind: 'one', item: 'read-1' },
      { kind: 'one', item: 'question' },
      { kind: 'one', item: 'read-2' },
    ])
  })

  test('the group runs while a call runs, and says a failure while folded', () => {
    const running = groupActions([
      { item: 'a', grouping: READ },
      { item: 'b', grouping: { ...RUN, status: 'in_progress' } },
    ])
    expect(running[0]).toMatchObject({ kind: 'group', status: 'in_progress' })
    const failed = groupActions([
      { item: 'a', grouping: { ...RUN, status: 'failed' } },
      { item: 'b', grouping: READ },
    ])
    expect(failed[0]).toMatchObject({ kind: 'group', status: 'failed' })
  })

  test('a group says its count and its latest action, never the kinds it holds (issue #159)', () => {
    const [group] = groupActions([
      { item: 'a', grouping: HEMERA },
      { item: 'b', grouping: READ },
    ])
    expect(Object.keys(group ?? {}).sort()).toEqual([
      'count',
      'items',
      'kind',
      'latest',
      'status',
      'unit',
    ])
  })

  test('a folded group names its latest action, and follows it as calls arrive (issue #180)', () => {
    const blocks = [
      { item: 'text', grouping: null },
      { item: 'read-1', grouping: { ...READ, label: 'Read src/menu.html' } },
      { item: 'read-2', grouping: { ...READ, label: 'Read src/menu.css', status: 'in_progress' } },
    ] satisfies { item: string; grouping: Grouping }[]
    expect(groupActions(blocks)[1]).toMatchObject({ count: 2, latest: 'Read src/menu.css' })
    const grown = groupActions([
      ...blocks,
      { item: 'thought', grouping: 'companion' },
      { item: 'run', grouping: { ...RUN, label: 'pnpm test menu', status: 'in_progress' } },
      { item: 'diff', grouping: 'companion' },
    ])
    // A companion after the last call is not an action: the line names the call before it.
    expect(grown[1]).toMatchObject({ count: 3, latest: 'pnpm test menu' })
  })
})

describe('What an entry is to a run of calls', () => {
  test('an agent call is counted by its kind, and an unknown kind as another call', () => {
    expect(groupingOf(entryOf('tool_call', call('read')))).toEqual(READ)
    expect(groupingOf(entryOf('tool_call', call('execute', 'in_progress', 'pnpm test')))).toEqual({
      kind: 'execute',
      status: 'in_progress',
      label: 'pnpm test',
    })
    expect(groupingOf(entryOf('tool_call', call('telepathy')))).toEqual({
      kind: 'other',
      status: 'completed',
      label: 'Read a file',
    })
  })

  test('a call to one of Hemera’s tools is counted as Hemera’s, reported or answered', () => {
    expect(groupingOf(entryOf('tool_call', call(null, 'pending', 'spec_write')))).toMatchObject({
      kind: 'hemera',
      status: 'in_progress',
    })
    const answered = entryOf(
      'hemera_tool_call',
      JSON.stringify({
        tool: 'spec_write',
        state: 'refused',
        caller: 'agent',
        paths: [],
        arguments: '{}',
      }),
    )
    expect(groupingOf(answered)).toMatchObject({ kind: 'hemera', status: 'failed' })
  })

  test('a call is named as its row names it: the agent’s title, or Hemera’s label and subject', () => {
    expect(
      groupingOf(entryOf('tool_call', call('read', 'completed', 'Read src/menu.html'))),
    ).toEqual({ kind: 'read', status: 'completed', label: 'Read src/menu.html' })
    const reported = JSON.stringify({
      call: {
        title: 'fs_read',
        kind: null,
        status: 'in_progress',
        rawInput: { text: JSON.stringify({ path: 'src/menu.html' }) },
      },
    })
    expect(groupingOf(entryOf('tool_call', reported))).toMatchObject({
      label: 'Read file src/menu.html',
    })
    const answered = entryOf(
      'hemera_tool_call',
      JSON.stringify({
        tool: 'fs_read',
        state: 'completed',
        caller: 'agent',
        paths: [],
        arguments: JSON.stringify({ path: 'src/menu.html' }),
      }),
    )
    expect(groupingOf(answered)).toMatchObject({ label: 'Read file src/menu.html' })
    const bare = entryOf(
      'hemera_tool_call',
      JSON.stringify({
        tool: 'commands_list',
        state: 'completed',
        caller: 'agent',
        paths: [],
        arguments: '{}',
      }),
    )
    expect(groupingOf(bare)).toMatchObject({ label: 'List commands' })
  })

  test('a thought and a diff go with the calls; the agent’s text and the rest end the run', () => {
    expect(groupingOf(entryOf('thought', ''))).toBe('companion')
    expect(groupingOf(entryOf('diff', '[]'))).toBe('companion')
    expect(groupingOf(entryOf('message', ''))).toBe(null)
    expect(groupingOf(entryOf('note', '{}'))).toBe(null)
    expect(groupingOf(entryOf('tool_call', '{'))).toBe(null)
  })
})

describe('The quiet records fold into the work around them (#250)', () => {
  test('a permission, a proposal, a question, the Spec proposed and a run are members', () => {
    for (const kind of [
      'permission_request',
      'permission_decision',
      'command_proposal',
      'command_run',
      'spec_proposal',
      'spec_question',
    ] as const) {
      expect(groupingOf(entryOf(kind, '{}'))).toBe('member')
    }
  })

  test('a member stays in the group, at either end, and is not counted', () => {
    const pieces = groupActions([
      { item: 'text', grouping: null },
      { item: 'run', grouping: 'member' },
      { item: 'read-1', grouping: READ },
      { item: 'read-2', grouping: READ },
      { item: 'question', grouping: 'member' },
    ])
    expect(pieces).toEqual([
      { kind: 'one', item: 'text' },
      {
        kind: 'group',
        items: ['run', 'read-1', 'read-2', 'question'],
        count: 2,
        status: 'completed',
        latest: 'Read a file',
        unit: 'actions',
      },
    ])
  })

  test('nothing outside a group changes: a lone record stays its row', () => {
    expect(groupActions([{ item: 'question', grouping: 'member' }])).toEqual([
      { kind: 'one', item: 'question' },
    ])
  })
})

describe('Runs one after the other between two messages are one group (#250)', () => {
  const run = (state: string, name = 'v2 check'): SessionEntry =>
    entryOf(
      'command_run',
      JSON.stringify({ name, line: 'bun run check', state }),
      `run-${name}-${state}`,
    )

  test('a run is a member that says how it stands and what it is', () => {
    expect(groupingOf(run('failed'))).toEqual({
      member: 'run',
      status: 'failed',
      label: 'v2 check',
    })
    expect(groupingOf(run('exited', 'echo'))).toEqual({
      member: 'run',
      status: 'completed',
      label: 'echo',
    })
  })

  test('two runs or more with no call around them fold into `N runs`, failed if one failed', () => {
    const failed: Grouping = { member: 'run', status: 'failed', label: 'v2 check' }
    const done: Grouping = { member: 'run', status: 'completed', label: 'echo' }
    const pieces = groupActions([
      { item: 'said', grouping: null },
      { item: 'run-1', grouping: failed },
      { item: 'run-2', grouping: failed },
      { item: 'run-3', grouping: done },
      { item: 'next', grouping: null },
    ])
    expect(pieces).toEqual([
      { kind: 'one', item: 'said' },
      {
        kind: 'group',
        items: ['run-1', 'run-2', 'run-3'],
        count: 3,
        status: 'failed',
        latest: 'echo',
        unit: 'runs',
      },
      { kind: 'one', item: 'next' },
    ])
  })

  test('a single run stays its own row', () => {
    const done: Grouping = { member: 'run', status: 'completed', label: 'echo' }
    expect(groupActions([{ item: 'run', grouping: done }])).toEqual([{ kind: 'one', item: 'run' }])
  })
})
