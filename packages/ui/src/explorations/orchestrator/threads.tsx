import { HemeraToolCall } from '../../activity/hemera-tool-call.tsx'
import { AgentText } from '../../message/agent-text.tsx'
import type { ScrollerEntry } from '../../message/scroller/scroller.tsx'
import { MissionBrief } from '../../spec/mission-brief.tsx'
import { type Helper, definitionOf } from './fixtures.ts'

/**
 * The threads of the exploration: the main agent's, which launches and reads its helpers, and each
 * helper's own, as its child Session writes it.
 */

function hemera(id: string, title: string, detail: string, brief?: string): ScrollerEntry {
  return { id, content: <MissionBrief title={title} detail={detail} brief={brief} /> }
}

function says(id: string, text: string): ScrollerEntry {
  return { id, content: <AgentText text={text} /> }
}

function launch(id: string, subject: string, summary: string): ScrollerEntry {
  return {
    id,
    content: (
      <HemeraToolCall
        tool="helper_launch"
        label="Launch helper"
        subject={{ text: subject }}
        status="completed"
        summary={summary}
      />
    ),
  }
}

const BRIEF =
  '**Building** · work through the ready tasks of `ATL-7`: **T2** · A CSV in the column order of the ledger (try 2 of 3: the header order was red), **T3** · Credit notes as negative rows. You may launch helpers.'

/** The main agent's thread: the brief, the helpers it launched, and what came back. */
export const MAIN_THREAD: ScrollerEntry[] = [
  hemera('brief', 'What the agent was told · Building', '10:28', BRIEF),
  says(
    'plan',
    'T2 and T3 touch separate files: one helper each. I asked for a test review of T1 and for the export page of the docs.',
  ),
  launch('launch-t2', 'T2', 'A free helper on T2'),
  launch('launch-t3', 'T3', 'A free helper on T3'),
  launch('launch-review', 'Test review · T1', 'Test review started'),
  hemera('review-back', 'Test review · T1 · green', '10:34'),
  launch('launch-docs', 'Documenter', 'Documenter started'),
  says('now', 'T1 is reviewed green. T2 is on its header again; T3 has not reported since 10:33.'),
]

/** A helper's own thread: its brief, its calls, and where it is now. */
export function threadOf(helper: Helper): ScrollerEntry[] {
  const defined = definitionOf(helper)
  const brief =
    defined === undefined
      ? `**${helper.name}** · written by the main agent: ${helper.last}`
      : `**${defined.name}** · ${defined.description} It receives: ${defined.receives.toLowerCase()}.`
  const entries: ScrollerEntry[] = [
    hemera('brief', `What the helper was told · ${helper.name}`, helper.at, brief),
    ...helper.steps.slice(0, -1).map((step, index) => ({
      id: `step-${String(index)}`,
      content: (
        <HemeraToolCall
          tool="fs_read"
          label="Step"
          subject={{ text: step }}
          status="completed"
          summary={step}
        />
      ),
    })),
  ]
  const last = helper.steps.at(-1) ?? helper.doing
  entries.push({
    id: 'now',
    content: (
      <HemeraToolCall
        tool="fs_edit"
        label="Step"
        subject={{ text: last }}
        status={
          helper.state === 'running' || helper.state === 'stuck' ? 'in_progress' : 'completed'
        }
        summary={last}
      />
    ),
  })
  entries.push(says('last', helper.last))
  return entries
}
