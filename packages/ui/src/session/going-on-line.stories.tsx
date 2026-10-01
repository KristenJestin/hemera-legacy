import type { Meta, StoryObj } from '@storybook/react-vite'
import { type ReactNode, useState } from 'react'
import { expect, fn, screen, userEvent, waitFor, within } from 'storybook/test'

import { atRest } from '../../.storybook/at-rest.ts'
import { useBeat } from '../../.storybook/beat.ts'
import { journeyOf, readEveryFrame } from '../../.storybook/journey.ts'
import { movesLess } from '../../.storybook/reduced-motion.ts'
import { TooltipProvider } from '../components/tooltip/tooltip.tsx'
import { AgentText } from '../message/agent-text.tsx'
import { GOING_ON, HELPERS, ONE_OFF_DONE } from './going-on-fixtures.ts'
import type { GoingOnAgent } from './going-on.ts'
import { GoingOnLine, type GoingOnLineProps } from './going-on-line.tsx'

/**
 * What goes on in a Session, as a line right under its title (issue #219, the fourth round of its
 * exploration): the commands Hemera runs on a solid edge, the ones the agent runs in its own shell
 * on a dashed one, the helpers the agent launched with their avatar (issue #77). What failed comes
 * first, then what runs, then what is over; four chips and a `+N` for the rest. A chip opens a
 * glance; its ⓘ the Details of a command, or a helper's live thread, read-only.
 */

/** A helper's thread, as the page would draw it: what it said, one block each. */
function threadOf(helper: GoingOnAgent): ReactNode {
  return (
    <>
      <AgentText text="Reading `src/export/csv.stream.ts` to see how the rows are written." />
      <AgentText text={helper.last ?? 'Starting.'} />
    </>
  )
}

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
  tags: ['autodocs'],
  parameters: {
    layout: 'fullscreen',
    docs: { story: { inline: false, height: '32rem' } },
  },
  args: {
    items: GOING_ON.few,
    onStop: fn(),
    onOpenUrl: fn(),
    onAddToCatalogue: fn(),
    onRunAgain: fn(),
    onRemove: fn(),
    onStopHelper: fn(),
    onGlance: fn(),
    helperThread: threadOf,
  },
} satisfies Meta<typeof Line>

export default meta

type Story = StoryObj<typeof meta>

/** Nothing goes on: the line is its Run alone, and says nothing (review of #250). */
export const Empty: Story = {
  args: { items: [] },
  play: async ({ canvasElement }) => {
    const line = within(canvasElement).getByRole('group', { name: 'What goes on in this Session' })
    await expect(line).toHaveTextContent('')
  },
}

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

/** A helper's glance: what it is doing, and what it last said; ⓘ and × in its head. */
export const HelperGlance: Story = {
  args: { items: HELPERS.running, defaultOpen: 'helper-reader' },
  play: async () => {
    const glanced = await screen.findByRole('dialog', { name: 'Helper Write the reader, running' })
    await expect(within(glanced).getByText('Editing a file')).toBeVisible()
    await expect(within(glanced).getByText(/now the/)).toBeVisible()
    await expect(
      within(glanced).getByRole('button', { name: 'Details of Write the reader' }),
    ).toBeVisible()
    await expect(
      within(glanced).getByRole('button', { name: 'Stop Write the reader' }),
    ).toBeVisible()
  },
}

export const Everything: Story = { args: { items: GOING_ON.many, defaultOpen: 'more' } }

export const RunDetails: Story = { args: { defaultDetail: 'run-test' } }

export const ServerDetails: Story = { args: { defaultDetail: 'run-dev' } }

export const ShellDetails: Story = { args: { defaultDetail: 'shell-vitest' } }

/**
 * A helper's dialog: its live thread, read-only — no composer, nothing to answer with — under a
 * head its live face leads.
 */
export const HelperThread: Story = {
  args: { items: HELPERS.running, defaultDetail: 'helper-reader' },
  play: async () => {
    const dialog = await screen.findByRole('dialog', { name: 'Write the reader' })
    await waitFor(() => expect(within(dialog).getByText(/csv\.stream\.ts/)).toBeVisible())
    await expect(within(dialog).getByRole('img', { name: /writing/i })).toBeVisible()
    await expect(within(dialog).queryByRole('textbox')).toBeNull()
  },
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
  play: async () => {
    const details = await screen.findByRole('dialog', { name: 'build' })
    await expect(within(details).getByText('Repository')).toBeVisible()
    await expect(within(details).getByText('v2')).toBeVisible()
    await expect(within(details).queryByText('Folder')).toBeNull()
  },
}

/** The chip's glance says the same place: the repository's mark and name. */
export const RepositoryGlance: Story = {
  args: { items: GOING_ON.places, defaultOpen: 'run-in-repository' },
  play: async () => {
    const glanced = await screen.findByRole('dialog', { name: 'build, running' })
    await expect(within(glanced).getByText('v2')).toBeVisible()
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
    // What runs is stopped from here, once the reader said so, and neither run again nor taken out.
    await expect(within(glanced).queryByRole('button', { name: /again$/ })).toBeNull()
    await expect(within(glanced).queryByRole('button', { name: /from the line$/ })).toBeNull()
    await userEvent.click(within(glanced).getByRole('button', { name: 'Stop test' }))
    await expect(args.onStop).not.toHaveBeenCalled()
    const asked = await within(glanced).findByRole('group', { name: 'Stop test?' })
    await userEvent.click(within(asked).getByRole('button', { name: 'Stop' }))
    await expect(args.onStop).toHaveBeenCalledWith(expect.objectContaining({ id: 'run-test' }))
    await userEvent.click(within(glanced).getByRole('button', { name: 'Details of test' }))
    const details = await screen.findByRole('dialog', { name: 'test' })
    // It opens by the dialog's own motion, as every dialog of the window does (review of #250).
    await waitFor(() =>
      expect(within(details).getByText(/by the agent through Hemera/)).toBeVisible(),
    )
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
      within(list).getByRole('button', { name: 'Helper Test review, done, details' }),
    )
    const details = await screen.findByRole('dialog', { name: 'Test review' })
    await waitFor(() => expect(within(details).getByText(/Every criterion of T1/)).toBeVisible())
    await userEvent.keyboard('{Escape}')
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull())
  },
}

/**
 * A glance's head (issue #237): Stop while it runs, Run again once it is over, the one-off's
 * `Add to catalogue`, then the ⓘ and the ✕ that takes the chip out of the line — icons named by
 * their tooltips, in that order. Closing the glance of something over is having seen it.
 */
export const GlanceActs: Story = {
  args: {
    items: [ONE_OFF_DONE],
  },
  play: async ({ canvasElement, args }) => {
    const canvas = within(canvasElement)
    const chip = canvas.getByRole('button', { name: /done$/ })
    await userEvent.click(chip)
    const glanced = await screen.findByRole('dialog', { name: /done$/ })
    const acts = within(glanced)
      .getAllByRole('button')
      .map((one) => one.getAttribute('aria-label') ?? '')
    await expect(acts.map((one) => one.split(' ')[0])).toEqual(['Run', 'Add', 'Details', 'Remove'])
    await expect(within(glanced).queryByRole('button', { name: /^Stop/ })).toBeNull()
    await userEvent.click(
      within(glanced).getByRole('button', { name: /^Add .* to the catalogue$/ }),
    )
    await expect(args.onAddToCatalogue).toHaveBeenCalledTimes(1)
    await userEvent.keyboard('{Escape}')
    await waitFor(() => {
      expect(screen.queryByRole('dialog', { name: /done$/ })).toBeNull()
    })
    // Read and put away, the chip stays: reading is not taking out (review of #250).
    await expect(chip).toBeInTheDocument()
    await expect(args.onRemove).not.toHaveBeenCalled()
    await userEvent.click(chip)
    const again = await screen.findByRole('dialog', { name: /done$/ })
    await userEvent.click(within(again).getByRole('button', { name: /again$/ }))
    await expect(args.onRunAgain).toHaveBeenCalledTimes(1)
  },
}

/**
 * The ✕ of an ended run's glance takes the chip out of the line; the page decides what the line
 * holds.
 */
export const RemovedByHand: Story = {
  args: { items: [ONE_OFF_DONE] },
  play: async ({ canvasElement, args }) => {
    const canvas = within(canvasElement)
    await userEvent.click(canvas.getByRole('button', { name: /done$/ }))
    const glanced = await screen.findByRole('dialog', { name: /done$/ })
    await userEvent.click(within(glanced).getByRole('button', { name: /from the line$/ }))
    // The glance closes first; the chip is taken out once it is gone.
    await waitFor(() => {
      expect(screen.queryByRole('dialog', { name: /done$/ })).toBeNull()
    })
    await waitFor(() => {
      expect(args.onRemove).toHaveBeenCalledWith(
        expect.objectContaining({ id: 'run-one-off-done' }),
      )
    })
  },
}

/**
 * The line, whose test runs for a beat, fails for a beat, and runs again: the story plays the
 * change by itself, with nothing beside the line to drive it.
 */
function Ending(props: GoingOnLineProps): ReactNode {
  const step = useBeat(2)
  const [shown, setShown] = useState<{ step: number; endedAt: number | null }>({
    step: 0,
    endedAt: null,
  })
  if (shown.step !== step) setShown({ step, endedAt: step === 0 ? null : Date.now() })
  const items = props.items.map((one) =>
    one.kind === 'run' && one.id === 'run-test' && step === 1
      ? { ...one, state: 'failed' as const, exitCode: 1, endedAt: shown.endedAt }
      : one,
  )
  return <Line {...props} items={items} />
}

/** A line that takes out what its glance's ✕ asks it to, as the page does. */
function Removing(props: GoingOnLineProps): ReactNode {
  const [items, setItems] = useState(props.items)
  return (
    <Line
      {...props}
      items={items}
      onRemove={(gone) => setItems((before) => before.filter((one) => one.id !== gone.id))}
    />
  )
}

/**
 * Taken out from its glance (review of #250): the glance closes with its own motion first, and
 * the chip leaves the line by its width once the glance is gone — never a glance left anchored to
 * a chip that is going away.
 */
export const RemovedFromItsGlance: Story = {
  args: { items: [...GOING_ON.few, ONE_OFF_DONE] },
  render: (args) => <Removing {...args} />,
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await userEvent.click(canvas.getByRole('button', { name: /done$/ }))
    const glanced = await screen.findByRole('dialog', { name: /done$/ })
    await userEvent.click(within(glanced).getByRole('button', { name: /from the line$/ }))
    // While the glance is still there, the chip it hangs from is too.
    await expect(canvas.getByRole('button', { name: /done$/ })).toBeInTheDocument()
    await waitFor(() => {
      expect(screen.queryByRole('dialog', { name: /done$/ })).toBeNull()
    })
    await waitFor(() => {
      expect(canvas.queryByRole('button', { name: /done$/ })).toBeNull()
    })
  },
}

/**
 * The runs Hemera holds are live chips (issue #77): their type's icon, no dot, their seconds, a
 * faint breath while they run, and the plain mark they ended on. The agent's own shell commands
 * keep their dot.
 */
export const LiveRuns: Story = {
  args: { items: GOING_ON.many },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    const dev = canvas.getByRole('button', { name: 'dev, running on localhost:5173/' })
    await expect(dev).toHaveTextContent(/^dev\d+s$/)
    await expect(dev.querySelector('[data-breath]')).not.toBeNull()
    await expect(dev.querySelector('.rounded-full')).toBeNull()
    const shell = canvas.getByRole('button', { name: /run by the agent, running$/ })
    await expect(shell.querySelector('.rounded-full')).not.toBeNull()
  },
}

/** A run of the line ends where it is watched: its wipe, then the mark it ended on. */
export const RunEnds: Story = {
  render: (args) => <Ending {...args} />,
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    const chip = canvas.getByRole('button', { name: 'test, running' })
    await waitFor(() =>
      expect(chip.querySelector('[data-wipe]')).toHaveClass('bg-destructive-muted'),
    )
    await expect(chip).toHaveAccessibleName('test, failed')
    await waitFor(() => expect(chip.querySelector('[data-end="failed"]')).not.toBeNull())
    await waitFor(() => expect(chip.querySelector('[data-wipe]')).toBeNull())
  },
}

/**
 * What failed comes first: a run that fails while watched travels to the head of the line, frame
 * after frame, rather than jumping there; the chips it passes make room for it.
 */
export const FailedRunTakesTheLead: Story = {
  render: (args) => <Ending {...args} />,
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    const chip = canvas.getByRole('button', { name: 'test, running' })
    const from = chip.getBoundingClientRect().left
    const watch = readEveryFrame(() => chip.getBoundingClientRect().left)
    await waitFor(() => expect(canvas.getAllByRole('button')[0]).toBe(chip))
    await atRest(chip)
    const to = chip.getBoundingClientRect().left
    await expect(to).toBeLessThan(from)
    if (movesLess()) return
    await expect(journeyOf(watch.stop(), from, to)).not.toBe('jumped')
  },
}

/**
 * A one-off's whole line is its name: on the line it ends in "…" at the chip's widest, its seconds
 * whole beside it; its glance and its tooltip say all of it.
 */
export const LongName: Story = {
  args: { items: GOING_ON.oneOff },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    const chip = canvas.getByRole('button', { name: /^pnpm vitest run csv\.stream/ })
    const name = within(chip).getByText('pnpm vitest run csv.stream --reporter verbose')
    await expect(name.scrollWidth).toBeGreaterThan(name.clientWidth)
    const time = chip.lastElementChild!
    await expect(time).toHaveTextContent(/^\d+s$/)
    await expect(time.getBoundingClientRect().right).toBeLessThanOrEqual(
      chip.getBoundingClientRect().right,
    )
    await userEvent.hover(chip)
    await expect(await screen.findByRole('tooltip')).toHaveTextContent(
      'pnpm vitest run csv.stream --reporter verbose',
    )
  },
}

/** Helpers at work: a live chip each, their avatar in the slot, a breath, their seconds. */
export const HelpersRunning: Story = {
  args: { items: HELPERS.running },
  play: async ({ canvasElement }) => {
    const chip = within(canvasElement).getByRole('button', {
      name: 'Helper Write the reader, running',
    })
    await expect(chip).toHaveTextContent(/^WWrite the reader\d+s$/)
    await expect(chip.querySelector('[data-breath]')).not.toBeNull()
  },
}

/** Helpers over: done, failed, stopped — the plain mark each ended on, and their seconds kept. */
export const HelpersEnded: Story = {
  args: { items: HELPERS.ended },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    // What failed comes first.
    await expect(canvas.getAllByRole('button')[0]).toHaveAccessibleName(
      'Helper Security review, failed',
    )
    await expect(
      canvas.getByRole('button', { name: 'Helper Test review, done' }).querySelector('[data-end]'),
    ).toHaveAttribute('data-end', 'finished')
    await expect(
      canvas.getByRole('button', { name: 'Helper Documenter, done' }).querySelector('[data-end]'),
    ).toHaveAttribute('data-end', 'stopped')
  },
}

/** Helpers among the runs: one line, four chips and the rest behind `+N`. */
export const HelpersCrowded: Story = {
  args: { items: HELPERS.crowded },
  play: async ({ canvasElement }) => {
    await expect(within(canvasElement).getByRole('button', { name: '3 more' })).toBeVisible()
  },
}

/** Two helpers share an initial: each avatar takes two letters. */
export const SharedInitials: Story = {
  args: { items: HELPERS.sharedInitials },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await expect(
      canvas.getByRole('button', { name: 'Helper Write the reader, running' }),
    ).toHaveTextContent(/^WT/)
    await expect(
      canvas.getByRole('button', { name: 'Helper Wire them, running' }),
    ).toHaveTextContent(/^WT/)
  },
}

/** A free helper's brief is its name: cut on the line, its seconds whole, all of it in its glance. */
export const HelperLongName: Story = {
  args: { items: HELPERS.longName },
  play: async ({ canvasElement }) => {
    const chip = within(canvasElement).getByRole('button', { name: /^Helper Find every place/ })
    const name = within(chip).getByText(/^Find every place/)
    await expect(name.scrollWidth).toBeGreaterThan(name.clientWidth)
    await expect(chip.lastElementChild).toHaveTextContent(/^\d+s$/)
  },
}

/** × stops a helper once the reader said so: `Stop <name>?` in its glance, then Stop. */
export const HelperStop: Story = {
  args: { items: HELPERS.running },
  play: async ({ canvasElement, args }) => {
    await userEvent.click(
      within(canvasElement).getByRole('button', { name: 'Helper Write the reader, running' }),
    )
    const glanced = await screen.findByRole('dialog', { name: 'Helper Write the reader, running' })
    await expect(args.onGlance).toHaveBeenCalledWith('helper-reader', true)
    await userEvent.click(within(glanced).getByRole('button', { name: 'Stop Write the reader' }))
    await expect(args.onStopHelper).not.toHaveBeenCalled()
    const asked = await within(glanced).findByRole('group', { name: 'Stop Write the reader?' })
    await userEvent.click(within(asked).getByRole('button', { name: 'Stop' }))
    await expect(args.onStopHelper).toHaveBeenCalledWith(
      expect.objectContaining({ id: 'helper-reader' }),
    )
    await userEvent.keyboard('{Escape}')
    await waitFor(() => expect(args.onGlance).toHaveBeenCalledWith('helper-reader', false))
  },
}
