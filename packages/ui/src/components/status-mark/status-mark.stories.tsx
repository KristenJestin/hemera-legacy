import type { Meta, StoryObj } from '@storybook/react-vite'
import { MotionConfig } from 'motion/react'
import { type ReactNode, useState } from 'react'
import { expect, userEvent, waitFor, within } from 'storybook/test'

import { readEveryFrame } from '../../../.storybook/journey.ts'
import {
  AT_ONCE,
  emulateReducedMotion,
  movesLess,
  withinFrames,
} from '../../../.storybook/reduced-motion.ts'
import { Button } from '../button/button.tsx'
import { type MarkState, StatusMark, type StatusMarkProps } from './status-mark.tsx'

/**
 * Where a task stands, as one small mark that changes in place (issue #77): a dashed ring to do;
 * an arc turning, or standing at its share on a faint track, in progress; a check or a cross that
 * draws itself; a dot that waits for you; a bar where the way is shut; a ring struck through when
 * it was skipped. Asked for less movement, it is at its end at once.
 */

const STATES: MarkState[] = ['todo', 'progress', 'done', 'failed', 'yours', 'blocked', 'skipped']

/** The tone each state is drawn in, a role of the theme and never a colour of the mark's own. */
const TONES: Record<MarkState, string> = {
  todo: 'text-muted-foreground',
  progress: 'text-warning',
  done: 'text-success',
  failed: 'text-destructive',
  yours: 'text-warning',
  blocked: 'text-destructive',
  skipped: 'text-muted-foreground',
}

/** How much of a stroke is drawn, from the dash motion writes on it: 0 to 1. */
function drawnOf(stroke: Element | null): number {
  if (stroke === null || !stroke.isConnected) return Number.NaN
  const opacity = Number(getComputedStyle(stroke).opacity)
  if (opacity === 0) return 0
  const dash = stroke.getAttribute('stroke-dasharray')
  if (dash === null) return 1
  return Number.parseFloat(dash)
}

/** The stroke of a mark that draws one state's figure. */
function strokeOf(mark: Element, figure: string): Element | null {
  return mark.querySelector(`[data-figure="${figure}"]`)
}

/** A mark whose state and share are moved on by the buttons beside it. */
function Moving({
  from,
  steps,
}: {
  from: StatusMarkProps
  steps: readonly (StatusMarkProps & { press: string })[]
}): ReactNode {
  const [shown, setShown] = useState<StatusMarkProps>(from)
  return (
    <div className="flex items-center gap-3">
      <StatusMark {...shown} />
      {steps.map(({ press, ...step }) => (
        <Button key={press} size="sm" variant="ghost" onClick={() => setShown(step)}>
          {press}
        </Button>
      ))}
    </div>
  )
}

const meta = {
  tags: ['autodocs'],
  title: 'Components/StatusMark',
  component: StatusMark,
  parameters: { layout: 'centered' },
  args: { state: 'progress', label: 'In progress' },
  argTypes: {
    state: { control: 'inline-radio', options: STATES },
    progress: {
      control: { type: 'range', min: 0, max: 1, step: 0.05 },
      description: 'How far, when it is known; left out, the arc turns.',
    },
    label: {
      control: 'text',
      description: 'What a screen reader hears. Left out, the mark is hidden from it.',
    },
  },
} satisfies Meta<typeof StatusMark>

export default meta
type Story = StoryObj<typeof meta>

export const Playground: Story = {}

/**
 * In progress, two ways: an arc that turns while how far is not known, and an arc standing at its
 * share on a faint track when it is. Named, or hidden beside a line that already says it.
 */
export const Variants: Story = {
  parameters: { controls: { disable: true } },
  render: () => (
    <div className="flex items-center gap-4">
      <StatusMark state="progress" label="Turning" />
      <StatusMark state="progress" progress={0.25} label="A quarter" />
      <StatusMark state="progress" progress={0.7} label="Most of it" />
      <StatusMark state="done" />
    </div>
  ),
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    const turning = canvas.getByRole('img', { name: 'Turning' })
    await expect(getComputedStyle(turning.querySelector('svg')!).animationName).toBe(
      movesLess() ? 'none' : 'turn',
    )
    await expect(turning.querySelector('[data-figure="track"]')).toBeNull()
    const quarter = canvas.getByRole('img', { name: 'A quarter' })
    await expect(quarter.querySelector('[data-figure="track"]')).not.toBeNull()
    await expect(getComputedStyle(quarter.querySelector('svg')!).animationName).toBe('none')
    await waitFor(() => expect(drawnOf(strokeOf(quarter, 'ring'))).toBeCloseTo(0.25, 2))
    // About 20 px, whatever it says.
    await expect(quarter.getBoundingClientRect().width).toBe(20)
    await expect(canvasElement.querySelectorAll('[aria-hidden="true"][data-mark]')).toHaveLength(1)
  },
}

/** The seven states side by side, each in its tone, each its own figure. */
export const States: Story = {
  parameters: { controls: { disable: true } },
  render: () => (
    <div className="flex flex-col gap-2">
      {STATES.map((state) => (
        <span key={state} className="flex items-center gap-2 text-sm text-muted-foreground">
          <StatusMark state={state} label={state} />
          {state}
        </span>
      ))}
    </div>
  ),
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    const mark = (state: MarkState) => canvas.getByRole('img', { name: state })
    await expect(STATES.filter((state) => !mark(state).classList.contains(TONES[state]))).toEqual(
      [],
    )
    await waitFor(() => {
      expect(drawnOf(strokeOf(mark('done'), 'check'))).toBe(1)
      expect(drawnOf(strokeOf(mark('failed'), 'cross'))).toBe(1)
      expect(drawnOf(strokeOf(mark('blocked'), 'bar'))).toBe(1)
      expect(drawnOf(strokeOf(mark('skipped'), 'strike'))).toBe(1)
    })
    // To do and skipped are the dashed ring; everything else closes it.
    await expect(Number(getComputedStyle(strokeOf(mark('todo'), 'dashed')!).opacity)).toBe(1)
    await expect(Number(getComputedStyle(strokeOf(mark('skipped'), 'dashed')!).opacity)).toBe(1)
    await expect(drawnOf(strokeOf(mark('done'), 'ring'))).toBe(1)
    // Only the one that waits for you has a ring leaving it.
    await expect(
      STATES.filter((state) => mark(state).querySelector('[data-figure="ping"]') !== null),
    ).toEqual(movesLess() ? [] : ['yours'])
  },
}

/**
 * A known share moves to the next on the spring of a dimension: frame after frame, never past
 * where it is going, and from wherever it stands when it is turned round.
 */
export const ProgressMoves: Story = {
  parameters: { controls: { disable: true } },
  render: () => (
    <Moving
      from={{ state: 'progress', progress: 0.2, label: 'Checking' }}
      steps={[{ state: 'progress', progress: 0.8, label: 'Checking', press: 'On' }]}
    />
  ),
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    const mark = canvas.getByRole('img', { name: 'Checking' })
    const ring = strokeOf(mark, 'ring')!
    await waitFor(() => expect(drawnOf(ring)).toBeCloseTo(0.2, 2))
    const watch = readEveryFrame(() => drawnOf(ring))
    await userEvent.click(canvas.getByRole('button', { name: 'On' }))
    await waitFor(() => expect(drawnOf(ring)).toBeCloseTo(0.8, 2))
    const shares = watch.stop().map((reading) => reading.value)
    await expect(shares.filter((share) => share > 0.81)).toEqual([])
    if (movesLess()) return
    await expect(shares.some((share) => share > 0.25 && share < 0.75)).toBe(true)
    await expect(shares.filter((share, at) => at > 0 && share < shares[at - 1]! - 0.001)).toEqual(
      [],
    )
  },
}

/**
 * Done: the ring closes and a check draws itself in it, as a stroke and not as a jump; failed, a
 * cross the same way.
 */
export const Ends: Story = {
  parameters: { controls: { disable: true } },
  render: () => (
    <Moving
      from={{ state: 'progress', label: 'Task' }}
      steps={[
        { state: 'done', label: 'Task', press: 'Done' },
        { state: 'failed', label: 'Task', press: 'Failed' },
      ]}
    />
  ),
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    const mark = canvas.getByRole('img', { name: 'Task' })
    /** Presses `press` and reads how much of `figure` is drawn on every frame until it is whole. */
    const drawing = async (press: string, figure: string): Promise<number[]> => {
      const stroke = strokeOf(mark, figure)!
      const watch = readEveryFrame(() => drawnOf(stroke))
      await userEvent.click(canvas.getByRole('button', { name: press }))
      await waitFor(() => expect(drawnOf(stroke)).toBe(1))
      return watch.stop().map((reading) => reading.value)
    }
    const check = await drawing('Done', 'check')
    const cross = await drawing('Failed', 'cross')
    await expect(mark).toHaveAttribute('data-mark', 'failed')
    await waitFor(() => expect(drawnOf(strokeOf(mark, 'check'))).toBe(0))
    if (movesLess()) return
    await expect(check.some((share) => share > 0.05 && share < 0.95)).toBe(true)
    await expect(cross.some((share) => share > 0.05 && share < 0.95)).toBe(true)
  },
}

/** Waits for you: a dot, and a ring leaving it on the running dot's beat. */
export const Yours: Story = {
  parameters: { controls: { disable: true } },
  args: { state: 'yours', label: 'Yours' },
  play: async ({ canvasElement }) => {
    const mark = within(canvasElement).getByRole('img', { name: 'Yours' })
    const ping = mark.querySelector('[data-figure="ping"]')
    if (movesLess()) {
      await expect(ping).toBeNull()
      return
    }
    await expect(ping).not.toBeNull()
    await waitFor(() => {
      const written = getComputedStyle(ping!).transform
      expect(written === 'none' ? 1 : new DOMMatrixReadOnly(written).a).toBeGreaterThan(1.2)
    })
  },
}

/**
 * Asked for less movement, every change is at its end the next frame: the share, the check, the
 * cross; and the arc stops turning.
 */
export const ReducedMotion: Story = {
  parameters: { controls: { disable: true } },
  render: () => (
    <MotionConfig reducedMotion="always">
      <div className="flex items-center gap-3">
        <StatusMark state="progress" label="Turning" />
        <Moving
          from={{ state: 'progress', progress: 0.2, label: 'Task' }}
          steps={[
            { state: 'progress', progress: 0.8, label: 'Task', press: 'On' },
            { state: 'done', label: 'Task', press: 'Done' },
          ]}
        />
      </div>
    </MotionConfig>
  ),
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    const mark = canvas.getByRole('img', { name: 'Task' })
    await userEvent.click(canvas.getByRole('button', { name: 'On' }))
    await expect(
      await withinFrames(() => Math.abs(drawnOf(strokeOf(mark, 'ring')) - 0.8) < 0.005, AT_ONCE),
    ).toBe(true)
    await userEvent.click(canvas.getByRole('button', { name: 'Done' }))
    await expect(await withinFrames(() => drawnOf(strokeOf(mark, 'check')) === 1, AT_ONCE)).toBe(
      true,
    )
    // The turn is the stylesheet's, which answers the system's own preference.
    if (!(await emulateReducedMotion())) return
    const turning = canvas.getByRole('img', { name: 'Turning' })
    await waitFor(() =>
      expect(getComputedStyle(turning.querySelector('svg')!).animationName).toBe('none'),
    )
  },
}

/**
 * Every change in turn, one mark moving from each pose to the next in place: to do, in progress,
 * waits for you, blocked, failed, in progress again, done, and skipped. It keeps its box the whole
 * way, so nothing beside it moves.
 */
export const EveryChange: Story = {
  parameters: { controls: { disable: true } },
  render: () => (
    <Moving
      from={{ state: 'todo', label: 'Task' }}
      steps={[
        { state: 'progress', label: 'Task', press: 'Start' },
        { state: 'yours', label: 'Task', press: 'Hand over' },
        { state: 'blocked', label: 'Task', press: 'Block' },
        { state: 'failed', label: 'Task', press: 'Fail' },
        { state: 'progress', progress: 0.5, label: 'Task', press: 'Half' },
        { state: 'done', label: 'Task', press: 'Finish' },
        { state: 'skipped', label: 'Task', press: 'Skip' },
      ]}
    />
  ),
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    const mark = canvas.getByRole('img', { name: 'Task' })
    const box = mark.getBoundingClientRect()
    const walk = [
      { press: 'Start', state: 'progress', figure: 'ring' },
      { press: 'Hand over', state: 'yours', figure: 'ring' },
      { press: 'Block', state: 'blocked', figure: 'bar' },
      { press: 'Fail', state: 'failed', figure: 'cross' },
      { press: 'Half', state: 'progress', figure: 'ring' },
      { press: 'Finish', state: 'done', figure: 'check' },
      { press: 'Skip', state: 'skipped', figure: 'strike' },
    ] as const
    const reached: MarkState[] = []
    const step = async (at: number): Promise<void> => {
      const next = walk[at]
      if (next === undefined) return
      await userEvent.click(canvas.getByRole('button', { name: next.press }))
      await waitFor(() => {
        expect(mark).toHaveAttribute('data-mark', next.state)
        expect(drawnOf(strokeOf(mark, next.figure))).toBeGreaterThan(0.25)
      })
      reached.push(next.state)
      await step(at + 1)
    }
    await step(0)
    await expect(reached).toEqual(walk.map((one) => one.state))
    const now = mark.getBoundingClientRect()
    await expect([now.width, now.height, now.left, now.top]).toEqual([
      box.width,
      box.height,
      box.left,
      box.top,
    ])
  },
}
