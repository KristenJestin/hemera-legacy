import type { Meta, StoryObj } from '@storybook/react-vite'
import { expect, fn, userEvent, within } from 'storybook/test'

import { TooltipProvider } from '../components/tooltip/tooltip.tsx'
import { READY } from '../spec/spec-fixtures.ts'
import { BuildSpecPanel } from './build-spec-panel.tsx'

/**
 * The frozen Spec opened from a build (D10-12; scenario "The Spec is read only in a build"): the
 * Spec as one column on the revision the build works from, and no edit control at all — no
 * editor, no Rework, no Mark ready. It is closed rather than folded. Beside a stand-in for the
 * rest of the page.
 */
const meta = {
  title: 'Blocks/Build/BuildSpecPanel',
  component: BuildSpecPanel,
  tags: ['autodocs'],
  parameters: { layout: 'fullscreen' },
  decorators: [
    (Story) => (
      <TooltipProvider>
        <div className="@container flex h-screen min-h-0 bg-background text-foreground">
          <div className="flex-1 p-6 text-sm text-muted-foreground">The chat stands here.</div>
          <div className="flex w-build-panel border-l border-border">
            <Story />
          </div>
        </div>
      </TooltipProvider>
    ),
  ],
  args: { spec: READY, onClose: fn() },
  argTypes: {
    spec: { control: 'object', description: 'The frozen revision the build works from.' },
    onClose: { action: 'closed' },
  },
} satisfies Meta<typeof BuildSpecPanel>

export default meta

type Story = StoryObj<typeof meta>

/**
 * Read only: the Spec as one column, its phases under their headings, with no editor, and nothing
 * that would change it.
 */
export const ReadOnly: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await expect(canvas.getByRole('region', { name: 'Spec ATL-7' })).toBeVisible()
    await expect(canvas.getByText('read only')).toBeVisible()
    await expect(canvas.getByRole('region', { name: 'Contents of ATL-7' })).toBeVisible()
    await expect(canvas.queryByRole('textbox')).toBeNull()
    await expect(canvas.queryByRole('button', { name: 'Rework' })).toBeNull()
    await expect(canvas.queryByRole('button', { name: 'Mark ready' })).toBeNull()
    await expect(canvas.queryByRole('button', { name: /^Fold/ })).toBeNull()
  },
}

/** The tasks of the contract in the column, as the build was handed them. */
export const Tasks: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    const column = within(canvas.getByRole('region', { name: 'Contents of ATL-7' }))
    await expect(column.getByText('The file imports into the ledger')).toBeVisible()
  },
}

/** The keyboard: Close, then the column the Spec is read in; Close is answered by the page. */
export const Keyboard: Story = {
  play: async ({ canvasElement, args }) => {
    const canvas = within(canvasElement)
    const close = canvas.getByRole('button', { name: 'Close the Spec' })
    close.focus()
    await userEvent.tab()
    await expect(canvas.getByRole('region', { name: 'Contents of ATL-7' })).toHaveFocus()
    close.focus()
    await userEvent.keyboard('{Enter}')
    await expect(args.onClose).toHaveBeenCalled()
  },
}
