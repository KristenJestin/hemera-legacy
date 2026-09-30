import type { Meta, StoryObj } from '@storybook/react-vite'
import type { ReactNode } from 'react'
import { expect, userEvent, waitFor, within } from 'storybook/test'

import { TooltipProvider } from '../../components/tooltip/tooltip.tsx'
import { STUCK } from './fixtures.ts'
import { type BuildSessionProps, BuildSession } from './page.tsx'

/**
 * A `build` Session that looks like a `define` Session (design exploration of 30 September 2026,
 * issue #77). Storybook only: nothing here is wired, and no component of the design system
 * changed for it.
 *
 * - The chat on the left, the build on the right in the Spec panel's own frame: its widths, its
 *   fold to a small frame at the window's edge, and its swap, which pushes the chat.
 * - One control on the panel's head, beside the fold, lays the build over the chat, the whole
 *   width of the row, and takes it back. The chat keeps its width under it; only the panel's edge
 *   moves. While it covers the chat, the Session's notices stand in the panel's foot.
 * - The head line spans the page: the runs, the helper agents, Run, ⓘ and `…`, reachable whether
 *   the build covers the chat or not. A helper's chip is its icon, its dot and its name; resting
 *   on it quotes its last line.
 * - A chip opens the helper's thread, read only: in the chat column (recommended), or in the
 *   build panel.
 *
 * The build is `ATL-7`'s, with two runs and three helpers: a test review and the documenter,
 * defined, with their own icons, and one free helper, `Credit notes`, with the common icon.
 */

function Screen(props: BuildSessionProps): ReactNode {
  return (
    <TooltipProvider>
      <BuildSession {...props} />
    </TooltipProvider>
  )
}

const meta = {
  title: 'Explorations/Build like define',
  component: Screen,
  tags: ['autodocs', 'new'],
  parameters: { layout: 'fullscreen' },
  args: { placement: 'column', defaultOver: false, defaultFolded: false, defaultHelper: null },
  argTypes: {
    placement: { control: 'inline-radio', options: ['column', 'panel'] },
    defaultHelper: {
      control: 'select',
      options: [null, 'helper-review', 'helper-docs', 'helper-credit'],
    },
  },
} satisfies Meta<typeof Screen>

export default meta

type Story = StoryObj<typeof meta>

/** The head line: the two runs, then each helper as its chip names it. */
async function seesTheLine(canvasElement: HTMLElement, credit = 'running'): Promise<void> {
  const line = within(
    within(canvasElement).getByRole('group', { name: 'What goes on in this Session' }),
  )
  await expect(line.getByRole('button', { name: /^dev/ })).toBeVisible()
  await expect(line.getByRole('button', { name: /^test/ })).toBeVisible()
  await expect(line.getByRole('button', { name: 'Helper Test review, running' })).toBeVisible()
  await expect(line.getByRole('button', { name: 'Helper Documenter, running' })).toBeVisible()
  await expect(line.getByRole('button', { name: `Helper Credit notes, ${credit}` })).toBeVisible()
}

function panelOf(canvasElement: HTMLElement): HTMLElement {
  return within(canvasElement).getByRole('region', { name: 'Build ATL-7' })
}

/** A build running: the chat beside the build, three helpers and two runs in the head line. */
export const Running: Story = {
  play: async ({ canvasElement }) => {
    await seesTheLine(canvasElement)
    const canvas = within(canvasElement)
    await expect(canvas.getByRole('log', { name: 'The thread of this Session' })).toBeVisible()
    await expect(canvas.getByRole('button', { name: 'Build over the chat' })).toHaveAttribute(
      'aria-pressed',
      'false',
    )
  },
}

/** The build over the chat: the whole row, the chat out of reach under it, the line still there. */
export const OverTheChat: Story = {
  args: { defaultOver: true },
  play: async ({ canvasElement }) => {
    await seesTheLine(canvasElement)
    const canvas = within(canvasElement)
    await expect(canvas.queryByRole('log', { name: 'The thread of this Session' })).toBeNull()
    await expect(canvas.getByRole('button', { name: 'Build over the chat' })).toHaveAttribute(
      'aria-pressed',
      'true',
    )
    await expect(
      within(panelOf(canvasElement)).getByRole('button', { name: /Permissions/ }),
    ).toBeVisible()
  },
}

/** The toggle lays the build over the chat, and takes it back; the chat's width never changes. */
export const OverAndBack: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    const panel = panelOf(canvasElement)
    const chat = canvas.getByRole('log', { name: 'The thread of this Session' })
    const beside = panel.getBoundingClientRect().width
    const chatWidth = chat.getBoundingClientRect().width
    const toggle = canvas.getByRole('button', { name: 'Build over the chat' })
    await userEvent.click(toggle)
    await waitFor(() => expect(panel.getBoundingClientRect().width).toBeGreaterThan(beside * 1.5))
    await expect(chat.getBoundingClientRect().width).toBe(chatWidth)
    await userEvent.click(toggle)
    await waitFor(() => expect(panel.getBoundingClientRect().width).toBe(beside))
  },
}

/** The build folded to its small frame, as the Spec folds: the chat has the row. */
export const Folded: Story = {
  args: { defaultFolded: true },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await expect(canvas.getByRole('button', { name: 'Unfold the build' })).toBeVisible()
  },
}

/** 1 · recommended · A helper's thread in the chat column, the way back to the main agent. */
export const HelperInTheChat: Story = {
  args: { defaultHelper: 'helper-credit' },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    const thread = canvas.getByRole('region', { name: 'The thread of Credit notes' })
    await expect(
      within(thread).getByRole('log', { name: 'What Credit notes is doing' }),
    ).toBeVisible()
    // Read only: no box to write in anywhere reachable.
    await expect(canvas.queryAllByRole('textbox')).toHaveLength(0)
    await expect(
      canvas.getByRole('button', { name: 'Helper Credit notes, running' }),
    ).toHaveAttribute('aria-pressed', 'true')
  },
}

/** 1 · The way back from a helper's thread gives the main agent's chat and its box back. */
export const BackToTheMainAgent: Story = {
  args: { defaultHelper: 'helper-credit' },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await userEvent.click(canvas.getByRole('button', { name: 'Main agent' }))
    await expect(await canvas.findByRole('textbox')).toBeVisible()
  },
}

/** 1 · A chip pressed while the build covers the chat takes the build back beside the thread. */
export const HelperFromOverTheChat: Story = {
  args: { defaultOver: true },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await userEvent.click(canvas.getByRole('button', { name: 'Helper Documenter, running' }))
    await expect(await canvas.findByRole('log', { name: 'What Documenter is doing' })).toBeVisible()
    await expect(canvas.getByRole('button', { name: 'Build over the chat' })).toHaveAttribute(
      'aria-pressed',
      'false',
    )
  },
}

/** 2 · A helper's thread in the build panel, in the build view's place. */
export const HelperInThePanel: Story = {
  args: { placement: 'panel', defaultHelper: 'helper-review' },
  play: async ({ canvasElement }) => {
    const panel = within(panelOf(canvasElement))
    await expect(panel.getByRole('log', { name: 'What Test review is doing' })).toBeVisible()
    await expect(within(canvasElement).getByRole('textbox')).toBeVisible()
  },
}

/** 2 · The way back from a helper's thread in the panel gives the build view back. */
export const BackToTheBuild: Story = {
  args: { placement: 'panel', defaultHelper: 'helper-review' },
  play: async ({ canvasElement }) => {
    const panel = within(panelOf(canvasElement))
    await userEvent.click(panel.getByRole('button', { name: 'Build' }))
    await waitFor(() =>
      expect(panel.queryByRole('region', { name: 'The thread of Test review' })).toBeNull(),
    )
  },
}

/** 2 · The same, with the build over the chat: the helper's thread has the whole row. */
export const HelperInThePanelOver: Story = {
  args: { placement: 'panel', defaultHelper: 'helper-docs', defaultOver: true },
  play: async ({ canvasElement }) => {
    const panel = within(panelOf(canvasElement))
    await expect(panel.getByRole('log', { name: 'What Documenter is doing' })).toBeVisible()
  },
}

/** A helper silent for seven minutes: its dot stops, grey, and its thread says where it stopped. */
export const StuckHelper: Story = {
  args: { helpers: STUCK, defaultHelper: 'helper-credit' },
  play: async ({ canvasElement }) => {
    await seesTheLine(canvasElement, 'silent')
  },
}
