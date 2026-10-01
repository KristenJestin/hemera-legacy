import type { Meta, StoryObj } from '@storybook/react-vite'
import { MotionConfig } from 'motion/react'
import { type ReactNode, useState } from 'react'
import { expect, fn, userEvent, waitFor, within } from 'storybook/test'

import { atRest } from '../../.storybook/at-rest.ts'
import { withinFrames } from '../../.storybook/reduced-motion.ts'

import { HemeraToolCall } from '../activity/hemera-tool-call.tsx'
import { PermissionRecord, PermissionRequest } from '../approval/permission-request.tsx'
import { Composer } from '../composer/composer.tsx'
import { TooltipProvider } from '../components/tooltip/tooltip.tsx'
import { IconShield } from '../icons.ts'
import { AgentText } from '../message/agent-text.tsx'
import { MessageScroller, type ScrollerEntry } from '../message/scroller/scroller.tsx'
import { type NoticeGroup, SessionNotices } from '../session/session-notices.tsx'
import { SessionDetails } from '../session/session-details.tsx'
import { SessionRow } from '../session/session-row.tsx'
import { SessionHeader } from '../session/session.tsx'
import { MissionBrief } from '../spec/mission-brief.tsx'
import { READY } from '../spec/spec-fixtures.ts'
import {
  ACCEPTED,
  BLOCKED,
  BLOCKER,
  BUILDING,
  FINAL_CHECKS_JUST_RED,
  FINAL_CHECKS_RED,
  GETTING_READY,
  NOW,
  PAUSED,
  READY_TO_ACCEPT,
  T4_YOURS,
  YOURS,
} from './build-fixtures.ts'
import { buildNotices } from './build-notices.tsx'
import { BuildPanel } from './build-panel.tsx'
import { type BuildViewProps } from './build-view.tsx'
import { type BuildViewData } from './model.ts'

/**
 * A `build` Session (D10-12): the page every Session has — its head, the thread, the composer —
 * with the build in the panel on its right, where a `define` Session has its Spec: the build view,
 * or the frozen Spec in its place while "Spec" is pressed. The panel opens unfolded and folds to a
 * band beside the chat, which it pushes as it moves.
 *
 * What waits for the user in the build — a task that is theirs, a blocker the agent raised, the
 * review — stands in the view and among the Session's notices, on the composer's edge. A permission
 * the agent asks stands there too, in its own kind beside the build's, and the thread keeps its
 * record where it was asked: one never hides the other (issue #203).
 *
 * Every screen is the build of `ATL-7` at one moment, left as it opens: its play asserts and
 * changes nothing. The paths through it — the Spec opening in the view's place, the fold, a
 * notice opening its task, the keyboard — are stories of their own.
 */

/** A Hemera line of the thread. */
function hemera(id: string, title: string, detail: string, brief?: string): ScrollerEntry {
  return { id, content: <MissionBrief title={title} detail={detail} brief={brief} /> }
}

/** What the agent said. */
function agents(id: string, text: string): ScrollerEntry {
  return { id, content: <AgentText text={text} /> }
}

const BRIEF =
  '**Building** · work through the ready tasks of `ATL-7`: **T2** · A CSV in the column order of the ledger (try 2 of 3: the header order was red), **T3** · Credit notes as negative rows.'

/** The thread of the build, from the brief to the calls of the build's own tools. */
const THREAD: ScrollerEntry[] = [
  hemera('brief', 'What the agent was told · Building', '10:28', BRIEF),
  {
    id: 'read',
    content: (
      <HemeraToolCall
        tool="build_read"
        label="Read build"
        mark="read-build"
        status="completed"
        summary="Reading the build of ATL-7"
      />
    ),
  },
  agents(
    'answer',
    'T2 was red on the header order: the ledger wants the number before the client. I am fixing the writer, then T3 from the same query.',
  ),
  {
    id: 'finished',
    content: (
      <HemeraToolCall
        tool="task_finished"
        label="Task finished"
        mark="finish-task"
        subject={{ text: 'T3' }}
        status="completed"
        summary="T3 handed to its checks"
      />
    ),
  },
]

/** The line a permission of the agent asks to run. */
const ASKED = 'pnpm vitest run src/billing/export-csv.test.ts'

/** The record of a permission the agent asks, which the thread keeps where it was asked. */
const PERMISSION: ScrollerEntry = {
  id: 'permission',
  content: (
    <PermissionRecord
      toolName="commands_run"
      label="Run command"
      subject={ASKED}
      command={ASKED}
      standing="pending"
    />
  ),
}

/** The permission among the Session's notices, where it is answered: a kind of its own. */
const PERMISSIONS: NoticeGroup = {
  kind: 'permission',
  label: 'Permissions',
  title: 'Run once',
  icon: <IconShield size="md" aria-hidden="true" />,
  urgent: true,
  tone: 'warning',
  items: [
    {
      id: 'permission',
      content: (
        <PermissionRequest
          toolName="commands_run"
          label="Run command"
          subject={ASKED}
          command={ASKED}
          intent="asks to run the test it wrote for the header order"
          options={[
            { optionId: 'reject-once', kind: 'reject_once', name: 'Reject once' },
            { optionId: 'allow-once', kind: 'allow_once', name: 'Allow once' },
          ]}
          onDecide={fn()}
        />
      ),
    },
  ],
}

/**
 * The head of the Session, across the whole page above the chat and the panel (#77): its details
 * open the Session details, whether the panel lies beside the chat or over it.
 */
function Head(): ReactNode {
  const [details, setDetails] = useState(false)
  return (
    <div className="shrink-0 px-6 pt-6 pb-1">
      <SessionHeader
        title="Build CSV export"
        onRename={fn()}
        onOpenDetails={() => setDetails(true)}
      />
      <SessionDetails open={details} onOpenChange={setDetails} plan={[]} files={[]} />
    </div>
  )
}

/** The chat of the Session: its thread, its composer and the notices on its edge. */
function Chat({ thread, notices }: { thread: ScrollerEntry[]; notices: ReactNode }): ReactNode {
  const [value, setValue] = useState('')
  const [files, setFiles] = useState<string[]>([])
  return (
    <div className="flex min-h-0 min-w-0 flex-1 flex-col">
      <MessageScroller className="flex-1" label="The thread of this Session" entries={thread} />
      <div className="mx-auto flex w-full max-w-3xl flex-col gap-2 px-6 pb-4">
        <Composer
          value={value}
          onValueChange={setValue}
          files={files}
          onFilesChange={setFiles}
          onSearchFiles={() => Promise.resolve([])}
          variant="inline"
          action="Send"
          placeholder="Say something to the agent…"
          onSend={() => Promise.resolve(null)}
          running
          onStop={fn()}
          notices={notices}
        />
      </div>
    </div>
  )
}

/** T3 went on once the user dismissed the blocker the agent raised on it: what came back on it. */
const DISMISSED: BuildViewData = {
  ...BUILDING,
  blockers: [{ ...BLOCKER, dismissedAt: '2026-09-25T10:36:00.000Z' }],
}

/** The screens of the build, by name. */
const SCREENS = {
  gettingReady: GETTING_READY,
  building: BUILDING,
  yours: YOURS,
  blocked: BLOCKED,
  paused: PAUSED,
  finalChecks: FINAL_CHECKS_RED,
  finalChecksJustRed: FINAL_CHECKS_JUST_RED,
  readyToAccept: READY_TO_ACCEPT,
  accepted: ACCEPTED,
  dismissed: DISMISSED,
} satisfies Record<string, BuildViewData>

function Screen({
  screen,
  asking = false,
  folded = false,
  over = false,
  specOpen = false,
  onPause,
  onResume,
  onAccept,
  onStop,
  onTaskDone,
  onTaskSkip,
  onDismissBlocker,
  onOpenChat,
}: {
  screen: keyof typeof SCREENS
  /** Whether a permission of the agent waits, among the notices and in the thread. */
  asking?: boolean
  /** Whether the panel opens folded to its small frame. */
  folded?: boolean
  /** Whether the open panel lies over the chat. */
  over?: boolean
  /** Whether the frozen Spec opens in the view's place. */
  specOpen?: boolean
  onPause: () => void
  onResume: () => void
  onAccept: () => void
  onStop: () => void
  onTaskDone: (taskId: string) => void
  onTaskSkip: (taskId: string, reason: string, unblock: boolean) => void
  onDismissBlocker: (blockerId: string, note: string | null) => void
  onOpenChat: () => void
}): ReactNode {
  const thread = asking ? [...THREAD, PERMISSION] : THREAD
  // The task a notice opens is held here, since the notices and the view's stage are two readings
  // of one build.
  const [selected, setSelected] = useState<string | null>(null)
  const view: Omit<BuildViewProps, 'specOpen' | 'onToggleSpec'> = {
    build: SCREENS[screen],
    now: NOW,
    onPause,
    onResume,
    onAccept,
    onStop,
    onTaskDone,
    onTaskSkip,
    onDismissBlocker,
    onOpenChat,
  }
  // The one pill of the Session's notices: on the composer's edge, and over the panel while it
  // covers the chat.
  const notices = (
    <SessionNotices groups={[...(asking ? [PERMISSIONS] : []), buildNotices(view, setSelected)]} />
  )
  return (
    <TooltipProvider>
      <div className="flex h-screen min-h-0 flex-col bg-background text-foreground">
        <Head />
        <SessionRow chat={<Chat thread={thread} notices={notices} />}>
          <BuildPanel
            {...view}
            notices={notices}
            selected={selected}
            onSelect={setSelected}
            spec={READY}
            defaultFolded={folded}
            defaultOver={over}
            defaultSpecOpen={specOpen}
          />
        </SessionRow>
      </div>
    </TooltipProvider>
  )
}

const meta = {
  title: 'Surfaces/Session/Build',
  component: Screen,
  tags: ['autodocs'],
  parameters: { layout: 'fullscreen' },
  args: {
    screen: 'building',
    asking: false,
    folded: false,
    over: false,
    specOpen: false,
    onPause: fn(),
    onResume: fn(),
    onAccept: fn(),
    onStop: fn(),
    onTaskDone: fn(),
    onTaskSkip: fn(),
    onDismissBlocker: fn(),
    onOpenChat: fn(),
  },
  argTypes: {
    screen: {
      control: 'select',
      options: Object.keys(SCREENS),
      description: 'Which moment of the build.',
    },
    asking: { control: 'boolean', description: 'Whether a permission of the agent waits.' },
    folded: {
      control: 'boolean',
      description: 'Whether the panel opens folded to its small frame.',
    },
    over: { control: 'boolean', description: 'Whether the open panel lies over the chat.' },
    specOpen: {
      control: 'boolean',
      description: "Whether the frozen Spec opens in the view's place.",
    },
    onPause: { action: 'paused' },
    onResume: { action: 'resumed' },
    onAccept: { action: 'accepted' },
    onStop: { action: 'stopped' },
    onTaskDone: { action: 'task done' },
    onTaskSkip: { action: 'task skipped' },
    onDismissBlocker: { action: 'blocker dismissed' },
    onOpenChat: { action: 'chat opened' },
  },
} satisfies Meta<typeof Screen>

export default meta

type Story = StoryObj<typeof meta>

/**
 * The one text of the page in reach: the panel keeps both its views drawn, beside the chat and over
 * it, the one not shown out of reach.
 */
function textInReach(canvasElement: HTMLElement, text: string): HTMLElement {
  const found = within(canvasElement)
    .getAllByText(text)
    .filter((one) => one.closest('[inert]') === null)
  if (found.length !== 1) throw new Error(`${String(found.length)} "${text}" in reach`)
  return found[0]!
}

/** The width of a region of the page, in pixels, which only a browser decides. */
function widthOf(canvasElement: HTMLElement, name: string): number {
  return within(canvasElement).getByLabelText(name).getBoundingClientRect().width
}

/**
 * Everything in place: the Session's head, the thread — the agent's calls to the build's tools and
 * the record of a permission it asks, which waits among the notices — and the build in the panel
 * on its right, a share of the row, T2 on its second try on the view's stage.
 */
export const Complete: Story = {
  args: { asking: true },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await expect(canvas.getByRole('region', { name: 'Build ATL-7' })).toBeVisible()
    await expect(
      canvas.getByRole('region', { name: 'A CSV in the column order of the ledger' }),
    ).toBeVisible()
    // The chat is the larger part of the row, and the panel takes its share beside it.
    await expect(widthOf(canvasElement, 'The thread of this Session')).toBeGreaterThan(
      widthOf(canvasElement, 'Build ATL-7'),
    )
    const thread = within(canvas.getByRole('log', { name: 'The thread of this Session' }))
    await expect(thread.getByRole('button', { name: /Task finished T3/ })).toBeVisible()
    await expect(
      await canvas.findByRole('button', { name: 'Waiting for your answer: Permissions 1' }),
    ).toBeVisible()
  },
}

/** Getting ready: the rows are there, and the view waits for the agent's approach. */
export const GettingReady: Story = {
  args: { screen: 'gettingReady' },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await expect(
      canvas.getByRole('img', { name: /^Waiting for the agent's approach/ }),
    ).toBeVisible()
  },
}

/** Building: the tasks by state, T2 on the stage, the chat beside it, nothing waiting. */
export const Building: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await expect(textInReach(canvasElement, 'Building')).toBeVisible()
    await expect(canvas.queryByRole('group', { name: /^Yours:/ })).toBeNull()
  },
}

/**
 * The human task is ready: Yours in the view, on the stage with Done and Skip, and the notices on
 * the composer's edge say one thing of the build waits.
 */
export const Yours: Story = {
  args: { screen: 'yours' },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await expect(
      canvas.getByRole('region', { name: 'The file imports into the ledger' }),
    ).toBeVisible()
    await expect(
      canvas.getByRole('group', { name: 'Yours: the agent does not do this task' }),
    ).toBeVisible()
    await expect(
      await canvas.findByRole('button', { name: 'Waiting for your answer: Build 1' }),
    ).toBeVisible()
  },
}

/**
 * A task of the build is the user's while the agent asks a permission (issue #203): both wait in the
 * notices, each in its kind, and answering one leaves the other there.
 */
export const PermissionBesideTheBuild: Story = {
  args: { screen: 'yours', asking: true },
  play: async ({ canvasElement, args }) => {
    const canvas = within(canvasElement)
    await userEvent.click(
      await canvas.findByRole('button', {
        name: 'Waiting for your answer: Permissions 1, Build 1',
      }),
    )
    const page = within(document.body)
    const permissions = within(await page.findByRole('region', { name: 'Permissions' }))
    await waitFor(() =>
      expect(permissions.getByRole('button', { name: 'Allow once' })).toBeVisible(),
    )
    const build = within(page.getByRole('region', { name: 'Build' }))
    const yours = within(build.getByRole('group', { name: 'T4 is yours' }))
    await userEvent.click(yours.getByRole('button', { name: 'Done' }))
    await expect(args.onTaskDone).toHaveBeenCalledWith(T4_YOURS.id)
    await waitFor(() =>
      expect(permissions.getByRole('button', { name: 'Allow once' })).toBeVisible(),
    )
  },
}

/** The agent says T3 contradicts the Spec: the blocker in the view, and among the notices. */
export const Blocked: Story = {
  args: { screen: 'blocked' },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await expect(
      canvas.getByRole('region', { name: 'Credit notes as negative rows' }),
    ).toBeVisible()
    await expect(
      canvas.getByRole('group', { name: 'The agent says this task contradicts the Spec' }),
    ).toBeVisible()
    await expect(
      await canvas.findByRole('button', { name: 'Waiting for your answer: Build 1' }),
    ).toBeVisible()
  },
}

/** Paused: the head says it, Resume where Pause was. */
export const Paused: Story = {
  args: { screen: 'paused' },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await expect(canvas.getByRole('button', { name: 'Resume' })).toBeVisible()
    await expect(textInReach(canvasElement, 'Paused')).toBeVisible()
  },
}

/** Final checks: every task done, the first final try red, the agent on the second. */
export const FinalChecks: Story = {
  args: { screen: 'finalChecks' },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await expect(canvas.getByRole('region', { name: 'Final checks' })).toBeVisible()
    await expect(canvas.getByRole('img', { name: 'Final checks on try 2 of 3' })).toBeVisible()
  },
}

/** Accepted: over and readable, the head says it, and nothing is left to stop. */
export const Accepted: Story = {
  args: { screen: 'accepted' },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await expect(textInReach(canvasElement, 'Accepted')).toBeVisible()
    await expect(canvas.queryByRole('button', { name: 'Stop build' })).toBeNull()
  },
}

/**
 * Folded to its small frame at the window's edge, as the Spec's (#77): the hammer, and the dot
 * that says a blocker waits for the hand.
 */
export const Folded: Story = {
  args: { folded: true, screen: 'blocked' },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await expect(canvas.getByRole('button', { name: 'Unfold the build' })).toBeVisible()
    await expect(
      canvas.getByRole('img', { name: 'Something in the build waits for you' }),
    ).toBeVisible()
    await expect(canvas.queryByRole('region', { name: 'Credit notes as negative rows' })).toBeNull()
  },
}

/** Where a control stands on the screen, to the pixel: its centre. */
function placeOf(button: HTMLElement): string {
  const box = button.getBoundingClientRect()
  return [box.left + box.width / 2, box.top + box.height / 2].map(Math.round).join(' ')
}

/**
 * The build's panel is the Spec's (#77): open, the same share of the row and the same margin at
 * its edge; folded, the same small frame at the window's edge, its unfold chevron exactly where
 * the head's fold chevron stood, so the same spot pressed twice folds the build and unfolds it.
 */
export const SameFrameAsTheSpec: Story = {
  // Settled at once, so that each side of the swap is read where it lands.
  decorators: [
    (Story) => (
      <MotionConfig reducedMotion="always">
        <Story />
      </MotionConfig>
    ),
  ],
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    const dock = canvas.getByRole('region', { name: 'Build ATL-7' })
    const row = dock.closest('[data-session-row]')!.getBoundingClientRect().width
    await expect(dock.getBoundingClientRect().width).toBeCloseTo(row * 0.45 + 12, 0)
    const fold = canvas.getByRole('button', { name: 'Fold the build' })
    const open = placeOf(fold)
    await userEvent.click(fold)
    const unfold = canvas.getByRole('button', { name: 'Unfold the build' })
    await waitFor(() => expect(placeOf(unfold)).toBe(open))
    // Folded, the slot is the small frame's width and its margin, the Spec's own.
    await waitFor(() => expect(dock.getBoundingClientRect().width).toBeCloseTo(56 + 12, 0))
    await expect(dock.querySelector('[data-panel]')).toHaveAttribute('data-stowed')
    await userEvent.click(unfold)
    await waitFor(() =>
      expect(placeOf(canvas.getByRole('button', { name: 'Fold the build' }))).toBe(open),
    )
  },
}

/**
 * Over the chat (#77): the build lies over the chat, the whole width of the row, the button beside
 * the fold pressed; the chat keeps its width under it and is out of reach, and the pill of what
 * waits for the user is still there to be pressed.
 */
export const OverTheChat: Story = {
  args: { over: true, screen: 'blocked' },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    const dock = canvas.getByRole('region', { name: 'Build ATL-7' })
    const row = dock.closest('[data-session-row]')!.getBoundingClientRect()
    const panel = dock.querySelector<HTMLElement>('[data-panel]')!
    await expect(panel.getBoundingClientRect().left).toBeCloseTo(row.left + 12, 0)
    await expect(canvas.getByRole('button', { name: 'Over the chat' })).toHaveAttribute(
      'aria-pressed',
      'true',
    )
    await expect(canvas.queryByRole('log', { name: 'The thread of this Session' })).toBeNull()
  },
}

/**
 * The head across the whole page (#77): with the build over the chat, the head is above the panel
 * and still in reach — its ⓘ opens the Session details, and Escape gives the keyboard back to it.
 */
export const HeadAboveThePanel: Story = {
  args: { over: true },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    const page = within(document.body)
    const details = canvas.getByRole('button', { name: 'Session details' })
    const panel = canvas
      .getByRole('region', { name: 'Build ATL-7' })
      .querySelector<HTMLElement>('[data-panel]')!
    await expect(details.getBoundingClientRect().bottom).toBeLessThanOrEqual(
      panel.getBoundingClientRect().top,
    )
    await userEvent.click(details)
    await waitFor(() => expect(page.getByRole('dialog')).toBeVisible())
    await userEvent.keyboard('{Escape}')
    await waitFor(() => expect(page.queryByRole('dialog')).toBeNull())
    await waitFor(() => expect(details).toHaveFocus())
  },
}

/**
 * The notices over the panel (#77): with the build over the chat, the pill of what waits for the
 * user floats over the panel's content at the very height it stood over the chat — on the
 * composer's edge, which the panel covers — and never in a band of its own; it opens as it does
 * there.
 */
export const NoticesOverThePanel: Story = {
  args: { screen: 'blocked' },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    const name = 'Waiting for your answer: Build 1'
    const besideChat = await canvas.findByRole('button', { name })
    await atRest(besideChat)
    const height = besideChat.getBoundingClientRect().bottom
    await userEvent.click(canvas.getByRole('button', { name: 'Over the chat' }))
    const floated = canvasElement.querySelector<HTMLElement>('[data-notices-over]')
    await waitFor(() => expect(floated).not.toBeNull())
    const pill = await within(floated!).findByRole('button', { name })
    await atRest(pill)
    await expect(pill.getBoundingClientRect().bottom).toBeCloseTo(height, 0)
    const panel = canvas
      .getByRole('region', { name: 'Build ATL-7' })
      .querySelector<HTMLElement>('[data-panel]')!
    // Over the panel's body, which reaches the row's foot under it: no band was made for it.
    await expect(panel.getBoundingClientRect().bottom).toBeGreaterThan(height)
    await expect(canvas.getAllByRole('button', { name })).toHaveLength(1)
    await userEvent.click(pill)
    const blocker = await within(document.body).findByRole('group', { name: 'Blocker on T3' })
    await waitFor(() => expect(blocker).toBeVisible())
  },
}

/** A fold gives the chat the room back, and an unfold takes it again: the chat is pushed. */
export const FoldPushesTheChat: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    const open = widthOf(canvasElement, 'The thread of this Session')
    await userEvent.click(canvas.getByRole('button', { name: 'Fold the build' }))
    await waitFor(() =>
      expect(widthOf(canvasElement, 'The thread of this Session')).toBeGreaterThan(open),
    )
    await expect(canvas.getByRole('button', { name: 'Unfold the build' })).toHaveFocus()
    await userEvent.click(canvas.getByRole('button', { name: 'Unfold the build' }))
    await waitFor(() => expect(widthOf(canvasElement, 'The thread of this Session')).toBe(open))
    await expect(canvas.getByRole('button', { name: 'Fold the build' })).toHaveFocus()
  },
}

/**
 * The frozen Spec open beside the tasks it produced (#77): the panel over the chat, the tasks on
 * the left, the Spec read only in the detail's place, and nothing that would change it.
 */
export const SpecOpen: Story = {
  args: { specOpen: true, over: true },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await expect(canvas.getByRole('region', { name: 'Spec ATL-7' })).toBeVisible()
    await expect(canvas.getByRole('region', { name: 'Tasks of ATL-7' })).toBeVisible()
    await expect(textInReach(canvasElement, 'read only')).toBeVisible()
    await expect(canvas.queryByRole('button', { name: 'Rework' })).toBeNull()
    await expect(canvas.queryByRole('button', { name: 'Mark ready' })).toBeNull()
    await expect(canvas.getByRole('button', { name: 'Spec' })).toHaveAttribute(
      'aria-pressed',
      'true',
    )
  },
}

/**
 * "Spec" pressed beside the chat lays the panel over the chat and opens the frozen Spec in the
 * detail's place, beside its tasks; closing it takes the panel back beside the chat, the view as
 * it was, and the chat's width never changed.
 */
export const SpecBesideItsTasks: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    const before = widthOf(canvasElement, 'The thread of this Session')
    await userEvent.click(canvas.getByRole('button', { name: 'Spec' }))
    const spec = await canvas.findByRole('region', { name: 'Spec ATL-7' })
    await expect(spec).toBeVisible()
    await expect(canvas.getByRole('button', { name: 'Over the chat' })).toHaveAttribute(
      'aria-pressed',
      'true',
    )
    const tasks = canvas.getByRole('region', { name: 'Tasks of ATL-7' })
    await expect(tasks.getBoundingClientRect().right).toBeLessThanOrEqual(
      spec.getBoundingClientRect().left + 1,
    )
    await userEvent.click(canvas.getByRole('button', { name: 'Close the Spec' }))
    await waitFor(() => expect(canvas.queryByRole('region', { name: 'Spec ATL-7' })).toBeNull())
    await expect(canvas.getByRole('button', { name: 'Over the chat' })).toHaveAttribute(
      'aria-pressed',
      'false',
    )
    await waitFor(() =>
      expect(canvas.getByRole('button', { name: 'Spec' })).toHaveAttribute('aria-pressed', 'false'),
    )
    await expect(widthOf(canvasElement, 'The thread of this Session')).toBe(before)
  },
}

/** Waits for the panel's cross-fade and the swap to be over: half a second of frames, or so. */
async function settled(): Promise<void> {
  await withinFrames(() => false, 30)
}

/**
 * The view beside the chat is kept while the panel lies over it: a story unfolded and the view
 * scrolled there are still unfolded and scrolled once the Spec, which lays the panel over the chat,
 * is closed, and once the panel is laid over the chat by hand and taken back.
 */
export const ViewKeptOverTheChat: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    const folded = canvas
      .getAllByRole('button', { name: /^Tasks · / })
      .find((one) => one.getAttribute('aria-expanded') === 'false')!
    await userEvent.click(folded)
    await waitFor(() => expect(folded).toHaveAttribute('aria-expanded', 'true'))
    const body = canvas.getByRole('region', { name: 'The build of ATL-7' })
    await waitFor(() => expect(body.scrollHeight).toBeGreaterThan(body.clientHeight + 40))
    body.scrollTop = 40
    const scrolled = body.scrollTop
    await expect(scrolled).toBeGreaterThan(0)
    await userEvent.click(canvas.getByRole('button', { name: 'Spec' }))
    await canvas.findByRole('region', { name: 'Spec ATL-7' })
    // The cross-fade over, so what was beside the chat has had the time to go.
    await settled()
    await userEvent.click(canvas.getByRole('button', { name: 'Close the Spec' }))
    await waitFor(() =>
      expect(canvas.getByRole('button', { name: 'Over the chat' })).toHaveAttribute(
        'aria-pressed',
        'false',
      ),
    )
    await waitFor(() =>
      expect(canvas.getByRole('region', { name: 'The build of ATL-7' })).toBe(body),
    )
    await expect(folded).toHaveAttribute('aria-expanded', 'true')
    await expect(body.scrollTop).toBe(scrolled)
    await userEvent.click(canvas.getByRole('button', { name: 'Over the chat' }))
    await settled()
    await userEvent.click(canvas.getByRole('button', { name: 'Over the chat' }))
    await waitFor(() =>
      expect(canvas.getByRole('region', { name: 'The build of ATL-7' })).toBe(body),
    )
    await expect(folded).toHaveAttribute('aria-expanded', 'true')
    await expect(body.scrollTop).toBe(scrolled)
  },
}

/**
 * The build over the chat (#77): the head, then two columns — the tasks by story, each story
 * headed by how many of its tasks are done and a compact bar, one line a task and nothing
 * unfolded; and beside them the task that needs the user first, whole, its blocker on top.
 */
export const WideBuild: Story = {
  args: { over: true, screen: 'blocked' },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    const tasks = within(canvas.getByRole('region', { name: 'Tasks of ATL-7' }))
    await expect(tasks.getByRole('button', { name: 'By story' })).toHaveAttribute(
      'aria-pressed',
      'true',
    )
    await expect(tasks.getByRole('group', { name: 'Export a month' })).toHaveTextContent('1/3')
    await expect(tasks.getByRole('button', { name: /^T3 / })).toHaveAttribute(
      'aria-pressed',
      'true',
    )
    const detail = within(canvas.getByRole('region', { name: 'T3 in detail' }))
    await expect(
      detail.getByRole('group', { name: 'The agent says this task contradicts the Spec' }),
    ).toBeVisible()
    await expect(detail.getByRole('list', { name: 'Tries of T3' })).toBeVisible()
    await expect(canvas.getByRole('img', { name: '1 done' })).toBeVisible()
    await expect(canvas.getByRole('img', { name: '2 waiting for you' })).toBeVisible()
  },
}

/** A task picked on the left is the one the right shows, whole: its tries, checks and files. */
export const PickATask: Story = {
  args: { over: true },
  play: async ({ canvasElement, args }) => {
    const canvas = within(canvasElement)
    const tasks = within(canvas.getByRole('region', { name: 'Tasks of ATL-7' }))
    await userEvent.click(tasks.getByRole('button', { name: /^T1 / }))
    const detail = within(await canvas.findByRole('region', { name: 'T1 in detail' }))
    await expect(detail.getByRole('list', { name: 'Tries of T1' })).toBeVisible()
    await expect(detail.getByRole('heading', { name: /Files changed/ })).toBeVisible()
    await expect(tasks.getByRole('button', { name: /^T1 / })).toHaveAttribute(
      'aria-pressed',
      'true',
    )
    await expect(args.onTaskDone).not.toHaveBeenCalled()
  },
}

/** The three groupings: by story, as one list with each task's stories, and by state. */
export const Groupings: Story = {
  args: { over: true, screen: 'blocked' },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    const tasks = within(canvas.getByRole('region', { name: 'Tasks of ATL-7' }))
    await userEvent.click(tasks.getByRole('button', { name: 'By state' }))
    await expect(tasks.getByRole('group', { name: 'Waiting for you' })).toBeVisible()
    await expect(tasks.getByRole('group', { name: 'In progress' })).toBeVisible()
    await expect(tasks.getByRole('group', { name: 'Done' })).toBeVisible()
    await expect(tasks.queryByRole('group', { name: 'To do' })).toBeNull()
    await userEvent.click(tasks.getByRole('button', { name: 'One list' }))
    await expect(tasks.getByRole('group', { name: 'Tasks' })).toBeVisible()
    await expect(tasks.getByRole('button', { name: /^T3 / })).toHaveTextContent('S2')
    await userEvent.click(tasks.getByRole('button', { name: 'By story' }))
    await expect(tasks.getByRole('group', { name: 'Credit notes in the same file' })).toBeVisible()
  },
}

/** What came back on a task: the blocker the agent raised on T3, which the user dismissed. */
export const Returns: Story = {
  args: { over: true, screen: 'dismissed' },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    const tasks = within(canvas.getByRole('region', { name: 'Tasks of ATL-7' }))
    await userEvent.click(tasks.getByRole('button', { name: /^T3 / }))
    const returns = within(await canvas.findByRole('region', { name: 'Returns on T3' }))
    await expect(returns.getByText(/the ledger refuses two rows/)).toBeVisible()
    await expect(returns.getByRole('img', { name: 'Dismissed' })).toBeVisible()
  },
}

/** The final checks, a line of their own at the end of the list, shown once nothing else is. */
export const WideFinalChecks: Story = {
  args: { over: true, screen: 'finalChecks' },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    const tasks = within(canvas.getByRole('region', { name: 'Tasks of ATL-7' }))
    await expect(tasks.getByRole('button', { name: /Final checks/ })).toHaveAttribute(
      'aria-pressed',
      'true',
    )
    await expect(canvas.getByRole('region', { name: 'Final checks' })).toBeVisible()
  },
}

/**
 * Over the chat, right after a red final try: the final checks' row wears the red cross, and the
 * arc of something under way once the next try runs.
 */
export const WideFinalChecksRed: Story = {
  args: { over: true, screen: 'finalChecksJustRed' },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    const tasks = within(canvas.getByRole('region', { name: 'Tasks of ATL-7' }))
    const row = tasks.getByRole('button', { name: /Final checks/ })
    await expect(row.firstElementChild).toHaveClass('text-destructive')
  },
}

/** A notice's Open puts its task on the view's stage, wherever the view was. */
export const NoticeOpensTheTask: Story = {
  args: { screen: 'blocked' },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    // T2 is drawn under its story once its tasks are unfolded, wherever the view was.
    await userEvent.click(canvas.getByRole('button', { name: 'Tasks · 3' }))
    await userEvent.click(canvas.getByRole('button', { name: /^T2 / }))
    await expect(
      canvas.getByRole('region', { name: 'A CSV in the column order of the ledger' }),
    ).toBeVisible()
    await userEvent.click(
      await canvas.findByRole('button', { name: 'Waiting for your answer: Build 1' }),
    )
    const notice = within(
      await within(document.body).findByRole('group', { name: 'Blocker on T3' }),
    )
    await userEvent.click(notice.getByRole('button', { name: 'Open' }))
    await waitFor(() =>
      expect(canvas.getByRole('region', { name: 'Credit notes as negative rows' })).toBeVisible(),
    )
  },
}

/** The user's task answered from the notices: Done, as the view's own Done would. */
export const YoursAmongTheNotices: Story = {
  args: { screen: 'yours' },
  play: async ({ canvasElement, args }) => {
    const canvas = within(canvasElement)
    await userEvent.click(
      await canvas.findByRole('button', { name: 'Waiting for your answer: Build 1' }),
    )
    const notice = within(await within(document.body).findByRole('group', { name: 'T4 is yours' }))
    await expect(notice.getByRole('button', { name: 'Skip…' })).toBeInTheDocument()
    await userEvent.click(notice.getByRole('button', { name: 'Done' }))
    await expect(args.onTaskDone).toHaveBeenCalledWith(T4_YOURS.id)
  },
}

/**
 * Every story done and the final checks green: the review waits among the notices, `Review` hands
 * the keyboard to the composer it is written in, and `Accept` ends the build.
 */
export const ReviewAmongTheNotices: Story = {
  args: { screen: 'readyToAccept' },
  play: async ({ canvasElement, args }) => {
    const canvas = within(canvasElement)
    await userEvent.click(
      await canvas.findByRole('button', { name: 'Waiting for your answer: Build 1' }),
    )
    const notice = within(
      await within(document.body).findByRole('group', { name: 'Review of ATL-7' }),
    )
    await userEvent.click(notice.getByRole('button', { name: 'Review' }))
    await expect(args.onOpenChat).toHaveBeenCalled()
    await userEvent.click(notice.getByRole('button', { name: 'Accept' }))
    await expect(args.onAccept).toHaveBeenCalled()
  },
}

/**
 * The frozen Spec and the Session details are two things of their own (issue #203): the Spec opens
 * in the build's panel, beside its tasks, the details open and close from the head without closing
 * it, and closing the Spec leaves the details closed.
 */
export const SpecAndDetailsApart: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    const page = within(document.body)
    await userEvent.click(canvas.getByRole('button', { name: 'Spec' }))
    const spec = await canvas.findByRole('region', { name: 'Spec ATL-7' })
    const panel = canvas.getByRole('region', { name: 'Build ATL-7' })
    await expect(panel.contains(spec)).toBe(true)

    const opener = canvas.getByRole('button', { name: 'Session details' })
    await userEvent.click(opener)
    await waitFor(() => expect(page.getByRole('dialog')).toBeVisible())
    await userEvent.keyboard('{Escape}')
    await waitFor(() => expect(page.queryByRole('dialog')).toBeNull())
    await waitFor(() => expect(opener).toHaveFocus())
    await expect(canvas.getByRole('region', { name: 'Spec ATL-7' })).toBeVisible()

    await userEvent.click(canvas.getByRole('button', { name: 'Close the Spec' }))
    await waitFor(() => expect(canvas.queryByRole('region', { name: 'Spec ATL-7' })).toBeNull())
    await expect(page.queryByRole('dialog')).toBeNull()
  },
}

/**
 * The keyboard: "Spec" opens the Spec and the keyboard lands on its Close; Close gives the keyboard
 * back to "Spec", which is where it was.
 */
export const Keyboard: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    const spec = canvas.getByRole('button', { name: 'Spec' })
    spec.focus()
    await userEvent.keyboard('{Enter}')
    await expect(await canvas.findByRole('region', { name: 'Spec ATL-7' })).toBeVisible()
    await waitFor(() =>
      expect(canvas.getByRole('button', { name: 'Close the Spec' })).toHaveFocus(),
    )
    await userEvent.keyboard('{Enter}')
    await waitFor(() => expect(canvas.queryByRole('region', { name: 'Spec ATL-7' })).toBeNull())
    await waitFor(() => expect(canvas.getByRole('button', { name: 'Spec' })).toHaveFocus())
  },
}
