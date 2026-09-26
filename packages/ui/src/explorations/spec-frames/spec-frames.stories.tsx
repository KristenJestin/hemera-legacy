import type { Meta, StoryObj } from '@storybook/react-vite'
import { MotionConfig } from 'motion/react'
import type { ReactNode } from 'react'
import { expect, userEvent, waitFor, within } from 'storybook/test'

import { TooltipProvider } from '../../components/tooltip/tooltip.tsx'
import { Chat, useSpecSession } from './frames-fixtures.tsx'
import { V1Grow, V2Beside, V3Cards } from './variants.tsx'

/**
 * The Spec panel and its rail as frames (design exploration of 26 September 2026, issue #159,
 * "Later, design"). Storybook only: nothing here is wired, and no component of the design system
 * changed for it.
 *
 * Everything in the app sits in frames; the Spec panel is the one surface that still stands as
 * a column against the window's edge, and its rail folds to a band the window's full height. Each
 * variant draws the same `define` Session — `ATL-7` being planned — with the panel open, with the
 * panel folded to a small floating frame sized to its glyphs and centred on the window's height,
 * and the way from one to the other, both directions, and under reduced motion.
 *
 * - V1 · Grow · the rail's frame grows into the panel, then its content moves into place.
 * - V2 · Beside · the rail's frame stays put and gains its words; the Spec unrolls from behind it.
 * - V3 · Cards · a frame per phase; the phases' glyphs travel from the rail into their cards.
 *
 * Every chevron folds and unfolds, as many times as wanted; the `reducedMotion` control shows
 * the same thing with the journey taken out.
 */

type Variant = 'v1' | 'v2' | 'v3'

const VARIANTS = { v1: V1Grow, v2: V2Beside, v3: V3Cards }

function Session({ variant, folded }: { variant: Variant; folded: boolean }): ReactNode {
  const session = useSpecSession()
  const Panel = VARIANTS[variant]
  return (
    // The row is the container the panel's width is a share of.
    <div className="@container flex h-screen min-h-0 bg-background text-foreground">
      <Chat />
      <Panel session={session} defaultFolded={folded} />
    </div>
  )
}

function Page({
  variant,
  folded = false,
  reducedMotion = false,
}: {
  variant: Variant
  /** Whether the panel stands folded when the Session opens. */
  folded?: boolean
  /** Whether the story asks for less movement, as a system that prefers it does. */
  reducedMotion?: boolean
}): ReactNode {
  return (
    <MotionConfig reducedMotion={reducedMotion ? 'always' : 'user'}>
      <TooltipProvider>
        <Session key={`${variant}-${folded}`} variant={variant} folded={folded} />
      </TooltipProvider>
    </MotionConfig>
  )
}

const meta = {
  title: 'Explorations/Spec panel frames',
  component: Page,
  tags: ['new'],
  parameters: { layout: 'fullscreen' },
  argTypes: {
    variant: { control: 'inline-radio', options: ['v1', 'v2', 'v3'] },
    folded: { control: 'boolean' },
    reducedMotion: { control: 'boolean' },
  },
} satisfies Meta<typeof Page>

export default meta

type Story = StoryObj<typeof meta>

/** The panel open: its region and what is on its stage. */
async function isOpen(canvasElement: HTMLElement): Promise<void> {
  const canvas = within(canvasElement)
  await waitFor(() => expect(canvas.getByRole('region', { name: 'Stage of ATL-7' })).toBeVisible())
  await expect(canvas.getByRole('button', { name: 'Fold the Spec' })).toBeVisible()
  await expect(canvas.queryByRole('button', { name: 'Unfold the Spec' })).toBeNull()
}

/** The panel folded to its floating frame: the unfold, and no stage. */
async function isFolded(canvasElement: HTMLElement): Promise<void> {
  const canvas = within(canvasElement)
  await waitFor(() => expect(canvas.queryByRole('region', { name: 'Stage of ATL-7' })).toBeNull())
  await expect(canvas.getByRole('button', { name: 'Unfold the Spec' })).toBeVisible()
}

/** Unfolds, then folds, by the hand, and lands the keyboard on what stands in place each time. */
async function unfoldThenFold(canvasElement: HTMLElement): Promise<void> {
  const canvas = within(canvasElement)
  await isFolded(canvasElement)
  await userEvent.click(canvas.getByRole('button', { name: 'Unfold the Spec' }))
  await isOpen(canvasElement)
  await waitFor(() => expect(canvas.getByRole('button', { name: 'Fold the Spec' })).toHaveFocus())
  await userEvent.click(canvas.getByRole('button', { name: 'Fold the Spec' }))
  await isFolded(canvasElement)
  await waitFor(() => expect(canvas.getByRole('button', { name: 'Unfold the Spec' })).toHaveFocus())
}

// ---------------------------------------------------------------------------------------------
// V1 · Grow

export const V1Open: Story = {
  name: 'V1 · Grow · open',
  args: { variant: 'v1' },
  play: async ({ canvasElement }) => isOpen(canvasElement),
}

export const V1Folded: Story = {
  name: 'V1 · Grow · folded',
  args: { variant: 'v1', folded: true },
  play: async ({ canvasElement }) => isFolded(canvasElement),
}

export const V1Transition: Story = {
  name: 'V1 · Grow · unfold and fold',
  args: { variant: 'v1', folded: true },
  play: async ({ canvasElement }) => unfoldThenFold(canvasElement),
}

export const V1ReducedMotion: Story = {
  name: 'V1 · Grow · reduced motion',
  args: { variant: 'v1', folded: true, reducedMotion: true },
  play: async ({ canvasElement }) => unfoldThenFold(canvasElement),
}

// ---------------------------------------------------------------------------------------------
// V2 · Beside

export const V2Open: Story = {
  name: 'V2 · Beside · open',
  args: { variant: 'v2' },
  play: async ({ canvasElement }) => isOpen(canvasElement),
}

export const V2Folded: Story = {
  name: 'V2 · Beside · folded',
  args: { variant: 'v2', folded: true },
  play: async ({ canvasElement }) => isFolded(canvasElement),
}

export const V2Transition: Story = {
  name: 'V2 · Beside · unfold and fold',
  args: { variant: 'v2', folded: true },
  play: async ({ canvasElement }) => unfoldThenFold(canvasElement),
}

export const V2ReducedMotion: Story = {
  name: 'V2 · Beside · reduced motion',
  args: { variant: 'v2', folded: true, reducedMotion: true },
  play: async ({ canvasElement }) => unfoldThenFold(canvasElement),
}

// ---------------------------------------------------------------------------------------------
// V3 · Cards

export const V3Open: Story = {
  name: 'V3 · Cards · open',
  args: { variant: 'v3' },
  play: async ({ canvasElement }) => isOpen(canvasElement),
}

export const V3Folded: Story = {
  name: 'V3 · Cards · folded',
  args: { variant: 'v3', folded: true },
  play: async ({ canvasElement }) => isFolded(canvasElement),
}

export const V3Transition: Story = {
  name: 'V3 · Cards · unfold and fold',
  args: { variant: 'v3', folded: true },
  play: async ({ canvasElement }) => unfoldThenFold(canvasElement),
}

export const V3ReducedMotion: Story = {
  name: 'V3 · Cards · reduced motion',
  args: { variant: 'v3', folded: true, reducedMotion: true },
  play: async ({ canvasElement }) => unfoldThenFold(canvasElement),
}

/** V3's glyph pressed: the column opens scrolled to that phase's card. */
export const V3OpensOnAPhase: Story = {
  name: 'V3 · Cards · a phase pressed',
  args: { variant: 'v3', folded: true },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await userEvent.click(canvas.getByRole('button', { name: /^Decompose phase/ }))
    await isOpen(canvasElement)
    await waitFor(() => expect(canvas.getByText('Decompose')).toBeVisible())
  },
}
