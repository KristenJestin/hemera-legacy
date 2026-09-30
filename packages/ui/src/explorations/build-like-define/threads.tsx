import { HemeraToolCall } from '../../activity/hemera-tool-call.tsx'
import { AgentText } from '../../message/agent-text.tsx'
import type { ScrollerEntry } from '../../message/scroller/scroller.tsx'
import { MissionBrief } from '../../spec/mission-brief.tsx'
import type { Helper } from './fixtures.ts'

/**
 * The threads of the exploration: the main agent's, the one the user talks to, and each helper's
 * own, as its child Session writes it.
 */

function hemera(id: string, title: string, detail: string, brief?: string): ScrollerEntry {
  return { id, content: <MissionBrief title={title} detail={detail} brief={brief} /> }
}

function says(id: string, text: string): ScrollerEntry {
  return { id, content: <AgentText text={text} /> }
}

function call(
  id: string,
  tool: string,
  label: string,
  subject: string,
  done: boolean,
): ScrollerEntry {
  return {
    id,
    content: (
      <HemeraToolCall
        tool={tool}
        label={label}
        subject={{ text: subject }}
        status={done ? 'completed' : 'in_progress'}
        summary={subject}
      />
    ),
  }
}

const BRIEF =
  '**Building** · work through the ready tasks of `ATL-7`: **T2** · A CSV in the column order of the ledger (try 2 of 3: the header order was red), **T3** · Credit notes as negative rows. You may launch helpers.'

/** The main agent's thread: the brief, the helpers it launched, and what it is doing. */
export const MAIN_THREAD: ScrollerEntry[] = [
  hemera('brief', 'What the agent was told · Building', '10:28', BRIEF),
  says(
    'plan',
    'T2 and T3 touch separate files. I take T2 myself and hand T3 to a helper; T1 goes to a test review, and the export page to the documenter.',
  ),
  call('launch-credit', 'helper_launch', 'Launch helper', 'Credit notes', true),
  call('launch-review', 'helper_launch', 'Launch helper', 'Test review', true),
  call('launch-docs', 'helper_launch', 'Launch helper', 'Documenter', true),
  call('edit', 'fs_edit', 'Edit file', 'src/billing/export-csv.ts', false),
  says('now', 'The ledger wants the number before the client. Moving it, then the test again.'),
]

/** A helper's own thread: its brief, its calls, the one it is in, and its last line. */
export function threadOf(helper: Helper): ScrollerEntry[] {
  const working = helper.state === 'running' || helper.state === 'stuck'
  return [
    hemera('brief', `What the helper was told · ${helper.name}`, helper.at),
    ...helper.steps.map((step, index) =>
      call(
        `step-${String(index)}`,
        'fs_read',
        'Step',
        step,
        !working || index < helper.steps.length - 1,
      ),
    ),
    says('last', helper.last),
  ]
}

/** A `free` Session's thread: a question, and the helpers the agent sent to answer it. */
export const FREE_THREAD: ScrollerEntry[] = [
  says(
    'ask',
    'Multi-currency invoices are off by a cent on the September close. I am looking for where the CSV rounds.',
  ),
  call('launch-explore', 'helper_launch', 'Launch helper', 'Explore', true),
  call('read', 'fs_read', 'Read file', 'src/shared/csv.ts', true),
  says(
    'found',
    'The VAT is cut to the cent on each line, then summed. Cutting the sum instead fixes the cent; a test review checked it.',
  ),
]

/** A `define` Session's thread: the Spec being written, and a prototype asked for. */
export const DEFINE_THREAD: ScrollerEntry[] = [
  says(
    'ask',
    'Accountants need a month of invoices as one CSV they can import into their ledger, from the billing page.',
  ),
  says(
    'plan',
    'Shape is finished. For the plan, one question is open: a select or a calendar to pick the month. I asked the prototyper for both.',
  ),
  call('launch-proto', 'helper_launch', 'Launch helper', 'Prototyper', true),
]
