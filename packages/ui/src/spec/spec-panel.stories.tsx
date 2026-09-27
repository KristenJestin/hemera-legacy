import type { Meta, StoryObj } from '@storybook/react-vite'
import { MotionConfig } from 'motion/react'
import { expect, fn, userEvent, waitFor, within } from 'storybook/test'

import { TooltipProvider } from '../components/tooltip/tooltip.tsx'
import { swap } from '../motion.ts'
import { LiveSpecPanel } from './spec-harness.tsx'
import {
  BUG,
  EMPTY,
  GATE_FULL,
  MAINTENANCE,
  MID_PLAN,
  OLDER_REVISION,
  READY,
  gate,
  phases,
} from './spec-fixtures.ts'
import type { WorkspaceActionsProps } from './workspace-actions.tsx'

/** The build of the Spec as the application hands it: nothing asked for yet, `main` to use. */
const BUILD: WorkspaceActionsProps = {
  launch: null,
  workspaces: [{ id: 'ws-main', name: 'main' }],
  onPrepareAndStart: fn(),
  onPrepareOnly: fn(),
  onUseWorkspace: fn(),
  onStart: fn(),
  onRetry: fn(),
  onOpen: fn(),
}

/** The Spec in the row: its slot, the small frame and, while it is there, the panel. */
function dockOf(canvasElement: HTMLElement): HTMLElement {
  return within(canvasElement).getByRole('region', { name: 'Spec ATL-7' })
}

/** The panel, which stays mounted folded as well as open. */
function panelOf(canvasElement: HTMLElement): HTMLElement {
  return dockOf(canvasElement).querySelector<HTMLElement>('[data-spec-panel]')!
}

/**
 * Whether the panel is stowed: the Spec folded and at rest, the panel still laid out so that an
 * unfold starts at once, but not drawn, out of the keyboard's reach and out of the accessibility
 * tree.
 */
function isStowed(canvasElement: HTMLElement): boolean {
  const panel = panelOf(canvasElement)
  return (
    panel.hasAttribute('data-stowed') &&
    panel.inert &&
    panel.getAttribute('aria-hidden') === 'true' &&
    getComputedStyle(panel).visibility === 'hidden'
  )
}

/** What the small frame is laid in, which slides and fades as a whole. */
function frameOf(canvasElement: HTMLElement): HTMLElement {
  return dockOf(canvasElement).querySelector<HTMLElement>('[data-spec-frame]')!
}

/** The panel's footer holding the build's actions, or `Mark ready`; null while it holds neither. */
function footOf(canvasElement: HTMLElement, kind: 'build' | 'ready'): HTMLElement | null {
  return dockOf(canvasElement).querySelector<HTMLElement>(`[data-foot="${kind}"]`)
}

/** The footer the build's actions stand in, or null while it has none. */
function buildFootOf(canvasElement: HTMLElement): HTMLElement | null {
  return footOf(canvasElement, 'build')
}

/** `Mark ready` in the panel's footer, which a draft offers and nothing else does. */
function markReadyOf(canvasElement: HTMLElement): HTMLElement {
  const foot = footOf(canvasElement, 'ready')
  if (foot === null) throw new Error('the footer holds no Mark ready')
  return within(foot).getByRole('button', { name: 'Mark ready' })
}

/** Whether a button is drawn as the primary action, rather than a quiet one. */
function isPrimary(button: HTMLElement): boolean {
  return button.classList.contains('bg-primary')
}

/** The column the Spec is read in, while the panel is open. */
function columnOf(canvasElement: HTMLElement): HTMLElement {
  return within(canvasElement).getByRole('region', { name: /^Contents of / })
}

/** The heading of a phase in the column, which is the trigger of the menu of the phases. */
function headingOf(canvasElement: HTMLElement, phase: string): HTMLElement {
  return within(columnOf(canvasElement)).getByRole('button', {
    name: new RegExp(`^${phase} phase, .*go to another phase$`),
  })
}

/**
 * Whether a phase's heading stands at the top of the column, stuck there: the phase being read.
 * Checked against the column's own top, to the pixel.
 */
function isStuck(canvasElement: HTMLElement, phase: string): boolean {
  const column = columnOf(canvasElement).getBoundingClientRect()
  const band = headingOf(canvasElement, phase).closest('[data-heading]')!.parentElement!
  return Math.abs(band.getBoundingClientRect().top - column.top) < 1
}

/** Resolves on the next frame, once whatever was asked has been drawn. */
function nextFrame(): Promise<void> {
  return new Promise((resolve) => requestAnimationFrame(() => resolve()))
}

/**
 * The Spec panel alone, in a Session's row beside a stand-in for the chat (issue #164). Folded by
 * default to a small frame at the window's edge — the unfold chevron and the three phases' glyphs,
 * each tinted by how far along it is — and opened by the chevron, a glyph, or the agent starting
 * on a part, unless the hand folded it. The two trade places by a swap: the frame slides out by
 * the edge and fades, and a beat later the panel slides in and pushes the chat; folding, the other
 * way round. Open, one frame: the head on its rim, the Spec as one column under the sticky
 * headings of its phases, and one footer across the panel (issue #150): `Mark ready` on a draft,
 * quiet until the agent confirmed the Spec complete and primary after, and the build's actions
 * once the Spec is ready. No readiness is drawn (issue #135). The screens of the brief are drawn
 * in their Session, under `Surfaces/Session/Define`; these are the panel's own states and paths.
 */
const meta = {
  title: 'Blocks/Spec/SpecPanel',
  component: LiveSpecPanel,
  tags: ['autodocs', 'updated'],
  parameters: { layout: 'fullscreen' },
  decorators: [
    (Story) => (
      <TooltipProvider>
        <Story />
      </TooltipProvider>
    ),
  ],
  args: {
    spec: MID_PLAN,
    defaultFolded: false,
    onFoldChange: fn(),
    onAnswer: fn(),
    onGoToQuestion: fn(),
    onMarkReady: fn(),
    onRework: fn(),
    onPickRevision: fn(),
    onTakeOver: fn(),
    build: BUILD,
  },
  argTypes: {
    spec: { control: 'object', description: 'The Spec as the panel draws it.' },
    reader: { control: 'object', description: 'Present when this Session reads the draft.' },
    defaultReworkOpen: { control: 'boolean', description: 'Whether Rework starts open.' },
    defaultFolded: {
      control: 'boolean',
      description: 'Whether it starts folded to its small frame.',
    },
    arrives: {
      control: 'boolean',
      description: 'Whether the Spec was just created here, and the panel arrives opening.',
    },
    agentWrites: {
      control: 'text',
      description: 'A part the agent can be made to start on, from the stand-in chat.',
    },
    onFoldChange: { description: 'Told each time the panel folds or unfolds.' },
    build: {
      control: 'object',
      description: 'The build, which a ready Spec offers in the panel footer.',
    },
  },
} satisfies Meta<typeof LiveSpecPanel>

export default meta

type Story = StoryObj<typeof meta>

/** The width the Spec takes in the row now, in pixels: its slot and its margin at the edge. */
function dockWidth(canvasElement: HTMLElement): number {
  return dockOf(canvasElement).getBoundingClientRect().width
}

/** The small frame's width — the theme's three and a half rems — and its margin, in pixels. */
const FOLDED = 56 + 12

/**
 * Folded, as a Session opens it: the small frame at the window's edge, at the top of the row — the
 * unfold chevron and the three phases' glyphs, each tinted by how far along it is and named with
 * its phase and its state. No head and no column: the chat has the width.
 */
export const Folded: Story = {
  args: { defaultFolded: true },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await expect(dockWidth(canvasElement)).toBe(FOLDED)
    await expect(isStowed(canvasElement)).toBe(true)
    const frame = canvas.getByRole('navigation', { name: 'Phases of ATL-7' })
    const shape = within(frame).getByRole('button', {
      name: 'Shape phase, done, unfold the Spec on it',
    })
    const plan = within(frame).getByRole('button', {
      name: 'Plan phase, started, the agent is writing it, unfold the Spec on it',
    })
    const decompose = within(frame).getByRole('button', {
      name: 'Decompose phase, started, unfold the Spec on it',
    })
    // The tints: done, started, and the phase the agent writes breathing.
    await expect(shape.querySelector('[data-progress="done"]')).not.toBeNull()
    await expect(plan.querySelector('[data-progress="started"][data-writing]')).not.toBeNull()
    await expect(decompose.querySelector('[data-progress="started"]')).not.toBeNull()
    await expect(canvas.getByRole('button', { name: 'Unfold the Spec' })).toBeVisible()
    // At the top of the row, where the open panel's top is (issue #181).
    const top = panelOf(canvasElement).parentElement!.getBoundingClientRect().top
    const box = frameOf(canvasElement).firstElementChild!.getBoundingClientRect()
    await expect(box.top).toBeCloseTo(top, 0)
    await expect(canvas.queryByRole('region', { name: 'Contents of ATL-7' })).toBeNull()
    await expect(canvas.queryByRole('heading', { name: 'CSV invoice export' })).toBeNull()
    // The column is there, laid out for the swap, and nothing of it takes the keyboard: neither
    // asked directly, nor walked to from the small frame.
    const panel = panelOf(canvasElement)
    const reachable = [
      ...panel.querySelectorAll<HTMLElement>('button, [tabindex], a[href], input, textarea'),
    ]
    await expect(reachable.length).toBeGreaterThan(0)
    for (const one of reachable) one.focus()
    await expect(panel.contains(document.activeElement)).toBe(false)
    canvas.getByRole('button', { name: 'Unfold the Spec' }).focus()
    const walked: boolean[] = []
    for (const _ of [1, 2, 3, 4, 5]) {
      // oxlint-disable-next-line no-await-in-loop -- the tab stops are walked one after the other
      await userEvent.tab()
      walked.push(panel.contains(document.activeElement))
    }
    await expect(walked).toEqual([false, false, false, false, false])
    // Left as it opened: the walk leaves no focus, and so no tooltip, behind it.
    if (document.activeElement instanceof HTMLElement) document.activeElement.blur()
  },
}

/**
 * Open: a feature being planned, the head with no sentence under it and the fold at its end, the
 * Spec as one column — no band of phases and no tabs — and `Mark ready` in the footer.
 */
export const Open: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await expect(dockWidth(canvasElement)).toBeGreaterThan(FOLDED)
    await expect(canvas.getByRole('heading', { name: 'CSV invoice export' })).toBeVisible()
    await expect(canvas.getByRole('button', { name: 'Fold the Spec' })).toBeVisible()
    await expect(canvas.queryByRole('navigation', { name: 'Phases of ATL-7' })).toBeNull()
    await expect(canvas.queryByRole('tablist')).toBeNull()
    // Every part, one phase after the other, under the three headings.
    const titles = [...columnOf(canvasElement).querySelectorAll('[data-part] h3')].map(
      (heading) => heading.textContent ?? '',
    )
    const parts = [/^Problem/, /^Scope/, /^Plan/, /^Stories/, /^Tasks/, /^Questions/]
    await expect(parts.filter((part) => !titles.some((title) => part.test(title)))).toEqual([])
    await expect(titles.findIndex((title) => title.startsWith('Problem'))).toBeLessThan(
      titles.findIndex((title) => title.startsWith('Plan')),
    )
    await expect(headingOf(canvasElement, 'Shape')).toHaveTextContent('5 of 5 written')
    await expect(headingOf(canvasElement, 'Plan')).toHaveTextContent('1 of 1 written')
    await expect(headingOf(canvasElement, 'Decompose')).toHaveTextContent('2 of 3 written')
    await expect(isStuck(canvasElement, 'Shape')).toBe(true)
    await expect(markReadyOf(canvasElement)).toBeEnabled()
    await expect(buildFootOf(canvasElement)).toBeNull()
    await expect(canvas.queryByText('Prototype')).toBeNull()
  },
}

/** Opened on Shape from its glyph: the column stands on Shape, its heading at the top. */
export const OpenOnShape: Story = {
  args: { defaultFolded: true },
  play: async ({ canvasElement, args }) => {
    const canvas = within(canvasElement)
    await userEvent.click(canvas.getByRole('button', { name: /^Shape phase, done/ }))
    await expect(args.onFoldChange).toHaveBeenCalledWith(false)
    await waitFor(() => expect(isStuck(canvasElement, 'Shape')).toBe(true))
    await expect(headingOf(canvasElement, 'Shape')).toHaveFocus()
  },
}

/** Opened on Plan from its glyph: the column stands on Plan, Shape scrolled away above it. */
export const OpenOnPlan: Story = {
  args: { defaultFolded: true },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await userEvent.click(canvas.getByRole('button', { name: /^Plan phase, started/ }))
    await waitFor(() => expect(isStuck(canvasElement, 'Plan')).toBe(true))
    await expect(columnOf(canvasElement).scrollTop).toBeGreaterThan(0)
    await expect(headingOf(canvasElement, 'Plan')).toHaveFocus()
    await waitFor(() => expect(dockWidth(canvasElement)).toBeGreaterThan(FOLDED))
  },
}

/**
 * Opened on Decompose from its glyph: the last phase, which the column brings to the top whatever
 * it holds, its heading stuck there as every other's is.
 */
export const OpenOnDecompose: Story = {
  args: { defaultFolded: true },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await userEvent.click(canvas.getByRole('button', { name: /^Decompose phase, started/ }))
    await waitFor(() => expect(isStuck(canvasElement, 'Decompose')).toBe(true))
    await expect(headingOf(canvasElement, 'Decompose')).toHaveFocus()
  },
}

/**
 * The heading of the phase being read stays stuck at the top while its content scrolls under it,
 * and the next phase's heading replaces it when it arrives: they never stack. Pressed, the stuck
 * heading opens the menu of the three phases, each with how much of it is written; one chosen
 * takes the column to it.
 */
export const StuckHeadingMenu: Story = {
  play: async ({ canvasElement }) => {
    const column = columnOf(canvasElement)
    const shape = column.querySelector<HTMLElement>('[data-phase="shape"]')!
    // Half-way down Shape: its heading is stuck, and it is the only one at the top.
    column.scrollTo({ top: shape.offsetHeight / 2, behavior: 'instant' })
    await nextFrame()
    await expect(isStuck(canvasElement, 'Shape')).toBe(true)
    await expect(isStuck(canvasElement, 'Plan')).toBe(false)
    // Into Plan: Plan's heading has pushed Shape's away, and stands alone at the top.
    column.scrollTo({ top: shape.offsetHeight + 4, behavior: 'instant' })
    await nextFrame()
    await expect(isStuck(canvasElement, 'Plan')).toBe(true)
    const gone = headingOf(canvasElement, 'Shape').getBoundingClientRect()
    await expect(gone.bottom).toBeLessThanOrEqual(column.getBoundingClientRect().top + 1)

    await userEvent.click(headingOf(canvasElement, 'Plan'))
    const menu = await waitFor(() => within(document.body).getByRole('menu'))
    const items = within(menu).getAllByRole('menuitem')
    await expect(items).toHaveLength(3)
    await expect(items[0]).toHaveTextContent(/^Shape\s*5 of 5 written$/)
    await expect(items[1]).toHaveTextContent(/^Plan\s*1 of 1 written$/)
    await expect(items[2]).toHaveTextContent(/^Decompose\s*2 of 3 written$/)
    await expect(items[0]!.querySelector('[data-progress="done"]')).not.toBeNull()
    await userEvent.click(items[2]!)
    await waitFor(() => expect(within(document.body).queryByRole('menu')).toBeNull())
    await waitFor(() => expect(isStuck(canvasElement, 'Decompose')).toBe(true))
  },
}

/**
 * A phase being written: the agent writes the plan, so Plan's glyph breathes, its heading says so
 * after how much is written, and both are named with it. Set to the tasks, it is Decompose's turn.
 */
export const PhaseBeingWritten: Story = {
  args: { agentWrites: 'tasks' },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    const plan = headingOf(canvasElement, 'Plan')
    await expect(plan).toHaveAccessibleName(
      'Plan phase, open, 1 of 1 written, the agent is writing it, go to another phase',
    )
    await expect(plan).toHaveTextContent('1 of 1 written · writing…')
    await expect(plan.querySelector('[data-writing]')).not.toBeNull()
    await expect(headingOf(canvasElement, 'Shape').querySelector('[data-writing]')).toBeNull()
    await userEvent.click(canvas.getByRole('button', { name: 'Let the agent write the tasks' }))
    await waitFor(() =>
      expect(headingOf(canvasElement, 'Decompose').querySelector('[data-writing]')).not.toBeNull(),
    )
  },
}

/**
 * A Spec with nothing written: every heading's glyph in the quiet tint, each phase "0 of n
 * written", every part saying that nothing is written yet.
 */
export const Empty: Story = {
  args: { spec: EMPTY },
  play: async ({ canvasElement }) => {
    const headings = ['Shape', 'Plan', 'Decompose'].map((phase) => headingOf(canvasElement, phase))
    await expect(
      headings.map((one) => one.querySelector('[data-progress]')?.getAttribute('data-progress')),
    ).toEqual(['empty', 'empty', 'empty'])
    await expect(headings.map((one) => /0 of \d written/.test(one.textContent ?? ''))).toEqual([
      true,
      true,
      true,
    ])
    const column = within(columnOf(canvasElement))
    await expect(column.getAllByText('Nothing written yet.').length).toBeGreaterThan(3)
  },
}

/**
 * Just created from the agent's proposal (issue #130): the panel arrives, opening from nothing to
 * its open width on the swap's spring rather than standing there, and lands open. The small
 * frame never shows.
 */
export const Arrives: Story = {
  args: { arrives: true, defaultFolded: true },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    const dock = dockOf(canvasElement)
    const row = dock.parentElement!.getBoundingClientRect().width
    await waitFor(() => expect(dock.getBoundingClientRect().width).toBeCloseTo(row * 0.45 + 12, 0))
    await expect(canvas.getByRole('heading', { name: 'CSV invoice export' })).toBeVisible()
    await expect(frameOf(canvasElement)).toHaveAttribute('aria-hidden', 'true')
  },
}

/** A bug: Reproduction in Shape, and Behaviour and Stories never drawn. */
export const Bug: Story = {
  args: { spec: BUG },
  play: async ({ canvasElement }) => {
    const column = within(columnOf(canvasElement))
    await expect(column.getByRole('heading', { name: /^Reproduction/ })).toBeVisible()
    await expect(column.queryByRole('heading', { name: /^Behaviour/ })).toBeNull()
    await expect(column.queryByRole('heading', { name: /^Stories/ })).toBeNull()
  },
}

/** A `maintenance`: its own section is the invariants it keeps. */
export const Maintenance: Story = {
  args: { spec: MAINTENANCE },
  play: async ({ canvasElement }) => {
    const column = within(columnOf(canvasElement))
    await expect(column.getByRole('heading', { name: /^Invariants/ })).toBeInTheDocument()
    await expect(column.queryByRole('heading', { name: /^Behaviour/ })).toBeNull()
  },
}

/**
 * The agent starts on a part while the Spec is folded: it opens on its own, on the phase of the
 * part the agent writes.
 */
export const OpensWhenTheAgentWrites: Story = {
  args: { defaultFolded: true, agentWrites: 'tasks' },
  play: async ({ canvasElement, args }) => {
    const canvas = within(canvasElement)
    await expect(isStowed(canvasElement)).toBe(true)
    await userEvent.click(canvas.getByRole('button', { name: 'Let the agent write the tasks' }))
    await expect(args.onFoldChange).toHaveBeenCalledWith(false)
    await waitFor(() => expect(isStuck(canvasElement, 'Decompose')).toBe(true))
    await waitFor(() => expect(dockWidth(canvasElement)).toBeGreaterThan(FOLDED))
  },
}

/**
 * Folded by the hand, the Spec stays folded when the agent starts on a part — the phase's glyph
 * breathes instead; unfolded by the hand, the keyboard is on the fold.
 */
export const HandFoldWins: Story = {
  args: { agentWrites: 'tasks' },
  play: async ({ canvasElement, args }) => {
    const canvas = within(canvasElement)
    await userEvent.click(canvas.getByRole('button', { name: 'Fold the Spec' }))
    await expect(args.onFoldChange).toHaveBeenLastCalledWith(true)
    await waitFor(() => expect(dockWidth(canvasElement)).toBe(FOLDED))
    // The fold is gone with the panel: the keyboard is on the small frame's unfold.
    await expect(canvas.getByRole('button', { name: 'Unfold the Spec' })).toHaveFocus()
    await waitFor(() => expect(isStowed(canvasElement)).toBe(true))
    await userEvent.click(canvas.getByRole('button', { name: 'Let the agent write the tasks' }))
    await expect(
      canvas.getByRole('button', { name: /^Decompose phase/ }).querySelector('[data-writing]'),
    ).not.toBeNull()
    await expect(args.onFoldChange).toHaveBeenCalledTimes(1)
    await expect(isStowed(canvasElement)).toBe(true)
    await userEvent.click(canvas.getByRole('button', { name: 'Unfold the Spec' }))
    await expect(args.onFoldChange).toHaveBeenLastCalledWith(false)
    await waitFor(() => expect(canvas.getByRole('button', { name: 'Fold the Spec' })).toHaveFocus())
  },
}

/** Where the chat, the panel and the small frame stand on one frame. */
interface Frame {
  /** When the frame was read, on the page's clock. */
  at: number
  chat: number
  chatRight: number
  /** How much of the panel is inside its clip, in pixels. */
  panel: number
  panelLeft: number
  /** How opaque the small frame is, from 0 to 1. */
  frame: number
}

/** The opacity a filter draws an element at, 1 when it draws none. */
function opacityOf(element: HTMLElement): number {
  const found = /opacity\(([\d.]+)\)/.exec(getComputedStyle(element).filter)
  return found === null ? 1 : Number(found[1])
}

/** The Spec and the chat on the frame this is called on. */
function measure(canvasElement: HTMLElement): Frame {
  const dock = dockOf(canvasElement)
  const chat = dock.previousElementSibling!.getBoundingClientRect()
  const panel = panelOf(canvasElement)
  const box = panel.getBoundingClientRect()
  const clip = panel.parentElement!.getBoundingClientRect()
  return {
    at: performance.now(),
    chat: chat.width,
    chatRight: chat.right,
    panel: isStowed(canvasElement) ? 0 : Math.max(0, clip.right - box.left),
    panelLeft: box.left,
    frame: opacityOf(frameOf(canvasElement)),
  }
}

/**
 * The frames an action moves the row through: the one before it, every frame while it happens,
 * and every frame after it until nothing has moved for twenty.
 */
async function framesOf(canvasElement: HTMLElement, action: () => Promise<void>): Promise<Frame[]> {
  const frames = [measure(canvasElement)]
  let acted = false
  const sampled = new Promise<Frame[]>((resolve) => {
    let still = 0
    const sample = (): void => {
      const now = measure(canvasElement)
      const last = frames.at(-1)!
      const same = last.chat === now.chat && last.frame === now.frame && last.panel === now.panel
      still = acted && same ? still + 1 : 0
      frames.push(now)
      if (still < 20) requestAnimationFrame(sample)
      else resolve(frames)
    }
    requestAnimationFrame(sample)
  })
  await action()
  acted = true
  return sampled
}

/** The chat's widths from the first frame it moved on to where it landed. */
function moved(frames: Frame[]): number[] {
  const widths = frames.map((frame) => frame.chat)
  return widths.slice(widths.findIndex((width) => width !== widths[0]) - 1)
}

/** Presses a button, and answers when the press landed, on the page's clock. */
async function pressedAt(button: HTMLElement): Promise<number> {
  let at = Number.NaN
  button.addEventListener(
    'click',
    () => {
      at = performance.now()
    },
    { once: true },
  )
  await userEvent.click(button)
  return at
}

/** The swap's beat, in milliseconds: how long the panel waits for the frame to start leaving. */
const BEAT = swap.beat * 1000

/**
 * The swap, both ways (issue #164). Opening, the small frame starts leaving first and the panel
 * waits a beat for it, then comes in while the frame is still there; folding, the panel leaves and the
 * frame is back while the panel is still going. On no frame is neither there. The chat is pushed
 * on every frame, never a jump, down one way and up the other, and the panel never stands over it.
 */
export const SwapReplayed: Story = {
  args: { defaultFolded: true },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    let pressed = Number.NaN
    const opening = await framesOf(canvasElement, async () => {
      pressed = await pressedAt(canvas.getByRole('button', { name: 'Unfold the Spec' }))
    })
    // Never neither: on every frame, some of the frame or some of the panel is there.
    await expect(opening.filter((frame) => frame.frame === 0 && frame.panel === 0)).toEqual([])
    // The frame goes first: the panel shows no sooner than a beat after the press. Measured on
    // the clock rather than against the frame's fade, which the compositor may start a frame or
    // two late on a busy machine.
    const coming = opening.find((frame) => frame.panel > 0)!
    await expect(coming.at - pressed).toBeGreaterThanOrEqual(BEAT)
    // And the two overlap: the panel is coming in while the frame is still there.
    await expect(opening.some((frame) => frame.frame > 0 && frame.panel > 0)).toBe(true)
    const narrowing = moved(opening)
    const [full, first] = narrowing
    const narrowest = narrowing.at(-1)!
    await expect(narrowest).toBeLessThan(full!)
    // Down on every frame, never back up, and through widths in between.
    await expect(narrowing).toEqual(narrowing.toSorted((a, b) => b - a))
    await expect(first).toBeGreaterThan(narrowest)
    await expect(opening.filter((frame) => frame.panelLeft < frame.chatRight - 0.5)).toEqual([])
    await expect(opening.at(-1)!.frame).toBe(0)

    const closing = await framesOf(canvasElement, () =>
      userEvent.click(canvas.getByRole('button', { name: 'Fold the Spec' })),
    )
    await expect(closing.filter((frame) => frame.frame === 0 && frame.panel === 0)).toEqual([])
    await expect(closing.some((frame) => frame.frame > 0 && frame.panel > 0)).toBe(true)
    const widening = moved(closing)
    const widest = widening.at(-1)!
    await expect(widest).toBeGreaterThan(widening[0]!)
    await expect(widening).toEqual(widening.toSorted((a, b) => a - b))
    await expect(closing.filter((frame) => frame.panelLeft < frame.chatRight - 0.5)).toEqual([])
    await expect(closing.at(-1)!.frame).toBe(1)
    await expect(widest).toBe(full)
    await waitFor(() => expect(isStowed(canvasElement)).toBe(true))
  },
}

/**
 * A fold asked while the panel is still coming in turns it round from where it is: the chat is
 * given its width back from the width it had reached, and is never pushed the rest of the way.
 */
export const TurnsRoundMidWay: Story = {
  args: { defaultFolded: true },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    const frames = await framesOf(canvasElement, async () => {
      await userEvent.click(canvas.getByRole('button', { name: 'Unfold the Spec' }))
      // Part of the way in, and no further.
      await waitFor(() => expect(measure(canvasElement).panel).toBeGreaterThan(40), {
        interval: 5,
      })
      await userEvent.click(canvas.getByRole('button', { name: 'Fold the Spec' }))
    })
    const widths = frames.map((frame) => frame.chat)
    const row = dockOf(canvasElement).parentElement!.getBoundingClientRect().width
    // The panel's whole width was never taken from the chat.
    await expect(Math.min(...widths)).toBeGreaterThan(row * 0.55 - 12 + 1)
    await expect(widths.at(-1)).toBe(widths[0])
    await expect(frames.at(-1)!.frame).toBe(1)
    await waitFor(() => expect(isStowed(canvasElement)).toBe(true))
  },
}

/**
 * Where a control stands on the screen, to the pixel: its centre, which the hover's growth under
 * the pointer that just pressed there leaves where it is.
 */
function placeOf(button: HTMLElement): string {
  const box = button.getBoundingClientRect()
  return [box.left + box.width / 2, box.top + box.height / 2].map(Math.round).join(' ')
}

/**
 * Unfolded then folded again, and the pointer's target never moves (issue #181): the fold chevron
 * of the open panel stands exactly where the unfold chevron of the small frame stood, so the same
 * spot pressed twice unfolds the Spec and folds it back. Read at rest on both sides of the swap.
 */
async function chevronStaysPut(canvasElement: HTMLElement): Promise<void> {
  const canvas = within(canvasElement)
  const unfold = canvas.getByRole('button', { name: 'Unfold the Spec' })
  const folded = placeOf(unfold)
  await userEvent.click(unfold)
  await nextFrame()
  const fold = canvas.getByRole('button', { name: 'Fold the Spec' })
  await expect(placeOf(fold)).toBe(folded)
  await userEvent.click(fold)
  await nextFrame()
  await expect(placeOf(canvas.getByRole('button', { name: 'Unfold the Spec' }))).toBe(folded)
}

/** A draft: the fold chevron of its head is where the small frame's unfold chevron was. */
export const ChevronInPlace: Story = {
  args: { defaultFolded: true },
  // Settled at once, so that each side of the swap is read where it lands.
  decorators: [
    (Story) => (
      <MotionConfig reducedMotion="always">
        <Story />
      </MotionConfig>
    ),
  ],
  play: async ({ canvasElement }) => chevronStaysPut(canvasElement),
}

/**
 * A ready Spec, whose head holds the taller picker of the revisions and `Rework`: the fold chevron
 * is still where the unfold chevron was.
 */
export const ChevronInPlaceWhenReady: Story = {
  args: { spec: READY, defaultFolded: true },
  // Settled at once, so that each side of the swap is read where it lands.
  decorators: [
    (Story) => (
      <MotionConfig reducedMotion="always">
        <Story />
      </MotionConfig>
    ),
  ],
  play: async ({ canvasElement }) => chevronStaysPut(canvasElement),
}

/**
 * Told to move less, the swap jumps: on the frame after the hand unfolds it, the panel is at its
 * open width — a share of the row — the chat has the rest, and the small frame is gone. Folded
 * again, the frame is back on the next frame.
 *
 * `MotionConfig` says the preference rather than the browser's media query, which motion reads
 * once when a component mounts: a story that emulated it afterwards would test a tree that never
 * heard.
 */
export const ReducedMotion: Story = {
  args: { defaultFolded: true },
  decorators: [
    (Story) => (
      <MotionConfig reducedMotion="always">
        <Story />
      </MotionConfig>
    ),
  ],
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await userEvent.click(canvas.getByRole('button', { name: 'Unfold the Spec' }))
    await nextFrame()
    const dock = dockOf(canvasElement)
    const row = dock.parentElement!.getBoundingClientRect().width
    await expect(dock.getBoundingClientRect().width).toBeCloseTo(row * 0.45 + 12, 0)
    await expect(measure(canvasElement).frame).toBe(0)
    await expect(canvas.getByRole('button', { name: 'Fold the Spec' })).toHaveFocus()
    await userEvent.click(canvas.getByRole('button', { name: 'Fold the Spec' }))
    await nextFrame()
    await expect(dockWidth(canvasElement)).toBe(FOLDED)
    await expect(measure(canvasElement).frame).toBe(1)
    await expect(isStowed(canvasElement)).toBe(true)
  },
}

/**
 * `Mark ready` pressed on a draft that still lacks something: refused, and what is left is said
 * beside it in the footer, in plain words (issues #135, #150). The Spec stays a draft.
 */
export const MarkReadyRefused: Story = {
  play: async ({ canvasElement, args }) => {
    const canvas = within(canvasElement)
    await userEvent.click(markReadyOf(canvasElement))
    await expect(args.onMarkReady).toHaveBeenCalledTimes(1)
    const foot = within(footOf(canvasElement, 'ready')!)
    await expect(foot.getByRole('alert')).toHaveTextContent(
      /^ATL-7 is not ready yet. Still to do: .*the credit-note question/,
    )
    await expect(canvas.getByRole('img', { name: 'Draft' })).toBeVisible()
    await expect(markReadyOf(canvasElement)).toBeVisible()
  },
}

/** An open question of the register takes the thread to where it is asked. */
export const QuestionLinked: Story = {
  play: async ({ canvasElement, args }) => {
    const canvas = within(canvasElement)
    await userEvent.click(canvas.getByRole('button', { name: /^Answer in the chat: Credit notes/ }))
    await expect(args.onGoToQuestion).toHaveBeenCalledWith('q-credit-notes')
  },
}

/**
 * An older revision picked: shown as it was marked ready, with no editor, no `Rework` and no
 * `Mark ready`.
 */
export const OlderRevision: Story = {
  args: { spec: OLDER_REVISION },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await expect(canvas.getByText('An earlier version · read only')).toBeVisible()
    await expect(canvas.queryByRole('textbox')).toBeNull()
    await expect(canvas.queryByRole('button', { name: 'Rework' })).toBeNull()
    await expect(canvas.queryByRole('button', { name: 'Mark ready' })).toBeNull()
    // Nothing to mark and nothing to build: the footer holds nothing.
    await expect(footOf(canvasElement, 'ready')).toBeNull()
    await expect(buildFootOf(canvasElement)).toBeNull()
  },
}

/**
 * A draft half done (issue #150): shaped, the plan being written, nothing split into tasks. The
 * head says no sentence of the phase, and the footer offers `Mark ready` quietly — the agent has
 * not confirmed the Spec complete — on the rim under the column, at the panel's end.
 */
export const DraftHalfDone: Story = {
  play: async ({ canvasElement }) => {
    const header = canvasElement.querySelector('header')!
    await expect(within(header).queryByRole('button', { name: 'Mark ready' })).toBeNull()
    await expect(header.querySelectorAll('p')).toHaveLength(0)
    const mark = markReadyOf(canvasElement)
    await expect(isPrimary(mark)).toBe(false)
    const foot = footOf(canvasElement, 'ready')!.getBoundingClientRect()
    const column = columnOf(canvasElement).getBoundingClientRect()
    await expect(foot.top).toBeGreaterThanOrEqual(column.bottom)
    await expect(buildFootOf(canvasElement)).toBeNull()
  },
}

/**
 * A draft the agent confirmed complete (issue #150): its `ready` proposal accepted, `Mark ready`
 * is the primary action of the footer. Pressed, it freezes the Spec as before.
 */
export const DraftConfirmed: Story = {
  args: { spec: GATE_FULL },
  play: async ({ canvasElement, args }) => {
    const mark = markReadyOf(canvasElement)
    await expect(isPrimary(mark)).toBe(true)
    await userEvent.click(mark)
    await expect(args.onMarkReady).toHaveBeenCalledTimes(1)
    await waitFor(() =>
      expect(within(canvasElement).getByRole('img', { name: 'Ready' })).toBeVisible(),
    )
  },
}

/**
 * A draft the agent attested while a phase is still open: the attestation alone does not make
 * `Mark ready` the primary action, since the press would be refused on the rest of the gate.
 */
export const AttestedWithAPhaseOpen: Story = {
  args: {
    spec: {
      ...GATE_FULL,
      phases: phases('finished', 'finished', 'open'),
      readiness: gate({ phases: 'phases · the decompose phase is open, not finished' }, [
        { label: 'decompose', target: 'tasks' },
      ]),
    },
  },
  play: async ({ canvasElement }) => {
    await expect(isPrimary(markReadyOf(canvasElement))).toBe(false)
  },
}

/**
 * A ready Spec with its footer (issues #135, #150): the build's actions stand in the footer under
 * the column, side by side at its end and none of them cut — not in the head, which says the
 * status and offers `Rework`.
 */
export const ReadyWithItsBuild: Story = {
  args: { spec: READY },
  play: async ({ canvasElement, args }) => {
    const canvas = within(canvasElement)
    const foot = buildFootOf(canvasElement)
    await expect(foot).not.toBeNull()
    const actions = within(foot!)
    const prepare = actions.getByRole('button', { name: 'Prepare and start the build' })
    const existing = actions.getByRole('button', { name: 'Use an existing Workspace' })
    for (const button of [prepare, existing]) {
      expect(button).toBeVisible()
      expect(button.scrollWidth).toBeLessThanOrEqual(button.clientWidth)
    }
    const column = columnOf(canvasElement).getBoundingClientRect()
    await expect(foot!.getBoundingClientRect().top).toBeGreaterThanOrEqual(column.bottom)
    const header = canvasElement.querySelector('header')!
    await expect(within(header).queryByRole('button', { name: /build/ })).toBeNull()
    await expect(within(header).getByRole('button', { name: 'Rework' })).toBeVisible()
    // Ready, the build's actions have taken `Mark ready`'s place.
    await expect(canvas.queryByRole('button', { name: 'Mark ready' })).toBeNull()
    await userEvent.click(prepare)
    await expect(args.build?.onPrepareAndStart).toHaveBeenCalled()
  },
}

/**
 * The build's actions arrive when the Spec becomes ready: `Mark ready` pressed, it folds away as
 * they grow in its place; `Rework` confirmed, they fold away and `Mark ready` is back, quiet
 * again, since the agent has to confirm the reworked Spec anew.
 */
export const BuildArrivesWhenReady: Story = {
  args: { spec: GATE_FULL },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await expect(buildFootOf(canvasElement)).toBeNull()
    await userEvent.click(markReadyOf(canvasElement))
    await waitFor(() => expect(buildFootOf(canvasElement)).not.toBeNull())
    await waitFor(() => expect(footOf(canvasElement, 'ready')).toBeNull())
    const arriving = buildFootOf(canvasElement)!.parentElement!
    await waitFor(() =>
      expect(
        within(arriving).getByRole('button', { name: 'Prepare and start the build' }),
      ).toBeVisible(),
    )
    await waitFor(() =>
      expect(arriving.getBoundingClientRect().height).toBe(
        buildFootOf(canvasElement)!.getBoundingClientRect().height,
      ),
    )
    await userEvent.click(canvas.getByRole('button', { name: 'Rework' }))
    const page = within(document.body)
    const dialog = await page.findByRole('dialog', { name: 'Rework ATL-7' })
    await userEvent.click(within(dialog).getByRole('button', { name: 'Rework' }))
    await waitFor(() => expect(buildFootOf(canvasElement)).toBeNull())
    await expect(canvas.queryByRole('button', { name: 'Prepare and start the build' })).toBeNull()
    await expect(isPrimary(markReadyOf(canvasElement))).toBe(false)
  },
}

/**
 * A Rework while the build waits for its Workspace: the launch is taken back, and the draft it
 * leaves has its footer — `Mark ready`, with the cancelled launch said beside it, not in its place.
 */
export const ReworkWhileTheLaunchWaits: Story = {
  args: {
    spec: READY,
    build: { ...BUILD, launch: { state: 'waiting', step: 'pnpm install' } },
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await expect(canvas.getByText(/^Preparing the Workspace/)).toBeVisible()
    await userEvent.click(canvas.getByRole('button', { name: 'Rework' }))
    const dialog = await within(document.body).findByRole('dialog', { name: 'Rework ATL-7' })
    await userEvent.click(within(dialog).getByRole('button', { name: 'Rework' }))
    await waitFor(() => expect(footOf(canvasElement, 'ready')).not.toBeNull())
    await waitFor(() => expect(buildFootOf(canvasElement)).toBeNull())
    const foot = within(footOf(canvasElement, 'ready')!)
    await expect(foot.getByRole('button', { name: 'Mark ready' })).toBeVisible()
    await expect(foot.getByRole('status')).toHaveTextContent('Cancelled by the Rework')
  },
}

/**
 * A draft with a failed launch still on it: `Mark ready` holds the footer, the failure is said
 * beside it, and nothing offers to start the agent again on a Spec that is not ready.
 */
export const DraftWithAFailedLaunch: Story = {
  args: {
    build: { ...BUILD, launch: { state: 'failed', cause: 'the agent exited with code 1' } },
  },
  play: async ({ canvasElement }) => {
    await expect(buildFootOf(canvasElement)).toBeNull()
    const foot = within(footOf(canvasElement, 'ready')!)
    await expect(foot.getByRole('button', { name: 'Mark ready' })).toBeVisible()
    await expect(foot.getByText(/The agent did not start: the agent exited/)).toBeVisible()
    await expect(foot.queryByRole('button', { name: 'Retry' })).toBeNull()
  },
}

/**
 * The keyboard across the swap: the unfold, then the fold, then a glyph, each landing where the
 * control it was on now stands; the heading it lands on opens the menu of the phases, which gives
 * the keyboard back to it when it closes.
 */
export const Keyboard: Story = {
  args: { defaultFolded: true },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    canvas.getByRole('button', { name: 'Unfold the Spec' }).focus()
    await userEvent.keyboard('{Enter}')
    await waitFor(() => expect(canvas.getByRole('button', { name: 'Fold the Spec' })).toHaveFocus())
    await userEvent.keyboard('{Enter}')
    await waitFor(() =>
      expect(canvas.getByRole('button', { name: 'Unfold the Spec' })).toHaveFocus(),
    )
    await userEvent.tab()
    await userEvent.tab()
    await expect(canvas.getByRole('button', { name: /^Plan phase/ })).toHaveFocus()
    await userEvent.keyboard('{Enter}')
    await waitFor(() => expect(headingOf(canvasElement, 'Plan')).toHaveFocus())
    await userEvent.keyboard('{Enter}')
    const menu = await waitFor(() => within(document.body).getByRole('menu'))
    await userEvent.keyboard('{Escape}')
    await waitFor(() => expect(menu).not.toBeInTheDocument())
    await expect(headingOf(canvasElement, 'Plan')).toHaveFocus()
  },
}
