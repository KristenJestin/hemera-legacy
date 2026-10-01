import type { Meta, StoryObj } from '@storybook/react-vite'
import { type ReactNode, useEffect, useState } from 'react'
import { expect, fn, screen, userEvent, waitFor, within } from 'storybook/test'

import { Composer } from '../composer/composer.tsx'
import { CommandProposal, CommandProposalRecord } from '../activity/command-proposal.tsx'
import { SetupProposal, SetupProposalRecord } from '../activity/setup-proposal.tsx'
import type { CommandType } from '../activity/command-type.ts'
import { PermissionRecord, PermissionRequest } from '../approval/permission-request.tsx'
import { Button } from '../components/button/button.tsx'
import { TooltipProvider } from '../components/tooltip/tooltip.tsx'
import {
  IconBookmarkPlus,
  IconFlag,
  IconListCheck,
  IconMessageQuestion,
  IconShield,
} from '../icons.ts'
import { AgentText } from '../message/agent-text.tsx'
import { CreateSpecProposal, SpecProposalRecord } from '../spec/create-spec-proposal.tsx'
import type { SpecQuestionView } from '../spec/model.ts'
import { CREDIT_NOTES } from '../spec/spec-fixtures.ts'
import { SpecQuestion, SpecQuestionRecord } from '../spec/spec-question.tsx'
import { type NoticeGroup, SessionNotices } from './session-notices.tsx'
import { TurnLine } from './turn-line.tsx'

/**
 * The Session's notices at the foot of a Session (issue #237): the pill attached to the top edge
 * of the composer, over the row that says what the turn is doing and what it has spent, the
 * thread above it. Everything that waits for a human is in it, grouped by kind.
 *
 * The motion is checked frame by frame against a running Storybook (`Arrival`); the tests play
 * the states.
 */

/** Something waiting, as the page would hand it: its kind and what it is about. */
type Waiting =
  | { id: string; kind: 'permission'; line: string; helper?: string }
  | { id: string; kind: 'proposal'; name: string; line: string; type: CommandType }
  | { id: string; kind: 'spec'; title: string }
  | { id: string; kind: 'question'; question: SpecQuestionView }
  | { id: string; kind: 'setup'; verb: string; subject: string; line?: string }

const ASK: Waiting = {
  id: 'ask',
  kind: 'permission',
  line: 'pnpm --filter @atlas/api vitest run src/invoices/csv.stream.spec.ts --reporter=verbose',
}

const PROPOSED: Waiting[] = [
  { id: 'dev', kind: 'proposal', name: 'dev', line: 'pnpm dev', type: 'serve' },
  { id: 'test', kind: 'proposal', name: 'test', line: 'pnpm test', type: 'test' },
]

const SIX: Waiting[] = [
  ...PROPOSED,
  { id: 'lint', kind: 'proposal', name: 'lint', line: 'pnpm lint', type: 'lint' },
  { id: 'typecheck', kind: 'proposal', name: 'typecheck', line: 'pnpm typecheck', type: 'lint' },
  { id: 'build', kind: 'proposal', name: 'build', line: 'pnpm build', type: 'build' },
  {
    id: 'migrate',
    kind: 'proposal',
    name: 'migrate',
    line: 'pnpm --filter api db:migrate',
    type: 'configure',
  },
]

/** The changes one call of the agent proposed to the Project's setup (#218). */
const SETUP: Waiting[] = [
  { id: 'front', kind: 'setup', verb: 'Add repository', subject: './sources/front' },
  { id: 'web', kind: 'setup', verb: 'Add service', subject: 'web', line: 'pnpm --filter web dev' },
  { id: 'key', kind: 'setup', verb: 'Add variable', subject: 'API_KEY' },
]

const SETUP_WHY = 'The README says how the Project is run, and you asked me to set it up.'

/** The setup's details, as the page hands them: a variable says it is set, never its value. */
function setupDetailsOf(waiting: { verb: string }) {
  return waiting.verb === 'Add variable'
    ? [
        { label: 'Scope', value: 'the Project' },
        { label: 'Value', value: 'set, not shown' },
      ]
    : []
}

const SPEC: Waiting = { id: 'spec', kind: 'spec', title: 'Export the invoices as CSV' }

const QUESTION: Waiting = { id: 'question', kind: 'question', question: CREDIT_NOTES }

const ONCE = [
  { optionId: 'refused', kind: 'reject_once' as const, name: 'Refuse' },
  { optionId: 'allowed', kind: 'allow_once' as const, name: 'Allow once' },
]

/** What answers one thing that waits, as the page draws it for the notices. */
/** What a question was answered with, which the stories read. */
const told = fn()

function Answer({
  waiting,
  onAnswer,
}: {
  waiting: Waiting
  onAnswer: (id: string) => void
}): ReactNode {
  const answer = (): void => onAnswer(waiting.id)
  switch (waiting.kind) {
    case 'permission':
      return (
        <PermissionRequest
          toolName="commands_run"
          label="Run command"
          subject={waiting.line}
          parameters={[{ label: 'In', value: 'api', repository: { path: 'api', icon: 'server' } }]}
          command={waiting.line}
          options={ONCE}
          helper={waiting.helper}
          onDecide={answer}
        />
      )
    case 'proposal':
      return (
        <CommandProposal
          name={waiting.name}
          line={waiting.line}
          type={waiting.type}
          folder="."
          why="The Project's package.json declares it."
          onAccept={answer}
          onDecline={answer}
        />
      )
    case 'spec':
      return (
        <CreateSpecProposal
          title={waiting.title}
          type="feature"
          onCreate={answer}
          onDecline={answer}
        />
      )
    case 'setup':
      return (
        <SetupProposal
          verb={waiting.verb}
          subject={waiting.subject}
          line={waiting.line}
          details={setupDetailsOf(waiting)}
          why={SETUP_WHY}
          onAccept={answer}
          onDecline={answer}
        />
      )
    case 'question':
      return (
        <SpecQuestion
          question={waiting.question}
          onAnswer={(given) => {
            told(given)
            answer()
          }}
          bare
        />
      )
  }
}

/** What the thread keeps of one thing that waited: its record, answered or not. */
function Kept({ waiting, answered }: { waiting: Waiting; answered: boolean }): ReactNode {
  switch (waiting.kind) {
    case 'permission':
      return (
        <PermissionRecord
          toolName="commands_run"
          label="Run command"
          subject={waiting.line}
          command={waiting.line}
          standing={answered ? 'allowed' : 'pending'}
          decision={answered ? { answer: 'Allow once', at: '10:42' } : undefined}
        />
      )
    case 'proposal':
      return (
        <CommandProposalRecord
          name={waiting.name}
          line={waiting.line}
          type={waiting.type}
          folder="."
          why="The Project's package.json declares it."
          state={answered ? 'accepted' : 'pending'}
        />
      )
    case 'spec':
      return (
        <SpecProposalRecord
          title={waiting.title}
          type="feature"
          state={answered ? 'created' : 'proposed'}
          specKey={answered ? 'ATL-7' : undefined}
        />
      )
    case 'setup':
      return (
        <SetupProposalRecord
          verb={waiting.verb}
          subject={waiting.subject}
          line={waiting.line}
          details={setupDetailsOf(waiting)}
          why={SETUP_WHY}
          state={answered ? 'accepted' : 'pending'}
        />
      )
    case 'question':
      return (
        <SpecQuestionRecord
          question={
            answered
              ? { ...waiting.question, answer: { optionId: waiting.question.options[0]?.id } }
              : waiting.question
          }
        />
      )
  }
}

function groupsOf(
  waiting: readonly Waiting[],
  onAnswer: (id: string) => void,
  onAcceptAll: (kind: Waiting['kind']) => void,
): NoticeGroup[] {
  const of = (kind: Waiting['kind']) =>
    waiting
      .filter((one) => one.kind === kind)
      .map((one) => ({ id: one.id, content: <Answer waiting={one} onAnswer={onAnswer} /> }))
  const proposals = of('proposal')
  const setup = of('setup')
  return [
    {
      kind: 'permission',
      label: 'Permissions',
      title: 'Run once',
      icon: <IconShield size="md" aria-hidden="true" />,
      urgent: true,
      tone: 'warning',
      items: of('permission'),
    },
    {
      kind: 'question',
      label: 'Questions',
      title: 'Questions',
      tone: 'info',
      icon: <IconMessageQuestion size="md" aria-hidden="true" />,
      items: of('question'),
    },
    {
      kind: 'spec',
      label: 'Spec proposed',
      title: 'Start a Spec',
      tone: 'success',
      icon: <IconFlag size="md" aria-hidden="true" />,
      items: of('spec'),
    },
    {
      kind: 'proposal',
      label: 'Proposed commands',
      title: 'Add to the catalogue',
      tone: 'primary',
      icon: <IconBookmarkPlus size="md" aria-hidden="true" />,
      items: proposals,
      actions:
        proposals.length > 1 ? (
          <Button variant="link" size="sm" onClick={() => onAcceptAll('proposal')}>
            Add all
          </Button>
        ) : undefined,
    },
    {
      kind: 'setup',
      label: 'Setup changes',
      title: 'Set up the Project',
      tone: 'build',
      icon: <IconListCheck size="md" aria-hidden="true" />,
      items: setup,
      actions:
        setup.length > 1 ? (
          <Button variant="link" size="sm" onClick={() => onAcceptAll('setup')}>
            Accept all
          </Button>
        ) : undefined,
    },
  ]
}

const SAID = [
  'I read how the export streams its rows and where the currency is lost.',
  'The join on `invoice_lines` drops the rows whose currency is null; the stream then writes an empty column for them.',
  'I will run the CSV stream tests on their own before I change anything.',
]

/** One step of what arrives: after how long, and what waits from then on. */
interface Step {
  at: number
  waiting: Waiting[]
}

interface BenchProps {
  /** What waits as the Session is drawn. */
  waiting: Waiting[]
  /** What arrives or leaves after it, in order: the motion is judged on it. */
  script?: Step[] | undefined
  defaultOpen?: boolean | undefined
  onAnswer: (id: string) => void
}

/** The foot of a Session: the thread's end, the row above the box, the box, and the pill. */
function Bench({ waiting: first, script = [], defaultOpen, onAnswer }: BenchProps): ReactNode {
  const [waiting, setWaiting] = useState(first)
  // Everything that was ever asked, which the thread keeps a record of, answered or not.
  const [asked, setAsked] = useState(first)
  useEffect(() => {
    const timers = script.map((step) =>
      window.setTimeout(() => {
        setWaiting(step.waiting)
        setAsked((before) => [
          ...before,
          ...step.waiting.filter((one) => !before.some((known) => known.id === one.id)),
        ])
      }, step.at),
    )
    return () => timers.forEach((timer) => window.clearTimeout(timer))
  }, [])
  const answer = (id: string): void => {
    onAnswer(id)
    setWaiting((before) => before.filter((one) => one.id !== id))
  }
  const acceptAll = (kind: Waiting['kind']): void => {
    setWaiting((before) => before.filter((one) => one.kind !== kind))
  }
  return (
    <TooltipProvider>
      <div className="flex h-screen flex-col bg-background text-foreground">
        <div className="mx-auto flex w-full max-w-3xl flex-1 flex-col justify-end gap-3 px-6">
          {SAID.map((text) => (
            <AgentText key={text} text={text} />
          ))}
          <div role="log" aria-label="Records" className="flex flex-col gap-1">
            {asked.map((one) => (
              <Kept
                key={one.id}
                waiting={one}
                answered={!waiting.some((still) => still.id === one.id)}
              />
            ))}
          </div>
        </div>
        <div className="mx-auto flex w-full max-w-3xl flex-col gap-2 px-6 pt-4 pb-4">
          <TurnLine
            activity={{ state: 'waiting' }}
            usage={{ used: 12400, size: 200000, cost: { amount: 0.42, currency: 'EUR' } }}
            notched={waiting.length > 0}
          />
          <Composer
            value=""
            onValueChange={() => undefined}
            files={[]}
            onFilesChange={() => undefined}
            onSearchFiles={() => Promise.resolve([])}
            variant="inline"
            action="Send"
            placeholder="Say something to claude…"
            onSend={() => Promise.resolve(null)}
            running
            notices={
              <SessionNotices
                groups={groupsOf(waiting, answer, acceptAll)}
                defaultOpen={defaultOpen}
              />
            }
          />
        </div>
      </div>
    </TooltipProvider>
  )
}

const meta = {
  title: 'Blocks/Session/SessionNotices',
  component: Bench,
  tags: ['autodocs'],
  parameters: { layout: 'fullscreen' },
  args: { waiting: [ASK], onAnswer: fn() },
} satisfies Meta<typeof Bench>

export default meta

type Story = StoryObj<typeof meta>

const PILL = /^Waiting for your answer/

/** The pill's own box and the composer's, as the page lays them. */
function boxesOf(canvasElement: HTMLElement) {
  const canvas = within(canvasElement)
  const pill = canvas.getByRole('button', { name: PILL }).getBoundingClientRect()
  const field = canvas.getByRole('textbox', { name: 'Say something to claude…' })
  // The frame is the box's rim: the first ancestor of the field that wears a border all round.
  let rim: HTMLElement | null = field
  while (rim !== null && !rim.className.includes('bg-surface-rim')) rim = rim.parentElement
  if (rim === null) throw new Error('the composer has no rim')
  return { pill, box: rim.getBoundingClientRect() }
}

/**
 * Closed, as it always opens: the kind's mark and its count on the composer's top edge, and not a
 * word of what waits until it is pressed.
 */
export const Closed: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    const pill = await canvas.findByRole('button', {
      name: 'Waiting for your answer: Permissions 1',
    })
    expect(pill).toHaveTextContent('1')
    // In the warning's tone, never the neutral chip: something waits.
    expect(pill.className).toContain('border-warning')
    // What answers it is not on the page until the pill is pressed; the thread has its record.
    expect(screen.queryByRole('button', { name: 'Allow once' })).toBeNull()
    expect(canvas.getByRole('group', { name: 'Permission for Run command, waiting' })).toBeVisible()
    expect(screen.queryByRole('dialog')).toBeNull()
    // Over the top edge of the box, detached from it by a clear gap, centred on it, once it has
    // risen (review of #250).
    await waitFor(() => {
      const { pill: face, box } = boxesOf(canvasElement)
      expect(Math.abs(box.top - face.bottom - 10)).toBeLessThan(1)
      expect(Math.abs(face.left + face.width / 2 - (box.left + box.width / 2))).toBeLessThan(1)
    })
  },
}

/** Pressed, it opens above itself on what waits, grouped by kind, each with its answer. */
export const Opened: Story = {
  args: { waiting: [ASK, ...PROPOSED] },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    const pill = await canvas.findByRole('button', {
      name: 'Waiting for your answer: Permissions 1, Proposed commands 2',
    })
    await userEvent.click(pill)
    const panel = await screen.findByRole('dialog', { name: 'Waiting for your answer' })
    const groups = within(panel).getAllByRole('region')
    expect(groups.map((group) => group.getAttribute('aria-label'))).toEqual([
      'Permissions',
      'Proposed commands',
    ])
    await waitFor(() => {
      expect(within(panel).getByText(/csv\.stream/)).toBeVisible()
    })
    // Above the pill, never over it.
    await waitFor(() => {
      expect(panel.getBoundingClientRect().bottom).toBeLessThanOrEqual(
        pill.getBoundingClientRect().top,
      )
    })
    // The focus stays on the pill, and Tab goes on into the panel: nothing is picked for the reader.
    await expect(pill).toHaveFocus()
    await userEvent.tab()
    await waitFor(() => {
      expect(panel.contains(document.activeElement)).toBe(true)
    })
  },
}

/** The last thing answered: the item leaves, and the pill goes back behind the composer. */
export const LastAnswered: Story = {
  play: async ({ canvasElement, args }) => {
    const canvas = within(canvasElement)
    await userEvent.click(await canvas.findByRole('button', { name: PILL }))
    const panel = await screen.findByRole('dialog', { name: 'Waiting for your answer' })
    await userEvent.click(within(panel).getByRole('button', { name: 'Allow once' }))
    expect(args.onAnswer).toHaveBeenCalledWith(ASK.id)
    await waitFor(() => {
      expect(canvas.queryByRole('button', { name: PILL })).toBeNull()
    })
    await waitFor(() => {
      expect(screen.queryByRole('dialog')).toBeNull()
    })
  },
}

/** Nothing waits: there is no pill at all, and the row above the box is whole. */
export const NothingWaits: Story = {
  args: { waiting: [] },
  play: async ({ canvasElement }) => {
    expect(within(canvasElement).queryByRole('button', { name: PILL })).toBeNull()
  },
}

/**
 * What the motion is judged on: a permission arrives and the pill rises out of the composer and
 * pops; two proposals join it while it is closed, and it pops again without opening; then all is
 * answered and it slides back behind the composer.
 */
export const Arrival: Story = {
  args: {
    waiting: [],
    script: [
      { at: 800, waiting: [ASK] },
      { at: 2600, waiting: [ASK, ...PROPOSED] },
      { at: 4400, waiting: [] },
    ],
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await waitFor(
      () => {
        expect(canvas.getByRole('button', { name: /Proposed commands 2$/ })).toBeVisible()
      },
      { timeout: 4000 },
    )
    // A new arrival while closed does not open it.
    expect(screen.queryByRole('dialog')).toBeNull()
    await waitFor(
      () => {
        expect(canvas.queryByRole('button', { name: PILL })).toBeNull()
      },
      { timeout: 4000 },
    )
  },
}

/**
 * Everything at once (issue #237): a permission, a question, the Spec the agent proposes and six
 * commands — one mark and one count a kind on the pill, one group a kind inside, the permission
 * first; Add all answers the six, and the rest stays.
 */
export const EveryKind: Story = {
  args: { waiting: [ASK, QUESTION, SPEC, ...SIX] },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    const pill = await canvas.findByRole('button', {
      name: 'Waiting for your answer: Permissions 1, Questions 1, Spec proposed 1, Proposed commands 6',
    })
    await expect(pill).toHaveTextContent('1116')
    await userEvent.click(pill)
    const panel = await screen.findByRole('dialog', { name: 'Waiting for your answer' })
    await expect(
      within(panel)
        .getAllByRole('region')
        .map((group) => group.getAttribute('aria-label')),
    ).toEqual(['Permissions', 'Questions', 'Spec proposed', 'Proposed commands'])
    await expect(within(panel).getAllByRole('group', { name: /^Proposed command / })).toHaveLength(
      6,
    )
    await userEvent.click(within(panel).getByRole('button', { name: 'Add all' }))
    await waitFor(() => {
      expect(within(panel).queryByRole('region', { name: 'Proposed commands' })).toBeNull()
    })
    // Still open, on what is left: answering is not dismissing.
    await expect(screen.getByRole('dialog', { name: 'Waiting for your answer' })).toBeVisible()
    await expect(
      canvas.getByRole('button', {
        name: 'Waiting for your answer: Permissions 1, Questions 1, Spec proposed 1',
      }),
    ).toBeVisible()
  },
}

/**
 * What the thread-record motion is judged on: two proposals wait, the notices are open, and one is
 * accepted — its row folds out of the notices by its height, its record in the thread turns its
 * dot, and nothing else on the page moves.
 */
export const AnsweredInPlace: Story = {
  args: { waiting: PROPOSED, defaultOpen: true },
  play: async ({ canvasElement, args }) => {
    const canvas = within(canvasElement)
    const panel = await screen.findByRole('dialog', { name: 'Waiting for your answer' })
    const records = canvas.getByRole('log', { name: 'Records' })
    const before = records.getBoundingClientRect()
    const dev = within(panel).getByRole('group', { name: 'Proposed command dev' })
    await userEvent.click(within(dev).getByRole('button', { name: 'Add' }))
    expect(args.onAnswer).toHaveBeenCalledWith('dev')
    await waitFor(() => {
      expect(within(panel).queryByRole('group', { name: 'Proposed command dev' })).toBeNull()
    })
    await expect(
      canvas.getByRole('group', { name: 'Proposed command dev, added to the catalogue' }),
    ).toBeVisible()
    await expect(
      canvas.getByRole('group', { name: 'Proposed command test, waiting' }),
    ).toBeVisible()
    // The records stand where they stood: the answer changed a dot, not the thread.
    expect(records.getBoundingClientRect().top).toBe(before.top)
    expect(records.getBoundingClientRect().height).toBe(before.height)
  },
}

/**
 * Open on several kinds at once (review of #250): one card anatomy for every kind — its mark and
 * what accepting does, the line whole and where, Refuse and the primary answer in the same place —
 * under one head a kind, with the same rule and room between every two groups.
 */
export const OpenOnSeveralKinds: Story = {
  args: {
    waiting: [ASK, ...SIX.slice(0, 3), QUESTION],
    defaultOpen: true,
  },
  play: async () => {
    const panel = await screen.findByRole('dialog', { name: 'Waiting for your answer' })
    // One row an item, each after its kind's tile: the kind is said nowhere else.
    await expect(within(panel).queryByText('Add to the catalogue')).toBeNull()
    await expect(within(panel).queryByText('Run once')).toBeNull()
    await expect(within(panel).getAllByRole('button', { name: 'Add' })).toHaveLength(3)
    await expect(within(panel).getAllByRole('button', { name: 'Decline' })).toHaveLength(3)
    await expect(within(panel).getByRole('button', { name: 'Add all' })).toBeVisible()
    // The whole line is one press away, unfolding in place.
    const row = within(panel).getByRole('group', { name: 'Permission for Run command' })
    await userEvent.click(within(row).getByRole('button', { name: 'Show the whole line' }))
    await expect(await within(row).findByText('api')).toBeVisible()
  },
}

/**
 * A question answered in the reader's own words (review of #250): `Other…` turns into its field in
 * place, at its own height; typing in it picks no choice and closes nothing, Escape gives `Other…`
 * back with the panel still open, and Enter sends the words — the question folds away with them.
 */
export const AnsweredInOwnWords: Story = {
  args: { waiting: [QUESTION, ...PROPOSED], defaultOpen: true },
  play: async ({ args }) => {
    told.mockClear()
    const panel = await screen.findByRole('dialog', { name: 'Waiting for your answer' })
    const proposals = within(panel).getByRole('region', { name: 'Proposed commands' })
    const question = within(panel).getByRole('region', { name: 'Questions' })
    // Read against the question's own top: the panel may scroll the field into view.
    const gap = (): number =>
      proposals.getBoundingClientRect().top - question.getBoundingClientRect().top
    const under = gap()
    await userEvent.click(within(panel).getByRole('button', { name: /Other/ }))
    const field = await within(panel).findByRole('textbox', { name: 'Other' })
    await expect(field).toHaveFocus()
    // Nothing under the question moved as `Other…` turned into its field.
    await expect(gap()).toBe(under)
    // Letters are the field's: B picks no choice.
    await userEvent.type(field, 'B')
    await expect(told).not.toHaveBeenCalled()
    // Escape gives `Other…` back, and the panel stays open.
    await userEvent.keyboard('{Escape}')
    await waitFor(() => {
      expect(within(panel).queryByRole('textbox', { name: 'Other' })).toBeNull()
    })
    await expect(screen.getByRole('dialog', { name: 'Waiting for your answer' })).toBeVisible()
    await userEvent.click(within(panel).getByRole('button', { name: /Other/ }))
    // What was typed before Escape is still there: nothing typed is lost.
    const again = await within(panel).findByRole('textbox', { name: 'Other' })
    await expect(again).toHaveValue('B')
    await userEvent.clear(again)
    await userEvent.type(again, 'One file a month{Enter}')
    await expect(told).toHaveBeenCalledWith({ text: 'One file a month' })
    await expect(args.onAnswer).toHaveBeenCalledWith(QUESTION.id)
    await waitFor(() => {
      expect(within(panel).queryByRole('region', { name: 'Questions' })).toBeNull()
    })
    // The panel is still open, on what is left.
    await expect(screen.getByRole('dialog', { name: 'Waiting for your answer' })).toBeVisible()
  },
}

/**
 * The Project's setup, proposed by the agent in one call (#218): its own tile and count on the
 * pill, a row a change inside, and Accept all as the group's last row. Accepted, the three leave
 * the notices together, and their records in the thread turn their dots; what else waits stays.
 */
export const SetupChanges: Story = {
  args: { waiting: [ASK, ...SETUP] },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    const pill = await canvas.findByRole('button', {
      name: 'Waiting for your answer: Permissions 1, Setup changes 3',
    })
    await userEvent.click(pill)
    const panel = await screen.findByRole('dialog', { name: 'Waiting for your answer' })
    await expect(
      within(panel)
        .getAllByRole('region')
        .map((group) => group.getAttribute('aria-label')),
    ).toEqual(['Permissions', 'Setup changes'])
    const setup = within(panel).getByRole('region', { name: 'Setup changes' })
    await expect(within(setup).getAllByRole('button', { name: 'Accept' })).toHaveLength(3)
    // Unfolded, the change says what accepting it does, in the name's place.
    const web = within(setup).getByRole('group', { name: 'Proposed change Add service web' })
    await userEvent.click(within(web).getByRole('button', { name: 'Show the whole line' }))
    // The title fades in over the name: read once it has.
    await waitFor(() => {
      expect(within(web).getByText('Add service')).toBeVisible()
    })
    await userEvent.click(within(setup).getByRole('button', { name: 'Accept all' }))
    await waitFor(() => {
      expect(within(panel).queryByRole('region', { name: 'Setup changes' })).toBeNull()
    })
    await expect(
      canvas.getByRole('group', { name: 'Proposed change Add variable API_KEY, applied' }),
    ).toBeVisible()
    await expect(
      canvas.getByRole('button', { name: 'Waiting for your answer: Permissions 1' }),
    ).toBeVisible()
  },
}

/** A helper's question (issue #77): among its build's notices, its avatar leading the row. */
export const HelperAsks: Story = {
  args: {
    waiting: [
      ASK,
      {
        id: 'helper-ask',
        kind: 'permission',
        line: 'pnpm --filter @atlas/api vitest run src/reader.spec.ts',
        helper: 'Write the reader',
      },
    ],
    defaultOpen: true,
  },
  play: async () => {
    const panel = await screen.findByRole('dialog', { name: 'Waiting for your answer' })
    const asked = within(panel).getByRole('group', {
      name: 'Permission for Run command, asked by Write the reader',
    })
    await expect(within(asked).getByText('W')).toBeVisible()
    // The main agent's own question names nobody.
    await expect(
      within(panel).getByRole('group', { name: 'Permission for Run command' }),
    ).toBeVisible()
  },
}
