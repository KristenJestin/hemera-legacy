import type { Meta, StoryObj } from '@storybook/react-vite'
import { cn } from 'cn'
import { MotionConfig } from 'motion/react'
import { useState } from 'react'
import { expect, userEvent, within } from 'storybook/test'

import {
  expectNeverBuried,
  watchMark,
  watchThereAndBack,
} from '../../../.storybook/sliding-mark.ts'
import { OVER_MARK, SlidingMark } from './sliding-mark.tsx'

/**
 * The mark of the chosen item of a list, on a list of its own (issue #127).
 *
 * Every list of the design system that marks a choice draws it with this: the tabs, the chrome
 * bar's Projects, the sidebar, the theme's segment, the Project settings' navigation. What is
 * shown here is the piece alone, on plain items, both ways of crossing and both directions.
 */
const PLACES = ['Home', 'Sessions', 'Journal', 'Workspaces', 'Settings']

const LIST = {
  vertical: 'relative isolate flex w-menu-side flex-col gap-1',
  horizontal: 'relative isolate flex items-stretch gap-1',
} as const

const ITEM =
  'relative flex h-control-md items-center rounded-md px-3 text-sm text-muted-foreground outline-none select-none focus-ring hover:bg-muted'

/** The chosen item: over the mark, which is its fill, and with no fill of its own. */
const CHOSEN = 'z-1 text-foreground hover:bg-transparent'

const FILL = 'absolute inset-0 rounded-md bg-accent'

/** What a reaching mark draws: one sheet, cut down to the item by its two edges. */
const SHEET = 'tab-mark block size-full bg-accent'

interface HarnessProps {
  /** Which way the list runs. */
  orientation: 'vertical' | 'horizontal'
  /** How the mark crosses from one item to the next. */
  crossing: 'slide' | 'reach'
  /** The item chosen first, or none. */
  initial: string | null
}

function Harness({ orientation, crossing, initial }: HarnessProps) {
  const [chosen, setChosen] = useState(initial)
  return (
    <div role="listbox" aria-label={`Places, ${orientation}`} className={LIST[orientation]}>
      {PLACES.map((place) => (
        <button
          key={place}
          type="button"
          role="option"
          aria-selected={place === chosen}
          data-mark={place}
          className={cn(ITEM, place === chosen && CHOSEN)}
          onClick={() => setChosen(place)}
        >
          <span className={OVER_MARK}>{place}</span>
        </button>
      ))}
      {crossing === 'reach' ? (
        <SlidingMark target={chosen} crossing="reach">
          <span data-mark-shape="" className={SHEET} />
        </SlidingMark>
      ) : (
        <SlidingMark target={chosen} shape={FILL} />
      )}
    </div>
  )
}

const meta = {
  tags: ['autodocs'],
  title: 'Components/SlidingMark',
  component: Harness,
  parameters: { layout: 'padded' },
  args: { orientation: 'vertical', crossing: 'slide', initial: 'Home' },
  argTypes: {
    orientation: {
      control: 'inline-radio',
      options: ['vertical', 'horizontal'],
      description: 'Which way the list runs.',
    },
    crossing: {
      control: 'inline-radio',
      options: ['slide', 'reach'],
      description: 'Carried across as a box, or stretched across by its two edges.',
    },
    initial: { control: 'text', description: 'The item chosen first; empty for none.' },
  },
} satisfies Meta<typeof Harness>

export default meta
type Story = StoryObj<typeof meta>

export const Playground: Story = {}

/** The two ways of crossing, down a column and along a row. */
export const Variants: Story = {
  parameters: { controls: { disable: true } },
  render: () => (
    <div className="flex flex-col gap-6">
      <Harness orientation="vertical" crossing="slide" initial="Home" />
      <Harness orientation="horizontal" crossing="slide" initial="Home" />
      <Harness orientation="horizontal" crossing="reach" initial="Home" />
    </div>
  ),
}

/** No item chosen: the list draws no mark at all, rather than one lying at its corner. */
export const States: Story = {
  parameters: { controls: { disable: true } },
  args: { initial: null },
  play: async ({ canvasElement }) => {
    const mark = canvasElement.querySelector('[data-sliding-mark]')
    expect(mark).not.toBeNull()
    expect(mark).not.toBeVisible()
    await userEvent.click(within(canvasElement).getByRole('option', { name: 'Journal' }))
    expect(mark).toBeVisible()
  },
}

/**
 * Down to the last item and back up to the first, then along a row by its two edges: on every
 * frame of the way the mark is drawn over the items it crosses, and never under one.
 */
export const Crossing: Story = {
  parameters: { controls: { disable: true } },
  render: () => (
    <div className="flex flex-col gap-6">
      <Harness orientation="vertical" crossing="slide" initial="Home" />
      <Harness orientation="horizontal" crossing="reach" initial="Home" />
    </div>
  ),
  play: async ({ canvasElement }) => {
    const [column, row] = within(canvasElement).getAllByRole('listbox')
    const click = (list: HTMLElement, name: string) => () =>
      userEvent.click(within(list).getByRole('option', { name }))
    const down = await watchThereAndBack(
      column!,
      click(column!, 'Settings'),
      click(column!, 'Home'),
    )
    const along = await watchThereAndBack(row!, click(row!, 'Settings'), click(row!, 'Home'))
    expect(within(row!).getByRole('option', { name: 'Home' })).toHaveAttribute(
      'aria-selected',
      'true',
    )
    expectNeverBuried([...down, ...along])
  },
}

/**
 * Asked for less movement, the mark jumps: it is on its new item on the next frame it draws,
 * with nothing in between. Asked by a `MotionConfig` rather than by the system, which a page
 * already drawn does not hear change — and `useTransition` honours both.
 */
export const ReducedMotion: Story = {
  parameters: { controls: { disable: true } },
  render: (args) => (
    <MotionConfig reducedMotion="always">
      <Harness {...args} />
    </MotionConfig>
  ),
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    const watched = await watchMark(canvas.getByRole('listbox'), () =>
      userEvent.click(canvas.getByRole('option', { name: 'Settings' })),
    )
    expect(watched.buried).toEqual([])
    // Where it was, and where it is.
    expect(watched.places).toBeLessThanOrEqual(2)
  },
}
