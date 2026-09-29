/**
 * A run of a Session as its agent is handed it at the next prompt (issue #238).
 *
 * Whatever the user sees of a run in the thread — started from the line, from a chip, or by the
 * agent in the background — the agent reads in its own history: which run it is, what it ran and
 * where, who started it, how it ended, and the end of what it printed. The output is its tail,
 * bounded, and the text says what was cut and how to read it, rather than passing a part off as
 * the whole.
 */

import type { RunView } from './service.ts'

/** How many of the last lines of a run's output the agent is handed. */
export const RUN_TAIL_LINES = 40

/** How many bytes of those lines at most: forty lines of a minified bundle are not forty lines. */
export const RUN_TAIL_BYTES = 4 * 1024

/** What the agent is shown of an output. */
interface Tail {
  readonly shown: string
  readonly cut: number
}

/** The tail of an output, and how many of its lines were left out. */
function tailOf(output: string): Tail {
  const lines = output.replace(/\n$/, '').split('\n')
  let kept = lines.slice(-RUN_TAIL_LINES)
  while (kept.length > 1 && Buffer.byteLength(kept.join('\n'), 'utf8') > RUN_TAIL_BYTES) {
    kept = kept.slice(1)
  }
  let shown = kept.join('\n')
  // One line longer than the budget on its own is kept by its end.
  if (Buffer.byteLength(shown, 'utf8') > RUN_TAIL_BYTES) shown = shown.slice(-RUN_TAIL_BYTES)
  return { shown, cut: lines.length - kept.length }
}

/** How a run stands, in words: running, or how it ended and with which exit code. */
function howItStands(run: RunView): string {
  if (run.state === 'running') return 'still running'
  const code = run.exitCode === null ? 'no exit code' : `exit code ${run.exitCode}`
  return `${run.state}, ${code}`
}

/**
 * The text of one run, as the agent is handed it. `latest` marks the most recent of the runs
 * handed over together, so that a question about "the command" right after it reads as that one.
 */
export function runText(run: RunView, latest: boolean): string {
  const { shown, cut } = run.output === '' ? { shown: '', cut: 0 } : tailOf(run.output)
  const folder = run.folder === null ? 'the Workspace root' : run.folder
  const read = `read them with commands_output, run: ${run.id}, from: 1`
  const marks = [
    ...(run.dropped > 0 ? [`[${run.dropped} bytes printed first were not kept]`] : []),
    ...(cut > 0 ? [`[${cut} earlier line${cut === 1 ? '' : 's'} not shown: ${read}]`] : []),
  ]
  return [
    '# Command run',
    '',
    "A command ran in this Session; this is how it went, as the thread shows it, not a message of the user's.",
    ...(latest ? ['This is the most recent run handed over to you.'] : []),
    '',
    `run: ${run.id}`,
    `name: ${run.name}`,
    `line: ${run.line}`,
    `folder: ${folder}, in the Workspace ${run.workspaceName} (${run.cwd})`,
    `started by: ${run.startedBy === 'agent' ? 'you, through commands_run' : 'the user, through Hemera'}`,
    `started at: ${run.startedAt}`,
    ...(run.endedAt === null ? [] : [`ended at: ${run.endedAt}`]),
    `state: ${howItStands(run)}`,
    ...(run.url === null ? [] : [`address: ${run.url}`]),
    '',
    shown === '' ? 'output: nothing printed' : 'output:',
    ...marks,
    ...(shown === '' ? [] : [shown]),
  ].join('\n')
}

/** The line the thread shows once the agent took a run: which one, and how it stood. */
export function runSaid(run: RunView): string {
  return `Hemera handed the agent the run of ${run.name} (${howItStands(run)}).`
}
