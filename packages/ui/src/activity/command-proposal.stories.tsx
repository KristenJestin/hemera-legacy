import type { Meta, StoryObj } from '@storybook/react-vite'
import { expect, fn, userEvent, within } from 'storybook/test'

import { CommandProposal, CommandProposalRecord } from './command-proposal.tsx'
import { COMMAND_TYPES } from './command-type.ts'

/**
 * A command the agent proposes for the catalogue, waiting for the human's answer (D8-11), as the
 * Session's notices list it (issue #237). Once answered it leaves the notices, and the thread's
 * record of it keeps the answer.
 */
const meta = {
  tags: ['autodocs', 'updated'],
  title: 'Blocks/Activity/CommandProposal',
  component: CommandProposal,
  parameters: { layout: 'padded' },
  decorators: [
    (Story) => (
      <div className="w-notices">
        <Story />
      </div>
    ),
  ],
  args: {
    name: 'seed',
    line: './scripts/seed.sh --fixtures login',
    type: 'script',
    folder: './sources/api',
    why: 'The login tests need a seeded database, and I have run this line three times in this Session.',
    onAccept: fn(),
    onDecline: fn(),
  },
  argTypes: {
    name: { control: 'text', description: 'The name it would be kept under.' },
    line: { control: 'text', description: 'The line it would run, exactly as proposed.' },
    type: {
      control: 'select',
      options: COMMAND_TYPES,
      description: 'What the command is for, drawn with its fixed icon (D8-07).',
    },
    folder: { control: 'text', description: 'The folder it would run in.' },
    why: { control: 'text', description: 'Why the agent thinks it is worth keeping.' },
    onAccept: { control: false, description: 'Writes the command to the catalogue.' },
    onDecline: { control: false, description: 'Answers no; nothing is written.' },
  },
} satisfies Meta<typeof CommandProposal>

export default meta

type Story = StoryObj<typeof meta>

/**
 * The agent proposed `seed`; the human has not answered yet. One row: what would be kept, and the
 * two answers as marks (issue #237). "A proposal enters the catalogue only when accepted".
 */
export const Pending: Story = {
  play: async ({ canvasElement, args }) => {
    const canvas = within(canvasElement)
    await expect(canvas.getByText(args.name)).toBeVisible()
    await expect(canvas.getByText(args.line)).toBeVisible()
    await expect(canvas.getByText(args.folder)).toBeVisible()
    // Its title says what accepting does (review of #250); why is under the pointer on the name.
    await expect(canvas.getByText('Add to the catalogue')).toBeVisible()
    await expect(canvas.getByText(args.name)).toHaveAttribute('title', args.why)
    await expect(canvas.queryByText(args.why)).toBeNull()
    await userEvent.click(canvas.getByRole('button', { name: 'Add' }))
    await expect(args.onAccept).toHaveBeenCalledTimes(1)
    await expect(args.onDecline).not.toHaveBeenCalled()
    await userEvent.click(canvas.getByRole('button', { name: 'Decline' }))
    await expect(args.onDecline).toHaveBeenCalledTimes(1)
  },
}

/** At the Workspace root, the card says so, where it says where. */
export const AtTheRoot: Story = {
  args: { name: 'test', line: 'pnpm test', type: 'test', folder: '.' },
  play: async ({ canvasElement }) => {
    await expect(within(canvasElement).getByText('Workspace root')).toBeVisible()
  },
}

/** Decline, then Accept: the quiet answer first and the one that writes last, as in a dialog. */
export const Keyboard: Story = {
  play: async ({ canvasElement, args }) => {
    args.onAccept.mockClear()
    const canvas = within(canvasElement)
    await userEvent.tab()
    await expect(document.activeElement).toBe(canvas.getByRole('button', { name: 'Decline' }))
    await userEvent.tab()
    await expect(document.activeElement).toBe(canvas.getByRole('button', { name: 'Add' }))
    await userEvent.keyboard('{Enter}')
    await expect(args.onAccept).toHaveBeenCalledTimes(1)
  },
}

/**
 * What the thread keeps of a proposal once answered (issue #237): its line with the dot of the
 * answer; opened, the line where it runs and why the agent proposed it.
 */
export const KeptAccepted: Story = {
  render: (args) => <CommandProposalRecord {...args} state="accepted" />,
  play: async ({ canvasElement, args }) => {
    const canvas = within(canvasElement)
    const record = canvas.getByRole('group', {
      name: `Proposed command ${args.name}, added to the catalogue`,
    })
    await expect(within(record).queryByRole('button', { name: /Accept|Decline/ })).toBeNull()
    await userEvent.click(within(record).getByRole('button'))
    await expect(await within(record).findByText(args.why)).toBeVisible()
  },
}

/** Declined: the same line, its dot saying so. */
export const KeptDeclined: Story = {
  render: (args) => <CommandProposalRecord {...args} state="declined" />,
  play: async ({ canvasElement, args }) => {
    await expect(
      within(canvasElement).getByRole('group', { name: `Proposed command ${args.name}, declined` }),
    ).toBeVisible()
  },
}
