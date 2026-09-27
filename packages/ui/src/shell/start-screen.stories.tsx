import type { Meta, StoryObj } from '@storybook/react-vite'
import { expect, waitFor, within } from 'storybook/test'

import { emulateReducedMotion } from '../../.storybook/reduced-motion.ts'
import { StartScreen } from './start-screen.tsx'

/**
 * What the window shows while it starts, before its first page is ready (issue #185): the
 * design system's loader, centred on the background the frame is painted with. The page's
 * `index.html` carries the same markup, so it is there from the first paint.
 */
const meta = {
  title: 'Shell/StartScreen',
  component: StartScreen,
  tags: ['autodocs', 'new'],
  parameters: { layout: 'fullscreen' },
} satisfies Meta<typeof StartScreen>

export default meta

type Story = StoryObj<typeof meta>

/** The loader in the middle of the window, on the page's own background. */
export const Starting: Story = {
  play: async ({ canvasElement }) => {
    const loader = within(canvasElement).getByRole('status', { name: 'Starting Hemera' })
    await expect(loader).toBeVisible()
    const screen = loader.parentElement!
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
    const box = loader.getBoundingClientRect()
    const frame = screen.getBoundingClientRect()
    expect(box.left + box.width / 2).toBeCloseTo(frame.left + frame.width / 2, 0)
    expect(box.top + box.height / 2).toBeCloseTo(frame.top + frame.height / 2, 0)
    expect(frame.height).toBe(window.innerHeight)
  },
}

/** Under a system that asked for less movement: the three dots stand still, and still say it. */
export const ReducedMotion: Story = {
  play: async ({ canvasElement }) => {
    if (!(await emulateReducedMotion())) return
    const ring = within(canvasElement).getByRole('status', { name: 'Starting Hemera' }).children[0]!
    await waitFor(() => {
      expect(getComputedStyle(ring).animationName).toBe('none')
    })
  },
}
