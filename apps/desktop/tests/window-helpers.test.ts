/**
 * A build's helpers as the window follows them, over the whole engine (issue #77).
 *
 * The line is drawn from the helpers store: what is under test is the road from the window to the
 * engine and back — the helpers read through `helpers.list`, read again on `helpers.changed`, a
 * helper's thread read for its dialog, and the user's × sent through `helpers.stop`, which tells
 * the main agent. The agents are fake: the main agent launches one helper, held at work.
 */

import { mkdtempSync, realpathSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, test } from 'vite-plus/test'

import { fakeAgent } from '#engine/agents/fake.ts'
import {
  closeHelpers,
  helpersSnapshot,
  listenToHelpers,
  openHelpers,
  readHelperThread,
  stopHelper,
} from '#renderer/helpers-store.ts'
import { lineOf } from '#renderer/journal-lines.ts'

import { gated } from './application.ts'
import { THREE, aReadySpec, buildAgent, launched } from './build-harness.ts'
import { type OpenWindow, install, openWindow } from './window.ts'

let dataFolder: string
let opened: OpenWindow | null = null
let stop: () => void = () => undefined

beforeEach(() => {
  dataFolder = realpathSync.native(mkdtempSync(join(tmpdir(), 'hemera-window-helpers-')))
})

afterEach(async () => {
  stop()
  closeHelpers()
  await opened?.close()
  opened = null
  rmSync(dataFolder, { recursive: true, force: true })
})

/** Waits in real time for what is waited for, and answers what was read last. */
async function until<A>(read: () => A, ready: (seen: A) => boolean): Promise<A> {
  for (let tries = 0; tries < 400; tries += 1) {
    const seen = read()
    if (ready(seen)) return seen
    // oxlint-disable-next-line no-await-in-loop -- each look waits for the one before it: this is a poll
    await new Promise((resolve) => setTimeout(resolve, 25))
  }
  throw new Error(`never came: ${JSON.stringify(read())}`)
}

describe('The window follows a build’s helpers', () => {
  test('read as launched, its thread read for its dialog, stopped by the user and the agent told', async () => {
    const handed: string[] = []
    const main = buildAgent({
      execute: (_labels, text) => {
        handed.push(text)
        return text.includes('# Internal result')
          ? []
          : [{ does: 'uses', call: 'helper_launch', arguments: { brief: 'Write the reader.' } }]
      },
    })
    const gate = gated(1)
    const helper = fakeAgent({
      between: gate.between,
      answersDeliveryWith: (text) =>
        text.includes('# Mission: helper')
          ? [
              { does: 'says', text: 'Reading the exporter.' },
              { does: 'says', text: 'Never said.' },
            ]
          : [],
    })
    opened = await openWindow(dataFolder, main.agent, helper)
    install(opened.bridge)
    stop = listenToHelpers()
    const spec = await opened.running(aReadySpec(dataFolder, THREE))
    const sessionId = await opened.running(launched(spec.specId, spec.workspaceId))
    await openHelpers(sessionId)

    // Launched after the build was opened: `helpers.changed` reads them again.
    const [running] = await until(
      () => helpersSnapshot().helpers,
      (helpers) => helpers.length === 1,
    )
    expect(running).toMatchObject({ name: 'Write the reader.', state: 'running', depth: 1 })
    const id = running?.id ?? ''

    // Its thread, read for its dialog: its brief and what it said, held at work.
    let thread = helpersSnapshot().threads.get(id) ?? []
    for (let tries = 0; tries < 400; tries += 1) {
      // oxlint-disable-next-line no-await-in-loop -- each read waits for the one before it: this is a poll
      await readHelperThread(id)
      thread = helpersSnapshot().threads.get(id) ?? []
      if (thread.some((entry) => entry.body === 'Reading the exporter.')) break
      // oxlint-disable-next-line no-await-in-loop -- each look waits for the one before it: this is a poll
      await new Promise((resolve) => setTimeout(resolve, 25))
    }
    expect(thread.find((entry) => entry.kind === 'mission_brief')?.body).toContain(
      '# Mission: helper',
    )
    expect(thread.some((entry) => entry.body === 'Reading the exporter.')).toBe(true)

    await stopHelper(id)
    gate.carryOn()
    expect(helpersSnapshot().helpers).toMatchObject([{ id, state: 'stopped' }])
    await until(
      () => handed,
      (all) => all.some((text) => text.includes('The user stopped Write the reader.')),
    )

    // Every line a helper wrote in the Journal reads as a sentence, never as its type.
    const journal = await opened.bridge.invoke('journal.read', {
      projectId: spec.projectId,
      limit: 200,
    })
    const lines = journal.entries.filter((entry) => entry.type.startsWith('helper.'))
    expect(lines.map((entry) => lineOf(entry).label)).toEqual(
      expect.arrayContaining([
        'Helper Write the reader. launched',
        'Helper Write the reader. stopped: Stopped by the user.',
      ]),
    )
  })
})
