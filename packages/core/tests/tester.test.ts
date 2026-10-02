/**
 * The app tester mode (#300): what a finding is, when two reports are the same finding, and the
 * files a finding and the index are written as.
 */

import { describe, expect, test } from 'vite-plus/test'

import {
  APP_TESTER_BRIEF,
  type FindingContext,
  type ReportedFinding,
  TESTER_TOOLS,
  TOOL_NAMES,
  findingFileName,
  findingsIndex,
  hemeraToolNamed,
  matchingFinding,
  newFinding,
  offeredTools,
  recordOccurrence,
  titleSimilarity,
  writeFindingFile,
} from '#index.ts'

const REDIRECT: ReportedFinding = {
  title: 'commands_run cannot redirect output with >',
  kind: 'missing_capability',
  place: 'commands_run',
  severity: 'hurts',
  trying: 'Keep the output of the test run in a file to read it page by page.',
  happened:
    'The line `pnpm test > out.txt` ran without a shell and `>` reached pnpm as an argument.',
  expected: 'A redirection runs as it does in a terminal, or the tool says it has no shell.',
  steps: '1. Ask commands_run for `pnpm test > out.txt`.\n2. Read the output.',
  files: ['package.json'],
  callId: 'toolu_01',
  error: 'ERR_PNPM_NO_SCRIPT Missing script: >',
  code: '1',
}

const FIRST: FindingContext = {
  at: '2026-09-30T16:32:08.000+02:00',
  hemera: {
    version: '0.5.0-dev.3-g1a2b3c4',
    channel: 'dev',
    commit: '1a2b3c4',
    os: 'Linux 7.2.3-arch1-3',
    platform: 'linux-x64',
  },
  agent: { name: 'claude-code', version: '0.79.0', model: 'opus', effort: 'high', mode: 'default' },
  auto: 'hemera-auto',
  project: { id: 'p-atlas', name: 'Atlas' },
  workspace: { name: 'main', path: '/home/someone/atlas' },
  session: { id: 's-parser', title: 'Fix the parser', mission: 'free' },
  build: null,
  call: {
    tool: 'commands_run',
    id: 'toolu_01',
    state: 'failed',
    summary: 'pnpm test > out.txt exited with 1',
    arguments: '{"line":"pnpm test > out.txt"}',
    ms: 812,
    seq: 41,
  },
  entries: { from: 36, to: 44 },
}

const SECOND: FindingContext = {
  ...FIRST,
  at: '2026-09-30T17:02:11.000+02:00',
  agent: { name: 'codex', version: null, model: null, effort: null, mode: null },
  session: { id: 's-deploy', title: 'Deploy the preview', mission: 'build' },
  build: { phase: 'execute', tasks: ['T2'] },
  call: null,
  entries: { from: 3, to: 9 },
}

describe('The same finding is recognised', () => {
  test('same kind, same place and a similar title is the same finding', () => {
    const existing = [{ number: 3, ...REDIRECT }]
    const again = {
      ...REDIRECT,
      title: "commands_run can't redirect output to a file",
      place: ' `Commands_Run` ',
    }
    expect(matchingFinding(existing, again)?.number).toBe(3)
  })

  test('another kind is another finding, whatever the title', () => {
    const existing = [{ number: 3, ...REDIRECT }]
    expect(matchingFinding(existing, { ...REDIRECT, kind: 'tool_error' })).toBeNull()
  })

  test('another place is another finding, whatever the title', () => {
    const existing = [{ number: 3, ...REDIRECT }]
    expect(matchingFinding(existing, { ...REDIRECT, place: 'commands_output' })).toBeNull()
  })

  test('a different title in the same place is another finding', () => {
    const existing = [{ number: 3, ...REDIRECT }]
    const other = { ...REDIRECT, title: 'commands_run loses the exit code of a serve command' }
    expect(titleSimilarity(REDIRECT.title, other.title)).toBeLessThan(0.5)
    expect(matchingFinding(existing, other)).toBeNull()
  })

  test('the closest title wins among several of the same kind and place', () => {
    const existing = [
      { number: 1, ...REDIRECT, title: 'commands_run cannot pipe output' },
      { number: 2, ...REDIRECT },
    ]
    const asked = { ...REDIRECT, title: 'commands_run cannot redirect output' }
    expect(matchingFinding(existing, asked)?.number).toBe(2)
  })

  test('a title is compared by its words, whatever their case and punctuation', () => {
    expect(titleSimilarity('The MCP server drops a call!', 'mcp server drops call')).toBe(1)
    expect(titleSimilarity('', 'anything')).toBe(0)
  })
})

describe('A finding is a file of its own', () => {
  test('a new finding holds its head and the facts of its occurrence', () => {
    const { head, body } = newFinding(7, REDIRECT, FIRST)
    expect(head).toMatchObject({
      number: 7,
      title: REDIRECT.title,
      kind: 'missing_capability',
      place: 'commands_run',
      severity: 'hurts',
      occurrences: 1,
      firstSeen: FIRST.at,
      lastSeen: FIRST.at,
      sessions: ['s-parser'],
      version: '0.5.0-dev.3-g1a2b3c4',
      channel: 'dev',
      commit: '1a2b3c4',
      os: 'Linux 7.2.3-arch1-3',
      platform: 'linux-x64',
      agent: 'claude-code',
      agentVersion: '0.79.0',
      model: 'opus',
      effort: 'high',
      mode: 'default',
      auto: 'hemera-auto',
      project: 'Atlas',
      projectId: 'p-atlas',
      workspace: 'main',
      workspacePath: '/home/someone/atlas',
    })
    for (const part of [
      '## Trying to',
      REDIRECT.trying,
      '## What happened',
      REDIRECT.happened,
      '## Expected',
      REDIRECT.expected,
      '## Steps to reproduce',
      '1. Ask commands_run',
      '### Occurrence 1 · 2026-09-30T16:32:08.000+02:00',
      'Fix the parser (`s-parser`) · free',
      'claude-code 0.79.0 · model opus · effort high · mode default',
      'Hemera Auto: hemera-auto',
      '0.5.0-dev.3-g1a2b3c4 · dev · commit 1a2b3c4 · Linux 7.2.3-arch1-3 · linux-x64',
      'Atlas (`p-atlas`)',
      'main at `/home/someone/atlas`',
      '`package.json`',
      '`commands_run` `toolu_01` · failed · 812 ms · entry 41',
      '`{"line":"pnpm test > out.txt"}`',
      'Code: 1',
      'Thread entries: 36 to 44',
      'ERR_PNPM_NO_SCRIPT Missing script: >',
    ]) {
      expect(body).toContain(part)
    }
  })

  test('its file is its front matter, one key a line, over its body', () => {
    const { head, body } = newFinding(7, REDIRECT, FIRST)
    const text = writeFindingFile(head, body)
    expect(
      text.startsWith('---\nnumber: 7\ntitle: "commands_run cannot redirect output with >"\n'),
    ).toBe(true)
    expect(text).toContain('\nsessions: ["s-parser"]\n')
    expect(text).toContain('\ncommit: "1a2b3c4"\n')
    expect(text.endsWith(`\n---\n${body}`)).toBe(true)
  })

  test('its name is its number and its title', () => {
    expect(findingFileName(7, 'commands_run cannot redirect output with >')).toBe(
      '0007-commands-run-cannot-redirect-output-with.md',
    )
    expect(findingFileName(12, '!!!')).toBe('0012-finding.md')
  })

  test('an occurrence adds a section, counts, moves last seen and adds its Session', () => {
    const first = newFinding(7, REDIRECT, FIRST)
    const again = recordOccurrence(
      first,
      { ...REDIRECT, severity: 'blocks', happened: 'The same with 2>&1.', error: null },
      SECOND,
    )
    expect(again.head).toMatchObject({
      occurrences: 2,
      firstSeen: FIRST.at,
      lastSeen: SECOND.at,
      sessions: ['s-parser', 's-deploy'],
      // The worst severity it was reported with.
      severity: 'blocks',
      // The head says the environment of the latest occurrence.
      agent: 'codex',
      agentVersion: null,
    })
    expect(again.body.startsWith(first.body)).toBe(true)
    const added = again.body.slice(first.body.length)
    expect(added).toContain('### Occurrence 2 · 2026-09-30T17:02:11.000+02:00')
    expect(added).toContain('Deploy the preview (`s-deploy`) · build')
    expect(added).toContain('Build: execute · T2')
    // What differs from the first report is said under the occurrence; what does not, is not.
    expect(added).toContain('The same with 2>&1.')
    expect(added).not.toContain(REDIRECT.expected)
  })

  test('a second occurrence in the same Session names it once', () => {
    const first = newFinding(7, REDIRECT, FIRST)
    const again = recordOccurrence(first, REDIRECT, { ...FIRST, at: SECOND.at })
    expect(again.head.sessions).toEqual(['s-parser'])
    expect(again.head.occurrences).toBe(2)
  })

  test('an error text that holds a fence is still one block', () => {
    const { body } = newFinding(1, { ...REDIRECT, error: 'before\n```\nafter' }, FIRST)
    expect(body).toContain('````text\nbefore\n```\nafter\n````')
  })
})

describe('The index lists every finding by kind, then severity', () => {
  test('one table per severity under each kind, linking each file', () => {
    const redirect = newFinding(1, REDIRECT, FIRST).head
    const crash = newFinding(
      2,
      {
        ...REDIRECT,
        title: 'fs_read fails on | in a name',
        kind: 'hemera_bug',
        place: 'fs_read',
        severity: 'blocks',
      },
      SECOND,
    ).head
    const typo = newFinding(
      3,
      { ...REDIRECT, title: 'A typo', kind: 'hemera_bug', place: 'Settings', severity: 'cosmetic' },
      FIRST,
    ).head
    const index = findingsIndex(
      [redirect, crash, typo].map((head) => ({
        head,
        file: findingFileName(head.number, head.title),
      })),
    )
    expect(index).toContain('3 findings · 3 occurrences')
    const order = [
      '## Hemera bug',
      '### Blocks',
      '### Cosmetic',
      '## Missing capability',
      '### Hurts',
    ]
    const at = order.map((heading) => index.indexOf(heading))
    for (const position of at) expect(position).toBeGreaterThan(-1)
    expect(at).toEqual([...at].toSorted((one, other) => one - other))
    expect(index).toContain('[#2](findings/0002-fs-read-fails-on-in-a-name.md)')
    // A pipe in a title does not break the table.
    expect(index).toContain('fs_read fails on \\| in a name')
  })

  test('with nothing reported, it says so', () => {
    expect(findingsIndex([])).toContain('No finding yet.')
  })
})

describe('The app tester tools', () => {
  test('are offered only while the mode is on, to every mission', () => {
    for (const mission of ['free', 'define', 'build'] as const) {
      for (const tool of TESTER_TOOLS) {
        expect(offeredTools(mission)).not.toContain(tool)
        expect(offeredTools(mission, true)).toContain(tool)
      }
    }
  })

  test('are known by their name under any prefix an agent gives them', () => {
    for (const tool of TESTER_TOOLS) {
      expect(TOOL_NAMES).toContain(tool)
      expect(hemeraToolNamed(tool)).toBe(tool)
      expect(hemeraToolNamed(`mcp__hemera__${tool}`)).toBe(tool)
      expect(hemeraToolNamed(`hemera_${tool}`)).toBe(tool)
    }
    expect(hemeraToolNamed('mcp__hemera__fs_read')).toBe('fs_read')
    expect(hemeraToolNamed('hemera_fs_read')).toBe('fs_read')
  })

  test('are the two the brief names', () => {
    const named = [...APP_TESTER_BRIEF.matchAll(/`([a-z_]+)`/g)].map((match) => match[1])
    expect(new Set(named)).toEqual(new Set(TESTER_TOOLS))
    expect(APP_TESTER_BRIEF).toMatch(/not .*user's project/)
    expect(APP_TESTER_BRIEF).toMatch(/unless it blocks/)
  })
})
