import type { Meta, StoryObj } from '@storybook/react-vite'
import { expect, fn, userEvent, within } from 'storybook/test'

import { TooltipProvider } from '../components/tooltip/tooltip.tsx'
import { SpecHead } from './spec-head.tsx'

/**
 * The first line of the Spec panel: the key, the title, the type, the status, and — once there
 * is more than one revision — the picker of the revisions, with `Rework` on a `ready` Spec — and
 * at the very end the fold that takes the panel back to its band. `Mark ready` is not here: it
 * stands in the panel's footer (issue #150).
 */
const meta = {
  title: 'Blocks/Spec/SpecHead',
  component: SpecHead,
  tags: ['autodocs'],
  parameters: { layout: 'padded' },
  decorators: [
    (Story) => (
      <TooltipProvider>
        <Story />
      </TooltipProvider>
    ),
  ],
  args: {
    specKey: 'ATL-7',
    title: 'CSV invoice export',
    type: 'feature',
    status: 'draft',
    revision: 1,
    revisions: [{ number: 1, detail: 'Latest · draft' }],
    onPickRevision: fn(),
    onRework: fn(),
  },
  argTypes: {
    specKey: { control: 'text', description: 'The human key, `PREFIX-n`.' },
    title: { control: 'text' },
    type: { control: 'inline-radio', options: ['feature', 'bug', 'maintenance'] },
    status: {
      control: 'inline-radio',
      options: ['draft', 'ready', 'in_progress', 'cancelled'],
    },
    revision: { control: 'number', description: 'The revision shown.' },
    revisions: { control: 'object', description: 'Every revision, newest first.' },
    superseded: { control: 'boolean', description: 'Whether an older revision is shown.' },
    onPickRevision: { description: 'Shows another revision.' },
    onRework: { description: 'Opens the rework of a `ready` Spec.' },
  },
} satisfies Meta<typeof SpecHead>

export default meta

type Story = StoryObj<typeof meta>

/**
 * A first draft: no revision named, no picker, no Rework, no `Mark ready` — the footer holds it
 * (issue #150) — and no fold: the panel draws its own after the head (#77).
 */
export const Draft: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await expect(canvas.getByRole('heading', { name: 'CSV invoice export' })).toBeVisible()
    await expect(canvas.getByRole('img', { name: 'Draft' })).toBeVisible()
    await expect(canvas.queryByRole('button', { name: /rev/ })).toBeNull()
    await expect(canvas.queryByRole('button', { name: 'Rework' })).toBeNull()
    await expect(canvas.queryByRole('button', { name: 'Mark ready' })).toBeNull()
    await expect(canvas.queryByRole('button', { name: 'Fold the Spec' })).toBeNull()
  },
}

/**
 * A provisional Spec (issue #198): New Spec's request before the agent proposed it. No key yet,
 * said quietly where the key goes; the dashed circle of a Spec that is not created; the title
 * set apart as the request's words; and `provisional` where the type goes, since none is settled.
 */
export const Provisional: Story = {
  args: {
    provisional: true,
    specKey: '',
    title: 'We want a text reading tool, like a small program that reads a file aloud',
    revisions: [],
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await expect(canvas.getByText('No key yet')).toBeVisible()
    await expect(canvas.getByRole('img', { name: 'Not created yet' })).toBeVisible()
    await expect(canvas.getByText('provisional')).toBeVisible()
    await expect(canvas.queryByText('feature')).toBeNull()
    await expect(canvas.queryByRole('img', { name: 'Draft' })).toBeNull()
    await expect(canvas.getByRole('heading', { name: /text reading tool/ })).toHaveClass('italic')
  },
}

/**
 * Every status as the head draws it (issue #159): an icon in its colour between the key and the
 * title, no word on the line — the word is the tooltip and the accessible name.
 */
export const Statuses: Story = {
  parameters: { controls: { disable: true } },
  render: (args) => (
    <div className="flex flex-col gap-4">
      <SpecHead {...args} status="draft" />
      <SpecHead {...args} status="ready" />
      <SpecHead {...args} status="in_progress" />
      <SpecHead {...args} status="cancelled" />
    </div>
  ),
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await Promise.all(
      ['Draft', 'Ready', 'Building', 'Cancelled'].map((word) =>
        expect(canvas.getByRole('img', { name: word })).toBeVisible(),
      ),
    )
    await expect(canvas.queryByText('draft')).toBeNull()
    const line = canvas.getAllByRole('heading', { level: 2 })[0]?.parentElement
    const [key, status, title] = [...(line?.children ?? [])]
    await expect(key).toHaveTextContent('ATL-7')
    await expect(status).toHaveAccessibleName('Draft')
    await expect(title?.tagName).toBe('H2')
    await userEvent.hover(canvas.getByRole('img', { name: 'Ready' }))
    await expect(await within(document.body).findByRole('tooltip')).toHaveTextContent('Ready')
  },
}

/** A `bug`: the type is a quiet chip, never a coloured one, behind the glyph of its type. */
export const Bug: Story = {
  args: {
    specKey: 'ATL-12',
    title: 'Totals off by a cent on multi-currency invoices',
    type: 'bug',
  },
  play: async ({ canvasElement }) => {
    const chip = within(canvasElement).getByText('bug')
    await expect(chip.querySelector('.tabler-icon-bug')).not.toBeNull()
  },
}

/** A `maintenance` Spec: its own glyph, a wrench, on the chip (issue #130). */
export const Maintenance: Story = {
  args: {
    specKey: 'ATL-14',
    title: 'Upgrade the CSV library',
    type: 'maintenance',
  },
  play: async ({ canvasElement }) => {
    const chip = within(canvasElement).getByText('maintenance')
    await expect(chip.querySelector('.tabler-icon-tool')).not.toBeNull()
  },
}

/**
 * Ready at revision 2: the picker lists the older one as read only, and `Rework` is the way
 * back to a draft.
 */
export const Ready: Story = {
  args: {
    status: 'ready',
    revision: 2,
    revisions: [
      { number: 2, detail: 'Latest · ready' },
      { number: 1, detail: 'Marked ready 22 Sep · read only' },
    ],
  },
  play: async ({ canvasElement, args }) => {
    const canvas = within(canvasElement)
    await userEvent.click(canvas.getByRole('button', { name: 'Latest' }))
    const older = await within(document.body).findByRole('menuitem', {
      name: 'Marked ready 22 Sep · read only',
    })
    await userEvent.click(older)
    await expect(args.onPickRevision).toHaveBeenCalledWith(1)
    await userEvent.click(canvas.getByRole('button', { name: 'Rework' }))
    await expect(args.onRework).toHaveBeenCalled()
    await expect(canvas.queryByRole('button', { name: 'Mark ready' })).toBeNull()
  },
}

/** An older revision picked: the picker to go back, and no `Rework` — it is not the current one. */
export const OlderRevision: Story = {
  args: {
    status: 'ready',
    revision: 1,
    superseded: true,
    revisions: [
      { number: 2, detail: 'Latest · ready' },
      { number: 1, detail: 'Marked ready 22 Sep · read only' },
    ],
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await expect(canvas.getByRole('button', { name: 'Earlier' })).toBeVisible()
    await expect(canvas.queryByRole('button', { name: 'Rework' })).toBeNull()
    await expect(canvas.queryByRole('button', { name: 'Mark ready' })).toBeNull()
  },
}

/** Reworked into revision 3: a draft again, with its older revisions in the picker. */
export const Reworked: Story = {
  args: {
    revision: 3,
    revisions: [
      { number: 3, detail: 'Latest · draft' },
      { number: 2, detail: 'Marked ready 23 Sep · read only' },
      { number: 1, detail: 'Marked ready 22 Sep · read only' },
    ],
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await expect(canvas.getByRole('button', { name: 'Latest' })).toBeVisible()
    await expect(canvas.queryByRole('button', { name: 'Rework' })).toBeNull()
  },
}
