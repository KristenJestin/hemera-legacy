import type { Meta, StoryObj } from '@storybook/react-vite'
import { expect, fn, screen, userEvent, waitFor, within } from 'storybook/test'

import { Button } from '../components/button/button.tsx'
import { IconListCheck } from '../icons.ts'
import { SessionNotices } from '../session/session-notices.tsx'
import { CallOutcome, CallOutcomeDetails } from './call-outcome.tsx'
import { HemeraToolCall } from './hemera-tool-call.tsx'
import { SetupProposal, SetupProposalRecord } from './setup-proposal.tsx'

/**
 * A change to the Project's setup the agent proposes, waiting for the human's answer (#218), as
 * the Session's notices list it: one row a change, after the setup's own tile — its verb once
 * unfolded, "Add service", "Add variable" — Decline and Accept, and Accept all for the changes
 * waiting together. Once answered it leaves the notices; the thread keeps it on the call that
 * proposed it, a mark on its line and, opened, each change with the dot of its answer.
 *
 * A variable's value is never one of the things said: the row says it would be set, and nothing
 * more (Decided 2 of #218).
 */

/** What a value would look like if it leaked: none of the stories may ever draw it. */
const SECRET = 'postgres://atlas:hunter2@db.internal/atlas'

const SERVICE = {
  verb: 'Add service',
  subject: 'web',
  line: 'pnpm --filter web dev',
  details: [
    { label: 'Runs in', value: './sources/web' },
    { label: 'Scope', value: 'one per Workspace' },
    { label: 'Portless', value: 'atlas-web' },
  ],
  why: 'The README starts the front end this way, and every Workspace needs its own server.',
}

const VARIABLE = {
  verb: 'Add variable',
  subject: 'DATABASE_URL',
  line: undefined,
  details: [
    { label: 'Scope', value: 'the Project' },
    { label: 'Value', value: 'set, not shown' },
  ],
  why: 'The API reads it at start, and you gave it to me above.',
}

const REPOSITORY = {
  verb: 'Add repository',
  subject: './sources/web',
  mono: true,
  line: undefined,
  details: [],
  why: 'The front end lives in its own repository beside the API.',
}

const meta = {
  tags: ['autodocs', 'new'],
  title: 'Blocks/Activity/SetupProposal',
  component: SetupProposal,
  parameters: { layout: 'padded' },
  decorators: [
    (Story) => (
      <div className="w-notices">
        <Story />
      </div>
    ),
  ],
  args: { ...SERVICE, onAccept: fn(), onDecline: fn() },
  argTypes: {
    verb: { control: 'text', description: 'What accepting it does, said once unfolded.' },
    subject: { control: 'text', description: 'What it is about: a name, a path.' },
    mono: { control: 'boolean', description: 'Whether the subject is a path.' },
    line: { control: 'text', description: 'The line a command or a step would run.' },
    details: { control: 'object', description: 'Every other field it would write.' },
    why: { control: 'text', description: 'Why the agent proposes it.' },
    onAccept: { control: false, description: 'Applies the change.' },
    onDecline: { control: false, description: 'Answers no; nothing changes.' },
  },
} satisfies Meta<typeof SetupProposal>

export default meta

type Story = StoryObj<typeof meta>

/**
 * The agent proposed a service; the human has not answered yet. One row: its name, Decline and
 * Accept; the chevron unfolds its verb in the name's place, its line and where it runs.
 * "Every change is a proposal the user accepts".
 */
export const Pending: Story = {
  play: async ({ canvasElement, args }) => {
    args.onAccept.mockClear()
    args.onDecline.mockClear()
    const canvas = within(canvasElement)
    const row = canvas.getByRole('group', { name: 'Proposed change Add service web' })
    await expect(within(row).getByText('web')).toHaveAttribute('title', args.why)
    await expect(within(row).queryByText('Add service')).toBeNull()
    await userEvent.click(within(row).getByRole('button', { name: 'Show the whole line' }))
    await expect(await within(row).findByText('Add service')).toBeVisible()
    await expect(await within(row).findByText(SERVICE.line)).toBeVisible()
    await expect(within(row).getByText('atlas-web')).toBeVisible()
    await userEvent.click(within(row).getByRole('button', { name: 'Accept' }))
    await expect(args.onAccept).toHaveBeenCalledTimes(1)
    await expect(args.onDecline).not.toHaveBeenCalled()
    await userEvent.click(within(row).getByRole('button', { name: 'Decline' }))
    await expect(args.onDecline).toHaveBeenCalledTimes(1)
  },
}

/** A variable: its name and that it would be set, never its value (Decided 2 of #218). */
export const Variable: Story = {
  args: VARIABLE,
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await userEvent.click(canvas.getByRole('button', { name: 'Show the whole line' }))
    await expect(await canvas.findByText('Add variable')).toBeVisible()
    await expect(canvas.getByText('set, not shown')).toBeVisible()
    await expect(canvasElement.textContent).not.toContain(SECRET)
  },
}

/** A path, set in the terminal's letters, with nothing more to unfold. */
export const Repository: Story = {
  args: REPOSITORY,
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await expect(canvas.getByText('./sources/web')).toBeVisible()
    await expect(canvas.queryByRole('button', { name: 'Show the whole line' })).toBeNull()
  },
}

/** Decline, then Accept: the quiet answer first and the one that writes last. */
export const Keyboard: Story = {
  play: async ({ canvasElement, args }) => {
    args.onAccept.mockClear()
    const canvas = within(canvasElement)
    await userEvent.tab()
    await expect(document.activeElement).toBe(canvas.getByRole('button', { name: 'Decline' }))
    await userEvent.tab()
    await expect(document.activeElement).toBe(canvas.getByRole('button', { name: 'Accept' }))
    await userEvent.keyboard('{Enter}')
    await expect(args.onAccept).toHaveBeenCalledTimes(1)
  },
}

const acceptAll = fn()

/**
 * In the notices (Decided 1 of #218): the three changes one call proposed, after the setup's tile
 * in its own tone, and Accept all as the group's last row. "Several changes proposed together are
 * accepted in one press".
 */
export const InTheNotices: Story = {
  decorators: [
    (Story) => (
      <div className="flex h-screen items-end justify-center">
        <Story />
      </div>
    ),
  ],
  render: (args) => (
    <SessionNotices
      defaultOpen
      groups={[
        {
          kind: 'setup',
          label: 'Setup changes',
          title: 'Set up the Project',
          tone: 'build',
          icon: <IconListCheck size="md" aria-hidden="true" />,
          items: [REPOSITORY, SERVICE, VARIABLE].map((change) => ({
            id: change.subject,
            content: (
              <SetupProposal {...change} onAccept={args.onAccept} onDecline={args.onDecline} />
            ),
          })),
          actions: (
            <Button variant="link" size="sm" onClick={acceptAll}>
              Accept all
            </Button>
          ),
        },
      ]}
    />
  ),
  play: async ({ canvasElement }) => {
    acceptAll.mockClear()
    const pill = within(canvasElement).getByRole('button', {
      name: 'Waiting for your answer: Setup changes 3',
    })
    await expect(pill).toHaveTextContent('3')
    const panel = await screen.findByRole('dialog', { name: 'Waiting for your answer' })
    const group = within(panel).getByRole('region', { name: 'Setup changes' })
    await expect(within(group).getAllByRole('group', { name: /^Proposed change / })).toHaveLength(3)
    // The kind is its tile, in a tone of its own, said under the pointer and nowhere else.
    const tiles = group.querySelectorAll('[title="Set up the Project"]')
    await expect(tiles).toHaveLength(3)
    await expect(tiles[0]?.className).toContain('bg-mission-build-muted')
    await expect(within(panel).queryByText('Set up the Project')).toBeNull()
    await userEvent.click(within(group).getByRole('button', { name: 'Accept all' }))
    await expect(acceptAll).toHaveBeenCalledTimes(1)
    await expect(panel.textContent).not.toContain(SECRET)
  },
}

/**
 * In the thread: one quiet entry, the call that proposed them. Its line carries the setup's mark
 * in the tone of what was answered; opened, each change with the dot of its answer, and why.
 */
export const KeptOnTheCall: Story = {
  decorators: [
    (Story) => (
      <div className="w-full max-w-3xl">
        <Story />
      </div>
    ),
  ],
  render: () => (
    <HemeraToolCall
      tool="setup_propose"
      label="Propose setup"
      mark="propose-setup"
      subject={{ text: '3 changes' }}
      status="completed"
      summary="proposed 3 change(s) to the setup of Atlas"
      outcome={<CallOutcome setup={['accepted', 'accepted', 'pending']} />}
    >
      <CallOutcomeDetails
        setup={{
          why: SERVICE.why,
          changes: [
            {
              id: 'repository',
              verb: 'Add repository',
              subject: './sources/web',
              state: 'accepted',
            },
            { id: 'service', verb: 'Add service', subject: 'web', state: 'accepted' },
            { id: 'variable', verb: 'Add variable', subject: 'DATABASE_URL', state: 'pending' },
          ],
        }}
      />
    </HemeraToolCall>
  ),
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    const call = canvas.getByRole('button', { name: /^Hemera Propose setup/ })
    await expect(
      within(call).getByRole('img', { name: '1 of 3 changes waiting' }),
    ).toBeInTheDocument()
    await userEvent.click(call)
    await waitFor(() => {
      expect(canvas.getByText('DATABASE_URL')).toBeVisible()
    })
    await expect(canvas.getAllByRole('img', { name: 'applied' })).toHaveLength(2)
    await expect(canvas.getByRole('img', { name: 'waiting' })).toBeInTheDocument()
    // No card, no button: it is answered among the notices, never here.
    await expect(canvas.queryByRole('button', { name: /Accept|Decline/ })).toBeNull()
    await expect(canvasElement.textContent).not.toContain(SECRET)
  },
}

/** Every change answered, all of them applied: the mark says so in the success tone. */
export const KeptAllApplied: Story = {
  render: () => <CallOutcome setup={['accepted', 'accepted']} />,
  play: async ({ canvasElement }) => {
    const mark = within(canvasElement).getByRole('img', { name: 'applied' })
    await expect(mark.className).toContain('text-success-muted-foreground')
  },
}

/**
 * A change whose call the thread cannot find keeps a quiet line of its own: the setup's mark, the
 * dot of its answer, its verb and what it is about; opened, what it would write and why.
 */
export const KeptAlone: Story = {
  render: () => <SetupProposalRecord {...VARIABLE} state="declined" />,
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    const record = canvas.getByRole('group', {
      name: 'Proposed change Add variable DATABASE_URL, declined',
    })
    await expect(within(record).queryByRole('button', { name: /Accept|Decline/ })).toBeNull()
    await userEvent.click(within(record).getByRole('button'))
    await expect(await within(record).findByText(VARIABLE.why)).toBeVisible()
    await expect(within(record).getByText('set, not shown')).toBeVisible()
    await expect(canvasElement.textContent).not.toContain(SECRET)
  },
}
