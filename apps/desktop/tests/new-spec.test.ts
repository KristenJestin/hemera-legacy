/**
 * The Home's `New Spec` (issues #128, #179), over the whole engine as the window drives it.
 *
 * `New Spec` makes the Session `Start chat` makes, and sends the same message with the intent
 * `spec`: Hemera creates the draft Spec from it before the prompt goes out, so the Session is
 * `define` from its first turn, and the request reaches the agent on that turn behind Hemera's
 * marker, never as the user's words. A message sent without the intent carries nothing of it.
 */

import { mkdtempSync, realpathSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, test } from 'vite-plus/test'

import { DELIVERY_MARKER, QUESTION_RULE } from '@hemera/core'
import { fakeAgent } from '#engine/agents/fake.ts'
import { SPEC_REQUEST, SPEC_REQUEST_URI, requestedSpec } from '#engine/agents/spec-request.ts'
import { listenToAgents, say } from '#renderer/agent-store.ts'
import { closeSessions, openSessions, startSession } from '#renderer/sessions-store.ts'

import { type OpenWindow, install, openWindow } from './window.ts'

describe('A Session started with New Spec defines its Spec from the first turn', () => {
  let dataFolder: string
  let main: string
  let opened: OpenWindow | null = null
  let stops: (() => void)[] = []

  beforeEach(() => {
    dataFolder = mkdtempSync(join(tmpdir(), 'hemera-new-spec-'))
    main = realpathSync(mkdtempSync(join(tmpdir(), 'hemera-new-spec-main-')))
  })

  afterEach(async () => {
    for (const stop of stops) stop()
    stops = []
    closeSessions()
    await opened?.close()
    opened = null
    for (const folder of [dataFolder, main]) rmSync(folder, { recursive: true, force: true })
  })

  test('Hemera creates the draft Spec, and the Session defines it before the prompt goes out', async () => {
    const agent = fakeAgent({ steps: [{ does: 'says', text: 'Which type is it?' }] })
    opened = await openWindow(dataFolder, agent)
    install(opened.bridge)
    stops = [listenToAgents()]
    const project = await opened.bridge.invoke('projects.create', {
      name: 'Atlas',
      tone: 'primary',
      mainPath: main,
    })
    await openSessions(project.id)

    const made = await startSession(project.id, 'claude', null)
    expect(made).not.toBeNull()
    const text = 'Export the invoices with HT and TTC\n\nThe accountant asks for both.'
    expect(await say(made?.id ?? '', text, 'spec')).toBeNull()

    // The Session is `define` and writes a feature Spec titled with the request's first line.
    const [session] = await opened.bridge.invoke('sessions.list', { projectId: project.id })
    expect(session?.mission).toBe('define')
    const specs = await opened.bridge.invoke('specs.list', { projectId: project.id })
    expect(specs).toEqual([
      expect.objectContaining({
        id: session?.specId,
        title: 'Export the invoices with HT and TTC',
        type: 'feature',
        status: 'draft',
        writerSessionId: made?.id,
      }),
    ])

    // The first turn hands the mission brief over first, then the request and the user's words,
    // the request behind Hemera's marker and never as the user's.
    expect(agent.answers.blocks[0]?.[0]).toEqual({ type: 'text', text: DELIVERY_MARKER })
    expect(JSON.stringify(agent.answers.blocks[0])).toContain('# Mission: define')
    expect(agent.answers.blocks[1]).toEqual([
      { type: 'text', text: DELIVERY_MARKER },
      {
        type: 'resource',
        resource: { uri: SPEC_REQUEST_URI, mimeType: 'text/markdown', text: SPEC_REQUEST },
      },
      { type: 'text', text },
    ])
    expect(SPEC_REQUEST).toContain('`spec_write` and `type`')
    // And the Context tab lists it, as something Hemera handed the agent on that turn.
    const context = await opened.bridge.invoke('context.read', { sessionId: made?.id ?? '' })
    expect(context.provided.filter((one) => one.kind === 'request')).toEqual([
      expect.objectContaining({ path: '', reached: 'embedded_resource' }),
    ])

    // The next message is a message like any other, and makes no second Spec.
    expect(await say(made?.id ?? '', 'The HT first')).toBeNull()
    expect(agent.answers.blocks.at(-1)).toEqual([{ type: 'text', text: 'The HT first' }])
    expect(await opened.bridge.invoke('specs.list', { projectId: project.id })).toHaveLength(1)
  })

  test('the first turn of a New Spec Session says every question goes through the question card', async () => {
    const agent = fakeAgent({ steps: [{ does: 'says', text: 'Which type is it?' }] })
    opened = await openWindow(dataFolder, agent)
    install(opened.bridge)
    stops = [listenToAgents()]
    const project = await opened.bridge.invoke('projects.create', {
      name: 'Atlas',
      tone: 'primary',
      mainPath: main,
    })
    await openSessions(project.id)
    const made = await startSession(project.id, 'claude', null)
    expect(await say(made?.id ?? '', 'A simple HTML menu to test with', 'spec')).toBeNull()

    // Everything the agent read before its first answer: the mission brief handed over, then the
    // request in front of the user's words. Both carry the rule, word for word.
    const first = agent.answers.blocks.slice(0, 2).map((blocks) => JSON.stringify(blocks))
    expect(first).toHaveLength(2)
    for (const text of first) expect(text).toContain(JSON.stringify(QUESTION_RULE).slice(1, -1))
    expect(SPEC_REQUEST).toContain(QUESTION_RULE)
  })

  test('the title is the first line of the request, cut on a word when it is long', () => {
    expect(requestedSpec('\n  Fix   the menu \nmore').title).toBe('Fix the menu')
    const long = requestedSpec(`${'word '.repeat(30)}end`).title
    expect(long.length).toBeLessThanOrEqual(81)
    expect(long.endsWith('word…')).toBe(true)
    expect(requestedSpec('   ')).toEqual({ title: 'New Spec', type: 'feature' })
  })

  test('a Session started with Start chat carries no request', async () => {
    const agent = fakeAgent({ steps: [{ does: 'says', text: 'Sure.' }] })
    opened = await openWindow(dataFolder, agent)
    install(opened.bridge)
    stops = [listenToAgents()]
    const project = await opened.bridge.invoke('projects.create', {
      name: 'Atlas',
      tone: 'primary',
      mainPath: main,
    })
    await openSessions(project.id)

    const made = await startSession(project.id, 'claude', null)
    expect(await say(made?.id ?? '', 'Export the invoices')).toBeNull()
    expect(agent.answers.blocks[0]).toEqual([{ type: 'text', text: 'Export the invoices' }])
  })
})
