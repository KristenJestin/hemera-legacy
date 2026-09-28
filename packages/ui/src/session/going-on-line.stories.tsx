import type { Meta, StoryObj } from '@storybook/react-vite'
import type { ReactNode } from 'react'
import { expect, fn, screen, userEvent, waitFor, within } from 'storybook/test'

import { TooltipProvider } from '../components/tooltip/tooltip.tsx'
import { GOING_ON } from './going-on-fixtures.ts'
import { GoingOnLine, type GoingOnLineProps } from './going-on-line.tsx'

/**
 * What goes on in a Session, as a line right under its title (issue #219, the fourth round of its
 * exploration): the commands Hemera runs on a solid edge, the ones the agent runs in its own shell
 * on a dashed one, sub-agents with a robot. How each stands is its dot; what failed comes first,
 * then what runs, then what is over; four chips and a `+N` for the rest. A chip opens a glance, its
 * ⓘ the Details, laid the same way for every kind.
 */

function Line(props: GoingOnLineProps): ReactNode {
  return (
    <TooltipProvider>
      <div className="mx-auto flex w-full max-w-3xl flex-col gap-3 px-6 pt-6">
        <h1 className="text-2xl font-medium">Blank page after the merge</h1>
        <GoingOnLine {...props} />
      </div>
    </TooltipProvider>
  )
}

const meta = {
  title: 'Blocks/Session/GoingOnLine',
  component: Line,
  tags: ['autodocs', 'new'],
  parameters: {
    layout: 'fullscreen',
    docs: { story: { inline: false, height: '32rem' } },
  },
  args: {
    items: GOING_ON.few,
    emptyLabel: 'Nothing running in csv-export',
    onStop: fn(),
    onOpenUrl: fn(),
    onAddToCatalogue: fn(),
  },
} satisfies Meta<typeof Line>

export default meta

type Story = StoryObj<typeof meta>

export const Empty: Story = { args: { items: [] } }

export const Few: Story = {}

export const Many: Story = {
  args: { items: GOING_ON.many },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    // The four that run are chips; the four that are over wait behind the +4.
    await expect(canvas.getByRole('button', { name: '4 more' })).toBeVisible()
    await expect(canvas.queryByRole('button', { name: /^lint/ })).toBeNull()
  },
}

export const Failed: Story = {
  args: { items: GOING_ON.failed },
  play: async ({ canvasElement }) => {
    const chips = within(canvasElement).getAllByRole('button')
    // What failed comes first, whatever began before it.
    await expect(chips[0]).toHaveAccessibleName('typecheck, failed')
  },
}

export const RunGlance: Story = { args: { defaultOpen: 'run-test' } }

export const ShellGlance: Story = { args: { defaultOpen: 'shell-vitest' } }

export const AgentGlance: Story = { args: { items: GOING_ON.many, defaultOpen: 'agent-explore' } }

export const Everything: Story = { args: { items: GOING_ON.many, defaultOpen: 'more' } }

export const RunDetails: Story = { args: { defaultDetail: 'run-test' } }

export const ServerDetails: Story = { args: { defaultDetail: 'run-dev' } }

export const ShellDetails: Story = { args: { defaultDetail: 'shell-vitest' } }

export const AgentDetails: Story = {
  args: { items: GOING_ON.many, defaultDetail: 'agent-explore' },
}

export const OneOffDetails: Story = {
  args: { items: GOING_ON.oneOff, defaultDetail: 'run-one-off' },
  play: async ({ args }) => {
    const details = await screen.findByRole('dialog')
    await expect(within(details).getByText('One-off, not in the catalogue')).toBeVisible()
    await expect(within(details).getByText('Nothing printed yet.')).toBeVisible()
    await userEvent.click(within(details).getByRole('button', { name: 'Add to catalogue' }))
    await expect(args.onAddToCatalogue).toHaveBeenCalledWith(
      expect.objectContaining({ id: 'run-one-off' }),
    )
  },
}

/** A run in one of the Project's repositories is said as that repository, never as a folder. */
export const RepositoryDetails: Story = {
  args: { items: GOING_ON.places, defaultDetail: 'run-in-repository' },
  play: async ({ canvasElement }) => {
    const details = await screen.findByRole('dialog', { name: 'build' })
    await expect(within(details).getByText('Repository')).toBeVisible()
    await expect(within(details).getByText('v2')).toBeVisible()
    await expect(within(details).queryByText('Folder')).toBeNull()
    // The chip says it the same way: the repository's name, and not a folder.
    await expect(within(canvasElement).getByText('v2')).toBeInTheDocument()
  },
}

/** A folder that is none of the Project's repositories stays a folder. */
export const FolderDetails: Story = {
  args: { items: GOING_ON.places, defaultDetail: 'run-in-folder' },
  play: async () => {
    const details = await screen.findByRole('dialog', { name: 'seed' })
    await expect(within(details).getByText('Folder')).toBeVisible()
    await expect(within(details).getByText('tools')).toBeVisible()
    await expect(within(details).queryByText('Repository')).toBeNull()
  },
}

export const RoundTrip: Story = {
  play: async ({ canvasElement, args }) => {
    const canvas = within(canvasElement)
    await userEvent.click(canvas.getByRole('button', { name: 'test, running' }))
    const glanced = await screen.findByRole('dialog', { name: 'test, running' })
    await waitFor(() => expect(within(glanced).getByText(/csv\.stream\.test\.ts/)).toBeVisible())
    await userEvent.click(within(glanced).getByRole('button', { name: 'Stop test' }))
    await expect(args.onStop).toHaveBeenCalledWith(expect.objectContaining({ id: 'run-test' }))
    await userEvent.click(within(glanced).getByRole('button', { name: 'Details of test' }))
    const details = await screen.findByRole('dialog', { name: 'test' })
    await expect(within(details).getByText(/by the agent through Hemera/)).toBeVisible()
    await userEvent.keyboard('{Escape}')
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull())
  },
}

export const ManyRoundTrip: Story = {
  args: { items: GOING_ON.many },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await userEvent.click(canvas.getByRole('button', { name: '4 more' }))
    const list = await screen.findByRole('dialog', { name: 'Everything in this Session' })
    await userEvent.click(
      within(list).getByRole('button', { name: 'Sub-agent Review, done, details' }),
    )
    const details = await screen.findByRole('dialog', { name: 'Sub-agent · Review' })
    await expect(within(details).getByText(/No row is written twice/)).toBeVisible()
    await userEvent.keyboard('{Escape}')
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull())
  },
}
