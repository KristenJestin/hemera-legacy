/**
 * The app tester's findings, as the Developer section lists them (#300).
 *
 * Read from the tester folder the engine hands back through `tester.findings`, one file a finding,
 * already masked: the page draws what the folder holds, and reads it again when the engine says a
 * report was written.
 */

import type { EngineEvent, TesterFinding } from '@hemera/ipc'
import type { FindingLine } from '@hemera/ui'

/** One finding as a row: its last seen written by `written`, or as it is when it is no date. */
export function findingLineOf(
  finding: TesterFinding,
  written: (ms: number) => string,
): FindingLine {
  const seen = Date.parse(finding.lastSeen)
  return {
    file: finding.file,
    number: finding.number,
    title: finding.title,
    kind: finding.kind,
    place: finding.place,
    severity: finding.severity,
    occurrences: finding.occurrences,
    lastSeen: Number.isNaN(seen) ? finding.lastSeen : written(seen),
    body: finding.body,
  }
}

/** Whether an event of the engine says the findings changed. */
export function findingsChanged(event: EngineEvent): boolean {
  return event.event === 'tester.changed'
}
