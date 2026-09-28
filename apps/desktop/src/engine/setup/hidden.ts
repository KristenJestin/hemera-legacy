/**
 * A call to `setup_propose` as the thread may show it: without a variable's value (Decided 2 of
 * #218).
 *
 * The agent may send a variable's value, and the value is never shown back — not in the card, not
 * in the entry Hemera writes of the call, not in the agent's own report of it that the thread
 * keeps. Both entries show the arguments the call was sent with, so both are written from what
 * this answers: every change as it was sent, a variable's value replaced. Whatever does not read
 * as a list of changes is replaced whole, since nothing then says where a value would be in it.
 */

import { hemeraToolNamed } from '@hemera/core'
import { z } from 'zod'

/** The flat arguments of a call, as the tools read them. */
type ToolArguments = Readonly<Record<string, string | number | boolean | null>>

/** What a value is shown as. */
export const HIDDEN_VALUE = '(hidden)'

/** What a list of changes that does not read is shown as. */
const HIDDEN_CHANGES = '(the changes are hidden: they may hold the value of a variable)'

/** A list of changes as sent, each read only as far as its value. */
const CHANGES_SENT = z.array(z.record(z.string(), z.json()))

/** The arguments of a call as the agent reports them, `changes` read as the text it was sent as. */
const ARGUMENTS_SENT = z.record(z.string(), z.json())

/**
 * The `changes` of a proposal, every value replaced: a variable's, and one sent under a kind the
 * tool does not know, since a call refused for its kind still shows what it was sent with.
 */
export function changesShown(changes: string): string {
  const read = z
    .string()
    .transform((text, context) => {
      try {
        return JSON.parse(text)
      } catch {
        context.addIssue({ code: 'custom', message: 'not JSON' })
        return z.NEVER
      }
    })
    .pipe(CHANGES_SENT)
    .safeParse(changes)
  if (!read.success) return HIDDEN_CHANGES
  return JSON.stringify(
    read.data.map((change) =>
      change['value'] === undefined ? change : Object.assign(change, { value: HIDDEN_VALUE }),
    ),
  )
}

/** Whether a tool, named as the agent or Hemera names it, is the one that carries values. */
function carriesValues(tool: string): boolean {
  return hemeraToolNamed(tool) === 'setup_propose'
}

/** The flat arguments of a call as Hemera's entry of it shows them. */
export function argumentsShown(tool: string, sent: ToolArguments) {
  const changes = z.string().safeParse(sent['changes'])
  if (!carriesValues(tool) || !changes.success) return sent
  return { ...sent, changes: changesShown(changes.data) }
}

/**
 * The raw input of a call as the agent reported it — the JSON text of its arguments — as the
 * thread keeps it. A report that does not read is replaced whole.
 */
export function rawInputShown(tool: string, raw: string): string {
  if (!carriesValues(tool)) return raw
  const read = z
    .string()
    .transform((text, context) => {
      try {
        return JSON.parse(text)
      } catch {
        context.addIssue({ code: 'custom', message: 'not JSON' })
        return z.NEVER
      }
    })
    .pipe(ARGUMENTS_SENT)
    .safeParse(raw)
  if (!read.success) return JSON.stringify(HIDDEN_CHANGES)
  return JSON.stringify(reportShown(read.data))
}

/**
 * The arguments of a report, `changes` hidden where the agent put them: at the top as most agents
 * report a call, or under `arguments` as codex-acp reports a dynamic tool's call.
 */
function reportShown(report: z.infer<typeof ARGUMENTS_SENT>): z.infer<typeof ARGUMENTS_SENT> {
  const nested = ARGUMENTS_SENT.safeParse(report['arguments'])
  if (nested.success) return { ...report, arguments: reportShown(nested.data) }
  const changes = z.string().safeParse(report['changes'])
  return { ...report, changes: changes.success ? changesShown(changes.data) : HIDDEN_CHANGES }
}
