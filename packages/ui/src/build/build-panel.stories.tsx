import type { Meta, StoryObj } from '@storybook/react-vite'
import { type ReactNode, useState } from 'react'
import { expect, fn, userEvent, waitFor, within } from 'storybook/test'

import { HemeraToolCall } from '../activity/hemera-tool-call.tsx'
import { PermissionRequest } from '../approval/permission-request.tsx'
import { BlockedBanner } from '../composer/blocked-banner.tsx'
import { Composer } from '../composer/composer.tsx'
import { TooltipProvider } from '../components/tooltip/tooltip.tsx'
import { AgentText } from '../message/agent-text.tsx'
import { MessageScroller, type ScrollerEntry } from '../message/scroller/scroller.tsx'
import { SessionNotices } from '../session/session-notices.tsx'
import { SessionHeader } from '../session/session.tsx'
import { MissionBrief } from '../spec/mission-brief.tsx'
import { READY } from '../spec/spec-fixtures.ts'
import {
  ACCEPTED,
  BLOCKED,
  BUILDING,
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
 * review — stands in the view and among the Session's notices, on the composer's edge. A permission the agent asks stands in the thread,
 * the composer saying the turn waits.
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

/** A permission the agent asks, in the thread, which the composer says it waits on. */
const PERMISSION: ScrollerEntry = {
  id: 'permission',
  content: (
    <PermissionRequest
      toolName="commands_run"
      label="Run command"
      subject="pnpm vitest run src/billing/export-csv.test.ts"
      intent="asks to run the test it wrote for the header order"
      options={[
        { optionId: 'allow-once', kind: 'allow_once', name: 'Allow once' },
        { optionId: 'reject-once', kind: 'reject_once', name: 'Reject once' },
      ]}
      onDecide={fn()}
    />
  ),
}

/** The chat of the Session: its head, its thread, its composer and the notices on its edge. */
function Chat({
  thread,
  blocked,
  notices,
}: {
  thread: ScrollerEntry[]
  blocked: ReactNode
  notices: ReactNode
}): ReactNode {
  const [value, setValue] = useState('')
  const [files, setFiles] = useState<string[]>([])
  return (
    <div className="flex min-h-0 min-w-0 flex-1 flex-col">
      <div className="mx-auto w-full max-w-3xl px-6 pt-6 pb-4">
        <SessionHeader title="Build CSV export" onRename={fn()} onOpenDetails={fn()} />
      </div>
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
          blocked={blocked}
          notices={notices}
        />
      </div>
    </div>
  )
}

/** The screens of the build, by name. */
const SCREENS = {
  gettingReady: GETTING_READY,
  building: BUILDING,
  yours: YOURS,
  blocked: BLOCKED,
  paused: PAUSED,
  finalChecks: FINAL_CHECKS_RED,
  readyToAccept: READY_TO_ACCEPT,
  accepted: ACCEPTED,
} satisfies Record<string, BuildViewData>

function Screen({
  screen,
  asking = false,
  folded = false,
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
  /** Whether a permission of the agent waits in the thread. */
  asking?: boolean
  /** Whether the panel opens folded to its band. */
  folded?: boolean
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
  return (
    <TooltipProvider>
      <div className="@container flex h-screen min-h-0 bg-background text-foreground">
        <Chat
          thread={thread}
          blocked={
            asking ? (
              <BlockedBanner waiting="The agent is asking to go on." onStop={fn()} />
            ) : undefined
          }
          notices={<SessionNotices groups={[buildNotices(view, setSelected)]} />}
        />
        <BuildPanel
          {...view}
          selected={selected}
          onSelect={setSelected}
          spec={READY}
          defaultFolded={folded}
          defaultSpecOpen={specOpen}
        />
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
    asking: { control: 'boolean', description: 'Whether a permission waits in the thread.' },
    folded: { control: 'boolean', description: 'Whether the panel opens folded to its band.' },
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

/** The width of a region of the page, in pixels, which only a browser decides. */
function widthOf(canvasElement: HTMLElement, name: string): number {
  return within(canvasElement).getByLabelText(name).getBoundingClientRect().width
}

/**
 * Everything in place: the Session's head, the thread — the agent's calls to the build's tools and
 * a permission it asks, which the composer says it waits on — and the build in the panel on its
 * right, a share of the row, T2 on its second try on the view's stage.
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
    await expect(thread.getByRole('button', { name: 'Allow once' })).toBeVisible()
  },
}

/** Getting ready: the rows are there, and the view waits for the agent's approach. */
export const GettingReady: Story = {
  args: { screen: 'gettingReady' },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await expect(canvas.getByText(/Waiting for the agent's approach/)).toBeVisible()
  },
}

/** Building: the tasks by state, T2 on the stage, the chat beside it, nothing waiting. */
export const Building: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await expect(canvas.getByText('Building')).toBeVisible()
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

/** Paused: the band under the view's head, Resume where Pause was. */
export const Paused: Story = {
  args: { screen: 'paused' },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await expect(canvas.getByRole('button', { name: 'Resume' })).toBeVisible()
    await expect(canvas.getByText(/nothing new starts until you resume/)).toBeVisible()
  },
}

/** Final checks: every task done, the first final try red, the agent on the second. */
export const FinalChecks: Story = {
  args: { screen: 'finalChecks' },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await expect(canvas.getByRole('region', { name: 'Final checks' })).toBeVisible()
    await expect(canvas.getByText('final checks on try 2 of 3')).toBeVisible()
  },
}

/** Accepted: over and readable, the branch and the files left in the Workspace. */
export const Accepted: Story = {
  args: { screen: 'accepted' },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await expect(canvas.getByText(/delivering them comes next/)).toBeVisible()
    await expect(canvas.queryByRole('button', { name: 'Stop build' })).toBeNull()
  },
}

/** Folded to its band: the hammer, and the dot that says a blocker waits for the hand. */
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
 * The frozen Spec open in the view's place, read only, inside the same panel: the chat keeps its
 * width, and nothing that would change the Spec is drawn.
 */
export const SpecOpen: Story = {
  args: { specOpen: true },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await expect(canvas.getByRole('region', { name: 'Spec ATL-7' })).toBeVisible()
    await expect(canvas.getByText('read only')).toBeVisible()
    await expect(canvas.queryByRole('button', { name: 'Rework' })).toBeNull()
    await expect(canvas.queryByRole('button', { name: 'Mark ready' })).toBeNull()
    await expect(widthOf(canvasElement, 'The thread of this Session')).toBeGreaterThan(
      widthOf(canvasElement, 'Build ATL-7'),
    )
  },
}

/**
 * "Spec" opens the frozen Spec in the view's place, and closing it gives the view back as it was:
 * nothing of the chat moves either way.
 */
export const SpecTakesTheViewsPlace: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    const before = widthOf(canvasElement, 'The thread of this Session')
    await userEvent.click(canvas.getByRole('button', { name: 'Spec' }))
    await expect(await canvas.findByRole('region', { name: 'Spec ATL-7' })).toBeVisible()
    await userEvent.click(canvas.getByRole('button', { name: 'Close the Spec' }))
    await waitFor(() => expect(canvas.queryByRole('region', { name: 'Spec ATL-7' })).toBeNull())
    await expect(canvas.getByRole('button', { name: 'Spec' })).toHaveAttribute(
      'aria-pressed',
      'false',
    )
    await expect(widthOf(canvasElement, 'The thread of this Session')).toBe(before)
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
    await expect(spec).toHaveFocus()
  },
}
