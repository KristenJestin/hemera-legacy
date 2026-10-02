import type { Meta, StoryObj } from '@storybook/react-vite'
import { MotionConfig } from 'motion/react'
import type { ReactNode } from 'react'
import { expect, waitFor, within } from 'storybook/test'

import { useBeat } from '../../../.storybook/beat.ts'
import { type Reading, journeyOf, readEveryFrame } from '../../../.storybook/journey.ts'
import { emulateReducedMotion, movesLess } from '../../../.storybook/reduced-motion.ts'
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

/** A mark that takes each pose in turn, a beat each, and round again: the story plays it. */
function Moving({
  poses,
  every,
}: {
  poses: readonly StatusMarkProps[]
  every?: number | undefined
}): ReactNode {
  const step = useBeat(poses.length, every)
  return <StatusMark {...poses[step]!} />
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
      poses={[
        { state: 'progress', progress: 0.2, label: 'Checking' },
        { state: 'progress', progress: 0.8, label: 'Checking' },
      ]}
    />
  ),
  play: async ({ canvasElement }) => {
    const mark = within(canvasElement).getByRole('img', { name: 'Checking' })
    const ring = strokeOf(mark, 'ring')!
    await waitFor(() => expect(drawnOf(ring)).toBeCloseTo(0.2, 2))
    // In hundredths, which is the unit a journey of a share is told in.
    const watch = readEveryFrame(() => drawnOf(ring) * 100)
    await waitFor(() => expect(drawnOf(ring)).toBeCloseTo(0.8, 2))
    const readings = watch.stop()
    const shares = readings.map((reading) => reading.value)
    await expect(shares.filter((share) => share > 81)).toEqual([])
    await expect(shares.filter((share, at) => at > 0 && share < shares[at - 1]! - 0.1)).toEqual([])
    if (movesLess()) return
    await expect(journeyOf(readings, 20, 80)).not.toBe('jumped')
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
      poses={[
        { state: 'progress', label: 'Task' },
        { state: 'done', label: 'Task' },
        { state: 'progress', label: 'Task' },
        { state: 'failed', label: 'Task' },
      ]}
    />
  ),
  play: async ({ canvasElement }) => {
    const mark = within(canvasElement).getByRole('img', { name: 'Task' })
    /** Reads how much of `figure` is drawn on every frame until its pose comes and it is whole. */
    const drawing = async (figure: string): Promise<Reading[]> => {
      const stroke = strokeOf(mark, figure)!
      const watch = readEveryFrame(() => drawnOf(stroke) * 100)
      await waitFor(() => expect(drawnOf(stroke)).toBe(1))
      return watch.stop()
    }
    const check = await drawing('check')
    const cross = await drawing('cross')
    await expect(mark).toHaveAttribute('data-mark', 'failed')
    await waitFor(() => expect(drawnOf(strokeOf(mark, 'check'))).toBe(0))
    if (movesLess()) return
    await expect(journeyOf(check, 0, 100)).not.toBe('jumped')
    await expect(journeyOf(cross, 0, 100)).not.toBe('jumped')
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
 * Asked for less movement, every change is at its end the next frame — the share, the check —
 * never part of the way; and the arc stops turning.
 */
export const ReducedMotion: Story = {
  parameters: { controls: { disable: true } },
  render: () => (
    <MotionConfig reducedMotion="always">
      <div className="flex items-center gap-3">
        <StatusMark state="progress" label="Turning" />
        <Moving
          poses={[
            { state: 'progress', progress: 0.2, label: 'Task' },
            { state: 'progress', progress: 0.8, label: 'Task' },
            { state: 'done', label: 'Task' },
          ]}
        />
      </div>
    </MotionConfig>
  ),
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    const mark = canvas.getByRole('img', { name: 'Task' })
    const ring = readEveryFrame(() => drawnOf(strokeOf(mark, 'ring')))
    const check = readEveryFrame(() => drawnOf(strokeOf(mark, 'check')))
    await waitFor(() => expect(drawnOf(strokeOf(mark, 'check'))).toBe(1))
    const shares = ring.stop().map((reading) => reading.value)
    const ticks = check.stop().map((reading) => reading.value)
    // Only the poses themselves, on every frame: nothing in between was ever drawn.
    const between = shares.filter(
      (share) => ![0.2, 0.8, 1].some((at) => Math.abs(share - at) < 0.005),
    )
    await expect(between).toEqual([])
    await expect(ticks.filter((share) => share !== 0 && share !== 1)).toEqual([])
    // The turn is the stylesheet's, which answers the system's own preference.
    if (!(await emulateReducedMotion())) return
    const turning = canvas.getByRole('img', { name: 'Turning' })
    await waitFor(() =>
      expect(getComputedStyle(turning.querySelector('svg')!).animationName).toBe('none'),
    )
  },
}

/** The walk through every pose, and the stroke each one draws. */
const WALK = [
  { state: 'todo', progress: undefined, figure: 'dashed' },
  { state: 'progress', progress: undefined, figure: 'ring' },
  { state: 'yours', progress: undefined, figure: 'ring' },
  { state: 'blocked', progress: undefined, figure: 'bar' },
  { state: 'failed', progress: undefined, figure: 'cross' },
  { state: 'progress', progress: 0.5, figure: 'ring' },
  { state: 'done', progress: undefined, figure: 'check' },
  { state: 'skipped', progress: undefined, figure: 'strike' },
] as const

/**
 * Every change in turn, one mark moving from each pose to the next in place: to do, in progress,
 * waits for you, blocked, failed, in progress again, done, and skipped. It keeps its box the whole
 * way, so nothing beside it moves.
 */
export const EveryChange: Story = {
  parameters: { controls: { disable: true } },
  render: () => (
    <Moving
      every={1200}
      poses={WALK.map((pose) => ({ state: pose.state, progress: pose.progress, label: 'Task' }))}
    />
  ),
  play: async ({ canvasElement }) => {
    const mark = within(canvasElement).getByRole('img', { name: 'Task' })
    const box = mark.getBoundingClientRect()
    const reached: MarkState[] = []
    const step = async (at: number): Promise<void> => {
      const next = WALK[at]
      if (next === undefined) return
      await waitFor(() => {
        expect(mark).toHaveAttribute('data-mark', next.state)
        expect(drawnOf(strokeOf(mark, next.figure))).toBeGreaterThan(0.25)
      })
      reached.push(next.state)
      await step(at + 1)
    }
    await step(1)
    await expect(reached).toEqual(WALK.slice(1).map((one) => one.state))
    const now = mark.getBoundingClientRect()
    await expect([now.width, now.height, now.left, now.top]).toEqual([
      box.width,
      box.height,
      box.left,
      box.top,
    ])
  },
}
