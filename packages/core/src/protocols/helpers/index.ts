/**
 * Helper agents as data (issue #77): the defined helpers Hemera ships, one file each and one schema
 * for all, the tools a helper Session holds, the brief it is handed and how its answer is read.
 *
 * The inputs are plain data the engine fills from its rows: nothing here reads the database or
 * decides a state.
 */

import { z } from 'zod'

import { HELPER_DEPTH } from '../../domain/helpers.ts'
import type { Session } from '../../domain/session.ts'
import { BUILDING, HELPING, TOOL_NAMES, type ToolName, offeredTools } from '../../domain/tools.ts'
import { type BriefTask, taskDefinition } from '../build/index.ts'
import { FREE_RESULT, HELPER_MISSION_BRIEF, OWN_HELPERS } from './briefs.ts'
import { DOCUMENTER } from './documenter.ts'
import { PROTOTYPER } from './prototyper.ts'
import { REVIEW_SECURITY } from './review-security.ts'
import { REVIEW_TESTS } from './review-tests.ts'
import { type HelperDefinition, helperDefinition } from './schema.ts'

export { HELPER_MISSION_BRIEF } from './briefs.ts'
export { HELPER_INPUTS, WRITING_TOOLS, helperDefinition } from './schema.ts'
export type { HelperDefinition } from './schema.ts'

/** Every defined helper Hemera ships, each parsed by the one schema as the application loads. */
export const HELPERS: readonly HelperDefinition[] = [
  REVIEW_TESTS,
  REVIEW_SECURITY,
  DOCUMENTER,
  PROTOTYPER,
].map((definition) => helperDefinition.parse(definition))

/** The defined helper of this id, or null for one Hemera does not ship. */
export function helperNamed(id: string): HelperDefinition | null {
  return HELPERS.find((definition) => definition.id === id) ?? null
}

/** What a helper on a build task signals about it, beside reading the build. */
const TASK_TOOLS: ReadonlySet<ToolName> = new Set(['build_read', 'task_finished', 'task_blocked'])

/**
 * What a free helper may never hold: a proposal goes to the user, and a helper never addresses
 * them; the Spec does not move under a helper.
 */
const NEVER_FREE: ReadonlySet<ToolName> = new Set([
  'commands_propose',
  'setup_propose',
  'spec_propose',
  'spec_write',
])

/**
 * The tools of a Session (D6-03, issue #77): its mission's for a Session the user started. A
 * helper holds its definition's — or, free, its mission's code tools and no proposal — the build
 * tools of the task it was launched on, and the helper tools while it stands below the depth cap.
 * A definition Hemera no longer ships lends nothing of its own.
 */
export function sessionTools(session: Pick<Session, 'mission' | 'helper'>): readonly ToolName[] {
  const mission = offeredTools(session.mission)
  const place = session.helper
  if (place === null) return mission
  const definition = place.definition === null ? null : helperNamed(place.definition)
  const own: readonly ToolName[] =
    place.definition === null
      ? mission.filter((name) => !BUILDING.has(name) && !HELPING.has(name) && !NEVER_FREE.has(name))
      : (definition?.tools ?? [])
  const onTask = place.task !== null && session.mission === 'build'
  return TOOL_NAMES.filter(
    (name) =>
      own.includes(name) ||
      (onTask && TASK_TOOLS.has(name)) ||
      (HELPING.has(name) && place.depth < HELPER_DEPTH),
  )
}

/** What a helper's brief is composed from. */
export interface HelperBriefInput {
  /** The defined helper it runs, or null for a free one. */
  readonly definition: HelperDefinition | null
  /** What its launcher wrote: the work to do. */
  readonly brief: string
  /** 1 for a helper of the main agent, 2 for a helper of a helper. */
  readonly depth: number
  /** The build task it was launched on, as the build's briefs define it; null for none. */
  readonly task: BriefTask | null
  /** The frozen Spec, rendered with its task labels; null when the build holds none. */
  readonly spec: string | null
}

/** The shape a defined helper's result takes, as a JSON Schema its brief shows it. */
function shapeOf(definition: HelperDefinition): string {
  return JSON.stringify(z.toJSONSchema(definition.returns), null, 2)
}

/**
 * The brief of a helper (issue #77): the helper mission, its role when it is defined, its
 * launcher's brief, the task it was launched on and the frozen Spec when it receives them, what it
 * returns, and its own helpers while it stands below the depth cap. Never the main thread.
 */
export function composeHelperBrief(input: HelperBriefInput): string {
  const { definition } = input
  const parts = [HELPER_MISSION_BRIEF]
  if (definition !== null)
    parts.push(`# Your role: ${definition.name}\n\n${definition.receives.role}`)
  parts.push(`# Your brief\n\n${input.brief.trim()}`)
  if (input.task !== null) {
    parts.push(
      [
        '# Your task',
        taskDefinition(input.task),
        `This task is yours. When it meets its result and its criteria, call \`task_finished({ task: "${input.task.label}" })\`; Hemera runs the Project's checks on it. When it contradicts the Spec, call \`task_blocked\` with the reason.`,
      ].join('\n\n'),
    )
  }
  const receivesSpec =
    input.task !== null || (definition?.receives.inputs.includes('spec') ?? false)
  if (receivesSpec && input.spec !== null) parts.push(`# The Spec\n\n${input.spec}`)
  parts.push(
    definition === null
      ? FREE_RESULT
      : `# What you return\n\nEnd your turn with one JSON object of this shape, in a \`\`\`json block: Hemera reads it before your launcher does.\n\n\`\`\`json\n${shapeOf(definition)}\n\`\`\``,
  )
  if (input.depth < HELPER_DEPTH) parts.push(OWN_HELPERS)
  return parts.join('\n\n')
}

/** A helper's answer, read against what it returns. */
export type HelperResult =
  | { readonly matched: true; readonly text: string }
  | { readonly matched: false; readonly text: string; readonly reason: string }

/** The last ```json block of an answer, or the whole answer when it holds none. */
function jsonOf(answer: string): string {
  const blocks = [...answer.matchAll(/```json\s*\n([\s\S]*?)```/g)]
  return (blocks.at(-1)?.[1] ?? answer).trim()
}

/** JSON text read as a value, or the reason it does not read. */
function parsedJson(text: string) {
  try {
    return { ok: true as const, value: z.json().parse(JSON.parse(text)) }
  } catch {
    return { ok: false as const, reason: 'its answer holds no JSON object' }
  }
}

/**
 * What a helper's answer gives its launcher (issue #77): a free helper's as it said it; a defined
 * helper's read against its `returns`, the object it matched written again, or the answer as it
 * came with why it did not match.
 */
export function helperResult(definition: HelperDefinition | null, answer: string): HelperResult {
  const said = answer.trim() === '' ? 'It said nothing.' : answer.trim()
  if (definition === null) return { matched: true, text: said }
  const read = parsedJson(jsonOf(answer))
  if (!read.ok) return { matched: false, text: said, reason: read.reason }
  const shaped = definition.returns.safeParse(read.value)
  if (!shaped.success) {
    const reason = shaped.error.issues
      .map((issue) => `${issue.path.join('.') || 'the result'}: ${issue.message}`)
      .join('; ')
    return { matched: false, text: said, reason }
  }
  return { matched: true, text: JSON.stringify(shaped.data, null, 2) }
}

/**
 * The defined helpers a Session of this mission may launch, one line each, as the main agent reads
 * them in `helper_launch`'s description.
 */
export function helpersFor(mission: Session['mission']): string {
  return HELPERS.filter((definition) => definition.missions.includes(mission))
    .map((definition) => `${definition.id} (${definition.name}): ${definition.description}`)
    .join('\n')
}
