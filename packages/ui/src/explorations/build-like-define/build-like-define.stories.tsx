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
 * - A helper's chip is its icon, its dot and its name. It opens that helper's live thread, read
 *   only, in a dialog, the same way in every kind of Session (`HelperViewer`).
 * - Over the chat, the panel shows more: the build's stories, helpers and runs at work, its tasks
 *   and one task whole, or the frozen Spec beside the tasks; the Spec's outline and open
 *   questions beside it.
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
  args: { kind: 'build', head: 'page' },
  argTypes: {
    kind: { control: 'inline-radio', options: ['free', 'define', 'build'] },
    head: { control: 'inline-radio', options: ['page', 'chat'] },
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
    await userEvent.click(canvas.getByRole('button', { name: 'Over the chat' }))
    await waitFor(() => expect(panel.getBoundingClientRect().width).toBeGreaterThan(beside * 1.5))
    await expect(chat.getBoundingClientRect().width).toBe(chatWidth)
    await userEvent.click(canvas.getByRole('button', { name: 'Over the chat' }))
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

/** A helper's thread in a dialog: that helper only, its live thread, no box to write in. */
export const HelperDialog: Story = {
  args: { defaultHelper: 'helper-review' },
  play: async ({ canvasElement }) => {
    const body = within(canvasElement.ownerDocument.body)
    const dialog = within(await body.findByRole('dialog', { name: 'Test review' }))
    await expect(dialog.getByRole('log', { name: 'What Test review is doing' })).toBeVisible()
    await expect(dialog.queryByRole('group', { name: /helpers/ })).toBeNull()
    await expect(dialog.queryAllByRole('textbox')).toHaveLength(0)
  },
}

/** A chip opens its helper's dialog; Escape closes it, and the keyboard is back on the chip. */
export const HelperOpensAndCloses: Story = {
  play: async ({ canvasElement }) => {
    const body = within(canvasElement.ownerDocument.body)
    const chip = line(canvasElement).getByRole('button', { name: 'Helper Documenter, running' })
    await userEvent.click(chip)
    const log = await body.findByRole('log', { name: 'What Documenter is doing' })
    await waitFor(() => expect(log).toBeVisible())
    await userEvent.keyboard('{Escape}')
    await waitFor(() => expect(body.queryByRole('dialog')).toBeNull())
    await waitFor(() => expect(chip).toHaveFocus())
  },
}

/** The same dialog in a `free` Session. */
export const HelperInFree: Story = {
  args: { kind: 'free', defaultHelper: 'helper-explore' },
  play: async ({ canvasElement }) => {
    const body = within(canvasElement.ownerDocument.body)
    await expect(await body.findByRole('log', { name: 'What Explore is doing' })).toBeVisible()
  },
}

/** Over the chat, the build is a master and its detail: the tasks, and one task whole. */
export const BuildWideView: Story = {
  args: { defaultOver: true },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    const build = within(canvas.getByRole('region', { name: 'The build of ATL-7' }))
    await expect(build.getByRole('button', { name: /T5/ })).toHaveAttribute('aria-pressed', 'true')
    await expect(build.getByRole('region', { name: 'T5 in detail' })).toBeVisible()
  },
}

/** Over the chat, a task picked in the list shows whole beside it. */
export const BuildWidePick: Story = {
  args: { defaultOver: true },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await userEvent.click(canvas.getAllByRole('button', { name: /T2/ })[0]!)
    await expect(await canvas.findByRole('region', { name: 'T2 in detail' })).toBeVisible()
  },
}

/** The frozen Spec, from beside the chat: the panel goes over it, the Spec beside its tasks. */
export const FrozenSpec: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await userEvent.click(canvas.getByRole('button', { name: 'The frozen Spec' }))
    await expect(await canvas.findByRole('region', { name: 'The frozen Spec ATL-7' })).toBeVisible()
    await expect(canvas.getByRole('button', { name: 'Over the chat' })).toHaveAttribute(
      'aria-pressed',
      'true',
    )
  },
}

/** Over the chat, the Spec's phases and sections are a sidebar, the rest of the width its text. */
export const DefineWideView: Story = {
  args: { kind: 'define', defaultOver: true },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    const outline = within(canvas.getByRole('navigation', { name: 'Outline of ATL-7' }))
    await expect(outline.getByRole('button', { name: /^Plan \d/ })).toBeVisible()
    await userEvent.click(outline.getByRole('button', { name: 'Questions' }))
    await waitFor(() =>
      expect(outline.getByRole('button', { name: 'Questions' })).toHaveAttribute(
        'aria-current',
        'location',
      ),
    )
    await expect(canvas.queryByRole('complementary', { name: 'Open questions' })).toBeNull()
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
