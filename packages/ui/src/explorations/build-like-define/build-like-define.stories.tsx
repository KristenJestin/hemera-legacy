import type { Meta, StoryObj } from '@storybook/react-vite'
import type { ReactNode } from 'react'
import { expect, userEvent, waitFor, within } from 'storybook/test'

import { TooltipProvider } from '../../components/tooltip/tooltip.tsx'
import { type SessionPageProps, SessionPage } from './page.tsx'

/**
 * A Session laid as `define` lays it, for every kind (design exploration of 30 September 2026,
 * issue #77). Storybook only: nothing here is wired, and no component of the design system
 * changed for it. `Playground`, beside these, is the page to try everything by hand; these are its
 * moments, one each, for the tests.
 *
 * - One side panel for `define` and `build` (`PanelDock`): the Spec panel's frame, widths, fold
 *   and swap, and one toggle that lays the panel over the chat and back. While it covers the
 *   chat, the notices float over the panel where they stood over the chat.
 * - The head line — runs, helpers, Run, ⓘ and `…` — across the page (A) or over the chat only,
 *   going into the panel's head while the panel covers the chat (B).
 * - A helper's chip is its icon, its dot and its name. It opens the helper's live thread, read
 *   only, the same way in every kind of Session (`HelperViewer`): a sheet under the head line
 *   (recommended), a dialog, or a sheet from the right.
 * - The build's tasks, almost empty at rest: how far the build is at a glance, the tasks grouped
 *   by story, as one list or by state, and each task unfolding to its tries, files and returns.
 */

function Screen(props: SessionPageProps): ReactNode {
  return (
    <TooltipProvider>
      <div className="h-screen">
        <SessionPage {...props} />
      </div>
    </TooltipProvider>
  )
}

const meta = {
  title: 'Explorations/Build like define/Screens',
  component: Screen,
  tags: ['autodocs'],
  parameters: { layout: 'fullscreen' },
  args: { kind: 'build', head: 'page', opening: 'sheet' },
  argTypes: {
    kind: { control: 'inline-radio', options: ['free', 'define', 'build'] },
    head: { control: 'inline-radio', options: ['page', 'chat'] },
    opening: { control: 'inline-radio', options: ['sheet', 'dialog', 'side'] },
  },
} satisfies Meta<typeof Screen>

export default meta

type Story = StoryObj<typeof meta>

/** The head line in view: the one not under the panel. */
function line(canvasElement: HTMLElement) {
  const lines = within(canvasElement).getAllByRole('group', {
    name: 'What goes on in this Session',
  })
  return within(lines.find((one) => one.closest('[inert]') === null) ?? lines[0]!)
}

function panelOf(canvasElement: HTMLElement, name = 'Build ATL-7'): HTMLElement {
  return within(canvasElement).getByRole('region', { name })
}

/** A build: the chat beside the build, three helpers — one silent — and two runs. */
export const Build: Story = {
  play: async ({ canvasElement }) => {
    const head = line(canvasElement)
    await expect(head.getByRole('button', { name: /^dev/ })).toBeVisible()
    await expect(head.getByRole('button', { name: /^test/ })).toBeVisible()
    await expect(head.getByRole('button', { name: 'Helper Test review, running' })).toBeVisible()
    await expect(head.getByRole('button', { name: 'Helper Documenter, running' })).toBeVisible()
    await expect(head.getByRole('button', { name: 'Helper Credit notes, silent' })).toBeVisible()
  },
}

/** The build over the chat; the notices float over it where they stood over the chat. */
export const BuildOverTheChat: Story = {
  args: { defaultOver: true },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await expect(canvas.queryByRole('log', { name: 'The thread of this Session' })).toBeNull()
    const floated = canvasElement.querySelector<HTMLElement>('[data-notices-over]')!
    await expect(
      await within(floated).findByRole('button', { name: /Waiting for your answer/ }),
    ).toBeVisible()
  },
}

/** The toggle lays the build over the chat and takes it back; the chat never changes width. */
export const OverAndBack: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    const panel = panelOf(canvasElement)
    const chat = canvas.getByRole('log', { name: 'The thread of this Session' })
    const beside = panel.getBoundingClientRect().width
    const chatWidth = chat.getBoundingClientRect().width
    const toggle = canvas.getByRole('button', { name: 'Over the chat' })
    await userEvent.click(toggle)
    await waitFor(() => expect(panel.getBoundingClientRect().width).toBeGreaterThan(beside * 1.5))
    await expect(chat.getBoundingClientRect().width).toBe(chatWidth)
    await userEvent.click(toggle)
    await waitFor(() => expect(panel.getBoundingClientRect().width).toBe(beside))
  },
}

/** `define` beside the chat, by the same panel; its helper is the prototyper. */
export const Define: Story = {
  args: { kind: 'define' },
  play: async ({ canvasElement }) => {
    await expect(panelOf(canvasElement, 'Spec ATL-7')).toBeVisible()
    await expect(
      line(canvasElement).getByRole('button', { name: 'Helper Prototyper, running' }),
    ).toBeVisible()
  },
}

/** `define` with its Spec over the chat. */
export const DefineOverTheChat: Story = {
  args: { kind: 'define', defaultOver: true },
  play: async ({ canvasElement }) => {
    const panel = panelOf(canvasElement, 'Spec ATL-7')
    await expect(within(panel).getByRole('button', { name: 'Over the chat' })).toHaveAttribute(
      'aria-pressed',
      'true',
    )
  },
}

/** A `free` Session: no panel, the runs and two helpers in its head line. */
export const Free: Story = {
  args: { kind: 'free' },
  play: async ({ canvasElement }) => {
    await expect(
      line(canvasElement).getByRole('button', { name: 'Helper Explore, running' }),
    ).toBeVisible()
    await expect(within(canvasElement).queryByRole('button', { name: 'Over the chat' })).toBeNull()
  },
}

/** The build folded to its small frame, as the Spec folds. */
export const Folded: Story = {
  args: { defaultFolded: true },
  play: async ({ canvasElement }) => {
    await expect(
      within(canvasElement).getByRole('button', { name: 'Unfold the panel' }),
    ).toBeVisible()
  },
}

/** B · The head line over the chat only, as `define` has it. */
export const HeadOverTheChat: Story = {
  args: { head: 'chat' },
  play: async ({ canvasElement }) => {
    const panel = within(panelOf(canvasElement))
    await expect(panel.queryByRole('group', { name: 'What goes on in this Session' })).toBeNull()
  },
}

/** B · The panel over the chat takes the head line into its own head. */
export const HeadInThePanel: Story = {
  args: { head: 'chat', defaultOver: true },
  play: async ({ canvasElement }) => {
    const panel = within(panelOf(canvasElement))
    await expect(
      await panel.findByRole('button', { name: 'Helper Documenter, running' }),
    ).toBeVisible()
  },
}

/** Helper · 1 · recommended · A sheet under the head line, over the page. */
export const HelperSheet: Story = {
  args: { defaultHelper: 'helper-credit' },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    const sheet = within(canvas.getByRole('region', { name: 'Helpers' }))
    await expect(sheet.getByRole('log', { name: 'What Credit notes is doing' })).toBeVisible()
    await expect(sheet.queryAllByRole('textbox')).toHaveLength(0)
  },
}

/** Helper · 2 · A dialog, as the Session details are one. */
export const HelperDialog: Story = {
  args: { opening: 'dialog', defaultHelper: 'helper-review' },
  play: async ({ canvasElement }) => {
    const body = within(canvasElement.ownerDocument.body)
    await expect(await body.findByRole('log', { name: 'What Test review is doing' })).toBeVisible()
  },
}

/** Helper · 3 · A sheet sliding over the page from the right. */
export const HelperSide: Story = {
  args: { opening: 'side', defaultHelper: 'helper-docs' },
  play: async ({ canvasElement }) => {
    const sheet = within(within(canvasElement).getByRole('region', { name: 'Helpers' }))
    await expect(sheet.getByRole('log', { name: 'What Documenter is doing' })).toBeVisible()
  },
}

/** Any opening · From inside, a press goes to another helper; Escape closes, back to the chip. */
export const HelperSwitchAndClose: Story = {
  args: { defaultHelper: 'helper-credit' },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    const sheet = within(canvas.getByRole('region', { name: 'Helpers' }))
    await userEvent.click(sheet.getByRole('button', { name: 'Helper Documenter, running' }))
    await expect(await sheet.findByRole('log', { name: 'What Documenter is doing' })).toBeVisible()
    await userEvent.keyboard('{Escape}')
    await waitFor(() => expect(canvas.queryByRole('region', { name: 'Helpers' })).toBeNull())
    await waitFor(() =>
      expect(
        line(canvasElement).getByRole('button', { name: 'Helper Documenter, running' }),
      ).toHaveFocus(),
    )
  },
}

/** The same sheet in a `free` Session. */
export const HelperInFree: Story = {
  args: { kind: 'free', defaultHelper: 'helper-explore' },
  play: async ({ canvasElement }) => {
    await expect(
      within(canvasElement).getByRole('log', { name: 'What Explore is doing' }),
    ).toBeVisible()
  },
}

/** The build's tasks at rest: how far it is at a glance, nothing unfolded. */
export const TasksAtAGlance: Story = {
  play: async ({ canvasElement }) => {
    const tasks = within(within(canvasElement).getByRole('region', { name: 'Tasks of ATL-7' }))
    await expect(tasks.getByLabelText('4 done')).toBeVisible()
    await expect(tasks.getByLabelText('2 in progress')).toBeVisible()
    await expect(tasks.queryAllByRole('button', { expanded: true })).toHaveLength(0)
  },
}

/** The tasks by state: what waits for the user first. */
export const TasksByState: Story = {
  args: { defaultGrouping: 'state' },
  play: async ({ canvasElement }) => {
    const tasks = within(within(canvasElement).getByRole('region', { name: 'Tasks of ATL-7' }))
    await expect(tasks.getByRole('group', { name: 'Waiting for you' })).toBeVisible()
  },
}

/** The tasks as one list. */
export const TasksAsAList: Story = {
  args: { defaultGrouping: 'list' },
  play: async ({ canvasElement }) => {
    const tasks = within(within(canvasElement).getByRole('region', { name: 'Tasks of ATL-7' }))
    await expect(tasks.getByRole('button', { name: 'One list' })).toHaveAttribute(
      'aria-pressed',
      'true',
    )
  },
}

/** A task unfolded: its tries and checks, its files, what came back on it. */
export const TaskOpened: Story = {
  args: { defaultTask: 'story-export-a-month:bt-t2' },
  play: async ({ canvasElement }) => {
    const detail = within(within(canvasElement).getByRole('region', { name: 'T2 in detail' }))
    await expect(detail.getByText(/ExportButton.tsx/)).toBeVisible()
    await expect(detail.getByText('Main agent')).toBeVisible()
  },
}

/** The same build over the chat: the tasks and an unfolded task use the whole width. */
export const TaskOpenedOverTheChat: Story = {
  args: { defaultOver: true, defaultTask: 'story-export-a-month:bt-t2' },
  play: async ({ canvasElement }) => {
    await expect(within(canvasElement).getByRole('region', { name: 'T2 in detail' })).toBeVisible()
  },
}

/** The pill's permission answered: it goes, and the pill with it. */
export const NoticeAnswered: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    const body = within(canvasElement.ownerDocument.body)
    await userEvent.click(await canvas.findByRole('button', { name: /Waiting for your answer/ }))
    await userEvent.click(await body.findByRole('button', { name: 'Run once' }))
    await waitFor(() =>
      expect(canvas.queryByRole('button', { name: /Waiting for your answer/ })).toBeNull(),
    )
  },
}
