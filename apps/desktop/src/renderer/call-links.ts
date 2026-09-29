import { hemeraToolNamed } from '@hemera/core'
import type { SessionEntry } from '@hemera/ipc'
import { z } from 'zod'

import type { FoldedCalls } from './agent-tool-payloads.ts'
import { answersAQuestion } from './agent-store.ts'
import { decisionOf, toolCallOf } from './notices.ts'

/**
 * What became of each of Hemera's calls, found in the thread (review of #250): a one-off asked
 * for leaves the call, the permission it waited on, the decision, and the run — three rows for one
 * act — and a command proposed leaves the call and the proposal. The thread draws one entry a call,
 * carrying what became of it, and the entries it absorbed are drawn no more on their own.
 *
 * The engine names none of these after the call, so they are paired by what they share: the line a
 * one-off runs, a run's id in the call's answer, a proposal's name; and, of several calls that
 * share it — a line asked again after a refusal — the one written nearest. What finds no call — a
 * run the reader started, a question the agent asked about its own tool — stays a row of its own.
 *
 * Pure, so it is tested on Node.
 */

/** What a call carries of what became of it. */
export interface CallLink {
  /** The permission it waited on, when it waited on one. */
  request?: SessionEntry | undefined
  /** The decision that closed it, or the line a one-off leaves when it ran without asking. */
  decision?: SessionEntry | undefined
  /** The run it asked for. */
  run?: SessionEntry | undefined
  /** The command it proposed. */
  proposal?: SessionEntry | undefined
}

export interface CallLinks {
  /** By the id of the entry the call is drawn from: Hemera's answer, or the agent's report. */
  byCall: ReadonlyMap<string, CallLink>
  /** The entries a call carries, which the thread no longer draws on their own. */
  absorbed: ReadonlySet<string>
}

const reportSchema = z.object({
  call: z.object({
    title: z.string(),
    rawInput: z.object({ text: z.string() }).nullish(),
    content: z.array(z.object({ text: z.object({ text: z.string() }).optional() })).optional(),
  }),
})

const hemeraSchema = z.object({ tool: z.string(), arguments: z.string().optional() })

const argumentsSchema = z.object({ line: z.string().optional(), name: z.string().optional() })

const permissionSchema = z.object({ tool: z.string().optional(), line: z.string().nullish() })

const runSchema = z.object({
  runId: z.string().optional(),
  line: z.string(),
  startedBy: z.string().optional(),
})

const proposalSchema = z.object({ name: z.string() })

function read<S extends z.ZodType>(schema: S, text: string): z.infer<S> | null {
  try {
    const parsed = schema.safeParse(JSON.parse(text))
    return parsed.success ? parsed.data : null
  } catch {
    return null
  }
}

/** A call of the thread, as far as pairing goes. */
interface Call {
  id: string
  at: number
  tool: string
  line: string | undefined
  name: string | undefined
  /** Everything it said, where a run's id is found. */
  said: string
}

/** The call an entry of the thread is drawn as, when it is a call of Hemera's that asks or runs. */
function callOf(drawn: SessionEntry, at: number): Call | null {
  if (drawn.kind === 'hemera_tool_call') {
    const payload = read(hemeraSchema, drawn.payload)
    if (payload === null) return null
    const args = read(argumentsSchema, payload.arguments ?? '{}')
    return {
      id: drawn.id,
      at,
      tool: payload.tool,
      line: args?.line,
      name: args?.name,
      said: `${drawn.body} ${drawn.payload}`,
    }
  }
  if (drawn.kind !== 'tool_call') return null
  const report = read(reportSchema, drawn.payload)
  if (report === null) return null
  const tool = hemeraToolNamed(report.call.title)
  if (tool === null) return null
  const args = read(argumentsSchema, report.call.rawInput?.text ?? '{}')
  const content = (report.call.content ?? []).map((one) => one.text?.text ?? '').join(' ')
  return { id: drawn.id, at, tool, line: args?.line, name: args?.name, said: content }
}

/** The one of the calls written nearest to `at`, among those that pass. */
function nearest(calls: readonly Call[], at: number, passes: (call: Call) => boolean): Call | null {
  let best: Call | null = null
  for (const call of calls) {
    if (!passes(call)) continue
    if (best === null || Math.abs(call.at - at) < Math.abs(best.at - at)) best = call
  }
  return best
}

export function callLinksOf(thread: readonly SessionEntry[], folded: FoldedCalls): CallLinks {
  const calls: Call[] = []
  thread.forEach((entry, at) => {
    if (folded.hidden.has(entry.id)) return
    const call = callOf(folded.inPlaceOf.get(entry.id) ?? entry, at)
    if (call !== null) calls.push(call)
  })
  const byCall = new Map<string, CallLink>()
  const absorbed = new Set<string>()
  const link = (call: Call, part: keyof CallLink, entry: SessionEntry): void => {
    const held = byCall.get(call.id) ?? {}
    // A call carries one of each: a second of a kind is left to be a row of its own.
    if (held[part] !== undefined) return
    byCall.set(call.id, { ...held, [part]: entry })
    absorbed.add(entry.id)
  }
  thread.forEach((entry, at) => {
    if (entry.kind === 'permission_request') {
      const asked = read(permissionSchema, entry.payload)
      const line = asked?.line ?? undefined
      if (asked?.tool !== 'commands_run' || line === undefined) return
      const call = nearest(calls, at, (one) => one.tool === 'commands_run' && one.line === line)
      if (call === null) return
      link(call, 'request', entry)
      const decision = decisionOf(entry, thread)
      if (decision !== null) link(call, 'decision', decision)
      return
    }
    if (entry.kind === 'permission_decision' && !answersAQuestion(entry)) {
      // A one-off the Session's mode let through: its line, and no request of its own.
      const ran = read(permissionSchema, entry.payload)
      const line = ran?.line ?? undefined
      if (ran?.tool !== 'commands_run' || line === undefined || toolCallOf(entry) === null) return
      const call = nearest(calls, at, (one) => one.tool === 'commands_run' && one.line === line)
      if (call !== null) link(call, 'decision', entry)
      return
    }
    if (entry.kind === 'command_run') {
      const run = read(runSchema, entry.payload)
      // A run the reader started is no call's: it keeps its own row.
      if (run === null || run.startedBy === 'user') return
      const id = run.runId
      const call =
        (id === undefined
          ? null
          : nearest(calls, at, (one) => one.tool === 'commands_run' && one.said.includes(id))) ??
        nearest(calls, at, (one) => one.tool === 'commands_run' && one.line === run.line)
      if (call !== null) link(call, 'run', entry)
      return
    }
    if (entry.kind === 'command_proposal') {
      const proposed = read(proposalSchema, entry.payload)
      if (proposed === null) return
      const call = nearest(
        calls,
        at,
        (one) => one.tool === 'commands_propose' && one.name === proposed.name,
      )
      if (call !== null) link(call, 'proposal', entry)
    }
  })
  return { byCall, absorbed }
}
