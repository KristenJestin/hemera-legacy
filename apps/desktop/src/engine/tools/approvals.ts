/**
 * The questions of Hemera's tools that no longer hold the agent (issue #304).
 *
 * A call that needs the human's answer waits a short grace for it, while the window is focused,
 * and is answered at once otherwise: "waiting for the user's approval, request #n". The call goes
 * on behind that answer, in the engine's own scope, and whatever it ends with — the action done,
 * or refused — waits here for the next safe point of its Session, which hands it to the agent as
 * the runs are handed (#245): with the next prompt, or in a turn of its own when the agent is idle.
 *
 * In memory, as the questions themselves are: an engine that stops takes its questions with it,
 * and the start of the next one closes what they left open in the thread.
 */

import { Context, Effect, Layer } from 'effect'

/** One late answer, as it waits for the agent. */
export interface LateAnswer {
  /** The number the agent was told to wait for: `request #n`. */
  readonly request: number
  readonly tool: string
  /** What the human answered. */
  readonly answer: 'allowed' | 'refused'
  /** How the call ended once answered: done, refused, or failed. */
  readonly state: 'completed' | 'failed' | 'refused'
  /** What the tool answered, as the agent would have read it had it waited. */
  readonly text: string
}

/** What the agent reads when its call waits for the human beyond the grace (#304). */
export function waitingText(request: number): string {
  return [
    `Waiting for the user's approval, request #${request}.`,
    'This action has not happened; do not assume it did.',
    'Continue with work that does not depend on it, or end your turn saying you wait.',
    'The answer will be handed to you when the user gives it.',
  ].join(' ')
}

/** What the agent is handed once the human answered a request it was told to wait for (#304). */
export function lateText(answer: LateAnswer): string {
  const head = `Request #${answer.request} (${answer.tool})`
  if (answer.answer === 'refused') {
    return `${head} was refused by the user. Nothing was done: ${answer.text}`
  }
  if (answer.state === 'completed') {
    return `${head} was approved by the user, and Hemera has now done it. Its result:\n\n${answer.text}`
  }
  return `${head} was approved by the user, but nothing was done: ${answer.text}`
}

export interface ApprovalsService {
  /** Whether Hemera's window has the focus: the grace is only waited while it does. */
  readonly focused: () => boolean
  /** Told by the main process as the window gains or loses the focus. */
  readonly focus: (focused: boolean) => Effect.Effect<void>
  /** The number of the next request of a Session, counted from one. */
  readonly number: (sessionId: string) => number
  /**
   * A call of a Session that answered "waiting" and goes on: the question it asks is no longer
   * the turn's, so a Stop leaves it standing, and the agent is kept while the call runs.
   * Answers what lets go of it, once the call has ended.
   */
  readonly detached: (sessionId: string, questionId: string) => Effect.Effect<() => void>
  /** The questions of a Session that no longer hold a turn. */
  readonly questionsOf: (sessionId: string) => ReadonlySet<string>
  /** Whether a Session has a call that answered "waiting" and has not ended. */
  readonly holding: (sessionId: string) => boolean
  /** A late answer arrived: it waits for the agent, and whoever listens is told. */
  readonly answered: (sessionId: string, answer: LateAnswer) => Effect.Effect<void>
  /** What waits for a Session's agent, oldest first. */
  readonly waiting: (sessionId: string) => readonly LateAnswer[]
  /** The agent took these: they wait no more. */
  readonly taken: (sessionId: string, handed: readonly LateAnswer[]) => Effect.Effect<void>
  /** Who hands a late answer over: the runtime, which knows whether the agent is idle. */
  readonly listen: (listener: (sessionId: string) => void) => void
}

export class Approvals extends Context.Service<Approvals, ApprovalsService>()('Approvals') {}

export const approvalsLayer: Layer.Layer<Approvals> = Layer.sync(Approvals, () => {
  // Until the main process says otherwise, the window is taken as looked at: a grace waited for
  // nobody costs a few seconds, and an engine with no window at all never asks anyone.
  let focused = true
  const numbers = new Map<string, number>()
  const questions = new Map<string, Set<string>>()
  const held = new Map<string, number>()
  const queued = new Map<string, readonly LateAnswer[]>()
  const listeners: ((sessionId: string) => void)[] = []

  return {
    focused: () => focused,
    focus: (value) =>
      Effect.sync(() => {
        focused = value
      }),
    number: (sessionId) => {
      const next = (numbers.get(sessionId) ?? 0) + 1
      numbers.set(sessionId, next)
      return next
    },
    detached: (sessionId, questionId) =>
      Effect.sync(() => {
        const asked = questions.get(sessionId) ?? new Set<string>()
        asked.add(questionId)
        questions.set(sessionId, asked)
        held.set(sessionId, (held.get(sessionId) ?? 0) + 1)
        let released = false
        return () => {
          if (released) return
          released = true
          questions.get(sessionId)?.delete(questionId)
          const left = (held.get(sessionId) ?? 1) - 1
          if (left > 0) held.set(sessionId, left)
          else held.delete(sessionId)
        }
      }),
    questionsOf: (sessionId) => questions.get(sessionId) ?? new Set<string>(),
    holding: (sessionId) => (held.get(sessionId) ?? 0) > 0,
    answered: (sessionId, answer) =>
      Effect.sync(() => {
        queued.set(sessionId, [...(queued.get(sessionId) ?? []), answer])
        for (const listener of listeners) listener(sessionId)
      }),
    waiting: (sessionId) => queued.get(sessionId) ?? [],
    taken: (sessionId, handed) =>
      Effect.sync(() => {
        const left = (queued.get(sessionId) ?? []).filter((one) => !handed.includes(one))
        if (left.length > 0) queued.set(sessionId, left)
        else queued.delete(sessionId)
      }),
    listen: (listener) => {
      listeners.push(listener)
    },
  } satisfies ApprovalsService
})
