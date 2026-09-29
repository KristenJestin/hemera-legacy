import type { Meta, StoryObj } from '@storybook/react-vite'
import { expect, within } from 'storybook/test'

import { EVERYTHING, ONE } from './fixtures.ts'
import { Stage } from './parts.tsx'
import { DeckPanel } from './variant-deck.tsx'
import { ListPanel } from './variant-list.tsx'
import { SplitPanel } from './variant-split.tsx'
import { TrayPanel } from './variant-tray.tsx'

/**
 * The panel the Session's notices open on (review of #250): the yellow pill and its rise are kept,
 * and what opens from it is drawn four ways that differ by their shape. Each is shown with the same
 * content — a permission with a long line, three proposed commands and a question — and with a
 * permission alone, on the foot of a Session. Press the pill to close and open it again.
 *
 * - A · Compact list: one dense row an item, the answers inline, a row unfolding in place.
 * - B · One at a time: tabs a kind, one item large, "1 of 5", previous and next.
 * - C · Tray: a drawer the composer's width on its top edge, a light head a kind.
 * - D · Inbox: the items on the left, the one chosen on the right, whole.
 */

const meta = {
  title: 'Explorations/Notices panel',
  component: Stage,
  tags: ['autodocs', 'new'],
  parameters: { layout: 'fullscreen', docs: { story: { inline: false, height: '44rem' } } },
  args: { panel: ListPanel, waiting: EVERYTHING },
} satisfies Meta<typeof Stage>

export default meta

type Story = StoryObj<typeof meta>

/** The panel is open, over the thread's end, and the thread is still there. */
async function opened({ canvasElement }: { canvasElement: HTMLElement }): Promise<void> {
  const canvas = within(canvasElement)
  await expect(canvas.getByRole('button', { name: 'Waiting for your answer' })).toHaveAttribute(
    'aria-expanded',
    'true',
  )
}

export const ACompactList: Story = {
  name: 'A · Compact list',
  args: { panel: ListPanel, waiting: EVERYTHING },
  play: opened,
}

export const ACompactListOne: Story = {
  name: 'A · Compact list, one permission',
  args: { panel: ListPanel, waiting: ONE },
  play: opened,
}

export const BOneAtATime: Story = {
  name: 'B · One at a time',
  args: { panel: DeckPanel, waiting: EVERYTHING },
  play: opened,
}

export const BOneAtATimeOne: Story = {
  name: 'B · One at a time, one permission',
  args: { panel: DeckPanel, waiting: ONE },
  play: opened,
}

export const CTray: Story = {
  name: 'C · Tray',
  args: { panel: TrayPanel, waiting: EVERYTHING },
  play: opened,
}

export const CTrayOne: Story = {
  name: 'C · Tray, one permission',
  args: { panel: TrayPanel, waiting: ONE },
  play: opened,
}

export const DInbox: Story = {
  name: 'D · Inbox',
  args: { panel: SplitPanel, waiting: EVERYTHING },
  play: opened,
}

export const DInboxOne: Story = {
  name: 'D · Inbox, one permission',
  args: { panel: SplitPanel, waiting: ONE },
  play: opened,
}
