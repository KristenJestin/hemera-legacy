import type { Meta, StoryObj } from '@storybook/react-vite'
import { AnimatePresence, motion } from 'motion/react'
import { type ReactNode, useState } from 'react'
import { expect, fn, userEvent, waitFor, within } from 'storybook/test'

import { Composer } from '../composer/composer.tsx'
import { TooltipProvider } from '../components/tooltip/tooltip.tsx'
import { AgentText } from '../message/agent-text.tsx'
import { MessageGroup } from '../message/message.tsx'
import { MessageScroller, type ScrollerEntry } from '../message/scroller/scroller.tsx'
import { crossfade, useTransition } from '../motion.ts'
import { SessionHeader } from '../session/session.tsx'
import { CreateSpecProposal, type ProposalState } from './create-spec-proposal.tsx'
import { MissionBrief } from './mission-brief.tsx'
import type { ReaderView, SpecType, SpecView } from './model.ts'
import {
  BUG,
  GATE_FULL,
  JUST_CREATED,
  MID_PLAN,
  ONE_QUESTION_LEFT,
  READER,
  READY,
  STALE,
} from './spec-fixtures.ts'
import { useLiveSpec } from './spec-harness.tsx'
import { SpecPanel } from './spec-panel.tsx'
import { SpecQuestion } from './spec-question.tsx'

/**
 * A `define` Session: the chat on the left, the Spec panel beside it (lot 19, the screens of the
 * brief, revision 2).
 *
 * The chat is the thread and the composer of the Session page, as they are; what `define` adds
 * to it is the thin Hemera line that says what the agent was handed this turn, and the questions
 * of the Spec, asked there and answered there. The panel takes the side column's place — there
 * is no side column while it is there. It opens folded to a small frame of its phases, so the chat
 * has the width (issue #164): a screen that shows the panel's state opens it unfolded, and a path
 * unfolds it first, the way a hand does.
 * A `define` Session never exists without its Spec: it starts from a Spec, or from a `free`
 * Session whose agent proposes one. Every screen is the same Spec, `ATL-7`, taken through its
 * states, consistent with the product rules: no task before `decompose`, a full gate only once
 * every phase is finished.
 */

const AT = 'Today at'

/** A message of yours, as the thread draws one. */
function yours(id: string, at: string, body: string): ScrollerEntry {
  return {
    id,
    mark: body,
    content: (
      <MessageGroup
        author="user"
        name="You"
        at={at}
        atLabel={`${AT} ${at}`}
        state="saved"
        lines={[{ id: `${id}-1`, body }]}
      />
    ),
  }
}

/** What the agent said, as the thread draws it. */
function agents(id: string, text: string): ScrollerEntry {
  return { id, content: <AgentText text={text} /> }
}

/** A Hemera line of the thread. */
function hemera(id: string, title: string, detail: string, brief?: string): ScrollerEntry {
  return { id, content: <MissionBrief title={title} detail={detail} brief={brief} /> }
}

const ASK = yours(
  'ask',
  '10:31',
  'Accountants need a month of invoices as one CSV they can import into their ledger, from the billing page.',
)

const PLAN_BRIEF =
  '**Plan** · analyse the code and fix the technical approach of `ATL-7`, its risks and how it is verified. Shape is finished; one blocking question is open.\n\nSince the last turn you edited **Scope** (v4).'

/** What each screen has in its thread, the questions asked there, and its Spec. */
interface Screen {
  title: string
  thread: ScrollerEntry[]
  /** The questions of the Spec asked at the end of the thread, by id. */
  asks?: string[] | undefined
  spec: SpecView
  reader?: ReaderView | undefined
}

const SCREENS = {
  midPlan: {
    title: 'Spec CSV',
    spec: MID_PLAN,
    asks: ['q-credit-notes'],
    thread: [
      ASK,
      hemera('brief', 'What the agent was told · Plan', '10:44', PLAN_BRIEF),
      agents(
        'answer',
        'Shape is finished: the problem, the outcome, the scope and two stories are in the Spec. I am writing the plan: the export can reuse the invoice query of `export.service.ts` and stream its rows.\n\nOne question blocks the plan:',
      ),
    ],
  },
  bug: {
    title: 'Rounding bug',
    spec: BUG,
    asks: ['q-rounding'],
    thread: [
      yours(
        'ask',
        '09:12',
        'Multi-currency invoices are off by a cent. Accounting saw it on the September close.',
      ),
      hemera(
        'brief',
        'What the agent was told · Shape',
        '09:12',
        '**Shape** · frame the need of `ATL-12`.',
      ),
      agents(
        'answer',
        'I reproduced it on the demo data and wrote the steps under Reproduction. You changed the amounts of step 1; I keep yours.\n\nOne question before the plan:',
      ),
    ],
  },
  gateFull: {
    title: 'Spec CSV',
    spec: GATE_FULL,
    thread: [
      ASK,
      hemera(
        'brief',
        'What the agent was told · Decompose',
        '11:20',
        '**Decompose** · slice `ATL-7`.',
      ),
      agents(
        'answer',
        'Decompose is finished: four tasks, each one a slice that can be verified alone, the last one yours: checking the file imports into the ledger.\n\nI attest the contract is complete and a build can run it without inventing a decision. Marking it ready is yours.',
      ),
    ],
  },
  lastQuestion: {
    title: 'Spec CSV',
    spec: ONE_QUESTION_LEFT,
    asks: ['q-credit-notes'],
    thread: [
      ASK,
      hemera(
        'brief',
        'What the agent was told · Decompose',
        '11:20',
        '**Decompose** · slice `ATL-7`.',
      ),
      agents(
        'answer',
        'Decompose is finished and I attest the contract. One question is still yours before it can be marked ready:',
      ),
    ],
  },
  ready: {
    title: 'Spec CSV',
    spec: READY,
    thread: [
      ASK,
      hemera('ready', 'ATL-7 marked ready', '11:34'),
      agents(
        'answer',
        'The Spec is ready at revision 2. A build Session can start from it. I can no longer change it unless you rework it.',
      ),
    ],
  },
  reader: {
    title: 'Billing review',
    spec: READER,
    reader: { writer: 'Spec CSV', takeOverRefused: null },
    thread: [
      yours('ask', '14:05', 'What does ATL-7 say about credit notes?'),
      agents(
        'answer',
        'Story S2 covers them: negative rows in the same file, marked by a `type` column. Its second criterion says the file total must still equal the billing page total for the month.\n\nI only read it: « Spec CSV » writes it.',
      ),
    ],
  },
  stale: {
    title: 'Spec CSV',
    spec: STALE,
    thread: [
      ASK,
      hemera('rework', 'ATL-7 reworked', '« credit notes keep their invoice number »'),
      agents(
        'answer',
        'Revision 3 is a full copy of 2. The reason touches the plan and the tasks, so I am declaring both again; shape still holds.',
      ),
    ],
  },
} satisfies Record<string, Screen>

type ScreenName = keyof typeof SCREENS | 'fromFree'

/** Where the thread of a question is: the id its block is found by. */
function askId(id: string): string {
  return `ask-${id}`
}

/** The chat of a Session: its head, its thread and its composer. */
function Chat({ title, thread }: { title: string; thread: ScrollerEntry[] }): ReactNode {
  const [value, setValue] = useState('')
  const [files, setFiles] = useState<string[]>([])
  return (
    <div className="flex min-h-0 min-w-0 flex-1 flex-col">
      <div className="flex w-full flex-col px-6 pt-6 pb-4">
        <SessionHeader title={title} onRename={fn()} onStartEditing={fn()} onArchive={fn()} />
      </div>
      <MessageScroller className="flex-1" label="The thread of this Session" entries={thread} />
      <div className="flex w-full flex-col px-6 pb-4">
        <Composer
          value={value}
          onValueChange={setValue}
          files={files}
          onFilesChange={setFiles}
          onSearchFiles={() => Promise.resolve([])}
          variant="inline"
          action="Send"
          placeholder="Answer, or ask the agent…"
          onSend={() => Promise.resolve(null)}
        />
      </div>
    </div>
  )
}

/** The actions a story reports, for the paths that assert on them. */
const ON = {
  onAnswer: fn(),
  onMarkReady: fn(),
  onRework: fn(),
  onPickRevision: fn(),
  onTakeOver: fn(),
}

/**
 * A `define` Session held together as the renderer will hold it: the Spec is held once, and both
 * the panel and the questions of the thread read it and write it.
 */
function DefineSession({
  shown,
  reworkOpen,
  folded,
}: {
  shown: Screen
  reworkOpen: boolean
  folded: boolean
}): ReactNode {
  const { spec, reader, actions } = useLiveSpec(shown.spec, shown.reader, ON)
  const asked: ScrollerEntry[] = (shown.asks ?? []).flatMap((id) => {
    const question = spec.questions.find((one) => one.id === id)
    if (question === undefined) return []
    return [
      {
        id: askId(id),
        content: (
          <div id={askId(id)}>
            <SpecQuestion question={question} onAnswer={(answer) => actions.onAnswer(id, answer)} />
          </div>
        ),
      },
    ]
  })
  return (
    // The row is the container the unfolded panel's width is a share of.
    <div className="@container flex h-screen min-h-0 bg-background text-foreground">
      <Chat title={shown.title} thread={[...shown.thread, ...asked]} />
      <SpecPanel
        spec={spec}
        reader={reader}
        defaultReworkOpen={reworkOpen}
        defaultFolded={folded}
        onMarkReady={actions.onMarkReady}
        onRework={actions.onRework}
        onPickRevision={actions.onPickRevision}
        onTakeOver={actions.onTakeOver}
      />
    </div>
  )
}

/**
 * A `free` Session whose agent proposes a Spec: on `Create` the Session becomes `define`, the
 * Spec exists, and the panel arrives beside the thread — a cross-fade, nothing travelling — while
 * the thread stays exactly as it was.
 */
function FreeThenDefine(): ReactNode {
  const transition = useTransition(crossfade)
  const [state, setState] = useState<ProposalState>('proposed')
  const [created, setCreated] = useState<SpecView | null>(null)
  const thread: ScrollerEntry[] = [
    ASK,
    agents(
      'answer',
      'That is a feature of its own: an export from the billing page, one file per month, in the order the ledger imports. Shall I write it down as a Spec?',
    ),
    {
      id: 'proposal',
      content: (
        <CreateSpecProposal
          title="CSV invoice export"
          type="feature"
          state={state}
          createdKey="ATL-7"
          onCreate={(title: string, type: SpecType) => {
            setState('created')
            setCreated({ ...JUST_CREATED, title, type })
          }}
          onDecline={() => setState('declined')}
        />
      ),
    },
  ]
  return (
    <div className="@container flex h-screen min-h-0 bg-background text-foreground">
      <Chat title="Invoices for the accountants" thread={thread} />
      <AnimatePresence initial={false}>
        {created !== null && (
          <motion.div
            key="panel"
            className="flex shrink-0"
            initial={{ filter: 'opacity(0)' }}
            animate={{ filter: 'opacity(1)' }}
            transition={transition}
          >
            <SpecPanel
              spec={created}
              onMarkReady={fn()}
              onRework={fn()}
              onPickRevision={fn()}
              onTakeOver={fn()}
            />
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}

/** One screen of the brief, by name. */
function Screens({
  screen,
  reworkOpen = false,
  folded = true,
}: {
  screen: ScreenName
  reworkOpen?: boolean
  /** Whether the Spec opens folded to its small frame, as a Session opens it. */
  folded?: boolean
}): ReactNode {
  return (
    <TooltipProvider>
      {screen === 'fromFree' ? (
        <FreeThenDefine />
      ) : (
        <DefineSession shown={SCREENS[screen]} reworkOpen={reworkOpen} folded={folded} />
      )}
    </TooltipProvider>
  )
}

const meta = {
  title: 'Surfaces/Session/Define',
  component: Screens,
  tags: ['autodocs', 'updated'],
  parameters: { layout: 'fullscreen' },
  args: { screen: 'midPlan' },
  argTypes: {
    screen: {
      control: 'select',
      options: [...Object.keys(SCREENS), 'fromFree'],
      description: 'Which screen of the brief.',
    },
    reworkOpen: { control: 'boolean', description: 'Whether the rework dialog starts open.' },
    folded: {
      control: 'boolean',
      description: 'Whether the Spec opens folded to its small frame.',
    },
  },
} satisfies Meta<typeof Screens>

export default meta

type Story = StoryObj<typeof meta>

/*
 * The screens first, each named after the state it shows and each left as it opens: its play
 * asserts and changes nothing, so the screen the gate looks at is the screen as drawn. A Session
 * opens its panel folded; a screen that shows the panel's own state opens it unfolded. The paths
 * through them — a Spec marked ready, reworked, taken over, a question answered
 * in the chat — are stories of their own, named after what they do, and
 * start from the folded panel a Session opens on: the hand unfolds it first.
 */

/** The hand unfolding the Spec from its small frame, and the panel once it is open. */
async function unfold(canvasElement: HTMLElement): Promise<void> {
  const canvas = within(canvasElement)
  await userEvent.click(canvas.getByRole('button', { name: 'Unfold the Spec' }))
  await canvas.findByRole('region', { name: 'Contents of ATL-7' })
}

/** The heading of a phase in the open panel's column, named with where the phase stands. */
function phaseHeading(canvasElement: HTMLElement, name: RegExp): HTMLElement {
  const column = within(canvasElement).getByRole('region', { name: 'Contents of ATL-7' })
  return within(column).getByRole('button', { name })
}

/**
 * Screen 1 · a feature being planned, as the Session opens it: the chat has the width, the Spec
 * a small frame at its edge — the glyph of each phase, tinted by how far along it is, the Plan one
 * breathing while the agent writes the plan, and no readiness. The thread says what the agent was handed in one folded
 * Hemera line, and asks the blocking question as a block.
 */
export const MidPlan: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await expect(
      canvas.getByRole('button', { name: /What the agent was told · Plan/ }),
    ).toBeVisible()
    const frame = canvas.getByRole('navigation', { name: 'Phases of ATL-7' })
    await expect(within(frame).queryByRole('img', { name: /^Readiness/ })).toBeNull()
    const plan = within(frame).getByRole('button', {
      name: 'Plan phase, started, the agent is writing it, unfold the Spec on it',
    })
    await expect(plan).toBeVisible()
    // Folded, the phases alone (issue #164): the one the agent writes in breathes.
    await expect(plan.querySelector('[data-writing]')).not.toBeNull()
    await expect(within(frame).queryByRole('button', { name: /^Tasks/ })).toBeNull()
    await expect(canvas.getByRole('button', { name: 'Unfold the Spec' })).toBeVisible()
    await expect(canvas.queryByRole('region', { name: 'Contents of ATL-7' })).toBeNull()
    await expect(canvas.getByRole('group', { name: /^Question: Credit notes/ })).toBeVisible()
  },
}

/**
 * Unfolded before it can be marked ready (issue #205): no `Mark ready`, and one quiet line of what
 * is left, the whole list in its tooltip; the tasks, not written yet, in the column under
 * Decompose.
 */
export const MidPlanNotReadyYet: Story = {
  play: async ({ canvasElement }) => {
    await unfold(canvasElement)
    const canvas = within(canvasElement)
    await expect(canvas.queryByText(/^Plan ·/)).toBeNull()
    await expect(canvas.queryByRole('button', { name: 'Mark ready' })).toBeNull()
    const left = canvas.getByText('4 things left before ready')
    await expect(left.getAttribute('title')).toMatch(/the tasks/)
    await expect(canvas.queryByRole('alert')).toBeNull()
    const column = canvas.getByRole('region', { name: 'Contents of ATL-7' })
    await expect(within(column).getByRole('heading', { name: /^Tasks · 0/ })).toBeVisible()
    await expect(canvas.getByText(/Tasks are written in Decompose/)).toBeVisible()
  },
}

/**
 * A question answered on its card in the chat: the register records it. The register offers no
 * way to the chat (issue #181): the card is where one answers.
 */
export const MidPlanQuestionAnswered: Story = {
  play: async ({ canvasElement }) => {
    await unfold(canvasElement)
    const canvas = within(canvasElement)
    const register = within(canvas.getByRole('list', { name: 'Questions' }))
    await expect(register.queryByRole('button')).toBeNull()
    const card = within(canvas.getByRole('group', { name: /^Question: Credit notes/ }))
    await userEvent.click(card.getByRole('button', { name: /recommended/ }))
    await expect(canvas.getByRole('heading', { name: /^Questions · 0 open/ })).toBeVisible()
  },
}

/** Screen 2 · a bug: its Shape has Reproduction, and Behaviour is never drawn. */
export const Bug: Story = {
  args: { screen: 'bug', folded: false },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await expect(canvas.getByRole('heading', { name: /^Reproduction/ })).toBeVisible()
    await expect(canvas.queryByRole('heading', { name: /^Behaviour/ })).toBeNull()
    // Read, as every part is: nothing of it is edited by hand (issue #135).
    await expect(canvas.queryByRole('textbox', { name: /^Reproduction/ })).toBeNull()
    await expect(canvas.getByRole('group', { name: /^Question: Is the total/ })).toBeVisible()
  },
}

/**
 * Screen 3 · from a free Session: the agent proposes the Spec in the thread, `Create` makes the
 * Session `define`, and the Spec arrives beside the thread, folded to its small frame, while the
 * thread stays.
 */
export const FromAFreeSession: Story = {
  args: { screen: 'fromFree' },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await expect(canvas.queryByRole('region', { name: 'Spec ATL-7' })).toBeNull()
    await userEvent.click(canvas.getByRole('button', { name: 'Create' }))
    await expect(await canvas.findByRole('region', { name: 'Spec ATL-7' })).toBeVisible()
    await expect(canvas.getByRole('button', { name: 'Unfold the Spec' })).toBeVisible()
    // The head names the Project and nothing more: the mission is the panel (issue #149).
    await expect(canvas.queryByText(/DEFINE ·/)).toBeNull()
    await expect(canvas.getByRole('status')).toHaveTextContent('Created ATL-7')
    await expect(canvas.getByText(/Shall I write it down as a Spec/)).toBeVisible()
  },
}

/** Screen 4 · every check passes: `Mark ready` in the footer, the primary action once confirmed. */
export const GateFull: Story = {
  args: { screen: 'gateFull', folded: false },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await expect(canvas.getByRole('button', { name: 'Mark ready' })).toBeEnabled()
    await expect(canvas.getByRole('heading', { name: /^Tasks · 4/ })).toBeVisible()
  },
}

/** Mark ready pressed: the Spec is ready, the document read only, and Rework appears. */
export const GateFullMarkedReady: Story = {
  args: { screen: 'gateFull' },
  play: async ({ canvasElement }) => {
    await unfold(canvasElement)
    const canvas = within(canvasElement)
    await userEvent.click(canvas.getByRole('button', { name: 'Mark ready' }))
    await expect(canvas.getByRole('button', { name: 'Rework' })).toBeVisible()
    await expect(canvas.queryByText(/Frozen on/)).toBeNull()
    await expect(canvas.queryByRole('textbox', { name: 'Problem' })).toBeNull()
    await expect(canvas.queryByRole('button', { name: 'Mark ready' })).toBeNull()
  },
}

/**
 * The last blocking question: while it is open, `Mark ready` is not offered and the footer says
 * the one thing left (issue #205); answered in the chat, `Mark ready` arrives, and marks the Spec
 * ready.
 */
export const LastQuestionAnswered: Story = {
  args: { screen: 'lastQuestion' },
  play: async ({ canvasElement }) => {
    await unfold(canvasElement)
    const canvas = within(canvasElement)
    await expect(canvas.queryByRole('button', { name: 'Mark ready' })).toBeNull()
    await expect(canvas.getByText('1 thing left before ready')).toHaveAttribute(
      'title',
      'Still to do:\nthe credit-note question',
    )
    await userEvent.click(canvas.getByRole('button', { name: /Other/ }))
    await userEvent.type(
      await canvas.findByRole('textbox', { name: 'Other' }),
      'Negative rows, marked by a type column.{Enter}',
    )
    await expect(
      canvas.getByText('Negative rows, marked by a type column.', { selector: 'p' }),
    ).toBeVisible()
    const mark = await canvas.findByRole('button', { name: 'Mark ready' })
    mark.focus()
    await userEvent.keyboard('{Enter}')
    await expect(canvas.getByRole('button', { name: 'Rework' })).toBeVisible()
  },
}

/**
 * Screen 5 · ready at revision 2: the status says it, and nothing else — no `frozen` on a
 * section, no line under the head — the picker of the revisions, and Rework at the end of the head.
 */
export const Ready: Story = {
  args: { screen: 'ready', folded: false },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    const panel = canvas.getByRole('region', { name: 'Spec ATL-7' })
    await expect(within(panel).getByRole('img', { name: 'Ready' })).toBeVisible()
    await expect(within(panel).queryByText(/frozen/i)).toBeNull()
    await expect(canvas.queryByRole('textbox', { name: 'Expected outcome' })).toBeNull()
    await expect(canvas.getByRole('button', { name: 'Latest' })).toBeVisible()
    await expect(canvas.getByRole('button', { name: 'Rework' })).toBeVisible()
  },
}

/** Screen 5, with the rework dialog open over the ready Spec, as the brief draws it. */
export const ReworkAsked: Story = {
  args: { screen: 'ready', reworkOpen: true, folded: false },
  play: async () => {
    const page = within(document.body)
    await expect(await page.findByRole('dialog', { name: 'Rework ATL-7' })).toBeVisible()
  },
}

/**
 * Rework, with no reason given: the whole contract copied into revision 3, a draft again whose
 * plan and tasks are stale.
 */
export const ReadyReworked: Story = {
  args: { screen: 'ready' },
  play: async ({ canvasElement }) => {
    await unfold(canvasElement)
    const canvas = within(canvasElement)
    await userEvent.click(canvas.getByRole('button', { name: 'Rework' }))
    const page = within(document.body)
    // The dialog rises into place; what is asked is where it ends.
    const says = await page.findByText(
      'A complete copy becomes revision 3; revision 2 stays as it is.',
    )
    await waitFor(() => expect(says).toBeVisible())
    await userEvent.click(page.getByRole('button', { name: 'Rework' }))
    await waitFor(() => expect(canvas.getByRole('button', { name: 'Latest' })).toBeVisible())
    // The phase's heading says what is to review; no sentence under the head says it again.
    await expect(phaseHeading(canvasElement, /^Plan phase, to review,/)).toBeVisible()
    await expect(canvas.queryByText(/^Every phase to review/)).toBeNull()
  },
}

/**
 * Screen 6 · the draft read from a second Session: the quiet bar with `Take over` under the head;
 * the agent of this Session does not write.
 */
export const Reader: Story = {
  args: { screen: 'reader', folded: false },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await expect(canvas.getByText('« Spec CSV »')).toBeVisible()
    await expect(canvas.getByRole('button', { name: 'Take over' })).toBeVisible()
    await expect(phaseHeading(canvasElement, /^Decompose phase/)).toBeVisible()
  },
}

/** A reader opens the stories, read like every part, then takes the right over. */
export const ReaderTakesOver: Story = {
  args: { screen: 'reader' },
  play: async ({ canvasElement }) => {
    await unfold(canvasElement)
    const canvas = within(canvasElement)
    await expect(canvas.getByRole('list', { name: 'Criteria of S2' })).toBeVisible()
    await expect(canvas.queryByRole('textbox', { name: /^Narrative/ })).toBeNull()
    await userEvent.click(canvas.getByRole('button', { name: 'Take over' }))
    await expect(canvas.queryByText('« Spec CSV »')).toBeNull()
  },
}

/**
 * Screen 8 · after a rework: the headings of Plan and Decompose say they are to review, their
 * parts say so beside their titles, and the plan copied from revision 2 is in the column.
 */
export const StaleAfterRework: Story = {
  args: { screen: 'stale', folded: false },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await expect(canvas.queryByText(/^Every phase to review/)).toBeNull()
    await expect(phaseHeading(canvasElement, /^Plan phase, to review,/)).toBeVisible()
    await expect(phaseHeading(canvasElement, /^Decompose phase, to review,/)).toBeVisible()
    await expect(canvas.getAllByText('to review')[0]).toBeVisible()
    await expect(canvas.queryByRole('button', { name: /things before ready/ })).toBeNull()
  },
}

/**
 * How far the window scrolls sideways: what its content is wider than it by, in pixels. The
 * window is the scroller the row is laid in, as the content area of the application is one.
 */
function sideways(canvasElement: HTMLElement): number {
  const window = canvasElement.querySelector<HTMLElement>('[data-window]')!
  return window.scrollWidth - window.clientWidth
}

/**
 * The row never scrolls sideways (issue #181): folded, while the panel is open, and folded again.
 * Each state is read once the swap has landed, the small frame gone or the panel stowed.
 */
async function neverSideways(canvasElement: HTMLElement): Promise<void> {
  const canvas = within(canvasElement)
  const dock = canvas.getByRole('region', { name: 'Spec ATL-7' })
  const frame = dock.querySelector<HTMLElement>('[data-spec-frame]')!
  const panel = dock.querySelector<HTMLElement>('[data-spec-panel]')!
  await expect(sideways(canvasElement)).toBe(0)
  await unfold(canvasElement)
  await waitFor(() => expect(getComputedStyle(frame).filter).toBe('opacity(0)'))
  await expect(sideways(canvasElement)).toBe(0)
  await userEvent.click(canvas.getByRole('button', { name: 'Fold the Spec' }))
  await waitFor(() => expect(panel).toHaveAttribute('data-stowed'))
  await expect(sideways(canvasElement)).toBe(0)
}

/** A narrow window: the Spec folded, open and folded again, and the row never scrolls sideways. */
export const NarrowWindow: Story = {
  decorators: [
    (Story) => (
      <div data-window className="h-screen w-full max-w-3xl overflow-y-auto">
        <Story />
      </div>
    ),
  ],
  play: async ({ canvasElement }) => neverSideways(canvasElement),
}

/** A wide window: the Spec folded, open and folded again, and the row never scrolls sideways. */
export const WideWindow: Story = {
  decorators: [
    (Story) => (
      <div data-window className="h-screen w-screen overflow-y-auto">
        <Story />
      </div>
    ),
  ],
  play: async ({ canvasElement }) => neverSideways(canvasElement),
}
