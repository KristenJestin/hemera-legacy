import type { Meta, StoryObj } from '@storybook/react-vite'
import { expect, fn, userEvent, within } from 'storybook/test'

import { SetupProposal } from './setup-proposal.tsx'

/**
 * A change to the Project's setup the agent proposes, and the human's answer (#218).
 *
 * The scenario "Every change is a proposal the user accepts": the agent proposes a repository, a
 * service and a variable in one call — three cards, the last of which offers Accept all — and
 * the user accepts or declines each. A variable's card says it would be set, never its value.
 */
const meta = {
  tags: ['autodocs', 'new'],
  title: 'Blocks/Activity/SetupProposal',
  component: SetupProposal,
  parameters: { layout: 'padded' },
  args: {
    title: 'Add the command dev',
    details: [
      { label: 'Type', value: 'serve' },
      { label: 'Line', value: 'pnpm --filter web dev' },
      { label: 'Runs in', value: './sources/web' },
      { label: 'Scope', value: 'one per Workspace' },
      { label: 'Portless', value: 'atlas-web' },
      { label: 'Runs when Hemera opens', value: 'yes' },
    ],
    why: 'The README starts the front end this way, and every Workspace needs its own server.',
    state: 'pending',
    onAccept: fn(),
    onDecline: fn(),
    onAcceptAll: fn(),
  },
  argTypes: {
    title: { control: 'text', description: 'The change in one line.' },
    details: { control: 'object', description: 'Every field it would write.' },
    why: { control: 'text', description: 'Why the agent proposes it.' },
    state: {
      control: 'inline-radio',
      options: ['pending', 'accepted', 'declined'],
      description: 'Waiting for the human, or answered.',
    },
    waiting: {
      control: 'number',
      description: 'How many changes of its batch still wait; Accept all shows above one.',
    },
    onAccept: { control: false, description: 'Applies the change.' },
    onDecline: { control: false, description: 'Answers no; nothing changes.' },
    onAcceptAll: { control: false, description: 'Accepts every change of the batch.' },
    className: { control: false, description: 'Where the block sits; never how it looks.' },
  },
} satisfies Meta<typeof SetupProposal>

export default meta

type Story = StoryObj<typeof meta>

type StoryContext = Parameters<NonNullable<Story['play']>>[0]

/** A pending change offers both answers; an answered one says which, and offers nothing. */
async function everyChangeIsAProposalTheUserAccepts({ canvasElement, args }: StoryContext) {
  // "Every change is a proposal the user accepts"
  const canvas = within(canvasElement)
  await expect(canvas.getByText(args.title)).toBeVisible()
  await expect(canvas.getByText(args.why)).toBeVisible()
  await Promise.all(
    args.details.map(async (detail) => await expect(canvas.getByText(detail.value)).toBeVisible()),
  )
  if (args.state === 'pending') {
    args.onAccept?.mockClear()
    args.onDecline?.mockClear()
    await userEvent.click(canvas.getByRole('button', { name: 'Accept' }))
    await expect(args.onAccept).toHaveBeenCalledTimes(1)
    await expect(args.onDecline).not.toHaveBeenCalled()
    await userEvent.click(canvas.getByRole('button', { name: 'Decline' }))
    await expect(args.onDecline).toHaveBeenCalledTimes(1)
    return
  }
  await expect(canvas.getByText(args.state === 'accepted' ? 'Applied' : 'Declined')).toBeVisible()
  await expect(canvas.queryByRole('button')).toBeNull()
}

/** The agent proposed a service; the human has not answered yet. */
export const Pending: Story = {
  play: everyChangeIsAProposalTheUserAccepts,
}

/** Accepted: the command is in the catalogue now, written by the settings' own use case. */
export const Accepted: Story = {
  args: { state: 'accepted' },
  play: everyChangeIsAProposalTheUserAccepts,
}

/** Declined: nothing of the setup changed, and the card keeps the answer. */
export const Declined: Story = {
  args: {
    title: 'Clean up the Workspace spike-cache',
    details: [{ label: 'Workspace', value: 'spike-cache' }],
    why: 'Nothing has run in it for a week and its branch is merged.',
    state: 'declined',
  },
  play: everyChangeIsAProposalTheUserAccepts,
}

/** A variable: the card says it would be set, and never shows its value (Decided 2 of #218). */
export const Variable: Story = {
  args: {
    title: 'Set the variable DATABASE_URL',
    details: [
      { label: 'Scope', value: 'the Project' },
      { label: 'Value', value: 'set, not shown' },
    ],
    why: 'The API reads it at start, and you gave it to me above.',
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await expect(canvas.getByText('set, not shown')).toBeVisible()
    await expect(canvas.queryByText(/postgres:/)).toBeNull()
  },
}

/**
 * The last card of a batch with three changes waiting: Accept all accepts them in one press
 * (Decided 1 of #218).
 */
export const Batch: Story = {
  args: {
    title: 'Set the variable API_PORT on feature-login',
    details: [
      { label: 'Scope', value: 'feature-login' },
      { label: 'Value', value: 'set, not shown' },
    ],
    why: 'Two Workspaces serve the API at once, and each needs its own port.',
    waiting: 3,
  },
  play: async ({ canvasElement, args }) => {
    // "Several changes proposed together are accepted in one press"
    args.onAcceptAll?.mockClear()
    args.onAccept?.mockClear()
    const canvas = within(canvasElement)
    await userEvent.click(canvas.getByRole('button', { name: 'Accept all 3' }))
    await expect(args.onAcceptAll).toHaveBeenCalledTimes(1)
    await expect(args.onAccept).not.toHaveBeenCalled()
  },
}

/** Decline, Accept, then Accept all: the quiet answer first, the one that writes most last. */
export const Keyboard: Story = {
  args: { waiting: 2 },
  play: async ({ canvasElement, args }) => {
    args.onAcceptAll?.mockClear()
    const canvas = within(canvasElement)
    await userEvent.tab()
    await expect(document.activeElement).toBe(canvas.getByRole('button', { name: 'Decline' }))
    await userEvent.tab()
    await expect(document.activeElement).toBe(canvas.getByRole('button', { name: 'Accept' }))
    await userEvent.tab()
    await expect(document.activeElement).toBe(canvas.getByRole('button', { name: 'Accept all 2' }))
    await userEvent.keyboard('{Enter}')
    await expect(args.onAcceptAll).toHaveBeenCalledTimes(1)
  },
}
