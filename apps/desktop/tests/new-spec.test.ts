/**
 * The Home's `New Spec` (issues #128, #179, #198), over the whole engine as the window drives it.
 *
 * `New Spec` makes the Session `Start chat` makes, and sends the same message with the intent
 * `spec`. No Spec is created then (#198): the window shows a provisional one, saved nowhere, and
 * the request reaches the agent on that first turn behind Hemera's marker, never as the user's
 * words. The agent checks the Project's Specs first, then proposes a new Spec or points to one
 * that exists; the user's answer to that card is what makes a Spec this Session defines. A message
 * sent without the intent carries nothing of it.
 */

import { mkdtempSync, realpathSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, test } from 'vite-plus/test'
import { Effect } from 'effect'
import { z } from 'zod'

import { DELIVERY_MARKER, QUESTION_RULE } from '@hemera/core'
import type { SessionEntry } from '@hemera/ipc'
import { type FakeStep, fakeAgent } from '#engine/agents/fake.ts'
import { SPEC_REQUEST, SPEC_REQUEST_URI } from '#engine/agents/spec-request.ts'
import { Specs } from '#engine/specs/specs.ts'
import { listenToAgents, say } from '#renderer/agent-store.ts'
import { proposalIdOf } from '#renderer/spec-entries.ts'
import {
  archiveSession,
  closeSessions,
  openSession,
  openSessions,
  readSessions,
  sessionsSnapshot,
  startSession,
} from '#renderer/sessions-store.ts'
import {
  closeSpec,
  createSpec,
  holdProvisionalSpec,
  joinSpec,
  provisionalSpecOf,
  provisionalTitleOf,
  specSnapshot,
} from '#renderer/spec-store.ts'

import { type OpenWindow, install, openWindow } from './window.ts'

/** A call the fake agent makes to one of Hemera's tools. */
const uses = (call: string, sent: Record<string, string>): FakeStep => ({
  does: 'uses',
  call,
  arguments: sent,
})

/** What a proposal entry carries, as `spec_propose` wrote it. */
const PROPOSAL = z.object({
  title: z.string(),
  type: z.string(),
  specId: z.string().optional(),
  key: z.string().optional(),
})

/** The proposal a Session's thread holds, read as the card reads it. */
function proposalIn(entries: readonly SessionEntry[]) {
  const entry = entries.find((one) => one.kind === 'spec_proposal')
  return entry === undefined ? null : PROPOSAL.parse(JSON.parse(entry.payload))
}

describe('New Spec shows a provisional Spec, and saves none until one is proposed and accepted', () => {
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
    closeSpec()
    await opened?.close()
    opened = null
    for (const folder of [dataFolder, main]) rmSync(folder, { recursive: true, force: true })
  })

  /** The window over the engine, a Project, and its list of Sessions read. */
  async function atlas(...agents: Parameters<typeof openWindow>[1][]) {
    const [first, ...others] = agents
    if (first === undefined) throw new Error('the suite handed over no agent')
    opened = await openWindow(dataFolder, first, ...others)
    install(opened.bridge)
    stops = [listenToAgents()]
    const project = await opened.bridge.invoke('projects.create', {
      name: 'Atlas',
      tone: 'primary',
      mainPath: main,
    })
    await openSessions(project.id)
    return { bridge: opened.bridge, running: opened.running, projectId: project.id }
  }

  /** The Home's New Spec, as `application.tsx` wires it: the Session, the page, the message. */
  async function newSpec(projectId: string, text: string): Promise<string> {
    const made = await startSession(projectId, 'claude', null)
    const sessionId = made?.id ?? ''
    await openSession(sessionId)
    holdProvisionalSpec(sessionId, text)
    expect(await say(sessionId, text, 'spec')).toBeNull()
    return sessionId
  }

  test('New Spec leaves the Session free, saves no Spec, and hands the request on the first turn', async () => {
    const agent = fakeAgent({ steps: [{ does: 'says', text: 'Let me look at the Specs.' }] })
    const { bridge, projectId } = await atlas(agent)
    const text = 'Export the invoices with HT and TTC\n\nThe accountant asks for both.'
    const sessionId = await newSpec(projectId, text)

    const [session] = await bridge.invoke('sessions.list', { projectId })
    expect(session?.mission).toBe('free')
    expect(session?.specId).toBeNull()
    expect(await bridge.invoke('specs.list', { projectId })).toEqual([])

    // The request rides the first turn behind Hemera's marker, in front of the user's words.
    expect(agent.answers.blocks[0]).toEqual([
      { type: 'text', text: DELIVERY_MARKER },
      {
        type: 'resource',
        resource: { uri: SPEC_REQUEST_URI, mimeType: 'text/markdown', text: SPEC_REQUEST },
      },
      { type: 'text', text },
    ])
    // And the Context tab lists it, as something Hemera handed the agent on that turn.
    const context = await bridge.invoke('context.read', { sessionId })
    expect(context.provided.filter((one) => one.kind === 'request')).toEqual([
      expect.objectContaining({ path: '', reached: 'embedded_resource' }),
    ])

    // The next message is a message like any other.
    expect(await say(sessionId, 'The HT first')).toBeNull()
    expect(agent.answers.blocks.at(-1)).toEqual([{ type: 'text', text: 'The HT first' }])
    expect(await bridge.invoke('specs.list', { projectId })).toEqual([])
  })

  test('the first turn asks the agent to check the Specs first, and carries the question-card rule', async () => {
    const agent = fakeAgent({ steps: [{ does: 'says', text: 'Let me look.' }] })
    const { projectId } = await atlas(agent)
    await newSpec(projectId, 'A simple HTML menu to test with')

    expect(SPEC_REQUEST).toContain('`project_get`')
    expect(SPEC_REQUEST).toContain('`spec_propose` with kind `spec`')
    expect(SPEC_REQUEST).toContain('`spec_propose` with kind `existing`')
    expect(SPEC_REQUEST).toContain(QUESTION_RULE)
    const first = JSON.stringify(agent.answers.blocks[0])
    expect(first).toContain(JSON.stringify(QUESTION_RULE).slice(1, -1))
  })

  test('the provisional panel exists before the first answer, and nothing is saved', async () => {
    /** What the window holds at the moment the agent is about to answer for the first time. */
    let before: {
      provisional: string | null
      mission: string | null
      saved: number
      answered: number
    } | null = null
    let projectId = ''
    const agent = fakeAgent({
      steps: [{ does: 'says', text: 'Let me look at the Specs.' }],
      between: async () => {
        if (before !== null) return
        await readSessions(projectId)
        const session = sessionsSnapshot().sessions[0]
        const sessionId = session?.id ?? ''
        const read = await window.hemera.invoke('sessions.read', { sessionId })
        before = {
          provisional: provisionalSpecOf(sessionId),
          mission: session?.mission ?? null,
          saved: (await window.hemera.invoke('specs.list', { projectId })).length,
          answered: read.entries.filter((entry) => entry.role === 'agent').length,
        }
      },
    })
    const atlasOpened = await atlas(agent)
    projectId = atlasOpened.projectId
    await newSpec(projectId, 'Mise en place d’une interface du menu simple en html\nPour tester.')

    expect(before).toEqual({
      provisional: 'Mise en place d’une interface du menu simple en html',
      mission: 'free',
      saved: 0,
      answered: 0,
    })
  })

  test('accepting the proposal makes the provisional Spec real, with the title and type proposed', async () => {
    const agent = fakeAgent({
      steps: [
        uses('project_get', {}),
        uses('spec_propose', {
          kind: 'spec',
          title: 'Read a text file aloud',
          type: 'feature',
          key: 'p-1',
        }),
      ],
    })
    // Accepted, the agent is started again with the tools of a define Session.
    const next = fakeAgent({ listsTools: true })
    const { bridge, projectId } = await atlas(agent, next)
    const sessionId = await newSpec(projectId, 'on veut rajouter un outil de lecture de texte')

    // It checked the Specs first: the Project has none.
    expect(agent.answers.used[0]?.text).toContain('specs: none')
    const thread = await bridge.invoke('sessions.read', { sessionId })
    expect(proposalIn(thread.entries)).toEqual({ title: 'Read a text file aloud', type: 'feature' })
    expect(await bridge.invoke('specs.list', { projectId })).toEqual([])

    // The card's Create, as the page wires it.
    expect(await createSpec(sessionId, 'feature', 'Read a text file aloud')).toBe(true)
    const [spec] = await bridge.invoke('specs.list', { projectId })
    expect(spec).toMatchObject({ title: 'Read a text file aloud', type: 'feature' })
    const [session] = await bridge.invoke('sessions.list', { projectId })
    expect(session).toMatchObject({ mission: 'define', specId: spec?.id })
    // The panel holds the Spec, keyed, and nothing provisional any more.
    expect(specSnapshot().snapshot?.spec.key).toBe(spec?.key)
    expect(provisionalSpecOf(sessionId)).toBeNull()
  })

  test('an existing Spec can be chosen instead, and the panel shows that one', async () => {
    // What the agent does is written once the Spec it points to exists, and its key is known.
    const steps: FakeStep[] = []
    const agent = fakeAgent({ listsTools: true, steps })
    // Continued, the agent is started again with the tools of a define Session.
    const next = fakeAgent({ listsTools: true })
    const { bridge, running, projectId } = await atlas(agent, next)
    // A Spec the Project already has, written by another Session.
    const other = await startSession(projectId, 'claude', null)
    const existing = await running(
      Effect.gen(function* () {
        return yield* (yield* Specs).create({
          sessionId: other?.id ?? '',
          type: 'feature',
          title: 'Read text aloud',
        })
      }),
    )
    const { id: specId, key } = existing.snapshot.spec
    steps.push(
      uses('project_get', {}),
      uses('spec_propose', { kind: 'existing', spec: key, key: 'p-1' }),
    )

    // The New Spec Session's agent reads the Project's Specs and points to that one.
    const sessionId = await newSpec(projectId, 'a tool that reads a text aloud')
    expect(agent.answers.used[0]?.text).toContain(`${key} feature draft: Read text aloud`)
    expect(agent.answers.used[1]?.isError).toBe(false)
    const thread = await bridge.invoke('sessions.read', { sessionId })
    expect(proposalIn(thread.entries)).toEqual({
      title: 'Read text aloud',
      type: 'feature',
      specId,
      key,
    })
    expect(await bridge.invoke('specs.list', { projectId })).toHaveLength(1)

    // `Continue it`: this Session defines that Spec, a reader of it, and the panel shows it.
    const card = thread.entries.find((entry) => entry.kind === 'spec_proposal')
    expect(await joinSpec(sessionId, proposalIdOf(card ?? thread.entries[0]!))).toBe(true)
    const sessions = await bridge.invoke('sessions.list', { projectId })
    expect(sessions.find((one) => one.id === sessionId)).toMatchObject({
      mission: 'define',
      specId,
    })
    expect(await bridge.invoke('specs.list', { projectId })).toEqual([
      expect.objectContaining({ id: specId, writerSessionId: other?.id }),
    ])
    expect(specSnapshot().snapshot?.spec.id).toBe(specId)
    expect(provisionalSpecOf(sessionId)).toBeNull()
  })

  test('nothing is saved when the Session is abandoned before accepting', async () => {
    const agent = fakeAgent({
      steps: [
        uses('spec_propose', { kind: 'spec', title: 'Text reader', type: 'feature', key: 'p-1' }),
      ],
    })
    const { bridge, projectId } = await atlas(agent)
    const sessionId = await newSpec(projectId, 'a text reader')
    const thread = await bridge.invoke('sessions.read', { sessionId })
    expect(proposalIn(thread.entries)?.title).toBe('Text reader')

    const session = sessionsSnapshot().sessions.find((one) => one.id === sessionId)
    if (session === undefined) throw new Error('the Session is not listed')
    expect(await archiveSession(session)).toBe(true)
    expect(await bridge.invoke('specs.list', { projectId })).toEqual([])
    const journal = await bridge.invoke('journal.read', { projectId, limit: 200 })
    expect(journal.entries.filter((line) => line.type.startsWith('spec.'))).toEqual([])
  })

  test('the agent that takes the turn after the proposal is accepted lists spec_write and spec_read, and writes the title', async () => {
    // The page reads what the Session's agent offers as soon as it is on screen, which starts the
    // agent while the Session is still free (`readOptions` in `application.tsx`). Its start is
    // held until the proposal is accepted, as a cold start on the machine outlasts the click.
    let hold: () => void = () => undefined
    const held = new Promise<void>((resolve) => {
      hold = resolve
    })
    const early = fakeAgent({ listsTools: true, holdsStart: () => held })
    // The agent started for the turn, if the first one is let go of: each start takes the next.
    const agent = fakeAgent({
      listsTools: true,
      steps: [uses('spec_write', { title: 'Invoice export', key: 't-1' })],
    })
    const { bridge, projectId } = await atlas(early, agent)
    const made = await startSession(projectId, 'claude', null)
    const sessionId = made?.id ?? ''

    const options = bridge.invoke('agents.options', { sessionId })
    expect(await createSpec(sessionId, 'feature', 'Export the invoices')).toBe(true)
    hold()
    await options
    expect(await say(sessionId, 'Go on')).toBeNull()

    // The agent started while the Session was free took no turn. The one that took the turn
    // listed the define tools, and its write went in.
    expect(early.answers.prompts).toEqual([])
    const listed = agent.answers.tools.at(-1) ?? []
    expect(listed).toContain('spec_write')
    expect(listed).toContain('spec_read')
    expect(agent.answers.used).toEqual([
      expect.objectContaining({ tool: 'spec_write', isError: false }),
    ])
    const specs = await bridge.invoke('specs.list', { projectId })
    expect(specs.map((spec) => spec.title)).toEqual(['Invoice export'])
  })

  test('the provisional title is the first line of the request, cut on a word when it is long', () => {
    expect(provisionalTitleOf('\n  Fix   the menu \nmore')).toBe('Fix the menu')
    const long = provisionalTitleOf(`${'word '.repeat(30)}end`)
    expect(long.length).toBeLessThanOrEqual(81)
    expect(long.endsWith('word…')).toBe(true)
    expect(provisionalTitleOf('   ')).toBe('New Spec')
  })

  test('a Session started with Start chat carries no request and shows no provisional Spec', async () => {
    const agent = fakeAgent({ steps: [{ does: 'says', text: 'Sure.' }] })
    const { projectId } = await atlas(agent)
    const made = await startSession(projectId, 'claude', null)
    expect(await say(made?.id ?? '', 'Export the invoices')).toBeNull()
    expect(agent.answers.blocks[0]).toEqual([{ type: 'text', text: 'Export the invoices' }])
    expect(provisionalSpecOf(made?.id ?? '')).toBeNull()
  })
})
