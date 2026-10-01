/**
 * A build, from a ready Spec to the user's task, in the built application (designs D10-02
 * to D10-12).
 *
 * The Project `Atlas` points at a `main` holding one repository, `./sources/api`, made here with
 * the machine's own `git` and removed after the run. Its one check is a line of the user's, run at
 * the Workspace root after each task: it is red while `fixed.txt` is missing there.
 *
 * The Spec is written the way a Spec is: a Session made on the Project, turned `define` by
 * `specs.create`, its agent asked to write a Spec a build can run and to attest it, and the human's
 * Mark ready — all through the bridge, the calls the window's own controls make. Its three tasks
 * depend each on the one before, and the second is the user's. The build is asked for through
 * `launches.request`, the call the Spec's launch action will make; everything after that is read
 * from the window and pressed in it: the build Session in the sidebar, its view, Pause and Resume.
 *
 * The agent is the suite's fake one (`agent/program.ts`): it answers the `prepare` brief with its
 * approach, finishes every task an `execute` delivery hands it, and writes `fixed.txt` only on the
 * try that follows a red one. This file leaves the build with the user's task waiting;
 * `builds.reopened.e2e.ts` starts the application again on the same data folder and ends it.
 *
 * Each suite is named after the scenario of the issue's Spec it covers.
 */

import { rmSync } from 'node:fs'
import { join } from 'node:path'

import { browser, expect } from '@wdio/globals'

import { repository } from '../tests/repositories.ts'
import { fakeWorkspace } from './agent/install.ts'
import { APPROACH, BUILDABLE, BUILDABLE_SECTIONS, FIXED, STORY } from './agent/script.ts'
import { addProject, awaits, press, pressIn, region, shows, sidebar } from './hand.ts'
import { awaitsYours, buildNow, pressExactly, unfoldTasks } from './build-hand.ts'

/** The folder of `main`, kept for the second instance, which goes on in it. */
const MAIN = fakeWorkspace('builds')

/** The Spec's key: the Project's prefix, and the first number. */
const KEY = 'ATL-1'

/** What the build Session is listed under: it has no message of the user's to be named after. */
const BUILD = 'New session'

/** Unfolds the stage of a task from its row, unless it is the one already unfolded. */
async function unfoldStage(label: string): Promise<void> {
  const found = await browser.execute((task: string) => {
    const row = [...document.querySelectorAll('ol[aria-label^="Stories of"] button')].find((one) =>
      (one.textContent ?? '').trim().startsWith(`${task},`),
    )
    if (!(row instanceof HTMLButtonElement)) return false
    if (row.getAttribute('aria-expanded') !== 'true') row.click()
    return true
  }, label)
  expect(found).toBe(true)
  await browser.pause(300)
}

/**
 * The check: a line of the user's, red while the file is missing at the Workspace root. Node's own
 * binary, which is on the machine whatever runs the suite; single quotes only inside.
 */
const CHECK_LINE = `"${process.execPath}" -e "process.exit(require('fs').existsSync('${FIXED}')?0:1)"`

before(() => {
  rmSync(join(MAIN, 'sources'), { recursive: true, force: true })
  rmSync(join(MAIN, FIXED), { force: true })
  repository(join(MAIN, 'sources', 'api'))
})

/**
 * The ready Spec, through the bridge: the Project's repository and its check, a Session made
 * `define`, its agent's contract and attestation, and the human's Mark ready.
 */
async function aReadySpec(): Promise<{ readonly specId: string; readonly workspaceId: string }> {
  return await browser.execute(
    async (asked: string, line: string) => {
      const projects = await window.hemera.invoke('projects.list', {})
      const project = projects.find((one) => one.name === 'Atlas')
      if (project === undefined) throw new Error('no Project Atlas')
      await window.hemera.invoke('repositories.add', {
        id: project.id,
        version: project.version,
        relativePath: './sources/api',
      })
      await window.hemera.invoke('checks.save', {
        projectId: project.id,
        id: null,
        draft: {
          name: 'fixed',
          commandId: null,
          line,
          where: 'root',
          repository: null,
          when: 'task',
          expect: null,
          files: null,
        },
      })
      const writer = await window.hemera.invoke('sessions.create', {
        projectId: project.id,
        provider: 'opencode',
      })
      const made = await window.hemera.invoke('specs.create', {
        sessionId: writer.id,
        type: 'feature',
        title: 'Export the Journal',
      })
      await window.hemera.invoke('agents.prompt', { sessionId: writer.id, text: asked })
      const attested = await window.hemera.invoke('specs.read', { specId: made.snapshot.spec.id })
      await window.hemera.invoke('specs.markReady', {
        specId: attested.spec.id,
        expectedRevisionId: attested.spec.currentRevisionId,
        expectedContentVersion: attested.spec.contentVersion,
        sessionId: writer.id,
      })
      const workspaces = await window.hemera.invoke('workspaces.list', { projectId: project.id })
      return {
        specId: attested.spec.id,
        workspaceId: workspaces.find((one) => one.main)?.id ?? '',
      }
    },
    BUILDABLE,
    CHECK_LINE,
  )
}

describe('A build prepares before it executes', () => {
  it('asked for on a ready Spec, runs as its own Session, the agent’s approach shown', async () => {
    await addProject('Atlas', MAIN)
    const { specId, workspaceId } = await aReadySpec()
    const status = await browser.execute(
      async (spec: string) =>
        (await window.hemera.invoke('specs.read', { specId: spec })).spec.status,
      specId,
    )
    expect(status).toBe('ready')

    const launch = await browser.execute(
      async (spec: string, workspace: string) =>
        await window.hemera.invoke('launches.request', { specId: spec, workspaceId: workspace }),
      specId,
      workspaceId,
    )
    // Answered once the launch is written, never after the agent (#132): on a Workspace already
    // ready it is started in the engine right after, and the window follows it.
    expect(launch.state).toBe('waiting')
    await browser.waitUntil(
      async () =>
        await browser.execute(
          async (spec: string) =>
            (await window.hemera.invoke('launches.forSpec', { specId: spec })).launch?.state ===
            'started',
          specId,
        ),
      { timeout: 20_000, interval: 200, timeoutMsg: 'the build was never started' },
    )

    await browser.waitUntil(async () => (await sidebar()).includes(BUILD), {
      timeout: 20_000,
      timeoutMsg: 'the build Session is never listed',
    })
    await press(BUILD)
    await awaits(APPROACH)
    // The head names the Project alone (#149): the agent is read off the composer, whose box is
    // addressed to it.
    const box = await browser.execute(
      () =>
        document.querySelector('[role="textbox"][contenteditable]')?.getAttribute('aria-label') ??
        '',
    )
    expect(box).toContain('opencode')
    expect(await shows(KEY)).toBe(true)
  })
})

describe("The agent's signal is not a verdict", () => {
  it('a red check sends T1 back to the agent, whose second try is green', async () => {
    await browser.waitUntil(async () => (await buildNow(KEY)).states.T1 === 'done', {
      timeout: 30_000,
      timeoutMsg: 'T1 never came out of its checks green',
    })
    const build = await buildNow(KEY)
    expect(build.tries.T1).toEqual(['red', 'green'])
    // The Spec moved to in progress with its first task started (D10-10).
    expect(build.specStatus).toBe('in_progress')
  })
})

describe('The build view draws the Spec and the progress of its tasks', () => {
  it('draws the story with its tasks and their times, and T1 opens on its tries, checks and files', async () => {
    await browser.waitUntil(async () => (await buildNow(KEY)).states.T2 === 'yours', {
      timeout: 20_000,
      timeoutMsg: 'T2 never became the user\u2019s',
    })
    // The Spec holds one story, drawn as the Spec wrote it, and its three tasks fold under it.
    const stories = await browser.execute(() =>
      [...document.querySelectorAll('ol[aria-label^="Stories of"] > li')].map(
        (story) => story.querySelector('h2')?.textContent ?? '',
      ),
    )
    expect(stories).toEqual([STORY.title])

    await unfoldTasks()
    const rows = await browser.execute(() =>
      [...document.querySelectorAll('ol[aria-label^="Stories of"] button')].map((row) =>
        (row.textContent ?? '').replace(/\s+/g, ' ').trim(),
      ),
    )
    // Each row says its time: how long a done task took, how long a task has been the user's.
    expect(rows.find((row) => row.startsWith('T1'))).toMatch(/, took \S/)
    expect(rows.find((row) => row.startsWith('T2'))).toMatch(/, for \S/)

    // Its evidence is on its stage, read there and not in the thread beside it: the red try said
    // in plain words, and the file it changed. Each task's row unfolds its stage, and the view may
    // have unfolded T1's already: pressed only when folded, as a hand would.
    await unfoldStage('T1')
    await browser.waitUntil(
      async () => (await region('ol[aria-label="Tries of T1"]')).includes('exited with 1'),
      { timeout: 20_000, timeoutMsg: 'the red try of T1 was never said on its stage' },
    )
    await browser.waitUntil(
      async () => (await region('ul[aria-label^="Files changed in"]')).includes('src/export.ts'),
      { timeout: 20_000, timeoutMsg: 'the file T1 changed was never shown on its stage' },
    )
  })
})

describe('A human task waits for the user', () => {
  it('T2 is the user’s, said among the Session’s notices, and never handed to the agent', async () => {
    await browser.waitUntil(async () => (await buildNow(KEY)).states.T2 === 'yours', {
      timeout: 20_000,
      timeoutMsg: 'T2 never became the user’s',
    })
    // What waits for the user is answered from the notices on the composer's edge (#237).
    await awaitsYours('T2', 'Sign the export format off')
    const build = await buildNow(KEY)
    expect(build.states).toEqual({ T1: 'done', T2: 'yours', T3: 'waiting' })
    expect(build.handed.T2).toBe(false)
    await browser.keys('Escape')
    await browser.pause(400)
  })
})

describe('The Spec is read only in a build', () => {
  it('opens the frozen revision beside its tasks, over the chat, with no edit control', async () => {
    // "Spec" lays the build over the chat and reads the frozen revision beside its tasks (#77).
    await pressExactly('Spec')
    await awaits('read only')
    const panel = `section[aria-label="Spec ${KEY}"]`
    expect(await region(panel)).toContain(BUILDABLE_SECTIONS.problem)
    const editable = await browser.execute(
      (scope: string) =>
        document.querySelector(scope)?.querySelectorAll('textarea, input, [contenteditable="true"]')
          .length ?? -1,
      panel,
    )
    expect(editable).toBe(0)
    expect(await region(panel)).not.toContain('Mark ready')
    expect(await region(panel)).not.toContain('Rework')

    expect(await region(`[role="region"][aria-label="Tasks of ${KEY}"]`)).toContain('T1')

    // Closed, the Spec takes the build back beside the chat, where the next files find it.
    await pressIn(panel, 'Close the Spec')
    await browser.waitUntil(async () => (await region(panel)) === '', {
      timeout: 5000,
      timeoutMsg: 'the frozen Spec never closed',
    })
    await browser.waitUntil(
      async () => (await region('ol[aria-label^="Stories of"]')).includes(STORY.title),
      { timeout: 5000, timeoutMsg: 'the build never came back beside the chat' },
    )
  })
})

describe('Pause stops at the next safe point', () => {
  it('Pause holds the build, and Resume lets it go on where it stood', async () => {
    await pressExactly('Pause')
    await browser.waitUntil(async () => (await buildNow(KEY)).paused, {
      timeout: 10_000,
      timeoutMsg: 'the build was never paused',
    })
    await awaits('Paused')
    expect((await buildNow(KEY)).states.T2).toBe('yours')

    await pressExactly('Resume')
    await browser.waitUntil(async () => !(await buildNow(KEY)).paused, {
      timeout: 10_000,
      timeoutMsg: 'the build was never resumed',
    })
    expect((await buildNow(KEY)).states).toEqual({ T1: 'done', T2: 'yours', T3: 'waiting' })
    // Left here: the next file starts the application again, mid-build, on the same view.
    await unfoldTasks()
    expect(await region('ol[aria-label^="Stories of"]')).toContain('T3')
  })
})
