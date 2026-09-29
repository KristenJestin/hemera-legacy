import type { Meta, StoryObj } from '@storybook/react-vite'
import { type ReactNode, useEffect, useState } from 'react'
import { expect, fn, screen, userEvent, waitFor, within } from 'storybook/test'

import { TooltipProvider } from '../components/tooltip/tooltip.tsx'
import { GOING_ON } from './going-on-fixtures.ts'
import { GoingOnLine } from './going-on-line.tsx'
import { type RunCatalogueEntry, RunCommand, type RunCommandProps } from './run-command.tsx'

/**
 * Where the reader starts a command in a Session (issue #219): Run, at the end of the line under
 * its title. One field over the Project's catalogue, matched on names and lines, the name first;
 * a line the catalogue lacks offered apart, to run once. The list is the button.
 */

const CATALOGUE: readonly RunCatalogueEntry[] = [
  { name: 'dev', command: 'pnpm dev', type: 'serve', running: true },
  { name: 'test', command: 'pnpm test', type: 'test', running: true },
  { name: 'lint', command: 'pnpm lint', type: 'lint', running: false },
  { name: 'typecheck', command: 'pnpm typecheck', type: 'lint', running: false },
  { name: 'storybook', command: 'pnpm storybook', type: 'serve', running: false },
]

function Frame(props: RunCommandProps): ReactNode {
  return (
    <TooltipProvider>
      <div className="flex px-6 pt-6">
        <RunCommand {...props} />
      </div>
    </TooltipProvider>
  )
}

const meta = {
  title: 'Blocks/Session/RunCommand',
  component: Frame,
  tags: ['autodocs', 'updated'],
  parameters: {
    layout: 'fullscreen',
    docs: { story: { inline: false, height: '28rem' } },
  },
  args: {
    catalogue: CATALOGUE,
    workspace: 'csv-export',
    onRunCommand: fn(),
    onRunOnce: fn(),
  },
} satisfies Meta<typeof Frame>

export default meta

type Story = StoryObj<typeof meta>

export const Closed: Story = {}

export const Catalogue: Story = { args: { defaultOpen: true } }

export const OneOff: Story = {
  args: { defaultOpen: true, defaultLine: 'pnpm vitest run csv.stream --reporter verbose' },
}

export const ByLine: Story = {
  args: { defaultOpen: true, defaultLine: 'pnpm lint' },
  play: async () => {
    const list = await screen.findByRole('listbox', { name: 'What Run can start' })
    // The line finds the command it is, and it is not offered again as a one-off.
    await expect(within(list).getAllByRole('option')[0]).toHaveTextContent('lint')
    await expect(within(list).queryByText('Run once')).toBeNull()
  },
}

export const Typo: Story = {
  args: { defaultOpen: true, defaultLine: 'typechek' },
  play: async () => {
    const list = await screen.findByRole('listbox', { name: 'What Run can start' })
    // A typo in a name still finds it, before the line is offered as it was typed.
    await expect(within(list).getAllByRole('option')[0]).toHaveTextContent('typecheck')
  },
}

export const EmptyCatalogue: Story = { args: { defaultOpen: true, catalogue: [] } }

export const InTheLine: Story = {
  render: (args) => (
    <TooltipProvider>
      <div className="mx-auto flex w-full max-w-3xl flex-col gap-3 px-6 pt-6">
        <h1 className="text-2xl font-medium">Blank page after the merge</h1>
        <GoingOnLine
          items={GOING_ON.few}
          onStop={fn()}
          onOpenUrl={fn()}
          onAddToCatalogue={fn()}
          end={<RunCommand {...args} />}
        />
      </div>
    </TooltipProvider>
  ),
}

export const RoundTrip: Story = {
  play: async ({ canvasElement, args }) => {
    await userEvent.click(within(canvasElement).getByRole('button', { name: 'Run' }))
    const field = await screen.findByRole('dialog', { name: 'Run a command' })
    // Typed, then Enter: the first match is the one started, and the field closes.
    await userEvent.type(within(field).getByRole('textbox', { name: 'Command' }), 'lint{Enter}')
    await expect(args.onRunCommand).toHaveBeenCalledWith(expect.objectContaining({ name: 'lint' }))
    await waitFor(() => expect(screen.queryByRole('dialog', { name: 'Run a command' })).toBeNull())
  },
}

export const OneOffRoundTrip: Story = {
  play: async ({ canvasElement, args }) => {
    await userEvent.click(within(canvasElement).getByRole('button', { name: 'Run' }))
    const field = await screen.findByRole('dialog', { name: 'Run a command' })
    await userEvent.type(
      within(field).getByRole('textbox', { name: 'Command' }),
      'pnpm vitest run csv',
    )
    // A click on the row starts it: the list is the button.
    await userEvent.click(
      within(field).getByRole('option', { name: 'Run once pnpm vitest run csv' }),
    )
    await expect(args.onRunOnce).toHaveBeenCalledWith('pnpm vitest run csv')
  },
}

export const EnterOnNothing: Story = {
  args: { defaultOpen: true },
  play: async ({ args }) => {
    const field = await screen.findByRole('dialog', { name: 'Run a command' })
    await userEvent.type(within(field).getByRole('textbox', { name: 'Command' }), '{Enter}')
    // An empty field chooses nothing: Enter there starts nothing.
    await expect(args.onRunCommand).not.toHaveBeenCalled()
    await expect(args.onRunOnce).not.toHaveBeenCalled()
  },
}

export const OneOffLikeACommand: Story = {
  args: {
    catalogue: [
      ...CATALOGUE,
      { name: 'seed', command: `node -e "console.log('seeded')"`, type: 'script', running: false },
    ],
  },
  play: async ({ canvasElement, args }) => {
    await userEvent.click(within(canvasElement).getByRole('button', { name: 'Run' }))
    const field = await screen.findByRole('dialog', { name: 'Run a command' })
    // A line that only looks like a command of the catalogue is run as it was typed: Enter never
    // starts the catalogue's command in its place.
    await userEvent.type(
      within(field).getByRole('textbox', { name: 'Command' }),
      `node -e "console.log('once')"{Enter}`,
    )
    await expect(args.onRunOnce).toHaveBeenCalledWith(`node -e "console.log('once')"`)
    await expect(args.onRunCommand).not.toHaveBeenCalled()
  },
}

/**
 * A page that registers Run's keystroke, as the application's table does: pressed anywhere —
 * the composer's box included — it asks Run to open.
 */
function WithTheKeystroke(props: RunCommandProps): ReactNode {
  const [asked, setAsked] = useState(0)
  useEffect(() => {
    const listen = (event: KeyboardEvent): void => {
      if (!(event.ctrlKey || event.metaKey) || !event.shiftKey || event.code !== 'KeyE') return
      event.preventDefault()
      setAsked((before) => before + 1)
    }
    document.addEventListener('keydown', listen)
    return () => document.removeEventListener('keydown', listen)
  }, [])
  return (
    <TooltipProvider>
      <div className="flex flex-col gap-6 px-6 pt-6">
        <RunCommand {...props} shortcut="Ctrl+Shift+E" asked={asked} />
        <textarea
          aria-label="Say something to claude…"
          className="rounded-md border border-border p-2"
        />
      </div>
    </TooltipProvider>
  )
}

/**
 * Run from the keyboard (review of #250): the keystroke opens Run's menu from the composer's box,
 * its field taking the caret; Run's tooltip says the keystroke, in the keys of the others.
 */
export const FromTheKeyboard: Story = {
  render: (args) => <WithTheKeystroke {...args} />,
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await userEvent.hover(canvas.getByRole('button', { name: 'Run' }))
    const tip = await screen.findByRole('tooltip')
    await expect(within(tip).getByText('Run a command')).toBeInTheDocument()
    await expect(tip.querySelector('kbd')).not.toBeNull()
    await userEvent.unhover(canvas.getByRole('button', { name: 'Run' }))
    await userEvent.click(canvas.getByRole('textbox', { name: 'Say something to claude…' }))
    await userEvent.keyboard('{Control>}{Shift>}E{/Shift}{/Control}')
    const menu = await screen.findByRole('dialog', { name: 'Run a command' })
    await waitFor(() => {
      expect(within(menu).getByRole('textbox', { name: 'Command' })).toHaveFocus()
    })
  },
}
