import type { Meta, StoryObj } from '@storybook/react-vite'
import type { ReactNode } from 'react'
import { expect, userEvent, waitFor, within } from 'storybook/test'

import { TooltipProvider } from '../../components/tooltip/tooltip.tsx'
import { HelperDefinitions } from './definitions.tsx'
import type { VariantProps } from './page.tsx'
import { DrawerSession } from './variant-drawer.tsx'
import { StripSession } from './variant-strip.tsx'
import { TabsSession } from './variant-tabs.tsx'

/**
 * The build Session as an orchestrator (design exploration of 30 September 2026, issue #77).
 * Storybook only: nothing here is wired, and no component of the design system changed for it.
 * The design note is `docs/product/sub-agents.md`.
 *
 * The user talks to the main agent only. It launches helper agents — defined ones, written in
 * advance with their own icon (a test review, the documenter), and free ones with the common icon
 * — stops them and reads their results. The helpers are chips in the line of what goes on, next
 * to the runs; a helper launched by another is joined to its launcher's chip. A chip's glance
 * says what it is doing and its last line, and opens its session, read only, in the stage.
 *
 * The chat is of moderate use in a build: the build view is made big, and the chat folds or
 * closes. Three ways, each on the real build view of `ATL-7`, with the head across the page so
 * the line and the notices stay reachable whatever the chat does:
 *
 * - A · Strip — the chat folds to a strip on the left, the build takes the width; the strip keeps
 *   the main agent's face and a Write; the notices stand at the foot of the build.
 * - B · Build and Chat — two full-width views and a switch; the composer is the page's foot.
 * - C · Drawer — the build is the page; the chat slides over it from the left.
 *
 * Recommended: A. The build is big and the chat is one press away, where it was; the main agent's
 * face in the strip says what it is doing without unfolding anything; and unfolded, the chat and
 * a helper's session can be read side by side, which neither B nor C allows.
 */

type Variant = 'strip' | 'tabs' | 'drawer'

function Screen({ variant, ...props }: VariantProps & { variant: Variant }): ReactNode {
  return (
    <TooltipProvider>
      {variant === 'strip' && <StripSession {...props} />}
      {variant === 'tabs' && <TabsSession {...props} />}
      {variant === 'drawer' && <DrawerSession {...props} />}
    </TooltipProvider>
  )
}

const meta = {
  title: 'Explorations/Orchestrator',
  component: Screen,
  tags: ['autodocs', 'new'],
  parameters: { layout: 'fullscreen' },
  args: { variant: 'strip', chatOpen: false, openHelper: null, glance: null },
  argTypes: {
    variant: { control: 'select', options: ['strip', 'tabs', 'drawer'] },
    chatOpen: { control: 'boolean' },
    openHelper: {
      control: 'select',
      options: [null, 'helper-t2', 'helper-sample', 'helper-t3', 'helper-review', 'helper-docs'],
    },
    glance: {
      control: 'select',
      options: [null, 'helper-t2', 'helper-sample', 'helper-t3', 'helper-review'],
    },
  },
} satisfies Meta<typeof Screen>

export default meta

type Story = StoryObj<typeof meta>

/** Every helper is a chip of the line, named with how it stands. */
async function seesHelpers(canvasElement: HTMLElement): Promise<void> {
  const line = within(
    within(canvasElement).getByRole('group', { name: 'What goes on in this Session' }),
  )
  await expect(line.getByRole('button', { name: 'Helper T2, running' })).toBeVisible()
  await expect(line.getByRole('button', { name: 'Helper Ledger sample, running' })).toBeVisible()
  await expect(line.getByRole('button', { name: 'Helper T3, silent' })).toBeVisible()
  await expect(line.getByRole('button', { name: 'Helper Test review, done' })).toBeVisible()
  await expect(line.getByRole('button', { name: 'Helper Documenter, running' })).toBeVisible()
}

/** A · The chat folded to its strip: the build has the width, the line and the notices stay. */
export const StripFolded: Story = {
  play: async ({ canvasElement }) => {
    await seesHelpers(canvasElement)
    const canvas = within(canvasElement)
    await expect(canvas.getByRole('button', { name: 'Write to the main agent' })).toBeVisible()
    await expect(canvas.getByRole('button', { name: /Permissions/ })).toBeVisible()
  },
}

/** A · The chat unfolded beside the build, the notices on its composer's edge. */
export const StripOpen: Story = {
  args: { chatOpen: true },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await expect(canvas.getByRole('log', { name: 'The thread of this Session' })).toBeVisible()
  },
}

/** A · Folding the chat gives its width to the build; Write brings it back, caret in the box. */
export const StripFoldsAndComesBack: Story = {
  args: { chatOpen: true },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    const chat = canvas.getByRole('region', { name: 'Chat with the main agent' })
    const open = chat.getBoundingClientRect().width
    await userEvent.click(canvas.getByRole('button', { name: 'Fold the chat' }))
    await waitFor(() => expect(chat.getBoundingClientRect().width).toBeLessThan(open / 4))
    await userEvent.click(canvas.getByRole('button', { name: 'Write to the main agent' }))
    await waitFor(() => expect(chat.getBoundingClientRect().width).toBe(open))
  },
}

/** A · A helper's session in the stage, with the main chat beside it. */
export const StripHelperSession: Story = {
  args: { chatOpen: true, openHelper: 'helper-t2' },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    const session = canvas.getByRole('region', { name: 'The session of T2' })
    await expect(within(session).getByRole('log', { name: 'What T2 is doing' })).toBeVisible()
    // Read only: the only box on the page is the main agent's.
    await expect(canvas.getAllByRole('textbox')).toHaveLength(1)
    await expect(canvas.getByRole('button', { name: 'Helper T2, running' })).toHaveAttribute(
      'aria-pressed',
      'true',
    )
  },
}

/** A · The glance of the helper that has been silent for seven minutes. */
export const StripStuckGlance: Story = {
  args: { glance: 'helper-t3' },
  play: async ({ canvasElement }) => {
    const body = within(canvasElement.ownerDocument.body)
    await expect(await body.findByRole('button', { name: 'Open the session of T3' })).toBeVisible()
  },
}

/** A · The glance of a helper launched by another: its launcher is named. */
export const StripLaunchedByAHelper: Story = {
  args: { glance: 'helper-sample' },
  play: async ({ canvasElement }) => {
    const body = within(canvasElement.ownerDocument.body)
    await expect(await body.findByText('by T2')).toBeVisible()
  },
}

/** Any variant · A chip's glance opens the helper's session, and the way back closes it. */
export const OpensAHelperFromItsChip: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    const body = within(canvasElement.ownerDocument.body)
    await userEvent.click(canvas.getByRole('button', { name: 'Helper Documenter, running' }))
    await userEvent.click(
      await body.findByRole('button', { name: 'Open the session of Documenter' }),
    )
    await expect(await canvas.findByRole('log', { name: 'What Documenter is doing' })).toBeVisible()
    await userEvent.click(canvas.getByRole('button', { name: 'Main Session' }))
    await waitFor(() =>
      expect(canvas.queryByRole('region', { name: 'The session of Documenter' })).toBeNull(),
    )
  },
}

/** B · The Build view, the composer at the page's foot. */
export const TabsBuild: Story = {
  args: { variant: 'tabs' },
  play: async ({ canvasElement }) => {
    await seesHelpers(canvasElement)
    const canvas = within(canvasElement)
    await expect(canvas.getByRole('tab', { name: /Build/ })).toHaveAttribute(
      'aria-selected',
      'true',
    )
    await expect(canvas.getByRole('textbox')).toBeVisible()
  },
}

/** B · The Chat view, full width. */
export const TabsChat: Story = {
  args: { variant: 'tabs', chatOpen: true },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await expect(canvas.getByRole('log', { name: 'The thread of this Session' })).toBeVisible()
  },
}

/** B · A helper's session over the Build view. */
export const TabsHelperSession: Story = {
  args: { variant: 'tabs', openHelper: 'helper-t3' },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await expect(canvas.getByRole('log', { name: 'What T3 is doing' })).toBeVisible()
  },
}

/** C · The build is the page; the main agent and the notices at its foot. */
export const DrawerClosed: Story = {
  args: { variant: 'drawer' },
  play: async ({ canvasElement }) => {
    await seesHelpers(canvasElement)
    const canvas = within(canvasElement)
    await expect(canvas.getByRole('button', { name: /Main agent/ })).toBeVisible()
  },
}

/** C · The chat over the build, which does not move under it. */
export const DrawerOpen: Story = {
  args: { variant: 'drawer', chatOpen: true },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await expect(canvas.getByRole('log', { name: 'The thread of this Session' })).toBeVisible()
  },
}

/** C · A helper's session in the build's place, the drawer closed. */
export const DrawerHelperSession: Story = {
  args: { variant: 'drawer', openHelper: 'helper-review' },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await expect(canvas.getByRole('log', { name: 'What Test review is doing' })).toBeVisible()
  },
}

/** The defined helpers, as their definitions say them, and the free helper's common icon. */
export const Definitions: Story = {
  render: () => <HelperDefinitions />,
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    const names = ['Test review', 'Security review', 'Documenter', 'Prototyper', 'Free helper']
    await Promise.all(
      names.map((name) => expect(canvas.getByRole('article', { name })).toBeVisible()),
    )
  },
}
