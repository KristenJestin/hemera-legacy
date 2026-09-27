import { TOOL_LABELS, type ToolMark, hemeraToolNamed } from '@hemera/core'
import type { SessionEntry } from '@hemera/ipc'
import type { FaceState } from '@hemera/ui'
import { z } from 'zod'

/**
 * Which face an agent's work wears (issue #140): read off the entries of its thread, the way the
 * row above the box reads what the turn is doing.
 *
 * The row says `running` for any tool call, and names it; the face says what kind of work the
 * call is, because that is what a face can say without words — reading, writing, running a
 * command. A tool of Hemera's is known by its mark, a tool of the agent's by the kind ACP gives
 * it. Nothing here imports the design system's components: only the name of a state crosses.
 */

/** What each of Hemera's own tools is doing, as a face: the mark says what kind of work it is. */
const MARK_FACES: Readonly<Record<ToolMark, FaceState>> = {
  'read-file': 'reading',
  'list-folder': 'reading',
  search: 'reading',
  'write-file': 'writing',
  'edit-file': 'writing',
  'run-command': 'running',
  'stop-command': 'running',
  'list-commands': 'reading',
  'command-output': 'reading',
  'propose-command': 'writing',
  project: 'reading',
  session: 'reading',
  'read-spec': 'reading',
  'write-spec': 'writing',
  'propose-spec': 'writing',
}

/**
 * What each kind ACP names for an agent's own call is doing, as a face. A kind nobody named, and
 * `other`, run: a tool going is what the row's own `running` says.
 */
const KIND_FACES = new Map<string, FaceState>([
  ['read', 'reading'],
  ['search', 'reading'],
  ['fetch', 'reading'],
  ['edit', 'writing'],
  ['delete', 'writing'],
  ['move', 'writing'],
  ['execute', 'running'],
  ['think', 'thinking'],
])

/** The one field of a reported call the face reads: the kind the agent gave it. */
const kindSchema = z.object({ call: z.object({ kind: z.string().nullable() }) })

/** What kind the agent gave a call, or null when it gave none or the payload does not read. */
function kindOf(entry: SessionEntry): string | null {
  try {
    const read = kindSchema.safeParse(JSON.parse(entry.payload))
    return read.success ? read.data.call.kind : null
  } catch {
    return null
  }
}

/** The face a tool call in flight wears: by Hemera's mark for its own tools, by kind otherwise. */
export function callFaceOf(entry: SessionEntry): FaceState {
  const named = hemeraToolNamed(entry.body)
  if (named !== null) return MARK_FACES[TOOL_LABELS[named].mark]
  const kind = kindOf(entry)
  return (kind === null ? undefined : KIND_FACES.get(kind)) ?? 'running'
}

/**
 * Whether a question of the Spec asked among `entries` is still waiting for its answer in
 * `thread`: a `spec_question` with no `spec_answer` of the same id beside it (D7-01, D7-03).
 */
export function asksAnswer(
  entries: readonly SessionEntry[],
  thread: readonly SessionEntry[],
): boolean {
  const answered = new Set(
    thread.filter((entry) => entry.kind === 'spec_answer').map((entry) => entry.correlationId),
  )
  return entries.some(
    (entry) =>
      entry.kind === 'spec_question' &&
      entry.correlationId !== null &&
      !answered.has(entry.correlationId),
  )
}
