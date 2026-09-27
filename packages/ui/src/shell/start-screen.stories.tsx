import type { Meta, StoryObj } from '@storybook/react-vite'
import { MotionConfig } from 'motion/react'
import { expect, waitFor, within } from 'storybook/test'

import { emulateReducedMotion } from '../../.storybook/reduced-motion.ts'
import { StartFrame, StartScreen } from './start-screen.tsx'

/**
 * What the window shows while it starts, before its first page is ready (issues #185 and #140):
 * Hemera's face, loading — its three features the three dots of a loader, going round — centred
 * on the background the frame is painted with. The page's `index.html` carries a still of it,
 * turned by the stylesheet, so it is there from the first paint; the face takes over from it
 * where the turn had got to.
 */
const meta = {
  title: 'Shell/StartScreen',
  component: StartScreen,
  tags: ['autodocs', 'new'],
  parameters: { layout: 'fullscreen' },
} satisfies Meta<typeof StartScreen>

export default meta

type Story = StoryObj<typeof meta>

/** The drawn strokes of the face, read off the page: what a frame changed, or did not. */
function strokesOf(face: Element): string[] {
  return [...face.querySelectorAll('path')].map((path) => path.getAttribute('d') ?? '')
}

/** Waits for the next frames, as many as asked. */
function frames(count: number): Promise<void> {
  return new Promise((settle) => {
    const look = (left: number): void => {
      if (left === 0) settle()
      else requestAnimationFrame(() => look(left - 1))
    }
    look(count)
  })
}

/** The face in the middle of the window, loading, on the page's own background. */
export const Starting: Story = {
  play: async ({ canvasElement }) => {
    const face = within(canvasElement).getByRole('img', { name: 'Starting Hemera' })
    await expect(face).toBeVisible()
    await expect(face).toHaveAttribute('data-state', 'loading')
    const screen = face.parentElement!
    // On the colour the main process paints the frame with, `--background`: nothing flashes
    // between the frame and this screen.
    const frameColour = document.createElement('div')
    frameColour.style.backgroundColor = 'var(--background)'
    document.body.append(frameColour)
    expect(getComputedStyle(screen).backgroundColor).toBe(
      getComputedStyle(frameColour).backgroundColor,
    )
    frameColour.remove()
    // Centred in the window, both ways.
    const box = face.getBoundingClientRect()
    const frame = screen.getBoundingClientRect()
    expect(box.left + box.width / 2).toBeCloseTo(frame.left + frame.width / 2, 0)
    expect(box.top + box.height / 2).toBeCloseTo(frame.top + frame.height / 2, 0)
    expect(frame.height).toBe(window.innerHeight)
    // Alive: its dots go round.
    const before = strokesOf(face)
    await frames(6)
    await expect(strokesOf(face)).not.toEqual(before)
  },
}

/**
 * The first paint, as `index.html` writes it before a line of script has run: a still of the
 * face, its dots where the face draws them, turned by the stylesheet. The same box, in the same
 * place, as the face that takes over from it.
 */
export const FirstPaint: Story = {
  render: () => <StartFrame />,
  play: async ({ canvasElement }) => {
    const still = within(canvasElement).getByRole('img', { name: 'Starting Hemera' })
    await expect(still).toBeVisible()
    await expect(still.querySelectorAll('path')).toHaveLength(3)
    // Turned by the stylesheet, on the loader's own beat.
    await expect(getComputedStyle(still.firstElementChild!).animationName).toBe('turn')
    const screen = still.parentElement!
    const box = still.getBoundingClientRect()
    const frame = screen.getBoundingClientRect()
    expect(box.left + box.width / 2).toBeCloseTo(frame.left + frame.width / 2, 0)
    expect(box.top + box.height / 2).toBeCloseTo(frame.top + frame.height / 2, 0)
  },
}

/**
 * Under a system that asked for less movement: the face holds a still expression, and the still
 * of the first paint does not turn.
 */
export const ReducedMotion: Story = {
  render: () => (
    <MotionConfig reducedMotion="always">
      <StartScreen />
    </MotionConfig>
  ),
  play: async ({ canvasElement }) => {
    const face = within(canvasElement).getByRole('img', { name: 'Starting Hemera' })
    await frames(2)
    const before = strokesOf(face)
    await frames(20)
    await expect(strokesOf(face)).toEqual(before)
  },
}

/** The still of the first paint under the same preference: the stylesheet leaves the turn out. */
export const FirstPaintReducedMotion: Story = {
  render: () => <StartFrame />,
  play: async ({ canvasElement }) => {
    const restore = await emulateReducedMotion()
    if (restore === null) return
    try {
      const still = within(canvasElement).getByRole('img', { name: 'Starting Hemera' })
      await waitFor(() => {
        expect(getComputedStyle(still.firstElementChild!).animationName).toBe('none')
      })
    } finally {
      await restore()
    }
  },
}
