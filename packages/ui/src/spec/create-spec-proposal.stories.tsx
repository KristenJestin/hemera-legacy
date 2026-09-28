import type { Meta, StoryObj } from '@storybook/react-vite'
import { expect, fn, userEvent, within } from 'storybook/test'

import { CreateSpecProposal, SpecProposalRecord } from './create-spec-proposal.tsx'

/**
 * The agent proposing a Spec in a `free` Session: the title it understood, editable in place,
 * the type as one of three chips, and `Create` or `Not now`.
 */
const meta = {
  title: 'Blocks/Spec/CreateSpecProposal',
  component: CreateSpecProposal,
  tags: ['autodocs', 'updated'],
  parameters: { layout: 'padded' },
  args: {
    title: 'CSV invoice export',
    type: 'feature',
    onCreate: fn(),
    onDecline: fn(),
    onContinue: fn(),
  },
  argTypes: {
    title: { control: 'text', description: 'The title the agent understood.' },
    type: { control: 'inline-radio', options: ['feature', 'bug', 'maintenance'] },
    state: { control: 'inline-radio', options: ['proposed', 'created', 'declined'] },
    createdKey: { control: 'text', description: 'The key given, once created.' },
    atOnce: {
      control: 'boolean',
      description: 'Whether Hemera created it at once, in a Session New Spec started.',
    },
    existingKey: {
      control: 'text',
      description: 'The key of a Spec that already exists, which the agent points to.',
    },
    onContinue: { description: 'Continue it: this Session defines the existing Spec.' },
    onCreate: { description: 'Creates the Spec with the title and the type as left.' },
    onDecline: { description: 'Not now.' },
  },
} satisfies Meta<typeof CreateSpecProposal>

export default meta

type Story = StoryObj<typeof meta>

/** Proposed: the title, `feature` selected, and the two answers. */
export const Proposed: Story = {
  play: async ({ canvasElement, args }) => {
    const canvas = within(canvasElement)
    await expect(canvas.getByRole('textbox', { name: 'Title of the Spec' })).toHaveValue(
      'CSV invoice export',
    )
    await expect(canvas.getByRole('radio', { name: 'feature' })).toBeChecked()
    // Each type wears its glyph beside its word, which stays the chip's name (issue #130).
    for (const [type, glyph] of Object.entries({
      feature: 'sparkles',
      bug: 'bug',
      maintenance: 'tool',
    })) {
      const chip = canvas.getByRole('radio', { name: type })
      // oxlint-disable-next-line no-await-in-loop -- one chip after the other, as they are read
      await expect(chip.querySelector(`.tabler-icon-${glyph}`)).not.toBeNull()
    }
    await userEvent.click(canvas.getByRole('button', { name: 'Create' }))
    await expect(args.onCreate).toHaveBeenCalledWith('CSV invoice export', 'feature')
  },
}

/** The title edited in place and the type changed before Create. */
export const TitleEdited: Story = {
  play: async ({ canvasElement, args }) => {
    const canvas = within(canvasElement)
    const title = canvas.getByRole('textbox', { name: 'Title of the Spec' })
    await userEvent.clear(title)
    await userEvent.type(title, 'Monthly CSV export for the ledger')
    await userEvent.tab()
    await userEvent.click(canvas.getByRole('radio', { name: 'maintenance' }))
    await userEvent.click(canvas.getByRole('radio', { name: 'feature' }))
    await userEvent.click(canvas.getByRole('button', { name: 'Create' }))
    await expect(args.onCreate).toHaveBeenCalledWith('Monthly CSV export for the ledger', 'feature')
  },
}

/** Created: folded to the line that says what happened. */
export const Created: Story = {
  args: { state: 'created', createdKey: 'ATL-7' },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await expect(canvas.getByRole('status')).toHaveTextContent('Created ATL-7')
  },
}

/**
 * Created at once, in a Session New Spec started (issue #205): the user asked for a Spec already,
 * so nothing was asked. The thread keeps one quiet line, and nothing to press.
 */
export const CreatedAtOnce: Story = {
  args: { state: 'created', createdKey: 'XC-2', atOnce: true },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await expect(canvas.getByRole('status')).toHaveTextContent(/^Spec XC-2 created · feature$/)
    await expect(canvas.queryByRole('button')).toBeNull()
  },
}

/** Declined: `Not now`, and the conversation goes on as it was. */
export const Declined: Story = {
  args: { state: 'declined' },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await expect(canvas.getByText(/was not created/)).toBeVisible()
  },
}

/**
 * The agent found the Spec already exists (issue #198): it points to it by its key rather than
 * proposing a second one. Nothing to edit, the Spec has its own title and type: `Continue it`
 * makes this Session define that one, or `Not now`.
 */
export const ExistingSpec: Story = {
  args: { existingKey: 'ATL-4' },
  play: async ({ canvasElement, args }) => {
    const canvas = within(canvasElement)
    const card = canvas.getByRole('group', { name: 'Continue a Spec' })
    await expect(card).toHaveTextContent('This Spec already exists')
    await expect(card).toHaveTextContent('ATL-4')
    await expect(card).toHaveTextContent('CSV invoice export')
    await expect(canvas.queryByRole('textbox', { name: 'Title of the Spec' })).toBeNull()
    await expect(canvas.queryByRole('button', { name: 'Create' })).toBeNull()
    await userEvent.click(canvas.getByRole('button', { name: 'Continue it' }))
    await expect(args.onContinue).toHaveBeenCalled()
    await expect(args.onCreate).not.toHaveBeenCalled()
  },
}

/** The existing Spec continued: folded to the line that says this Session defines it now. */
export const ExistingContinued: Story = {
  args: { existingKey: 'ATL-4', state: 'created' },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await expect(canvas.getByRole('status')).toHaveTextContent('Continued ATL-4')
  },
}

/** The existing Spec not continued: the conversation goes on as it was. */
export const ExistingDeclined: Story = {
  args: { existingKey: 'ATL-4', state: 'declined' },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await expect(canvas.getByText(/ATL-4 « CSV invoice export » was not continued/)).toBeVisible()
  },
}

/**
 * What the thread keeps of the proposal once the Spec is created (issue #237): a quiet line, the
 * Spec's key and its title, the dot of the answer. It is answered among the Session's notices.
 */
export const KeptCreated: Story = {
  render: () => (
    <SpecProposalRecord title="Export the Journal" type="feature" state="created" specKey="ATL-7" />
  ),
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    const record = canvas.getByRole('group', {
      name: 'Spec proposed, ATL-7 «Export the Journal», created',
    })
    await expect(within(record).getByText('ATL-7')).toBeVisible()
    await expect(within(record).queryByRole('button', { name: 'Create' })).toBeNull()
  },
}
