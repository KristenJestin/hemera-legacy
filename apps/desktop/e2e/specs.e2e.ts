/**
 * A Spec written beside the chat of a `define` Session (designs D7-01, D7-03, D7-07, D7-09,
 * D7-11, D7-14; issue #135).
 *
 * One journey, in the order a hand makes it, on one data folder: a `free` Session whose agent
 * proposes a Spec through `spec_propose`, the proposal accepted, the brief handed over before the
 * next turn, the Spec read in the panel with nothing to edit, a question asked and answered in the
 * chat, and a second Session that reads the draft and takes it over. The restart is
 * `specs.reopened.e2e.ts`, which starts a second instance on the folder this one wrote
 * (`wdio.conf.ts`, `CONTINUED`), finds the draft and its phases, and takes the Spec to `ready`.
 *
 * Two acts are not a hand's, and say so where they are made:
 *
 * - Some of the agent's writes. The fake agent follows a script fixed when its turn starts and
 *   writes neither `Problem` nor `Scope`: those, and the question, go through the window's own
 *   bridge. What it writes on its own, through `spec_write`, is `specs.reopened.e2e.ts`'s.
 * - The second Session. Nothing in the window lists Specs yet: it is opened on the Spec through
 *   `specs.openSession`, the call such a list would make.
 *
 * Each suite is named after the scenario it covers.
 */

import { browser, expect } from '@wdio/globals'

import { fakeWorkspace } from './agent/install.ts'
import { AGENT, ANSWERS, MODELS, PROPOSAL, PROPOSE } from './agent/script.ts'
import {
  addProject,
  awaitsRecord,
  answerWith,
  awaits,
  control,
  openNotices,
  press,
  pressIn,
  region,
  showPart,
  shows,
  sidebar,
  unfoldSpec,
  write,
} from './hand.ts'

/** Where the Project points, which is where the agent is started. Kept for the second instance. */
const SOURCES = fakeWorkspace('specs')

/** The Project, whose name gives the Spec key its prefix: `Atlas` is `ATL`. */
const PROJECT = 'Atlas'

/** What the first Session is asked, which is also the title it is listed under. */
const ASKED = `The CSV export drops the date. ${PROPOSE}`

/** The key the Spec is minted with: the Project's prefix, and the first number. */
const KEY = 'ATL-1'

/** What is said once the Session defines the Spec, which is the turn the brief rides. */
const DEFINING = 'Let us shape the export fix.'

/** What `Problem` and `Scope` are written with, through the bridge. */
const PROBLEM = 'The CSV export leaves the invoice date column empty.'
const SCOPE = 'The invoice and credit note CSV exports.'

/** The question asked in the chat, and the option it is answered with. */
const QUESTION = 'Which date decides the month of an invoice?'
const ISSUE = 'The issue date'

/** The title a Session opened on a Spec starts with. */
const OPENED = 'New session'

const PANEL = `section[aria-label="Spec ${KEY}"]`

const THREAD = '[aria-label="The thread of this Session"]'

const PROPOSAL_CARD = '[role="group"][aria-label="Create a Spec"]'

const READER_BAR = '[role="group"][aria-label="Write right"]'

/** The Session of this title and the Spec it defines, as the engine answers them. */
async function sessionOf(title: string): Promise<{ id: string; specId: string | null }> {
  return await browser.execute(
    async (project: string, named: string) => {
      const projects = await window.hemera.invoke('projects.list', {})
      const projectId = projects.find((one) => one.name === project)?.id ?? ''
      const sessions = await window.hemera.invoke('sessions.list', { projectId })
      const session = sessions.find((one) => one.title === named)
      return { id: session?.id ?? '', specId: session?.specId ?? null }
    },
    PROJECT,
    title,
  )
}

/** A section of the Spec as the engine holds it: its body, its version and who wrote it. */
async function sectionOf(specId: string, name: 'problem' | 'scope') {
  return await browser.execute(
    async (spec: string, section: string) => {
      const read = await window.hemera.invoke('specs.read', { specId: spec })
      const found = read.sections.find((one) => one.name === section)
      return { body: found?.body ?? '', version: found?.version ?? 0, author: found?.author ?? '' }
    },
    specId,
    name,
  )
}

/** Writes a section through the window's bridge, on the version it is at. */
async function writeThrough(
  specId: string,
  sessionId: string,
  name: 'problem' | 'scope',
  body: string,
): Promise<void> {
  const { version } = await sectionOf(specId, name)
  await browser.execute(
    async (
      spec: string,
      session: string,
      section: 'problem' | 'scope',
      text: string,
      base: number,
    ) => {
      await window.hemera.invoke('specs.writeSection', {
        specId: spec,
        sessionId: session,
        name: section,
        body: text,
        baseVersion: base,
      })
    },
    specId,
    sessionId,
    name,
    body,
    version,
  )
  await browser.pause(1200)
}

/** How many editable fields the panel holds. */
async function fieldsIn(scope: string): Promise<number> {
  return await browser.execute(
    (selector: string) =>
      document
        .querySelector(selector)
        ?.querySelectorAll('textarea, input, [contenteditable="true"]').length ?? 0,
    scope,
  )
}

/** How many times the thread says this. */
async function timesInThread(text: string): Promise<number> {
  return (await region(THREAD)).split(text).length - 1
}

describe('A free Session’s agent proposes a Spec, and Create makes the Session define', () => {
  it('shows the proposal in the thread, with nothing of a Spec beside it yet', async () => {
    await addProject(PROJECT, SOURCES)
    await press('Choose an agent')
    await press(AGENT)
    await awaits(MODELS[0].name)
    await browser.keys(['\uE00C'])
    await browser.pause(300)
    await write(ASKED)
    await press('Start chat')
    await awaits(ANSWERS[0])
    // The proposal waits among the Session's notices, closed until pressed (issue #237).
    await openNotices('Spec proposed')

    // The agent proposed through Hemera's `spec_propose`: a Hemera call of the thread, wearing
    // the tool's own mark, and the proposal below it.
    const proposed = await browser.execute(
      (thread: string) =>
        document.querySelector(thread)?.querySelector('[data-mark="propose-spec"]') !== null,
      THREAD,
    )
    expect(proposed).toBe(true)
    expect(await region(PROPOSAL_CARD)).toContain('feature')
    // A `free` Session has no panel, and nothing that offers one but the proposal. The notices'
    // own `Spec proposed` group, which holds the proposal, is not a panel.
    expect(await region('section[aria-label^="Spec "]:not([aria-label="Spec proposed"])')).toBe('')
    expect(await control('Create a Spec')).toBeNull()
    expect(await control('Join a Spec')).toBeNull()
  })

  it('creates the Spec with its key, opens the panel and keeps the thread', async () => {
    await openNotices('Spec proposed')
    await pressIn(PROPOSAL_CARD, 'Start')
    await awaitsRecord(`Spec proposed, ${KEY} `)
    await browser.waitUntil(async () => (await region(PANEL)) !== '', {
      timeout: 10_000,
      timeoutMsg: 'the Spec panel never opened',
    })
    // It opens folded to its band beside the chat: the hand unfolds it to read it.
    await unfoldSpec(KEY)

    const panel = await region(PANEL)
    expect(panel).toContain(KEY)
    expect(panel).toContain(PROPOSAL.title)
    // The status is an icon named by its word, not a word on the line (issue #159).
    expect(
      await browser.execute(
        (scope: string) =>
          document.querySelector(`${scope} [role="img"][aria-label="Draft"]`) !== null,
        PANEL,
      ),
    ).toBe(true)
    // No sentence of the phase under the head: the rail says where each part stands (#150).
    expect(panel).not.toContain('Shape ·')
    // The head names the Project alone (issue #149): the mission is the panel beside the chat,
    // and the agent is the composer's.
    expect(await shows(`DEFINE · opencode`)).toBe(false)
    expect(await region(THREAD)).toContain(ANSWERS[0])
    const { specId } = await sessionOf(ASKED)
    expect(specId).not.toBeNull()
  })
})

/** How far the page scrolls sideways, in pixels: what its content is wider than it by. */
async function sideways(): Promise<number> {
  return await browser.execute(() => {
    const page = document.querySelector('main')
    return page === null ? -1 : page.scrollWidth - page.clientWidth
  })
}

/** Presses the fold or the unfold of the Spec, and waits for the swap to land. */
async function swapSpec(name: 'Fold the Spec' | 'Unfold the Spec'): Promise<void> {
  await browser.execute(
    (scope: string, label: string) => {
      const button = document.querySelector(scope)?.querySelector(`button[aria-label="${label}"]`)
      if (button instanceof HTMLButtonElement) button.click()
    },
    PANEL,
    name,
  )
  await browser.pause(1200)
}

/** Sizes the window, then says how far the page scrolls sideways with the Spec open and folded. */
async function sidewaysAt(width: number): Promise<string[]> {
  await browser.electron.execute((electron, wide: number) => {
    electron.BrowserWindow.getAllWindows()[0]?.setSize(wide, 800)
  }, width)
  await browser.pause(600)
  const open = await sideways()
  await swapSpec('Fold the Spec')
  const folded = await sideways()
  await swapSpec('Unfold the Spec')
  return [`${width} open: ${open}`, `${width} folded: ${folded}`]
}

describe('The Session row never scrolls sideways', () => {
  it('fits the chat and the Spec in the window, open and folded, narrow and wide', async () => {
    const before = await browser.electron.execute(
      (electron) => electron.BrowserWindow.getAllWindows()[0]?.getSize() ?? [1280, 800],
    )
    const narrow = await sidewaysAt(900)
    const wide = await sidewaysAt(1600)
    await browser.electron.execute((electron, size: number[]) => {
      electron.BrowserWindow.getAllWindows()[0]?.setSize(size[0] ?? 1280, size[1] ?? 800)
    }, before)
    expect([...narrow, ...wide]).toEqual([
      '900 open: 0',
      '900 folded: 0',
      '1600 open: 0',
      '1600 folded: 0',
    ])
  })
})

describe('The brief is part of the turn, never a human message', () => {
  it('hands the mission brief with the turn, and draws no row of it in the thread', async () => {
    await write(DEFINING)
    await press('Send')
    await awaits(ANSWERS[1])

    // The sentence was written once, as the user's; the brief is Hemera's, kept in the thread's
    // entries for the Context tab, and drawn nowhere in the thread (issue #205).
    expect(await timesInThread(DEFINING)).toBe(1)
    expect(await region(THREAD)).not.toContain('What the agent was told')
    expect(await region(THREAD)).not.toContain('# The Spec')
    const { id } = await sessionOf(ASKED)
    const briefs = await browser.execute(async (sessionId: string) => {
      const read = await window.hemera.invoke('sessions.read', { sessionId })
      return read.entries.filter((entry) => entry.kind === 'mission_brief').length
    }, id)
    expect(briefs).toBeGreaterThan(0)
  })
})

describe('The Spec is read, never edited by hand', () => {
  it('draws what is written as text, and offers nothing to type in', async () => {
    const { id, specId } = await sessionOf(ASKED)
    await writeThrough(specId ?? '', id, 'problem', PROBLEM)
    await writeThrough(specId ?? '', id, 'scope', SCOPE)
    await showPart(KEY, 'Problem')

    expect(await region(PANEL)).toContain(PROBLEM)
    expect(await fieldsIn(PANEL)).toBe(0)
    expect(await control(`Preview Problem as Markdown`)).toBeNull()
  })
})

describe('A question is asked and answered in the chat', () => {
  it('asks it as a block of the thread, and the register records it with no link', async () => {
    const { id, specId } = await sessionOf(ASKED)
    await browser.execute(
      async (spec: string, session: string, body: string, issue: string) => {
        await window.hemera.invoke('specs.raiseQuestion', {
          specId: spec,
          sessionId: session,
          body,
          blocking: true,
          phase: 'shape',
          options: [
            { id: 'issue', label: issue, recommended: true },
            { id: 'payment', label: 'The payment date' },
          ],
        })
      },
      specId ?? '',
      id,
      QUESTION,
      ISSUE,
    )
    await awaits(QUESTION)
    await browser.pause(800)
    await showPart(KEY, 'Questions')

    const panel = await region(PANEL)
    expect(panel).toContain('Questions · 1 open')
    // The notices on the composer's edge are where it is answered (#237): the register offers no
    // way there (#181).
    expect(panel.toLowerCase()).not.toContain('answer in the chat')
  })

  it('answers it in the notices, keeps its record in the thread, and resolves it in the register', async () => {
    await answerWith(ISSUE)
    await browser.pause(1200)

    // The thread keeps a quiet record where it was asked, the answer after the question, named
    // after its answer, lettered as the card lettered it (issues #199, #237).
    const block = await region('[id^="ask-"]')
    expect(block).toContain(QUESTION)
    expect(block).toContain(`A, ${ISSUE}`)
    const chosen = await browser.execute(() =>
      [...document.querySelectorAll('[role="group"][aria-label^="You answered"]')].map(
        (group) =>
          `${group.closest('[id^="ask-"]') === null ? 'thread' : 'card'}: ${group.getAttribute('aria-label') ?? ''}`,
      ),
    )
    expect(chosen).toEqual([`card: You answered «${QUESTION}»: A, ${ISSUE}`])
    const panel = await region(PANEL)
    expect(panel).toContain('Questions · 0 open')
    expect(panel).toContain('1 answered')
    // The answer is an entry of its own, the human's, beside the question.
    const { id } = await sessionOf(ASKED)
    const answers = await browser.execute(async (sessionId: string) => {
      const read = await window.hemera.invoke('sessions.read', { sessionId })
      return read.entries
        .filter((entry) => entry.kind === 'spec_answer')
        .map((entry) => `${entry.role}: ${entry.body}`)
    }, id)
    expect(answers).toEqual([`user: ${ISSUE}`])
  })
})

describe('A second Session reads but does not write', () => {
  it('reads the draft another Session writes, and is told which one', async () => {
    const { specId } = await sessionOf(ASKED)
    await browser.execute(async (spec: string) => {
      await window.hemera.invoke('specs.openSession', { specId: spec, provider: 'opencode' })
    }, specId ?? '')
    await browser.waitUntil(async () => (await sidebar()).includes(OPENED), {
      timeout: 10_000,
      timeoutMsg: 'the Session opened on the Spec is never listed',
    })

    await press(OPENED)
    await browser.waitUntil(async () => (await region(PANEL)) !== '', {
      timeout: 10_000,
      timeoutMsg: 'the Spec panel of the second Session never showed',
    })
    await unfoldSpec(KEY)
    await browser.waitUntil(async () => (await region(READER_BAR)) !== '', {
      timeout: 10_000,
      timeoutMsg: 'the reader bar never showed',
    })
    expect(await region(READER_BAR)).toContain(`« ${ASKED} »`)
    expect(await region(PANEL)).toContain(PROBLEM)
  })

  it('takes the write right over, and the first Session reads from then on', async () => {
    await pressIn(READER_BAR, 'Take over')
    await browser.pause(1200)
    expect(await region(READER_BAR)).toBe('')

    const { id, specId } = await sessionOf(OPENED)
    const writer = await browser.execute(async (spec: string) => {
      const read = await window.hemera.invoke('specs.read', { specId: spec })
      return read.spec.writerSessionId
    }, specId ?? '')
    expect(writer).toBe(id)

    // The first Session, revisited, is the reader now. Its agent's writes are refused by the
    // engine (`writable`, tested there).
    await press(ASKED)
    await browser.waitUntil(async () => (await region(PANEL)) !== '', {
      timeout: 10_000,
      timeoutMsg: 'the Spec panel of the first Session never showed again',
    })
    await unfoldSpec(KEY)
    await browser.waitUntil(async () => (await region(READER_BAR)) !== '', {
      timeout: 10_000,
      timeoutMsg: 'the first Session never read',
    })
    expect(await region(READER_BAR)).toContain(`« ${OPENED} »`)
  })
})

describe('Mark ready waits until the Spec can be marked ready', () => {
  it('is not offered on a draft that still lacks something, whose footer says nothing', async () => {
    // A press could only be refused (issues #205, #209): the footer says nothing instead.
    expect(await region(PANEL)).not.toContain('checks met')
    expect(await control('Mark ready')).toBeNull()
    expect(await region(PANEL)).not.toMatch(/left before ready/)
    expect(await region(PANEL)).not.toContain('is not ready yet')
    const { specId } = await sessionOf(ASKED)
    const status = await browser.execute(async (spec: string) => {
      const read = await window.hemera.invoke('specs.read', { specId: spec })
      return read.spec.status
    }, specId ?? '')
    expect(status).toBe('draft')
  })
})
