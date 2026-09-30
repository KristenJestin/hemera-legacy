import type { Meta, StoryObj } from '@storybook/react-vite'
import { MotionConfig } from 'motion/react'
import { useState } from 'react'
import { expect, fn, userEvent, waitFor, within } from 'storybook/test'

import { emulateReducedMotion } from '../../../.storybook/reduced-motion.ts'
import { check } from '../../motion.ts'
import { Checkbox } from './checkbox.tsx'

/** A box whose state the story keeps, so ticking it in the canvas does what it says. */
function Kept({
  initial,
  label,
  description,
  disabled,
}: {
  initial: boolean
  label: string
  description?: string
  disabled?: boolean
}) {
  const [checked, setChecked] = useState(initial)
  return (
    <Checkbox
      checked={checked}
      onCheckedChange={setChecked}
      label={label}
      description={description}
      disabled={disabled}
    />
  )
}

const meta = {
  tags: ['autodocs'],
  title: 'Components/Checkbox',
  component: Checkbox,
  parameters: { layout: 'centered' },
  args: {
    checked: false,
    label: 'Include in every new Workspace',
    onCheckedChange: fn(),
  },
  argTypes: {
    checked: { control: 'boolean', description: 'Whether the box is ticked.' },
    label: { control: 'text', description: 'The words beside the box, which are its name.' },
    description: { control: 'text', description: 'A muted line under the label.' },
    hiddenLabel: {
      control: 'text',
      description: 'Words a screen reader hears after the label, where the label repeats.',
    },
    disabled: { control: 'boolean' },
    onCheckedChange: { description: 'Called with the new state when the box is toggled.' },
    className: { table: { disable: true } },
  },
} satisfies Meta<typeof Checkbox>

export default meta
type Story = StoryObj<typeof meta>

/** One box, in whichever state you ask for. */
export const Playground: Story = {}

/** With a label alone, and with a line that says what ticking it does. */
export const Variants: Story = {
  parameters: { controls: { disable: true } },
  render: () => (
    <div className="flex flex-col gap-4">
      <Kept initial={false} label="Serve through Portless" />
      <Kept
        initial
        label="Include in every new Workspace"
        description="A dedicated Workspace gets a worktree of it unless it is left out."
      />
    </div>
  ),
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    expect(canvas.getByRole('checkbox', { name: /portless/i })).not.toBeChecked()
    expect(canvas.getByRole('checkbox', { name: /every new workspace/i })).toBeChecked()
  },
}

/** Unticked, ticked, and both of them disabled. */
export const States: Story = {
  parameters: { controls: { disable: true } },
  render: () => (
    <div className="flex flex-col gap-3">
      <Kept initial={false} label="Unticked" />
      <Kept initial label="Ticked" />
      <Kept initial={false} label="Unticked, disabled" disabled />
      <Kept initial label="Ticked, disabled" disabled />
    </div>
  ),
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    const ticked = canvas.getByRole('checkbox', { name: 'Ticked' })
    const plain = canvas.getByRole('checkbox', { name: 'Unticked' })
    // The ticked box wears the theme's primary role, and the unticked one does not.
    expect(getComputedStyle(ticked).backgroundColor).not.toBe(
      getComputedStyle(plain).backgroundColor,
    )
    expect(canvas.getByRole('checkbox', { name: 'Ticked, disabled' })).toHaveAttribute(
      'aria-disabled',
      'true',
    )
  },
}

/** Tab reaches the box, Space ticks it, and a press on its words ticks it as well. */
export const Keyboard: Story = {
  parameters: { controls: { disable: true } },
  render: () => <Kept initial={false} label="Serve through Portless" />,
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    const box = canvas.getByRole('checkbox', { name: /portless/i })
    await userEvent.tab()
    expect(document.activeElement).toBe(box)
    await userEvent.keyboard(' ')
    expect(box).toBeChecked()
    await userEvent.click(canvas.getByText('Serve through Portless'))
    expect(box).not.toBeChecked()
  },
}

/** How much of the tick is drawn, from nothing (0) to all of it (1), as motion writes it. */
function drawnOf(box: HTMLElement): number {
  const path = box.querySelector('path')!
  return Number.parseFloat(path.getAttribute('stroke-dasharray') ?? '0')
}

/** How far the box is drawn under its own size, 1 at rest. */
function scaleOf(box: HTMLElement): number {
  const matrix = new DOMMatrixReadOnly(getComputedStyle(box).transform)
  return matrix.a
}

/** What the tick and the box were seen at, frame by frame, and when each frame came. */
interface Frames {
  drawn: number[]
  scales: number[]
  at: number[]
}

/**
 * What the tick and the box go through, frame by frame, from just before `gesture` until the tick
 * is at `end`.
 *
 * The frames are read from before the gesture, not from when it resolves: on a machine busy with
 * the rest of the run, the click can resolve after the box's short give is over, and a watch
 * started then would never see it.
 */
async function framesAround(
  box: HTMLElement,
  end: number,
  gesture: () => Promise<void>,
): Promise<Frames> {
  const drawn: number[] = []
  const scales: number[] = []
  const at: number[] = []
  let done = false
  const watching = (async () => {
    const started = performance.now()
    while (performance.now() - started < 2000) {
      // oxlint-disable-next-line no-await-in-loop -- one frame, then a look, then the next: the order is the point
      await new Promise((next) => requestAnimationFrame(next))
      drawn.push(drawnOf(box))
      scales.push(scaleOf(box))
      at.push(performance.now())
      if (done && drawn.at(-1) === end && scales.at(-1) === 1) break
    }
  })()
  await gesture()
  done = true
  await watching
  return { drawn, scales, at }
}

/**
 * The longest a watch waited between two frames, in milliseconds.
 *
 * The tick draws for 260 ms and the box gives for 160: a frame that comes that long after the one
 * before it, on a machine busy with the rest of the run, can step over the whole of either, and
 * then no frame was there to see it — not a tick that jumped, and not one that drew either. Only
 * then is the gesture played again; when every frame came sooner than that, what they saw is the
 * answer, and a tick that never drew fails on the first try.
 */
function longestGap({ at }: Frames): number {
  return Math.max(0, ...at.slice(1).map((one, index) => one - at[index]!))
}

/** How long the tick draws, and how long the box gives, in the milliseconds a frame is read in. */
const DRAW = check.draw.duration * 1000
const GIVE = check.press.duration * 1000

/** Whether some frame saw the tick part of the way along: drawn, and not switched on. */
function drawing({ drawn }: Frames): boolean {
  return drawn.some((one) => one > 0 && one < 1)
}

/**
 * Checked: the tick draws itself along its stroke and the box gives a little under it, then
 * settles, drawn.
 */
export const Checked: Story = {
  parameters: { controls: { disable: true } },
  render: () => <Kept initial={false} label="Serve through Portless" />,
  play: async ({ canvasElement }) => {
    const box = within(canvasElement).getByRole('checkbox', { name: /portless/i })
    await expect(drawnOf(box)).toBe(0)
    const ticked = (): Promise<Frames> => framesAround(box, 1, () => userEvent.click(box))
    // Played again only when no frame saw one of the two and a frame came too late to have: the
    // box is unchecked and checked again, up to five times.
    const unseen = (frames: Frames): boolean =>
      (!drawing(frames) && longestGap(frames) >= DRAW) ||
      (Math.min(...frames.scales) === 1 && longestGap(frames) >= GIVE)
    let seen = await ticked()
    for (let tries = 4; tries > 0 && unseen(seen); tries -= 1) {
      // oxlint-disable-next-line no-await-in-loop -- one gesture at a time: the replay is the point
      await framesAround(box, 0, () => userEvent.click(box))
      // oxlint-disable-next-line no-await-in-loop -- one gesture at a time: the replay is the point
      seen = await ticked()
    }
    const { drawn, scales } = seen
    // Part of the way along on some frame: drawn, and not switched on.
    expect(drawing(seen)).toBe(true)
    expect(Math.min(...scales)).toBeLessThan(1)
    expect(drawn.at(-1)).toBe(1)
    expect(scales.at(-1)).toBe(1)
    expect(box).toBeChecked()
  },
}

/** Unchecked: the tick undraws the way it came, while the fill fades from under it. */
export const Unchecked: Story = {
  parameters: { controls: { disable: true } },
  render: () => <Kept initial label="Serve through Portless" />,
  play: async ({ canvasElement }) => {
    const box = within(canvasElement).getByRole('checkbox', { name: /portless/i })
    // Opened checked, it is drawn already: nothing draws itself on the way in.
    await expect(drawnOf(box)).toBe(1)
    const unticked = (): Promise<Frames> => framesAround(box, 0, () => userEvent.click(box))
    // Played again, up to five times, only when no frame saw the tick on its way and a frame came
    // too late to have: the box is checked again, and unchecked again.
    let seen = await unticked()
    for (let tries = 4; tries > 0 && !drawing(seen) && longestGap(seen) >= DRAW; tries -= 1) {
      // oxlint-disable-next-line no-await-in-loop -- one gesture at a time: the replay is the point
      await framesAround(box, 1, () => userEvent.click(box))
      // oxlint-disable-next-line no-await-in-loop -- one gesture at a time: the replay is the point
      seen = await unticked()
    }
    const { drawn, scales } = seen
    expect(drawing(seen)).toBe(true)
    // Letting go is not pressed: the box stays its size.
    expect(Math.min(...scales)).toBe(1)
    expect(drawn.at(-1)).toBe(0)
    expect(box).not.toBeChecked()
  },
}

/**
 * The same box for a reader who asked for less movement: the tick is there or not, at once, the
 * box never gives, and its fill does not fade. What motion draws is asked through a
 * `MotionConfig`; the fill is the stylesheet's, which answers the system's own preference.
 */
export const ReducedMotion: Story = {
  parameters: { controls: { disable: true } },
  render: () => (
    <MotionConfig reducedMotion="always">
      <Kept initial={false} label="Serve through Portless" />
    </MotionConfig>
  ),
  play: async ({ canvasElement }) => {
    const box = within(canvasElement).getByRole('checkbox', { name: /portless/i })
    // Nothing part of the way on any frame: the tick goes from none of it to all of it.
    const checked = await framesAround(box, 1, () => userEvent.click(box))
    expect(checked.drawn.filter((one) => one > 0 && one < 1)).toEqual([])
    expect(checked.drawn.at(-1)).toBe(1)
    expect(checked.scales.every((one) => one === 1)).toBe(true)
    const unchecked = await framesAround(box, 0, () => userEvent.click(box))
    expect(unchecked.drawn.filter((one) => one > 0 && one < 1)).toEqual([])
    expect(unchecked.drawn.at(-1)).toBe(0)
    if (!(await emulateReducedMotion())) return
    await waitFor(() => {
      expect(getComputedStyle(box).transitionProperty).toBe('none')
    })
  },
}
