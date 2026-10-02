import type { Meta, StoryObj } from '@storybook/react-vite'
import type { ReactNode } from 'react'
import { expect, userEvent, waitFor, within } from 'storybook/test'

import { TooltipProvider } from '../../components/tooltip/tooltip.tsx'
import { FEEDBACK, LARGE_ROUND, ONLY_A_QUESTION, ROUND, STALE_ROUND } from './fixtures.ts'
import type { ReviewStart } from './review.tsx'
// A stylesheet is imported for its effect: the libraries' variables, drawn from the tokens.
// oxlint-disable-next-line import/no-unassigned-import
import './review-diffs.css'
import { SessionPage } from './session-page.tsx'

/**
 * The review round of a build, around a real diff (design exploration of 30 September 2026,
 * issue #271). Storybook only: nothing here is wired, and no component of the design system
 * changed for it.
 *
 * One design, the DiffsHub one, drawn with `@pierre/diffs` and `@pierre/trees`:
 *
 * - **Left**, the Spec, then the tree of what the round changed, grouped by repository, each file
 *   with its Git letter and its counts, each repository with its totals and its stale mark.
 * - **Centre**, the diff of every file in one scroll, split or stacked; the Spec story by story
 *   when its entry is chosen. A line number pressed or dragged over opens a box under the lines,
 *   and what is written there becomes a feedback anchored on them.
 * - **Side**, the round's feedback as it accumulates, and "Fix these". A feedback that points
 *   somewhere takes the reader there.
 * - **Top**, `Spec review · round n`, the stale dot, and Accept, Deliver and Close, each drawn
 *   only when it can be done.
 *
 * It is the build Session's panel, widened over the chat to the whole row; the chevron at the
 * head's end brings it back beside the chat, where the feedback column gives way to an icon.
 */

type Moment = 'open' | 'stale' | 'acceptable' | 'fixing' | 'accepted' | 'large' | 'spec'

const MOMENTS: Record<Moment, ReviewStart> = {
  open: { round: ROUND, feedback: FEEDBACK },
  stale: { round: STALE_ROUND, feedback: FEEDBACK },
  acceptable: { round: ROUND, feedback: ONLY_A_QUESTION },
  fixing: { round: ROUND, feedback: FEEDBACK, fixing: true },
  accepted: { round: ROUND, feedback: ONLY_A_QUESTION, standing: 'accepted' },
  large: { round: LARGE_ROUND, feedback: FEEDBACK },
  spec: { round: ROUND, feedback: FEEDBACK, spec: true },
}

function Screen({
  moment,
  wide,
  stacked,
}: {
  moment: Moment
  wide: boolean
  stacked: boolean
}): ReactNode {
  const start: ReviewStart = { ...MOMENTS[moment], layout: stacked ? 'stacked' : 'split' }
  return (
    <TooltipProvider>
      <div className="h-screen">
        <SessionPage start={start} wide={wide} />
      </div>
    </TooltipProvider>
  )
}

const meta = {
  title: 'Explorations/Review diffs',
  component: Screen,
  tags: ['autodocs', 'new'],
  parameters: { layout: 'fullscreen' },
  args: { moment: 'open', wide: true, stacked: false },
  argTypes: {
    moment: { control: 'select', options: Object.keys(MOMENTS) },
    wide: { control: 'boolean', description: 'Whether the review goes over the chat.' },
    stacked: { control: 'boolean', description: 'Whether the diff opens stacked.' },
  },
} satisfies Meta<typeof Screen>

export default meta

type Story = StoryObj<typeof meta>

/** The shadow root the diff of a file is drawn in, once it is drawn. */
async function diffOf(canvasElement: HTMLElement, path: string): Promise<ShadowRoot> {
  const found: ShadowRoot[] = []
  await waitFor(() => {
    found.length = 0
    for (const host of canvasElement.querySelectorAll('diffs-container')) {
      const root = host.shadowRoot
      if (
        root?.textContent?.includes(path) === true &&
        root.querySelector('[data-line]') !== null
      ) {
        found.push(root)
      }
    }
    expect(found.length).toBeGreaterThan(0)
  })
  return found[0]!
}

/**
 * Everything in place: the review over the chat, the tree of the two repositories, the diff of
 * every file, the feedback beside it. Accept is not there: some feedback waits for a fix.
 */
export const Complete: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await expect(canvas.getByRole('heading', { name: 'Spec review · round 1' })).toBeVisible()
    await expect(canvas.getByRole('navigation', { name: 'What the round changed' })).toBeVisible()
    await expect(canvas.getByRole('complementary', { name: 'Feedback of the round' })).toBeVisible()
    await expect(canvas.getByRole('button', { name: /Fix these/ })).toBeVisible()
    await expect(canvas.queryByRole('button', { name: 'Accept' })).toBeNull()
    await diffOf(canvasElement, 'docs/billing/export.md')
  },
}

/** The review beside the chat, the build panel's share of the row: the feedback is an icon. */
export const BesideTheChat: Story = {
  args: { wide: false },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await expect(canvas.getByRole('button', { name: 'Over the chat' })).toBeVisible()
    await userEvent.click(canvas.getByRole('button', { name: 'Feedback' }))
    await expect(canvas.getByRole('complementary', { name: 'Feedback of the round' })).toBeVisible()
  },
}

/** The same diff stacked, one column, which is how a narrow review reads best. */
export const Stacked: Story = {
  args: { stacked: true },
}

/** The Spec entry: every story, each criterion shown met or not, and what was left on them. */
export const Spec: Story = {
  args: { moment: 'spec' },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    const spec = within(canvas.getByRole('region', { name: 'Spec of ATL-7' }))
    await expect(spec.getByRole('article', { name: 'S1 Export a month' })).toBeVisible()
    await expect(spec.getAllByRole('img', { name: 'Not shown met' })).toHaveLength(1)
    await userEvent.click(spec.getByRole('button', { name: 'Comment on S2 · 1' }))
    await userEvent.type(
      spec.getByRole('textbox', { name: 'Comment on S2 · 1' }),
      'Show a credit note in the September sample.',
    )
    await userEvent.click(spec.getByRole('button', { name: 'Comment' }))
    await expect(spec.getByText('Show a credit note in the September sample.')).toBeVisible()
  },
}

/** `ExportButton.tsx` saved in an editor: the front is stale, the head says so, Accept is gone. */
export const Stale: Story = {
  args: { moment: 'stale' },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await expect(
      canvas.getByRole('img', { name: 'The Workspace changed since the round opened' }),
    ).toBeVisible()
    await expect(canvas.queryByRole('button', { name: 'Accept' })).toBeNull()
  },
}

/** Only a question left: nothing waits for a fix, and Accept is there. */
export const Acceptable: Story = {
  args: { moment: 'acceptable' },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await expect(canvas.queryByRole('button', { name: /Fix these/ })).toBeNull()
    await userEvent.click(canvas.getByRole('button', { name: 'Accept' }))
    await expect(canvas.getByRole('img', { name: 'Accepted' })).toBeVisible()
    await expect(canvas.getByRole('button', { name: 'Deliver' })).toBeVisible()
  },
}

/** Accepted: its check, and Deliver next; Close comes once delivered. */
export const Accepted: Story = {
  args: { moment: 'accepted' },
}

/** "Fix these" pressed: the round takes no more feedback, and a dot says the fix is under way. */
export const Fixing: Story = {
  args: { moment: 'fixing' },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await expect(canvas.getAllByRole('img', { name: /being fixed/ }).length).toBeGreaterThan(0)
    await expect(canvas.queryByRole('group', { name: 'A feedback on the round' })).toBeNull()
  },
}

/** The list sends the reader to a feedback on lines: the diff scrolls to it, and it is lit. */
export const JumpToAComment: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    const list = within(canvas.getByRole('complementary', { name: 'Feedback of the round' }))
    await userEvent.click(list.getByRole('button', { name: /Two Export CSV buttons/ }))
    await waitFor(() =>
      expect(canvasElement.querySelector('[data-feedback="fb-1"][data-lit="true"]')).not.toBeNull(),
    )
  },
}

/**
 * Forty modules more: thousands of lines in dozens of files, the generated client folded, the
 * binary files their sizes. Only what is on screen is drawn.
 */
export const Large: Story = {
  args: { moment: 'large' },
  play: async ({ canvasElement }) => {
    await diffOf(canvasElement, 'docs/billing/export.md')
    const drawn = [...canvasElement.querySelectorAll('diffs-container')].length
    await expect(drawn).toBeLessThan(20)
  },
}
