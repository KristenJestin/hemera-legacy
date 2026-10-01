import type { Meta, StoryObj } from '@storybook/react-vite'
import { expect, userEvent, waitFor, within } from 'storybook/test'

import { withinFrames } from '../../../.storybook/reduced-motion.ts'

import { type Case, PanelViewsSession } from './session.tsx'

/**
 * What the Session's frame shows (issue #333): the build at its base, and on top of it the frozen
 * Spec, a task, a Spec review round or a delivery, all handed to the frame by one contract — a
 * title, a width, the head's actions and a body.
 *
 * Two ways for the frame's head to move between them:
 *
 * - **A, the stack** (`Stack…`): a breadcrumb from the base to the view on top, a back, a close.
 * - **B, tabs** (`Tabs…`): the base's tab and one per open view, each closable.
 *
 * Every case is a whole Session, beside the chat and over it. From the build, Spec opens the Spec,
 * a task opens its detail, the review card opens the round and Accept the delivery; from a task or
 * a round, the head's Spec opens the Spec on top of it. Going back finds the base as it was left:
 * its scroll, its folds, and the width the frame had.
 */
const meta = {
  title: 'Explorations/Panel views',
  component: PanelViewsSession,
  tags: ['autodocs'],
  parameters: { layout: 'fullscreen' },
  args: { variant: 'stack', case: 'spec', over: false },
  argTypes: {
    variant: {
      control: 'inline-radio',
      options: ['stack', 'tabs'],
      description: 'A, the stack and its breadcrumb; B, tabs.',
    },
    case: {
      control: 'select',
      options: ['base', 'spec', 'task', 'review', 'delivery', 'deep'] satisfies Case[],
      description: 'What the frame shows as the page opens.',
    },
    over: { control: 'boolean', description: 'Whether the frame lies over the chat.' },
  },
} satisfies Meta<typeof PanelViewsSession>

export default meta

type Story = StoryObj<typeof meta>

/** Waits for the cross-fade and the swap to be over: half a second of frames, or so. */
async function settled(): Promise<void> {
  await withinFrames(() => false, 30)
}

/** Every control: the variant, the case, over the chat or beside it. */
export const Playground: Story = {}

// ——— A, the stack ———

/** The frozen Spec opened from the build, the frame beside the chat: `Build ATL-7 › Spec`. */
export const StackSpecBeside: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    const where = within(canvas.getByRole('navigation', { name: 'Where the frame is' }))
    await expect(where.getByRole('heading', { name: 'Spec' })).toHaveAttribute(
      'aria-current',
      'page',
    )
    await expect(where.getByRole('button', { name: 'Build ATL-7' })).toBeVisible()
    await expect(canvas.getByRole('button', { name: 'Back' })).toBeVisible()
  },
}

/** The frozen Spec over the chat, the width it asks for as it opens. */
export const StackSpecOver: Story = { args: { over: true } }

/** A task's detail, `Build ATL-7 › T2`, its Spec in the head. */
export const StackTaskBeside: Story = { args: { case: 'task' } }

export const StackTaskOver: Story = { args: { case: 'task', over: true } }

/** A Spec review round, `Build ATL-7 › Review · round 1`: a dot per criterion. */
export const StackReviewBeside: Story = { args: { case: 'review' } }

export const StackReviewOver: Story = { args: { case: 'review', over: true } }

/** The delivery at the end of the build, its steps by repository. */
export const StackDeliveryBeside: Story = { args: { case: 'delivery' } }

export const StackDeliveryOver: Story = { args: { case: 'delivery', over: true } }

/** Two deep: the Spec opened from the round, `Build ATL-7 › Review · round 1 › Spec`. */
export const StackDeep: Story = {
  args: { case: 'deep', over: true },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await userEvent.click(canvas.getByRole('button', { name: 'Back' }))
    const where = within(canvas.getByRole('navigation', { name: 'Where the frame is' }))
    await waitFor(() =>
      expect(where.getByRole('heading', { name: 'Review · round 1' })).toBeVisible(),
    )
    await waitFor(() => expect(where.queryByRole('heading', { name: 'Spec' })).toBeNull())
  },
}

/**
 * The base is kept: a story unfolded and the build scrolled, Spec lays the frame over the chat;
 * back, the frame is beside the chat again and the build as it was left.
 */
export const StackKeepsTheBase: Story = {
  args: { case: 'base' },
  play: async ({ canvasElement }) => {
    await keepsTheBase(canvasElement, 'Back')
  },
}

// ——— B, tabs ———

/** The frozen Spec in a tab beside the build's. */
export const TabsSpecBeside: Story = {
  args: { variant: 'tabs' },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    const strip = within(canvas.getByRole('navigation', { name: 'Views of the frame' }))
    await expect(strip.getByRole('button', { name: 'Spec' })).toHaveAttribute(
      'aria-current',
      'page',
    )
    await expect(strip.getByRole('button', { name: 'Build ATL-7' })).toBeVisible()
    await expect(strip.queryByRole('button', { name: 'Close Build ATL-7' })).toBeNull()
    await expect(strip.getByRole('button', { name: 'Close Spec' })).toBeVisible()
  },
}

export const TabsSpecOver: Story = { args: { variant: 'tabs', over: true } }

export const TabsTaskBeside: Story = { args: { variant: 'tabs', case: 'task' } }

export const TabsTaskOver: Story = { args: { variant: 'tabs', case: 'task', over: true } }

export const TabsReviewBeside: Story = { args: { variant: 'tabs', case: 'review' } }

export const TabsReviewOver: Story = { args: { variant: 'tabs', case: 'review', over: true } }

export const TabsDeliveryBeside: Story = { args: { variant: 'tabs', case: 'delivery' } }

export const TabsDeliveryOver: Story = { args: { variant: 'tabs', case: 'delivery', over: true } }

/** Two views open beside the base: the round and the Spec opened from it, the Spec shown. */
export const TabsSeveral: Story = {
  args: { variant: 'tabs', case: 'deep', over: true },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    const strip = within(canvas.getByRole('navigation', { name: 'Views of the frame' }))
    await userEvent.click(strip.getByRole('button', { name: 'Close Spec' }))
    await waitFor(() =>
      expect(strip.getByRole('button', { name: 'Review · round 1' })).toHaveAttribute(
        'aria-current',
        'page',
      ),
    )
  },
}

/** The base is kept the same way when its tab is shown again. */
export const TabsKeepTheBase: Story = {
  args: { variant: 'tabs', case: 'base' },
  play: async ({ canvasElement }) => {
    await keepsTheBase(canvasElement, 'Build ATL-7')
  },
}

/**
 * Unfolds a story's tasks and scrolls the build, opens the Spec, goes back by `back` (the stack's
 * back or the base's tab), and finds the build as it was and the frame beside the chat.
 */
async function keepsTheBase(canvasElement: HTMLElement, back: string): Promise<void> {
  const canvas = within(canvasElement)
  const fold = canvas.getAllByRole('button', { name: /^Tasks · / })[0]!
  await userEvent.click(fold)
  await waitFor(() => expect(fold).toHaveAttribute('aria-expanded', 'true'))
  const body = canvas.getByRole('region', { name: 'The build of ATL-7' })
  await waitFor(() => expect(body.scrollHeight).toBeGreaterThan(body.clientHeight + 40))
  body.scrollTop = 40
  const scrolled = body.scrollTop
  await userEvent.click(canvas.getByRole('button', { name: 'Spec' }))
  await waitFor(() =>
    expect(canvas.getByRole('button', { name: 'Over the chat' })).toHaveAttribute(
      'aria-pressed',
      'true',
    ),
  )
  await settled()
  const press = canvas.getByRole('button', { name: back })
  await userEvent.click(press)
  await waitFor(() =>
    expect(canvas.getByRole('button', { name: 'Over the chat' })).toHaveAttribute(
      'aria-pressed',
      'false',
    ),
  )
  await waitFor(() => expect(canvas.getByRole('region', { name: 'The build of ATL-7' })).toBe(body))
  await expect(fold).toHaveAttribute('aria-expanded', 'true')
  await expect(body.scrollTop).toBe(scrolled)
}
