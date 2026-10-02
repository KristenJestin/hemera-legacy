/**
 * The app tester's findings as the Developer section lists them (#300): read from the folder the
 * engine hands back through `tester.findings`, and redrawn when the engine says it changed.
 */

import { describe, expect, test } from 'vite-plus/test'

import type { EngineEvent, TesterFinding } from '@hemera/ipc'
import { findingLineOf, findingsChanged } from '#renderer/finding-lines.ts'

const FINDING: TesterFinding = {
  file: '0003-commands-run-cannot-redirect-output.md',
  number: 3,
  title: 'commands_run cannot redirect output',
  kind: 'missing_capability',
  place: 'commands_run',
  severity: 'hurts',
  occurrences: 2,
  firstSeen: '2026-09-30T14:32:08.000+02:00',
  lastSeen: '2026-09-30T15:02:11.000+02:00',
  sessions: ['s-parser', 's-deploy'],
  agent: 'claude-code',
  version: '0.5.0-dev',
  body: '# #3 commands_run cannot redirect output\n',
}

describe('A finding becomes one row', () => {
  test('its file, number, title, kind, place, severity, count and body, its last seen written', () => {
    expect(findingLineOf(FINDING, (at) => `at ${at}`)).toEqual({
      file: FINDING.file,
      number: 3,
      title: FINDING.title,
      kind: 'missing_capability',
      place: 'commands_run',
      severity: 'hurts',
      occurrences: 2,
      lastSeen: `at ${Date.parse(FINDING.lastSeen)}`,
      body: FINDING.body,
    })
  })

  test('a last seen a hand wrote as no date is shown as it is', () => {
    expect(findingLineOf({ ...FINDING, lastSeen: 'yesterday' }, () => 'never').lastSeen).toBe(
      'yesterday',
    )
  })
})

describe('The list is read again when the engine says the findings changed', () => {
  test('tester.changed, and nothing else', () => {
    const changed: EngineEvent = { event: 'tester.changed' }
    const other: EngineEvent = { event: 'agents.changed' }
    expect(findingsChanged(changed)).toBe(true)
    expect(findingsChanged(other)).toBe(false)
  })
})
