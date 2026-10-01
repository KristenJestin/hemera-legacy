import type { Meta, StoryObj } from '@storybook/react-vite'
import { MotionConfig } from 'motion/react'
import { type ReactNode, useState } from 'react'
import { expect, fn, screen, userEvent, waitFor, within } from 'storybook/test'

import { readEveryFrame } from '../../../.storybook/journey.ts'
import {
  AT_ONCE,
  emulateReducedMotion,
  movesLess,
  withinFrames,
} from '../../../.storybook/reduced-motion.ts'
import { IconChecklist, IconFlask, IconHammer, IconServer } from '../../icons.ts'
import { HelperAvatar } from '../../session/helper-avatar.tsx'
import { Button } from '../button/button.tsx'
import { TooltipProvider } from '../tooltip/tooltip.tsx'
import { LiveChip, type LiveChipProps, type LiveState } from './live-chip.tsx'

/**
 * What goes on, as one chip (issue #77): a run and a helper are the same chip and differ only by
 * what fills its icon slot. Neutral, no dot; its seconds in a room kept for three digits; a faint
 * breath across it while it works; one wipe in the tint it ended on, a shake if it failed, and
 * back to neutral with only its icon coloured. Pressed, its glance.
 */

/** A minute and a half ago, for a chip that is still at work. */
const AGO = Date.now() - 84_000

/** An ended chip, `seconds` long. */
function lasted(seconds: number): Pick<LiveChipProps, 'startedAt' | 'endedAt'> {
  return { startedAt: 0, endedAt: seconds * 1000 }
}

const STATES: LiveState[] = ['running', 'finished', 'failed', 'stopped']

const LINES = (
  <pre className="font-mono text-xs text-muted-foreground">
    ✓ csv.stream.test.ts (12){'\n'}✗ csv.totals.test.ts (1 failed)
  </pre>
)

/** A translation along the line, read off the matrix the browser computed. */
function shiftOf(element: Element): number {
  if (!element.isConnected) return Number.NaN
  const written = getComputedStyle(element).transform
  return written === 'none' ? 0 : new DOMMatrixReadOnly(written).m41
}

/** How far across the chip the last wipe stands: -1 before it, 1 past it. */
function crossingOf(wipe: Element): number {
  if (!(wipe instanceof HTMLElement) || !wipe.isConnected || wipe.offsetWidth === 0) {
    return Number.NaN
  }
  return shiftOf(wipe) / wipe.offsetWidth
}

/** A chip that runs until its End is pressed, and ends as asked. */
function Ending({ to, ...props }: LiveChipProps & { to: LiveState }): ReactNode {
  const [state, setState] = useState<LiveState>('running')
  const [endedAt, setEndedAt] = useState<number | null>(null)
  return (
    <div className="flex items-center gap-3">
      <LiveChip {...props} state={state} endedAt={endedAt} />
      <Button
        size="sm"
        variant="ghost"
        onClick={() => {
          setState(to)
          setEndedAt(Date.now())
        }}
      >
        End
      </Button>
    </div>
  )
}

const meta = {
  tags: ['autodocs'],
  title: 'Components/LiveChip',
  component: LiveChip,
  args: {
    name: 'test',
    icon: <IconFlask size="sm" aria-hidden="true" />,
    state: 'running',
    startedAt: AGO,
    endedAt: null,
    step: 'vitest run --reporter dot',
    children: LINES,
    onDetails: fn(),
    onStop: fn(),
    onRunAgain: fn(),
  },
  argTypes: {
    name: { control: 'text', description: 'The whole name; the chip ends a long one in "…".' },
    state: { control: 'inline-radio', options: STATES },
    icon: { table: { disable: true } },
    children: { table: { disable: true } },
    tools: { table: { disable: true } },
    startedAt: { control: 'number', description: 'When it started, in milliseconds.' },
    endedAt: { control: 'number', description: 'When it ended; null while it works.' },
  },
  decorators: [
    (Story) => (
      <TooltipProvider>
        <div className="p-12">
          <Story />
        </div>
      </TooltipProvider>
    ),
  ],
} satisfies Meta<typeof LiveChip>

export default meta
type Story = StoryObj<typeof meta>

export const Playground: Story = {}

/** The slot holds whatever says what the chip is: a command's type, a helper's avatar. */
export const Variants: Story = {
  parameters: { controls: { disable: true } },
  render: (args) => (
    <div className="flex items-center gap-1.5">
      <LiveChip {...args} name="dev" icon={<IconServer size="sm" aria-hidden="true" />} />
      <LiveChip
        {...args}
        name="Reviewer"
        icon={
          <span
            aria-hidden="true"
            className="inline-flex size-icon-sm items-center justify-center rounded-full bg-info-muted text-xs font-semibold text-info-muted-foreground"
          >
            R
          </span>
        }
      />
    </div>
  ),
  play: async ({ canvasElement }) => {
    const chips = within(canvasElement).getAllByRole('button')
    await expect(chips.map((chip) => chip.getBoundingClientRect().height)).toEqual([
      chips[0]!.getBoundingClientRect().height,
      chips[0]!.getBoundingClientRect().height,
    ])
  },
}

/**
 * The four states side by side. Neutral all of them: the chip wears no dot and no tinted border;
 * only a working one breathes, and an ended one says how by its icon alone.
 */
export const States: Story = {
  parameters: { controls: { disable: true } },
  render: (args) => (
    <div className="flex items-center gap-1.5">
      <LiveChip {...args} name="dev" state="running" />
      <LiveChip {...args} name="build" state="finished" {...lasted(84)} />
      <LiveChip {...args} name="test" state="failed" {...lasted(12)} />
      <LiveChip {...args} name="lint" state="stopped" {...lasted(3)} />
    </div>
  ),
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    const running = canvas.getByRole('button', { name: 'dev, running' })
    const finished = canvas.getByRole('button', { name: 'build, done' })
    const failed = canvas.getByRole('button', { name: 'test, failed' })
    const stopped = canvas.getByRole('button', { name: 'lint, stopped' })
    const chips = [running, finished, failed, stopped]
    // One surface and one edge for all four: nothing lasting says how a chip stands.
    await expect(new Set(chips.map((chip) => getComputedStyle(chip).backgroundColor)).size).toBe(1)
    await expect(new Set(chips.map((chip) => getComputedStyle(chip).borderColor)).size).toBe(1)
    // The working one breathes, faintly, across its whole background; nothing else does.
    const breath = running.querySelector('[data-breath]')
    await expect(breath).not.toBeNull()
    await expect(getComputedStyle(breath!).animationName).toBe('breathe')
    await expect(
      [finished, failed, stopped].map((one) => one.querySelector('[data-breath]')),
    ).toEqual([null, null, null])
    // Its icon gives way to a plain mark, and only the mark is coloured.
    await expect(finished.querySelector('[data-end="finished"]')).toHaveClass('text-success')
    await expect(failed.querySelector('[data-end="failed"]')).toHaveClass('text-destructive')
    await expect(stopped.querySelector('[data-end="stopped"]')).toHaveClass('text-muted-foreground')
    await expect(running.querySelector('[data-end]')).toBeNull()
    // The seconds, glued to their unit.
    await expect(finished).toHaveTextContent(/84s$/)
    await expect(running).toHaveTextContent(/\d+s$/)
  },
}

/**
 * Seconds and nothing else, in a room kept for three digits: 9s, 99s and 999s take the same
 * width, so the chip does not grow as a digit arrives; past 999s it widens once.
 */
export const Seconds: Story = {
  parameters: { controls: { disable: true } },
  render: (args) => (
    <div className="flex flex-col items-start gap-1.5">
      {[9, 99, 999, 1000].map((seconds) => (
        <LiveChip
          key={seconds}
          {...args}
          name="build"
          state="finished"
          label={`${String(seconds)} seconds`}
          {...lasted(seconds)}
        />
      ))}
    </div>
  ),
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    const width = (seconds: number) =>
      canvas.getByRole('button', { name: `${String(seconds)} seconds` }).getBoundingClientRect()
        .width
    const times = [9, 99, 999, 1000].map((seconds) => canvas.getByText(`${String(seconds)}s`))
    const room = times.map((time) => time.getBoundingClientRect().width)
    await expect(room[1]).toBe(room[0])
    await expect(room[2]).toBe(room[0])
    await expect(room[3]).toBeGreaterThan(room[0]!)
    await expect(width(99)).toBe(width(9))
    await expect(width(999)).toBe(width(9))
    await expect(getComputedStyle(times[0]!).fontVariantNumeric).toBe('tabular-nums')
  },
}

/**
 * A long name ends in "…" at the chip's widest; the seconds are never what gives way, and the
 * whole name is the chip's tooltip.
 */
export const LongName: Story = {
  args: {
    name: 'pnpm --filter @hemera/desktop exec vitest run tests/build-protocol.test.ts',
    state: 'finished',
    ...lasted(112),
  },
  play: async ({ canvasElement, args }) => {
    const chip = within(canvasElement).getByRole('button', { name: /, done$/ })
    const name = within(chip).getByText(args.name)
    const time = within(chip).getByText('112s')
    // The name is cut at its end…
    await expect(name.scrollWidth).toBeGreaterThan(name.clientWidth)
    await expect(getComputedStyle(name).textOverflow).toBe('ellipsis')
    // …at the chip's widest, and the seconds stand whole inside it.
    await expect(chip.getBoundingClientRect().width).toBeLessThanOrEqual(
      Number.parseFloat(getComputedStyle(chip).maxWidth),
    )
    await expect(time.scrollWidth).toBeLessThanOrEqual(time.clientWidth)
    await expect(time.getBoundingClientRect().right).toBeLessThanOrEqual(
      chip.getBoundingClientRect().right,
    )
    await userEvent.hover(chip)
    await expect(await screen.findByRole('tooltip')).toHaveTextContent(args.name)
  },
}

/**
 * Pressed, its glance: the mark, the whole name, the seconds, the step it is on and its last
 * lines; ⓘ for its details and × to stop it while it works.
 */
export const Glance: Story = {
  args: { defaultOpen: true },
  play: async ({ args }) => {
    const glance = await screen.findByRole('dialog', { name: 'test, running' })
    await expect(within(glance).getByText('vitest run --reporter dot')).toBeVisible()
    await expect(within(glance).getByText(/csv\.totals\.test\.ts/)).toBeVisible()
    await expect(within(glance).getByText(/^\d+s$/)).toBeVisible()
    const tools = within(glance)
      .getAllByRole('button')
      .map((one) => one.getAttribute('aria-label'))
    await expect(tools).toEqual(['Details of test', 'Stop test'])
    await userEvent.click(within(glance).getByRole('button', { name: 'Details of test' }))
    await expect(args.onDetails).toHaveBeenCalledTimes(1)
    // The details take over: the glance goes.
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull())
  },
}

/** Ended, its glance offers to run it again, and no longer to stop it. */
export const EndedGlance: Story = {
  args: { state: 'failed', ...lasted(12), defaultOpen: true },
  play: async ({ args }) => {
    const glance = await screen.findByRole('dialog', { name: 'test, failed' })
    await expect(within(glance).queryByRole('button', { name: 'Stop test' })).toBeNull()
    await expect(within(glance).getByText('12s')).toBeVisible()
    await userEvent.click(within(glance).getByRole('button', { name: 'Run test again' }))
    await expect(args.onRunAgain).toHaveBeenCalledTimes(1)
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull())
  },
}

/**
 * × asks first, in the glance itself: "Stop test?" opens under its head by its height, and only
 * Stop stops it; Cancel folds the question away.
 */
export const StopAsksFirst: Story = {
  args: { defaultOpen: true },
  play: async ({ args }) => {
    const glance = await screen.findByRole('dialog', { name: 'test, running' })
    await userEvent.click(within(glance).getByRole('button', { name: 'Stop test' }))
    const question = await within(glance).findByRole('group', { name: 'Stop test?' })
    // It opens by its height, frame after frame, rather than appearing whole.
    const room = question.parentElement!
    const watch = readEveryFrame(() => room.getBoundingClientRect().height)
    await waitFor(() => expect(within(question).getByText('Stop test?')).toBeVisible())
    await new Promise((settled) => setTimeout(settled, 500))
    const heights = watch.stop().map((reading) => reading.value)
    if (!movesLess()) {
      await expect(heights.some((one) => one > 1 && one < heights.at(-1)! - 1)).toBe(true)
    }
    await expect(args.onStop).not.toHaveBeenCalled()
    await userEvent.click(within(question).getByRole('button', { name: 'Cancel' }))
    await waitFor(() =>
      expect(within(glance).queryByRole('group', { name: 'Stop test?' })).toBeNull(),
    )
    await expect(args.onStop).not.toHaveBeenCalled()
    await userEvent.click(within(glance).getByRole('button', { name: 'Stop test' }))
    const again = await within(glance).findByRole('group', { name: 'Stop test?' })
    await userEvent.click(within(again).getByRole('button', { name: 'Stop' }))
    await expect(args.onStop).toHaveBeenCalledTimes(1)
  },
}

/**
 * Ending well, watched: one wipe crosses the chip in the success tint, frame after frame and
 * never back, and leaves the chip as neutral as it was; its icon gives way to a green check.
 */
export const EndsWell: Story = {
  parameters: { controls: { disable: true } },
  render: (args) => <Ending {...args} to="finished" />,
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    const chip = canvas.getByRole('button', { name: 'test, running' })
    const surface = getComputedStyle(chip).backgroundColor
    const edge = getComputedStyle(chip).borderColor
    await userEvent.click(canvas.getByRole('button', { name: 'End' }))
    const wipe = chip.querySelector('[data-wipe]')
    await expect(wipe).not.toBeNull()
    await expect(wipe).toHaveClass('bg-success-muted')
    // While the wipe crosses, the icon is still the chip's own.
    await expect(chip.querySelector('[data-end]')).toBeNull()
    const watch = readEveryFrame(() => crossingOf(wipe!))
    await waitFor(() => expect(chip.querySelector('[data-wipe]')).toBeNull())
    const crossing = watch
      .stop()
      .map((reading) => reading.value)
      .filter((value) => !Number.isNaN(value))
    // Once across, left to right and never back: every frame further on than the one before.
    await expect(crossing.length).toBeGreaterThan(2)
    await expect(crossing.some((share) => share > -0.9 && share < 0.9)).toBe(true)
    const backwards = crossing.filter((share, at) => at > 0 && share < crossing[at - 1]! - 0.001)
    await expect(backwards).toEqual([])
    // Then nothing lasting: the chip's own surface and edge, and a green check for its icon.
    await expect(chip).toHaveAccessibleName('test, done')
    await expect(getComputedStyle(chip).backgroundColor).toBe(surface)
    await expect(getComputedStyle(chip).borderColor).toBe(edge)
    await expect(chip.querySelector('[data-breath]')).toBeNull()
    await waitFor(() =>
      expect(chip.querySelector('[data-end="finished"]')).toHaveClass('text-success'),
    )
  },
}

/**
 * Failing, watched: the wipe crosses in the failure's tint, then one short shake — out, back past
 * its place, and still — and a red ✕ for its icon.
 */
export const EndsInFailure: Story = {
  parameters: { controls: { disable: true } },
  render: (args) => <Ending {...args} to="failed" />,
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    const chip = canvas.getByRole('button', { name: 'test, running' })
    const shaken = chip.closest('[data-live-chip]')
    await expect(shaken).not.toBeNull()
    const watch = readEveryFrame(() => shiftOf(shaken!))
    await userEvent.click(canvas.getByRole('button', { name: 'End' }))
    await expect(chip.querySelector('[data-wipe]')).toHaveClass('bg-destructive-muted')
    await waitFor(() => expect(chip.querySelector('[data-wipe]')).toBeNull())
    await waitFor(() =>
      expect(chip.querySelector('[data-end="failed"]')).toHaveClass('text-destructive'),
    )
    await new Promise((settled) => setTimeout(settled, 600))
    const shifts = watch.stop().map((reading) => reading.value)
    // One shake, both ways, and back to its place.
    await expect(Math.min(...shifts)).toBeLessThan(-1)
    await expect(Math.max(...shifts)).toBeGreaterThan(1)
    await expect(shifts.at(-1)).toBe(0)
  },
}

/**
 * Asked for less movement, an end is there at once: no wipe, no shake — the mark it ended on, the
 * next frame — and a working chip's tint stands still.
 */
export const ReducedMotion: Story = {
  parameters: { controls: { disable: true } },
  render: (args) => (
    <MotionConfig reducedMotion="always">
      <div className="flex items-center gap-1.5">
        <LiveChip {...args} name="dev" />
        <Ending {...args} to="failed" />
      </div>
    </MotionConfig>
  ),
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    const chip = canvas.getByRole('button', { name: 'test, running' })
    const shaken = chip.closest('[data-live-chip]')!
    const wiped = readEveryFrame(() => (chip.querySelector('[data-wipe]') === null ? 0 : 1))
    const shifted = readEveryFrame(() => shiftOf(shaken))
    await userEvent.click(canvas.getByRole('button', { name: 'End' }))
    await expect(
      await withinFrames(() => chip.querySelector('[data-end="failed"]') !== null, AT_ONCE),
    ).toBe(true)
    await new Promise((settled) => setTimeout(settled, 600))
    await expect(wiped.stop().every((reading) => reading.value === 0)).toBe(true)
    await expect(shifted.stop().every((reading) => reading.value === 0)).toBe(true)
    // The breath is the stylesheet's, which answers the system's own preference.
    if (!(await emulateReducedMotion())) return
    const working = canvas.getByRole('button', { name: 'dev, running' })
    await waitFor(() =>
      expect(getComputedStyle(working.querySelector('[data-breath]')!).animationName).toBe('none'),
    )
  },
}

/**
 * Tab lands on the chip, Enter opens its glance on its first tool, named by its tooltip; Escape
 * puts the name away, Escape again closes the glance and gives the chip back.
 */
export const Keyboard: Story = {
  parameters: { controls: { disable: true } },
  play: async ({ canvasElement }) => {
    const chip = within(canvasElement).getByRole('button', { name: 'test, running' })
    await userEvent.tab()
    await expect(chip).toHaveFocus()
    await userEvent.keyboard('{Enter}')
    const glance = await screen.findByRole('dialog', { name: 'test, running' })
    await waitFor(() => expect(glance.contains(document.activeElement)).toBe(true))
    await expect(await screen.findByRole('tooltip')).toHaveTextContent('Details')
    await userEvent.keyboard('{Escape}')
    await waitFor(() => expect(screen.queryByRole('tooltip')).toBeNull())
    await expect(glance).toBeInTheDocument()
    await userEvent.keyboard('{Escape}')
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull())
    await expect(chip).toHaveFocus()
  },
}

/** The helpers of the crowded row, whose names decide their letters. */
const HELPERS = ['Reviewer', 'Researcher', 'Security reviewer of the CSV export and its ledger']

/** A helper's chip: its avatar in the slot, among the others of the Session. */
function helper(name: string): Pick<LiveChipProps, 'name' | 'icon'> {
  return {
    name,
    icon: <HelperAvatar name={name} others={HELPERS.filter((other) => other !== name)} />,
  }
}

/**
 * A crowded row, as a busy Session's head has it: runs and helpers side by side, working and
 * ended, long names among them. Every chip is one height and no wider than its widest; a long
 * name ends in "…" and its seconds stand whole; a helper wears its letters where a run wears its
 * type.
 */
export const Crowded: Story = {
  parameters: { controls: { disable: true } },
  render: (args) => (
    <div className="flex w-menu-wide flex-wrap items-center gap-1.5">
      <LiveChip {...args} name="dev" icon={<IconServer size="sm" aria-hidden="true" />} />
      <LiveChip
        {...args}
        name="pnpm --filter @hemera/desktop exec vitest run tests/build-protocol.test.ts"
        state="failed"
        {...lasted(1204)}
      />
      <LiveChip
        {...args}
        name="build"
        icon={<IconHammer size="sm" aria-hidden="true" />}
        state="finished"
        {...lasted(48)}
      />
      <LiveChip
        {...args}
        name="lint"
        icon={<IconChecklist size="sm" aria-hidden="true" />}
        state="stopped"
        {...lasted(3)}
      />
      {HELPERS.map((name) => (
        <LiveChip key={name} {...args} {...helper(name)} />
      ))}
    </div>
  ),
  play: async ({ canvasElement }) => {
    const chips = within(canvasElement).getAllByRole('button')
    await expect(chips).toHaveLength(7)
    const heights = new Set(chips.map((chip) => chip.getBoundingClientRect().height))
    await expect(heights.size).toBe(1)
    const widest = Number.parseFloat(getComputedStyle(chips[0]!).maxWidth)
    await expect(chips.filter((chip) => chip.getBoundingClientRect().width > widest)).toEqual([])
    // The seconds of every chip stand whole, inside it.
    const cut = chips.filter((chip) => {
      const time = chip.lastElementChild!
      return (
        time.scrollWidth > time.clientWidth ||
        time.getBoundingClientRect().right > chip.getBoundingClientRect().right
      )
    })
    await expect(cut).toEqual([])
    await expect(chips[1]).toHaveTextContent(/1204s$/)
    // Helpers that share an initial wear two letters; the one alone with its own, one.
    await expect(
      chips.slice(4).map((chip) => chip.querySelector('.rounded-full')?.textContent),
    ).toEqual(['RE', 'RE', 'S'])
  },
}

/**
 * A helper's chip and its glance: the step it is on and what it said last; × asks before it stops
 * the helper, whose main agent is told and decides what comes next.
 */
export const Helper: Story = {
  args: {
    ...helper('Reviewer'),
    step: 'Read src/export/csv.stream.ts',
    children: (
      <p className="text-sm">No row is written twice: the cursor advances after each flush.</p>
    ),
    defaultOpen: true,
  },
  play: async ({ args }) => {
    const glance = await screen.findByRole('dialog', { name: 'Reviewer, running' })
    await expect(within(glance).getByText('Read src/export/csv.stream.ts')).toBeVisible()
    await userEvent.click(within(glance).getByRole('button', { name: 'Stop Reviewer' }))
    const asked = await within(glance).findByRole('group', { name: 'Stop Reviewer?' })
    await userEvent.click(within(asked).getByRole('button', { name: 'Stop' }))
    await expect(args.onStop).toHaveBeenCalledTimes(1)
  },
}

/** A helper that has finished gives its avatar up for the plain check, as a run gives its icon. */
export const HelperEnds: Story = {
  parameters: { controls: { disable: true } },
  render: (args) => <Ending {...args} {...helper('Reviewer')} to="finished" />,
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    const chip = canvas.getByRole('button', { name: 'Reviewer, running' })
    await userEvent.click(canvas.getByRole('button', { name: 'End' }))
    await expect(chip.querySelector('[data-wipe]')).toHaveClass('bg-success-muted')
    await waitFor(() => expect(chip.querySelector('[data-end="finished"]')).not.toBeNull())
    // The avatar keeps its room under the check, so nothing on the line moves.
    const avatar = chip.querySelector('.rounded-full')!
    await expect(avatar.getBoundingClientRect().width).toBeGreaterThan(0)
    await waitFor(() => expect(getComputedStyle(avatar.parentElement!).filter).toBe('opacity(0)'))
  },
}
