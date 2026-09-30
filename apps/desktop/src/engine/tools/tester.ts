/**
 * The app tester's two tools (#300): `hemera_report` records a problem with Hemera itself, and
 * `hemera_reports` lists what was already recorded.
 *
 * The agent says the human part of a finding; everything Hemera knows itself is added here: the
 * environment, the agent and what it stands on, Hemera Auto's level, the Project, the Workspace,
 * the Session and its build, the call the finding is about as the thread holds it, and where in
 * the thread it happened. The findings service masks it all and writes it; nothing is sent
 * anywhere. While the mode is off, both tools refuse and nothing is written.
 */

import {
  type FindingCall,
  type FindingContext,
  type ReportedFinding,
  type SessionEntry,
} from '@hemera/core'
import { Effect } from 'effect'
import { z } from 'zod'

import type { SessionModesService } from '../agents/modes.ts'
import type { BuildsService } from '../build/build.ts'
import { knownSecretValues } from '../classifier/redaction.ts'
import type { SessionsService } from '../sessions.ts'
import type { TesterFindingsService } from '../tester/findings.ts'
import type { DescribedWorkspace } from '../workspaces/described.ts'
import type { VariablesService } from '../workspaces/variables.ts'
import { FINDINGS_PAGE, type ParsedCall } from './arguments.ts'

/** What a tester tool answers, as the catalogue writes it down: its `Answer`, said again here. */
export interface TesterAnswer {
  readonly ok: boolean
  readonly refused?: boolean
  readonly summary: string
  readonly text: string
  readonly paths: readonly string[]
}

/** What the tester tools read through. */
export interface TesterToolsNeeds {
  readonly findings: TesterFindingsService
  readonly sessions: SessionsService
  readonly variables: VariablesService
  readonly builds: BuildsService
  readonly modes: SessionModesService
  /** Whether the mode is on now, as the preferences say. */
  readonly on: Effect.Effect<boolean>
  /** Hemera Auto's level as the settings stand. */
  readonly auto: Effect.Effect<string>
}

/** Where a call was made: the Project and the Workspace of its Session. */
export interface TesterPlace {
  readonly projectId: string
  readonly projectName: string
  readonly workspace: DescribedWorkspace
}

/** How many of the thread's last entries a finding is looked for in. */
const LOOKED_BACK = 200

/** How many entries around the event a finding points at. */
const AROUND = 5

/** The payload of Hemera's own call in the thread, as far as a finding needs it. */
const hemeraCallPayload = z.object({
  tool: z.string(),
  state: z.string().optional(),
  callId: z.string().nullable().optional(),
  ms: z.number().optional(),
  arguments: z.string().optional(),
})

/** The payload of the agent's own call in the thread, as far as a finding needs it. */
const agentCallPayload = z.object({ call: z.object({ rawInput: z.json().optional() }) })

/** A payload read as JSON against its schema, or null. */
function payloadOf<A>(schema: z.ZodType<A>, payload: string): A | null {
  try {
    // SAFETY: JSON.parse is validated by the schema of the payload on the same line.
    const read = schema.safeParse(JSON.parse(payload))
    return read.success ? read.data : null
  } catch {
    return null
  }
}

/** The call a finding is about, found in the thread by the id the agent gave. */
function callIn(entries: readonly SessionEntry[], id: string): FindingCall | null {
  for (const entry of entries.toReversed()) {
    if (entry.kind === 'hemera_tool_call') {
      const payload = payloadOf(hemeraCallPayload, entry.payload)
      if (payload === null || payload.callId !== id) continue
      return {
        tool: payload.tool,
        id,
        state: payload.state ?? entry.state,
        summary: entry.body,
        arguments: payload.arguments ?? null,
        ms: payload.ms ?? null,
        seq: entry.seq,
      }
    }
    if (entry.kind === 'tool_call' && entry.correlationId === `call:${id}`) {
      const input = payloadOf(agentCallPayload, entry.payload)?.call.rawInput
      return {
        tool: entry.body,
        id,
        state: entry.state,
        summary: null,
        arguments: input === undefined ? null : JSON.stringify(input),
        ms: null,
        seq: entry.seq,
      }
    }
  }
  return null
}

/** Now, in ISO with the machine's time zone: `2026-09-30T16:32:08.000+02:00`. */
export function isoWithZone(at: Date): string {
  const offset = -at.getTimezoneOffset()
  const local = new Date(at.getTime() + offset * 60_000).toISOString().slice(0, 23)
  const hours = String(Math.floor(Math.abs(offset) / 60)).padStart(2, '0')
  const minutes = String(Math.abs(offset) % 60).padStart(2, '0')
  return `${local}${offset < 0 ? '-' : '+'}${hours}:${minutes}`
}

/** A place as a filter compares it. */
const placed = (place: string) => place.toLowerCase().replace(/[`'"]/g, '').trim()

/** The value an agent's option stands on, by the category it announced. */
function optionOf(
  options: readonly { readonly category: string | null; readonly value: string }[],
  ...categories: readonly string[]
): string | null {
  return (
    options.find((one) => one.category !== null && categories.includes(one.category))?.value ?? null
  )
}

const OFF = 'the app tester mode is off: nothing was recorded'

export function testerTools(needs: TesterToolsNeeds) {
  const { findings, sessions, variables, builds, modes } = needs

  /** What was asked, or nothing when a service could not answer: a finding says what it knows. */
  const known = <A, E>(effect: Effect.Effect<A, E>): Effect.Effect<A | null> =>
    effect.pipe(Effect.match({ onFailure: () => null, onSuccess: (value: A) => value }))

  const refusedOff: TesterAnswer = {
    ok: false,
    refused: true,
    summary: 'the app tester mode is off',
    text: OFF,
    paths: [],
  }

  /** `hemera_report`: the finding, what Hemera knows beside it, written as a new one or added. */
  const report = (
    sessionId: string,
    place: TesterPlace,
    call: Extract<ParsedCall, { tool: 'hemera_report' }>['arguments'],
  ): Effect.Effect<TesterAnswer> =>
    Effect.gen(function* () {
      if (!(yield* needs.on)) return refusedOff
      const read = yield* known(sessions.one(sessionId))
      if (read === null) {
        return {
          ok: false,
          summary: 'this Session is unknown',
          text: 'this Session is unknown to the engine',
          paths: [],
        }
      }
      const { session } = read
      const thread = (yield* known(sessions.read(sessionId, undefined, LOOKED_BACK)))?.entries ?? []
      const found = call.call_id === undefined ? null : callIn(thread, call.call_id)
      const last = thread.at(-1)?.seq ?? null
      const entries =
        last === null
          ? null
          : {
              from: Math.max(thread[0]?.seq ?? 1, (found?.seq ?? last) - AROUND),
              to: found === null ? last : Math.min(last, found.seq + AROUND),
            }
      const agent = yield* modes.agent(sessionId)
      const standing = yield* modes.standing(sessionId)
      const options = agent?.options ?? []
      const build =
        session.mission === 'build'
          ? yield* known(builds.view(sessionId)).pipe(
              Effect.map((view) =>
                view === null
                  ? null
                  : {
                      phase: view.phase,
                      tasks: view.tasks
                        .filter((task) => task.state === 'in_progress')
                        .map((task) => task.label),
                    },
              ),
            )
          : null
      const context: FindingContext = {
        at: isoWithZone(new Date()),
        hemera: findings.hemera,
        agent: {
          name: session.provider ?? 'agent',
          version: agent?.version ?? null,
          model: optionOf(options, 'model') ?? session.model,
          effort: optionOf(options, 'thought_level', 'effort'),
          mode: optionOf(options, 'mode') ?? standing?.mode ?? null,
        },
        auto: yield* needs.auto,
        project: { id: place.projectId, name: place.projectName },
        workspace: { name: place.workspace.name, path: place.workspace.path },
        session: { id: session.id, title: session.title, mission: session.mission },
        build,
        call: found,
        entries,
      }
      const reported: ReportedFinding = {
        title: call.title,
        kind: call.kind,
        place: call.where,
        severity: call.severity,
        trying: call.trying,
        happened: call.happened,
        expected: call.expected,
        steps: call.steps,
        files: (call.files ?? '')
          .split(/[,\n]/)
          .map((file) => file.trim())
          .filter((file) => file !== ''),
        callId: call.call_id ?? null,
        error: call.error === undefined || call.error === '' ? null : call.error,
        code: call.code === undefined ? null : String(call.code),
      }
      const environment =
        (yield* known(variables.givenFor(place.projectId, place.workspace.id))) ?? {}
      const written = yield* known(
        findings.report(reported, context, knownSecretValues(environment)),
      )
      if (written === null) {
        return {
          ok: false,
          summary: 'the finding could not be written',
          text: 'the app tester folder refused the finding; it was not recorded',
          paths: [],
        }
      }
      const where = `tester/findings/${written.file}`
      const said = written.added
        ? `added to #${written.number}: ${written.title}, ${written.occurrences} occurrences (${where})`
        : `new #${written.number}: ${written.title} (${where})`
      return {
        ok: true,
        summary: written.added ? `added to #${written.number}` : `new #${written.number}`,
        text: said,
        paths: [],
      }
    })

  /** `hemera_reports`: what exists, the latest seen first, filtered and paginated. */
  const reports = (
    call: Extract<ParsedCall, { tool: 'hemera_reports' }>['arguments'],
  ): Effect.Effect<TesterAnswer> =>
    Effect.gen(function* () {
      if (!(yield* needs.on)) return refusedOff
      const all = yield* known(findings.list)
      if (all === null) {
        return {
          ok: false,
          summary: 'the findings could not be read',
          text: 'the app tester folder could not be read',
          paths: [],
        }
      }
      const kept = all.filter(
        ({ head }) =>
          (call.kind === undefined || head.kind === call.kind) &&
          (call.where === undefined || placed(head.place) === placed(call.where)),
      )
      const offset = call.offset ?? 0
      const page = kept.slice(offset, offset + FINDINGS_PAGE)
      const lines = page.map(
        ({ head }) =>
          `#${head.number} ${head.kind} · ${head.severity} · ${head.place}: ${head.title} (${head.occurrences} ${head.occurrences === 1 ? 'occurrence' : 'occurrences'}, last seen ${head.lastSeen})`,
      )
      const more =
        offset + page.length < kept.length ? [`more from offset ${offset + page.length}`] : []
      const head =
        kept.length === 0
          ? 'no finding yet'
          : `${kept.length} ${kept.length === 1 ? 'finding' : 'findings'}, the latest seen first:`
      return {
        ok: true,
        summary: `read ${kept.length} ${kept.length === 1 ? 'finding' : 'findings'}`,
        text: [head, ...lines, ...more].join('\n'),
        paths: [],
      }
    })

  return { report, reports }
}
