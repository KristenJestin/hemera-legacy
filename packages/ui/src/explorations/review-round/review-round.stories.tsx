import type { Meta, StoryObj } from '@storybook/react-vite'
import type { ReactNode } from 'react'
import { expect, userEvent, waitFor, within } from 'storybook/test'

import { TooltipProvider } from '../../components/tooltip/tooltip.tsx'
import { FEEDBACK, NO_GIT, NO_GIT_FEEDBACK, RESULT, STALE } from './fixtures.ts'
import type { RoundStart } from './page.tsx'
import { ModeSession } from './variant-mode.tsx'
import { PanelSession } from './variant-panel.tsx'
import { SplitSession } from './variant-split.tsx'

/**
 * The review round of a build (design exploration of 30 September 2026, issue #23, lot 6a).
 * Storybook only: nothing here is wired, and no component of the design system changed for it.
 *
 * Once the build is done, the main agent opens a round on a stabilised result and changes
 * nothing of it until the user asks for the fix pass. The round shows, per repository, the
 * commits, the files changed and the untracked ones; the evidence — the checks that passed and
 * the reviewers' findings already fixed — and the documentation that changed. The user leaves
 * feedback without any anchor, screenshots pasted or dropped; it accumulates, and nothing starts
 * before "Fix these". A question is answered by the main agent and never becomes a task. Accept,
 * Deliver and Close the Spec are three clicks, each waiting for the one before. A file changed
 * outside Hemera makes the result stale; a Project without Git shows no repository and no
 * code review. The diff and comments on lines come after 1.0.
 *
 * Three variants, each in the build Session's page, the chat foldable to its band:
 *
 * - A · Panel — the build panel's stage turns to the review, one column, the feedback box at
 *   its foot where a composer would be.
 * - B · Review mode — the round takes the row: the result on the left, the repositories side by
 *   side, the feedback in a column of its own on the right; the chat opens folded.
 * - C · Split — the panel splits into the list of the result and what is chosen in it; the
 *   feedback lives in the chat, in the composer's place.
 *
 * Recommended: B. The result and the feedback are seen together without a scroll between them,
 * nothing important lives in the chat, so it can stay folded, and the gestures stand in a head
 * across the whole row.
 */

type Variant = 'panel' | 'mode' | 'split'

type Moment = 'open' | 'stale' | 'noGit' | 'fixing' | 'accepted' | 'empty'

const MOMENTS: Record<Moment, Omit<RoundStart, 'chatFolded'>> = {
  open: { result: RESULT, feedback: FEEDBACK, standing: 'open', fixing: false },
  empty: { result: RESULT, feedback: [], standing: 'open', fixing: false },
  stale: { result: STALE, feedback: FEEDBACK, standing: 'open', fixing: false },
  noGit: {
    result: NO_GIT,
    feedback: NO_GIT_FEEDBACK,
    standing: 'open',
    fixing: false,
  },
  fixing: { result: RESULT, feedback: FEEDBACK, standing: 'open', fixing: true },
  accepted: { result: RESULT, feedback: [], standing: 'accepted', fixing: false },
}

function Screen({
  variant,
  moment,
  chatFolded,
}: {
  variant: Variant
  moment: Moment
  chatFolded: boolean
}): ReactNode {
  const start: RoundStart = { ...MOMENTS[moment], chatFolded }
  return (
    <TooltipProvider>
      {variant === 'panel' && <PanelSession start={start} />}
      {variant === 'mode' && <ModeSession start={start} />}
      {variant === 'split' && <SplitSession start={start} />}
    </TooltipProvider>
  )
}

const meta = {
  title: 'Explorations/Review round',
  component: Screen,
  tags: ['autodocs', 'new'],
  parameters: { layout: 'fullscreen' },
  args: { variant: 'mode', moment: 'open', chatFolded: true },
  argTypes: {
    variant: { control: 'select', options: ['panel', 'mode', 'split'] },
    moment: { control: 'select', options: Object.keys(MOMENTS) },
    chatFolded: { control: 'boolean' },
  },
} satisfies Meta<typeof Screen>

export default meta

type Story = StoryObj<typeof meta>

/** Every repository of the result, the evidence and the documentation are drawn. */
async function seesTheResult(canvasElement: HTMLElement): Promise<void> {
  const canvas = within(canvasElement)
  await expect(canvas.getByRole('article', { name: 'sources/api' })).toBeVisible()
  await expect(canvas.getByRole('region', { name: 'Evidence' })).toBeInTheDocument()
  await expect(canvas.getByRole('region', { name: 'Documentation' })).toBeInTheDocument()
}

/** A · The round in the build panel, the chat beside it. */
export const PanelComplete: Story = {
  args: { variant: 'panel', chatFolded: false },
  play: async ({ canvasElement }) => seesTheResult(canvasElement),
}

/** A · The chat folded: the panel takes the row. */
export const PanelChatFolded: Story = {
  args: { variant: 'panel', chatFolded: true },
  play: async ({ canvasElement }) => {
    await expect(
      within(canvasElement).getByRole('button', { name: 'Unfold the chat' }),
    ).toBeVisible()
  },
}

/** A · `ExportButton.tsx` saved in an editor: the result is stale, Accept is refused. */
export const PanelStale: Story = {
  args: { variant: 'panel', moment: 'stale', chatFolded: true },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await expect(canvas.getByRole('status', { name: 'Stale result' })).toBeVisible()
    await expect(canvas.getByRole('button', { name: 'Accept' })).toBeDisabled()
  },
}

/** A · Without Git: the folder, the checks, the documentation, the feedback. */
export const PanelWithoutGit: Story = {
  args: { variant: 'panel', moment: 'noGit', chatFolded: true },
}

/** B · The round across the row, the chat folded, the feedback beside the result. */
export const ModeComplete: Story = {
  args: { variant: 'mode' },
  play: async ({ canvasElement }) => {
    await seesTheResult(canvasElement)
    await expect(
      within(canvasElement).getByRole('complementary', { name: 'Feedback' }),
    ).toBeVisible()
  },
}

/** B · The chat unfolded beside the round. */
export const ModeChatOpen: Story = {
  args: { variant: 'mode', chatFolded: false },
}

/** B · Stale: the warning under the head, the file marked in its repository. */
export const ModeStale: Story = {
  args: { variant: 'mode', moment: 'stale' },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await expect(canvas.getByRole('status', { name: 'Stale result' })).toBeVisible()
    await expect(canvas.getByRole('button', { name: 'Accept' })).toBeDisabled()
    await expect(canvas.getByRole('img', { name: /^Changed outside Hemera at / })).toBeVisible()
  },
}

/** B · Retake: the round takes the result again, the warning leaves, Accept comes back. */
export const ModeRetake: Story = {
  args: { variant: 'mode', moment: 'stale' },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await userEvent.click(canvas.getByRole('button', { name: 'Retake' }))
    await waitFor(() => expect(canvas.queryByRole('status', { name: 'Stale result' })).toBeNull())
    await expect(canvas.getByRole('button', { name: 'Accept' })).toBeEnabled()
  },
}

/** B · Without Git: no repository, no finding, and nothing drawn as if there were. */
export const ModeWithoutGit: Story = {
  args: { variant: 'mode', moment: 'noGit' },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await expect(canvas.getByRole('article', { name: '~/Sites/bakery' })).toBeVisible()
    await expect(canvas.queryByRole('list', { name: 'Findings fixed' })).toBeNull()
    await expect(canvas.queryByText(/Commits/)).toBeNull()
  },
}

/** B · "Fix these" pressed: the batches with the feedback they come from; the question stays out. */
export const ModeFixing: Story = {
  args: { variant: 'mode', moment: 'fixing' },
  play: async ({ canvasElement }) => {
    const fixes = within(within(canvasElement).getByRole('list', { name: 'Fixes' }))
    await expect(fixes.getAllByRole('listitem')).toHaveLength(2)
  },
}

/**
 * B · Feedback accumulates: a remark and a question are added, nothing starts; "Fix these" counts
 * the remarks only, and its press is what starts the pass.
 */
export const ModeFeedbackAccumulates: Story = {
  args: { variant: 'mode', moment: 'empty' },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await expect(canvas.getByRole('button', { name: 'Fix these · 0' })).toBeDisabled()
    const box = canvas.getByRole('textbox', { name: 'Feedback' })
    await userEvent.type(box, 'The button says Export CSV twice.')
    await userEvent.click(canvas.getByRole('button', { name: 'Add' }))
    await userEvent.type(box, 'Is the file UTF-8 with a BOM?')
    await userEvent.click(canvas.getByRole('button', { name: 'Add' }))
    await expect(canvas.getByRole('img', { name: 'Question' })).toBeVisible()
    await expect(canvas.queryByRole('list', { name: 'Fixes' })).toBeNull()
    await userEvent.click(canvas.getByRole('button', { name: 'Fix these · 1' }))
    const fixes = within(await canvas.findByRole('list', { name: 'Fixes' }))
    await expect(fixes.getAllByRole('listitem')).toHaveLength(1)
  },
}

/** B · A screenshot pasted into the box is attached to the feedback it is added with. */
export const ModeScreenshotPasted: Story = {
  args: { variant: 'mode', moment: 'empty' },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    const box = canvas.getByRole('textbox', { name: 'Feedback' })
    await userEvent.click(box)
    const shot = new File([new Uint8Array([137, 80, 78, 71])], 'screen.png', {
      type: 'image/png',
    })
    const data = new DataTransfer()
    data.items.add(shot)
    box.dispatchEvent(new ClipboardEvent('paste', { clipboardData: data, bubbles: true }))
    await expect(
      await canvas.findByRole('list', { name: 'Screenshots to attach' }),
    ).toBeInTheDocument()
    await userEvent.click(canvas.getByRole('button', { name: 'Add' }))
    await expect(await canvas.findByRole('button', { name: 'Open screen.png' })).toBeVisible()
    // The pass is offered now, and its button has finished arriving from its disabled look.
    const fix = canvas.getByRole('button', { name: 'Fix these · 1' })
    await waitFor(() => expect(getComputedStyle(fix).opacity).toBe('1'))
  },
}

/** B · Accept, Deliver, Close the Spec: three clicks, each waiting for the one before. */
export const ModeThreeGestures: Story = {
  args: { variant: 'mode', moment: 'empty' },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    const page = within(document.body)
    await expect(canvas.getByRole('button', { name: 'Deliver' })).toBeDisabled()
    await expect(canvas.getByRole('button', { name: 'Close the Spec' })).toBeDisabled()
    await userEvent.click(canvas.getByRole('button', { name: 'Accept' }))
    await userEvent.click(await canvas.findByRole('button', { name: 'Deliver' }))
    await waitFor(() =>
      expect(page.getByRole('list', { name: "The Project's delivery rules" })).toBeVisible(),
    )
    await userEvent.click(page.getByRole('button', { name: 'Confirm delivery' }))
    await userEvent.click(await canvas.findByRole('button', { name: 'Close the Spec' }))
    await waitFor(() => expect(page.getByText('Workspace kept')).toBeVisible())
    await userEvent.click(page.getByRole('button', { name: 'Close ATL-7' }))
    await expect(await canvas.findByText('Closed')).toBeVisible()
  },
}

/** B · Accepted: Deliver is next. */
export const ModeAccepted: Story = {
  args: { variant: 'mode', moment: 'accepted' },
  play: async ({ canvasElement }) => {
    await expect(within(canvasElement).getByRole('button', { name: 'Deliver' })).toBeEnabled()
  },
}

/** C · The result's list and what is chosen in it; the feedback in the chat. */
export const SplitComplete: Story = {
  args: { variant: 'split', chatFolded: false },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await expect(canvas.getByRole('navigation', { name: 'Result' })).toBeVisible()
    await userEvent.click(canvas.getByRole('button', { name: /^Evidence/ }))
    await expect(canvas.getByRole('region', { name: 'Evidence' })).toBeVisible()
  },
}

/** C · Stale: the repository's entry carries the dot. */
export const SplitStale: Story = {
  args: { variant: 'split', moment: 'stale', chatFolded: false },
}

/** C · Without Git. */
export const SplitWithoutGit: Story = {
  args: { variant: 'split', moment: 'noGit', chatFolded: false },
}

/** C · The chat folded: the feedback goes with it, and the band only counts it. */
export const SplitChatFolded: Story = {
  args: { variant: 'split', chatFolded: true },
}
