import type { Meta, StoryObj } from '@storybook/react-vite'
import { MotionConfig } from 'motion/react'
import { type ReactNode, useEffect, useRef, useState } from 'react'
import { expect, userEvent, waitFor, within } from 'storybook/test'

import { Button } from '../../components/button/button.tsx'
import { TooltipProvider } from '../../components/tooltip/tooltip.tsx'
import { durations } from '../../motion.ts'
import { Chat, useSpecSession } from './frames-fixtures.tsx'
import { V4Strip, V4bRim } from './column-variants.tsx'
import {
  DrawerCarried,
  DrawerSwap,
  TransitionDrawer,
  TransitionMorph,
  TransitionReveal,
} from './transitions.tsx'
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
 * - V4 · Strip · V3 folded, and open as one frame holding the whole Spec as one column, a strip
 *   of the phases' glyphs at the top of its body saying where the reader is (verdict of 26
 *   September: V3 folded, none of the three open).
 * - V4b · Rim · the same, the phases' glyphs on the rim with their names and how much of each
 *   has been read, the body the column alone.
 * - V4b · Transition A/B/C · V4b's two states kept, three journeys between them (second verdict
 *   of 26 September: V4b chosen, its fold refused): the folded frame morphing into the rim, the
 *   panel sliding in as a drawer, the panel uncovered by a clip. Each with a replay.
 * - V4b · Drawer 1 · Swap and Drawer 2 · Carried · two takes on the drawer (third verdict: B
 *   leaned to): the folded frame trading places with the panel, or riding in on its left edge.
 *
 * Every chevron folds and unfolds, as many times as wanted; the `reducedMotion` control shows
 * the same thing with the journey taken out.
 */

type Variant =
  | 'v1'
  | 'v2'
  | 'v3'
  | 'v4'
  | 'v4b'
  | 'v4b-a'
  | 'v4b-b'
  | 'v4b-c'
  | 'v4b-swap'
  | 'v4b-carried'

const VARIANTS = { v1: V1Grow, v2: V2Beside, v3: V3Cards, v4: V4Strip, v4b: V4bRim }

/** V4b's transitions, which a replay drives. */
const TRANSITIONS = {
  'v4b-a': TransitionMorph,
  'v4b-b': TransitionDrawer,
  'v4b-c': TransitionReveal,
  'v4b-swap': DrawerSwap,
  'v4b-carried': DrawerCarried,
}

type Replayable = keyof typeof TRANSITIONS

function isReplayable(variant: Variant): variant is Replayable {
  return variant in TRANSITIONS
}

function Session({ variant, folded }: { variant: Variant; folded: boolean }): ReactNode {
  const session = useSpecSession()
  if (isReplayable(variant)) return <Replayed variant={variant} folded={folded} />
  const Panel = VARIANTS[variant]
  return (
    // The row is the container the panel's width is a share of.
    <div className="@container flex h-screen min-h-0 bg-background text-foreground">
      <Chat />
      <Panel session={session} defaultFolded={folded} />
    </div>
  )
}

/**
 * A transition with its replay: a bar above the Session whose button plays the way there and
 * back — unfolds, holds the open frame a turn, folds; or the other way round from open.
 */
function Replayed({ variant, folded }: { variant: Replayable; folded: boolean }): ReactNode {
  const session = useSpecSession()
  const Panel = TRANSITIONS[variant]
  const [signal, setSignal] = useState(0)
  const [playing, setPlaying] = useState(false)
  const first = useRef<boolean | null>(null)
  const hold = useRef<ReturnType<typeof setTimeout>>(undefined)
  useEffect(() => () => clearTimeout(hold.current), [])

  function settled(nowFolded: boolean): void {
    if (!playing) return
    if (first.current === null) return
    // Arrived at the far end: hold it, then go back. Back where it started: done.
    if (nowFolded !== first.current) {
      hold.current = setTimeout(() => setSignal((one) => one + 1), durations.turn * 1000)
    } else {
      first.current = null
      setPlaying(false)
    }
  }

  return (
    <div className="flex h-screen min-h-0 flex-col bg-background text-foreground">
      <div className="flex shrink-0 items-center gap-3 border-b border-border px-4 py-2 text-sm text-muted-foreground">
        <Button
          variant="secondary"
          size="sm"
          onClick={() => {
            // Pressed again while playing: the replay under way goes on.
            if (playing) return
            first.current = document.querySelector('[aria-label="Unfold the Spec"]') !== null
            setPlaying(true)
            setSignal((one) => one + 1)
          }}
        >
          Replay
        </Button>
        <span>Unfolds, holds, folds back — or the other way round from open.</span>
      </div>
      <div className="@container flex min-h-0 flex-1">
        <Chat />
        <Panel session={session} defaultFolded={folded} signal={signal} onSettle={settled} />
      </div>
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
    variant: {
      control: 'inline-radio',
      options: [
        'v1',
        'v2',
        'v3',
        'v4',
        'v4b',
        'v4b-a',
        'v4b-b',
        'v4b-c',
        'v4b-swap',
        'v4b-carried',
      ],
    },
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
  // Waited for: a transition may still be carrying the folded frame away.
  await waitFor(() => expect(canvas.queryByRole('button', { name: 'Unfold the Spec' })).toBeNull())
}

/** The panel folded to its floating frame: the unfold, and no stage. */
async function isFolded(canvasElement: HTMLElement): Promise<void> {
  const canvas = within(canvasElement)
  await waitFor(() => expect(canvas.queryByRole('region', { name: 'Stage of ATL-7' })).toBeNull())
  // Waited for: a transition may still be dressing the folded frame once the Spec has gone.
  await waitFor(() => expect(canvas.getByRole('button', { name: 'Unfold the Spec' })).toBeVisible())
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

/**
 * The reader scrolled the column down to Decompose: the phase named at the top follows. Plan
 * pressed first takes the column there and names it at once; the scrolls after it are the
 * reader's, back to the top and then down to Decompose, which, short, is named once the column
 * is at its foot.
 */
async function scrolledToDecompose(canvasElement: HTMLElement): Promise<void> {
  const canvas = within(canvasElement)
  await isOpen(canvasElement)
  const column = canvas.getByRole('region', { name: 'Stage of ATL-7' })
  const glyph = (phase: string): HTMLElement =>
    canvas.getByRole('button', { name: new RegExp(`^Go to the ${phase} phase`) })
  await expect(glyph('Shape')).toHaveAttribute('aria-current', 'location')
  await userEvent.click(glyph('Plan'))
  await waitFor(() => expect(glyph('Plan')).toHaveAttribute('aria-current', 'location'))
  await waitFor(() => expect(column.scrollTop).toBeGreaterThan(0))
  const decompose = column.querySelector<HTMLElement>('[data-phase="decompose"]')
  if (decompose === null) throw new Error('The column holds no Decompose phase')
  // After the smooth scroll to Plan has stopped: what follows is the reader's own.
  await new Promise((resolve) => setTimeout(resolve, 800))
  column.scrollTop = 0
  await waitFor(() => expect(glyph('Shape')).toHaveAttribute('aria-current', 'location'))
  column.scrollTop = decompose.offsetTop
  await waitFor(() => expect(glyph('Decompose')).toHaveAttribute('aria-current', 'location'))
  await expect(glyph('Plan')).not.toHaveAttribute('aria-current')
}

/** A glyph of the folded frame pressed: the column opens on that phase, named in the strip. */
async function opensOnDecompose(canvasElement: HTMLElement): Promise<void> {
  const canvas = within(canvasElement)
  await userEvent.click(canvas.getByRole('button', { name: /^Decompose phase/ }))
  await isOpen(canvasElement)
  await waitFor(() =>
    expect(canvas.getByRole('button', { name: /^Go to the Decompose phase/ })).toHaveAttribute(
      'aria-current',
      'location',
    ),
  )
}

// ---------------------------------------------------------------------------------------------
// V4 · Strip

export const V4Open: Story = {
  name: 'V4 · Strip · open',
  args: { variant: 'v4' },
  play: async ({ canvasElement }) => isOpen(canvasElement),
}

export const V4Folded: Story = {
  name: 'V4 · Strip · folded',
  args: { variant: 'v4', folded: true },
  play: async ({ canvasElement }) => isFolded(canvasElement),
}

export const V4Transition: Story = {
  name: 'V4 · Strip · unfold and fold',
  args: { variant: 'v4', folded: true },
  play: async ({ canvasElement }) => unfoldThenFold(canvasElement),
}

export const V4ReducedMotion: Story = {
  name: 'V4 · Strip · reduced motion',
  args: { variant: 'v4', folded: true, reducedMotion: true },
  play: async ({ canvasElement }) => unfoldThenFold(canvasElement),
}

export const V4ScrolledToDecompose: Story = {
  name: 'V4 · Strip · scrolled to Decompose',
  args: { variant: 'v4' },
  play: async ({ canvasElement }) => scrolledToDecompose(canvasElement),
}

export const V4OpensOnAPhase: Story = {
  name: 'V4 · Strip · a phase pressed',
  args: { variant: 'v4', folded: true },
  play: async ({ canvasElement }) => opensOnDecompose(canvasElement),
}

// ---------------------------------------------------------------------------------------------
// V4b · Rim

export const V4bOpen: Story = {
  name: 'V4b · Rim · open',
  args: { variant: 'v4b' },
  play: async ({ canvasElement }) => isOpen(canvasElement),
}

export const V4bFolded: Story = {
  name: 'V4b · Rim · folded',
  args: { variant: 'v4b', folded: true },
  play: async ({ canvasElement }) => isFolded(canvasElement),
}

export const V4bTransition: Story = {
  name: 'V4b · Rim · unfold and fold',
  args: { variant: 'v4b', folded: true },
  play: async ({ canvasElement }) => unfoldThenFold(canvasElement),
}

export const V4bReducedMotion: Story = {
  name: 'V4b · Rim · reduced motion',
  args: { variant: 'v4b', folded: true, reducedMotion: true },
  play: async ({ canvasElement }) => unfoldThenFold(canvasElement),
}

export const V4bScrolledToDecompose: Story = {
  name: 'V4b · Rim · scrolled to Decompose',
  args: { variant: 'v4b' },
  play: async ({ canvasElement }) => scrolledToDecompose(canvasElement),
}

export const V4bOpensOnAPhase: Story = {
  name: 'V4b · Rim · a phase pressed',
  args: { variant: 'v4b', folded: true },
  play: async ({ canvasElement }) => opensOnDecompose(canvasElement),
}

// ---------------------------------------------------------------------------------------------
// V4b · three transitions

/** The replay pressed: the Spec opens, holds, and folds back by itself. */
async function replays(canvasElement: HTMLElement): Promise<void> {
  const canvas = within(canvasElement)
  await isFolded(canvasElement)
  await userEvent.click(canvas.getByRole('button', { name: 'Replay' }))
  await isOpen(canvasElement)
  await isFolded(canvasElement)
}

export const V4bMorph: Story = {
  name: 'V4b · Transition A · Morph · open ↔ folded',
  args: { variant: 'v4b-a', folded: true },
  play: async ({ canvasElement }) => {
    await unfoldThenFold(canvasElement)
    await replays(canvasElement)
  },
}

export const V4bMorphReducedMotion: Story = {
  name: 'V4b · Transition A · Morph · reduced motion',
  args: { variant: 'v4b-a', folded: true, reducedMotion: true },
  play: async ({ canvasElement }) => unfoldThenFold(canvasElement),
}

export const V4bDrawer: Story = {
  name: 'V4b · Transition B · Drawer · open ↔ folded',
  args: { variant: 'v4b-b', folded: true },
  play: async ({ canvasElement }) => {
    await unfoldThenFold(canvasElement)
    await replays(canvasElement)
  },
}

export const V4bDrawerReducedMotion: Story = {
  name: 'V4b · Transition B · Drawer · reduced motion',
  args: { variant: 'v4b-b', folded: true, reducedMotion: true },
  play: async ({ canvasElement }) => unfoldThenFold(canvasElement),
}

export const V4bReveal: Story = {
  name: 'V4b · Transition C · Reveal · open ↔ folded',
  args: { variant: 'v4b-c', folded: true },
  play: async ({ canvasElement }) => {
    await unfoldThenFold(canvasElement)
    await replays(canvasElement)
  },
}

export const V4bRevealReducedMotion: Story = {
  name: 'V4b · Transition C · Reveal · reduced motion',
  args: { variant: 'v4b-c', folded: true, reducedMotion: true },
  play: async ({ canvasElement }) => unfoldThenFold(canvasElement),
}

// ---------------------------------------------------------------------------------------------
// V4b · two drawers

export const V4bSwap: Story = {
  name: 'V4b · Drawer 1 · Swap · open ↔ folded',
  args: { variant: 'v4b-swap', folded: true },
  play: async ({ canvasElement }) => {
    await unfoldThenFold(canvasElement)
    await replays(canvasElement)
  },
}

export const V4bSwapReducedMotion: Story = {
  name: 'V4b · Drawer 1 · Swap · reduced motion',
  args: { variant: 'v4b-swap', folded: true, reducedMotion: true },
  play: async ({ canvasElement }) => unfoldThenFold(canvasElement),
}

export const V4bCarried: Story = {
  name: 'V4b · Drawer 2 · Carried · open ↔ folded',
  args: { variant: 'v4b-carried', folded: true },
  play: async ({ canvasElement }) => {
    await unfoldThenFold(canvasElement)
    await replays(canvasElement)
  },
}

export const V4bCarriedReducedMotion: Story = {
  name: 'V4b · Drawer 2 · Carried · reduced motion',
  args: { variant: 'v4b-carried', folded: true, reducedMotion: true },
  play: async ({ canvasElement }) => unfoldThenFold(canvasElement),
}
