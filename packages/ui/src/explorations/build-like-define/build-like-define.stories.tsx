import type { Meta, StoryObj } from '@storybook/react-vite'
import { type FunctionComponent, type ReactNode, useState } from 'react'
import { expect, userEvent, waitFor, within } from 'storybook/test'

import { StatusDot } from '../../components/status-dot/status-dot.tsx'
import { TooltipProvider } from '../../components/tooltip/tooltip.tsx'
import { IconBolt, IconDatabase, type IconProps, IconWorld } from '../../icons.ts'
import { HelperIcon, type HelperIconName, type HelperIconSize, TiledIcon } from './helper-icons.tsx'
import type { CommandState } from '../../activity/command-run.tsx'
import { GOING_ON } from '../../session/going-on-fixtures.ts'
import type { GoingOnRun } from '../../session/going-on.ts'
import { type SessionPageProps, SessionPage } from './page.tsx'
import { type LiveRun, RunChips as Chips } from './run-chips.tsx'
import { type MarkState, StatusMark } from './status-mark.tsx'

/**
 * A Session laid as `define` lays it, for every kind (design exploration of 30 September 2026,
 * issue #77). Storybook only: nothing here is wired, and no component of the design system
 * changed for it. `Playground`, beside these, is the page to try everything by hand; these are its
 * moments, one each, for the tests.
 *
 * - One side panel for `define` and `build` (`PanelDock`): the Spec panel's frame, widths, fold
 *   and swap, and one toggle that lays the panel over the chat and back. While it covers the
 *   chat, the notices float over the panel where they stood over the chat.
 * - The head line — runs, helpers, Run, ⓘ and `…` — across the page (A) or over the chat only,
 *   going into the panel's head while the panel covers the chat (B).
 * - A helper's chip is its icon, its dot and its name. It opens that helper's live thread, read
 *   only, in a dialog, the same way in every kind of Session (`HelperViewer`).
 * - Over the chat, the panel shows more: the build's stories, helpers and runs at work, its tasks
 *   and one task whole, or the frozen Spec beside the tasks; the Spec's outline and open
 *   questions beside it.
 * - The build's tasks, almost empty at rest: how far the build is at a glance, the tasks grouped
 *   by story, as one list or by state, and each task unfolding to its tries, files and returns.
 */

function Screen(props: SessionPageProps): ReactNode {
  return (
    <TooltipProvider>
      <div className="h-screen">
        <SessionPage {...props} />
      </div>
    </TooltipProvider>
  )
}

const meta = {
  title: 'Explorations/Build like define/Screens',
  component: Screen,
  tags: ['autodocs'],
  parameters: { layout: 'fullscreen' },
  args: { kind: 'build', head: 'page' },
  argTypes: {
    kind: { control: 'inline-radio', options: ['free', 'define', 'build'] },
    head: { control: 'inline-radio', options: ['page', 'chat'] },
  },
} satisfies Meta<typeof Screen>

export default meta

type Story = StoryObj<typeof meta>

/** The head line in view: the one not under the panel. */
function line(canvasElement: HTMLElement) {
  const lines = within(canvasElement).getAllByRole('group', {
    name: 'What goes on in this Session',
  })
  return within(lines.find((one) => one.closest('[inert]') === null) ?? lines[0]!)
}

function panelOf(canvasElement: HTMLElement, name = 'Build ATL-7'): HTMLElement {
  return within(canvasElement).getByRole('region', { name })
}

/** A build: the chat beside the build, three helpers — one silent — and two runs. */
export const Build: Story = {
  play: async ({ canvasElement }) => {
    const head = line(canvasElement)
    await expect(head.getByRole('button', { name: /^dev/ })).toBeVisible()
    await expect(head.getByRole('button', { name: /^test/ })).toBeVisible()
    await expect(head.getByRole('button', { name: 'Helper Test review, running' })).toBeVisible()
    await expect(head.getByRole('button', { name: 'Helper Documenter, running' })).toBeVisible()
    await expect(head.getByRole('button', { name: 'Helper Credit notes, silent' })).toBeVisible()
  },
}

/** The build over the chat; the notices float over it where they stood over the chat. */
export const BuildOverTheChat: Story = {
  args: { defaultOver: true },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await expect(canvas.queryByRole('log', { name: 'The thread of this Session' })).toBeNull()
    const floated = canvasElement.querySelector<HTMLElement>('[data-notices-over]')!
    await expect(
      await within(floated).findByRole('button', { name: /Waiting for your answer/ }),
    ).toBeVisible()
  },
}

/** The toggle lays the build over the chat and takes it back; the chat never changes width. */
export const OverAndBack: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    const panel = panelOf(canvasElement)
    const chat = canvas.getByRole('log', { name: 'The thread of this Session' })
    const beside = panel.getBoundingClientRect().width
    const chatWidth = chat.getBoundingClientRect().width
    await userEvent.click(canvas.getByRole('button', { name: 'Over the chat' }))
    await waitFor(() => expect(panel.getBoundingClientRect().width).toBeGreaterThan(beside * 1.5))
    await expect(chat.getBoundingClientRect().width).toBe(chatWidth)
    await userEvent.click(canvas.getByRole('button', { name: 'Over the chat' }))
    await waitFor(() => expect(panel.getBoundingClientRect().width).toBe(beside))
  },
}

/** `define` beside the chat, by the same panel; its helper is the prototyper. */
export const Define: Story = {
  args: { kind: 'define' },
  play: async ({ canvasElement }) => {
    await expect(panelOf(canvasElement, 'Spec ATL-7')).toBeVisible()
    await expect(
      line(canvasElement).getByRole('button', { name: 'Helper Prototyper, running' }),
    ).toBeVisible()
  },
}

/** `define` with its Spec over the chat. */
export const DefineOverTheChat: Story = {
  args: { kind: 'define', defaultOver: true },
  play: async ({ canvasElement }) => {
    const panel = panelOf(canvasElement, 'Spec ATL-7')
    await expect(within(panel).getByRole('button', { name: 'Over the chat' })).toHaveAttribute(
      'aria-pressed',
      'true',
    )
  },
}

/** A `free` Session: no panel, the runs and two helpers in its head line. */
export const Free: Story = {
  args: { kind: 'free' },
  play: async ({ canvasElement }) => {
    await expect(
      line(canvasElement).getByRole('button', { name: 'Helper Explore, running' }),
    ).toBeVisible()
    await expect(within(canvasElement).queryByRole('button', { name: 'Over the chat' })).toBeNull()
  },
}

/** The build folded to its small frame, as the Spec folds. */
export const Folded: Story = {
  args: { defaultFolded: true },
  play: async ({ canvasElement }) => {
    await expect(
      within(canvasElement).getByRole('button', { name: 'Unfold the panel' }),
    ).toBeVisible()
  },
}

/** B · The head line over the chat only, as `define` has it. */
export const HeadOverTheChat: Story = {
  args: { head: 'chat' },
  play: async ({ canvasElement }) => {
    const panel = within(panelOf(canvasElement))
    await expect(panel.queryByRole('group', { name: 'What goes on in this Session' })).toBeNull()
  },
}

/** B · The panel over the chat takes the head line into its own head. */
export const HeadInThePanel: Story = {
  args: { head: 'chat', defaultOver: true },
  play: async ({ canvasElement }) => {
    const panel = within(panelOf(canvasElement))
    await expect(
      await panel.findByRole('button', { name: 'Helper Documenter, running' }),
    ).toBeVisible()
  },
}

/** A helper's thread in a dialog: that helper only, its live thread, no box to write in. */
export const HelperDialog: Story = {
  args: { defaultHelper: 'helper-review' },
  play: async ({ canvasElement }) => {
    const body = within(canvasElement.ownerDocument.body)
    const dialog = within(await body.findByRole('dialog', { name: 'Test review' }))
    await expect(dialog.getByRole('log', { name: 'What Test review is doing' })).toBeVisible()
    await expect(dialog.queryByRole('group', { name: /helpers/ })).toBeNull()
    await expect(dialog.queryAllByRole('textbox')).toHaveLength(0)
  },
}

/** A helper's chip opens its glance, as a run's does: how long, the step it is in, its last line. */
export const HelperGlance: Story = {
  args: { defaultGlance: 'helper-credit' },
  play: async ({ canvasElement }) => {
    const body = within(canvasElement.ownerDocument.body)
    await expect(
      await body.findByRole('button', { name: 'The thread of Credit notes' }),
    ).toBeVisible()
    await expect(body.getByRole('button', { name: 'Stop Credit notes' })).toBeVisible()
    await expect(body.getByText('9 min')).toBeVisible()
  },
}

/** ⓘ in the glance opens the thread; Escape closes it, and the keyboard is back on the chip. */
export const HelperOpensAndCloses: Story = {
  play: async ({ canvasElement }) => {
    const body = within(canvasElement.ownerDocument.body)
    const chip = line(canvasElement).getByRole('button', { name: 'Helper Documenter, running' })
    await userEvent.click(chip)
    await userEvent.click(await body.findByRole('button', { name: 'The thread of Documenter' }))
    const log = await body.findByRole('log', { name: 'What Documenter is doing' })
    await waitFor(() => expect(log).toBeVisible())
    await userEvent.keyboard('{Escape}')
    await waitFor(() => expect(body.queryByRole('dialog')).toBeNull())
    await waitFor(() => expect(chip).toHaveFocus())
  },
}

/** × in the glance asks first; stopped, the helper's dot says so and the thread tells the agent. */
export const HelperStop: Story = {
  play: async ({ canvasElement }) => {
    const body = within(canvasElement.ownerDocument.body)
    await userEvent.click(
      line(canvasElement).getByRole('button', { name: 'Helper Credit notes, silent' }),
    )
    await userEvent.click(await body.findByRole('button', { name: 'Stop Credit notes' }))
    const ask = within(await body.findByRole('dialog', { name: 'Stop Credit notes?' }))
    await userEvent.click(ask.getByRole('button', { name: 'Stop' }))
    await expect(
      await within(canvasElement).findByRole('button', { name: 'Helper Credit notes, stopped' }),
    ).toBeVisible()
    await expect(within(canvasElement).getByText('You stopped Credit notes')).toBeVisible()
  },
}

/** The same dialog in a `free` Session. */
export const HelperInFree: Story = {
  args: { kind: 'free', defaultHelper: 'helper-explore' },
  play: async ({ canvasElement }) => {
    const body = within(canvasElement.ownerDocument.body)
    await expect(await body.findByRole('log', { name: 'What Explore is doing' })).toBeVisible()
  },
}

const ICONS: readonly { icon: HelperIconName; name: string }[] = [
  { icon: 'free', name: 'Free helper' },
  { icon: 'reviewer', name: 'Test review' },
  { icon: 'security', name: 'Security review' },
  { icon: 'documenter', name: 'Documenter' },
  { icon: 'prototyper', name: 'Prototyper' },
]

/** Helpers not written yet, to show the rule: any icon of the catalogue in the same tile. */
const NEW_HELPERS: readonly { glyph: FunctionComponent<IconProps>; name: string }[] = [
  { glyph: IconDatabase, name: 'Migrator' },
  { glyph: IconWorld, name: 'Translator' },
  { glyph: IconBolt, name: 'Performance review' },
]

const SAMPLE_CHIP =
  'inline-flex h-control-sm items-center gap-1.5 rounded-md border border-border bg-card px-2 text-xs'

const ICON_CELL = 'flex w-menu-side flex-col items-start gap-3'

const ICON_BIG =
  'flex size-16 items-center justify-center rounded-xl border border-border bg-card text-foreground'

/** One helper's icon, large and on a chip. */
function IconCell({
  icon,
  name,
}: {
  icon: (size: HelperIconSize) => ReactNode
  name: string
}): ReactNode {
  return (
    <div className={ICON_CELL}>
      <span className={ICON_BIG}>{icon('xl')}</span>
      <span className={SAMPLE_CHIP}>
        <span className="flex text-muted-foreground">{icon('md')}</span>
        <StatusDot status="running" size="sm" />
        {name}
      </span>
    </div>
  )
}

/**
 * The helper icons, the maintainer's choice: Hemera's tile, holding one icon of the catalogue
 * that says what the helper is for — large, and at a chip's size. The last row is the rule: a new
 * defined helper picks an icon of the catalogue, and the tile makes it one of the family.
 */
export const HelperIcons: Story = {
  render: () => (
    <div className="flex min-h-screen flex-col gap-8 bg-background p-8 text-foreground">
      <section aria-label="The helpers" className="flex flex-col gap-3">
        <h2 className="text-sm font-medium">The helpers</h2>
        <div className="flex flex-wrap gap-6">
          {ICONS.map(({ icon, name }) => (
            <IconCell
              key={icon}
              name={name}
              icon={(size) => <HelperIcon name={icon} size={size} />}
            />
          ))}
        </div>
      </section>
      <section aria-label="A new helper" className="flex flex-col gap-3">
        <h2 className="text-sm font-medium">
          A new helper · any icon of the catalogue, in the tile
        </h2>
        <div className="flex flex-wrap gap-6">
          {NEW_HELPERS.map(({ glyph, name }) => (
            <IconCell
              key={name}
              name={name}
              icon={(size) => <TiledIcon glyph={glyph} size={size} />}
            />
          ))}
        </div>
      </section>
    </div>
  ),
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await expect(canvas.getAllByRole('region')).toHaveLength(2)
  },
}

const MARKS: readonly { state: MarkState; word: string; progress?: number }[] = [
  { state: 'todo', word: 'To do' },
  { state: 'progress', word: 'In progress' },
  { state: 'progress', word: 'In progress · 40%', progress: 0.4 },
  { state: 'done', word: 'Done' },
  { state: 'failed', word: 'Failed' },
  { state: 'yours', word: 'Waits for you' },
  { state: 'blocked', word: 'Blocked' },
  { state: 'skipped', word: 'Skipped' },
]

const BENCH = 'flex min-h-screen flex-col gap-8 bg-background p-8 text-foreground'

const MARK_CELL = 'flex w-menu-side items-center gap-2 text-sm'

const PICK =
  'rounded-md border border-border px-2 py-1 text-xs outline-none hover:bg-accent focus-ring aria-pressed:bg-accent aria-pressed:font-medium'

/** One mark driven by hand, to watch it change in place from any state to any other. */
function MarkBench(): ReactNode {
  const [shown, setShown] = useState(0)
  const mark = MARKS[shown] ?? MARKS[0]!
  return (
    <section aria-label="One mark, changing" className="flex flex-col gap-3">
      <h2 className="text-sm font-medium">One mark, changing in place</h2>
      <div className="flex items-center gap-4">
        <span className="flex size-10 items-center justify-center rounded-lg border border-border bg-card">
          <StatusMark state={mark.state} progress={mark.progress} label={mark.word} />
        </span>
        <div role="group" aria-label="Its state" className="flex flex-wrap gap-1.5">
          {MARKS.map((one, index) => (
            <button
              key={one.word}
              type="button"
              className={PICK}
              aria-pressed={index === shown}
              onClick={() => setShown(index)}
            >
              {one.word}
            </button>
          ))}
        </div>
      </div>
    </section>
  )
}

/**
 * The status mark: every state, then one mark driven by hand from any state to any other — the
 * ring closing, the tick and the cross drawing themselves, the arc turning or standing at its
 * share, the dot of what waits for you ringing.
 */
export const StatusMarks: Story = {
  render: () => (
    <div className={BENCH}>
      <section aria-label="Every state" className="flex flex-col gap-3">
        <h2 className="text-sm font-medium">Every state</h2>
        <div className="flex flex-wrap gap-4">
          {MARKS.map((one) => (
            <span key={one.word} className={MARK_CELL}>
              <StatusMark state={one.state} progress={one.progress} label={one.word} />
              {one.word}
            </span>
          ))}
        </div>
      </section>
      <MarkBench />
    </div>
  ),
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    const bench = within(canvas.getByRole('region', { name: 'One mark, changing' }))
    await userEvent.click(bench.getByRole('button', { name: 'Done' }))
    await expect(bench.getByRole('img', { name: 'Done' })).toBeVisible()
    await userEvent.click(bench.getByRole('button', { name: 'Failed' }))
    await expect(bench.getByRole('img', { name: 'Failed' })).toBeVisible()
  },
}

/** Runs in each state, driven by hand: running, done, failed, and run again. */
function RunBench(): ReactNode {
  const now = Date.now()
  const base = GOING_ON.few.flatMap((item) => (item.kind === 'run' ? [item] : []))
  const [runs, setRuns] = useState<readonly LiveRun[]>(() =>
    base.flatMap((item, index) =>
      (['running', 'finished', 'failed'] as const).map((state) => ({
        item: runOf(item, `${item.id}-${state}`, state),
        startedAt: now - (index + 1) * 83_000,
        endedAt: state === 'running' ? null : now - 12_000,
      })),
    ),
  )
  function set(id: string, state: CommandState): void {
    setRuns((all) =>
      all.map((run) =>
        run.item.id !== id
          ? run
          : {
              item: runOf(run.item, id, state),
              startedAt: state === 'running' ? Date.now() : run.startedAt,
              endedAt: state === 'running' ? null : Date.now(),
            },
      ),
    )
  }
  const driven = runs.find((run) => run.item.id === 'run-test-running')
  return (
    <div className={BENCH}>
      <div
        role="group"
        aria-label="What goes on in this Session"
        className="flex flex-wrap gap-y-2"
      >
        <Chips
          runs={runs}
          onStop={(id) => set(id, 'stopped')}
          onRetry={(id) => set(id, 'running')}
        />
      </div>
      <div role="group" aria-label="Drive the tests" className="flex gap-1.5">
        <button type="button" className={PICK} onClick={() => set('run-test-running', 'finished')}>
          Finish the tests
        </button>
        <button type="button" className={PICK} onClick={() => set('run-test-running', 'failed')}>
          Fail the tests
        </button>
        <button type="button" className={PICK} onClick={() => set('run-test-running', 'running')}>
          Run them again
        </button>
        <span className="text-xs text-muted-foreground">{driven?.item.state}</span>
      </div>
    </div>
  )
}

/** A run, under an id of its own, in a state. */
function runOf(item: GoingOnRun, id: string, state: CommandState): GoingOnRun {
  return { ...item, id, state }
}

/**
 * The run chips: running (a tint wiping across, the duration ticking), done (one wash of the
 * success tint), failed (the failure's tint, one short shake, the retry glyph beside it), and
 * the tests driven by hand from one to another.
 */
export const RunChips: Story = {
  render: () => (
    <TooltipProvider>
      <RunBench />
    </TooltipProvider>
  ),
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await userEvent.click(canvas.getByRole('button', { name: 'Run test again' }))
    await expect(canvas.getAllByRole('button', { name: 'test, running' })).toHaveLength(2)
    await userEvent.click(canvas.getByRole('button', { name: 'Fail the tests' }))
    await waitFor(() =>
      expect(canvas.getAllByRole('button', { name: 'Run test again' })).toHaveLength(1),
    )
  },
}

/** Over the chat, the build is a master and its detail: the tasks, and one task whole. */
export const BuildWideView: Story = {
  args: { defaultOver: true },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    const build = within(canvas.getByRole('region', { name: 'The build of ATL-7' }))
    await expect(build.getByRole('button', { name: /T5/ })).toHaveAttribute('aria-pressed', 'true')
    await expect(build.getByRole('region', { name: 'T5 in detail' })).toBeVisible()
  },
}

/** Over the chat, a task picked in the list shows whole beside it. */
export const BuildWidePick: Story = {
  args: { defaultOver: true },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await userEvent.click(canvas.getAllByRole('button', { name: /T2/ })[0]!)
    await expect(await canvas.findByRole('region', { name: 'T2 in detail' })).toBeVisible()
  },
}

/** The frozen Spec, from beside the chat: the panel goes over it, the Spec beside its tasks. */
export const FrozenSpec: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await userEvent.click(canvas.getByRole('button', { name: 'The frozen Spec' }))
    await expect(await canvas.findByRole('region', { name: 'The frozen Spec ATL-7' })).toBeVisible()
    await expect(canvas.getByRole('button', { name: 'Over the chat' })).toHaveAttribute(
      'aria-pressed',
      'true',
    )
  },
}

/** Over the chat, the Spec's phases and sections are a sidebar, the rest of the width its text. */
export const DefineWideView: Story = {
  args: { kind: 'define', defaultOver: true },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    const outline = within(canvas.getByRole('navigation', { name: 'Outline of ATL-7' }))
    await expect(outline.getByRole('button', { name: /^Plan \d/ })).toBeVisible()
    await userEvent.click(outline.getByRole('button', { name: 'Questions' }))
    await waitFor(() =>
      expect(outline.getByRole('button', { name: 'Questions' })).toHaveAttribute(
        'aria-current',
        'location',
      ),
    )
    await expect(canvas.queryByRole('complementary', { name: 'Open questions' })).toBeNull()
  },
}

/** The build's tasks at rest: how far it is at a glance, nothing unfolded. */
export const TasksAtAGlance: Story = {
  play: async ({ canvasElement }) => {
    const tasks = within(within(canvasElement).getByRole('region', { name: 'Tasks of ATL-7' }))
    await expect(tasks.getByLabelText('4 done')).toBeVisible()
    await expect(tasks.getByLabelText('2 in progress')).toBeVisible()
    await expect(tasks.queryAllByRole('button', { expanded: true })).toHaveLength(0)
  },
}

/** The tasks by state: what waits for the user first. */
export const TasksByState: Story = {
  args: { defaultGrouping: 'state' },
  play: async ({ canvasElement }) => {
    const tasks = within(within(canvasElement).getByRole('region', { name: 'Tasks of ATL-7' }))
    await expect(tasks.getByRole('group', { name: 'Waiting for you' })).toBeVisible()
  },
}

/** The tasks as one list. */
export const TasksAsAList: Story = {
  args: { defaultGrouping: 'list' },
  play: async ({ canvasElement }) => {
    const tasks = within(within(canvasElement).getByRole('region', { name: 'Tasks of ATL-7' }))
    await expect(tasks.getByRole('button', { name: 'One list' })).toHaveAttribute(
      'aria-pressed',
      'true',
    )
  },
}

/** A task unfolded: its tries and checks, its files, what came back on it. */
export const TaskOpened: Story = {
  args: { defaultTask: 'story-export-a-month:bt-t2' },
  play: async ({ canvasElement }) => {
    const detail = within(within(canvasElement).getByRole('region', { name: 'T2 in detail' }))
    await expect(detail.getByText(/ExportButton.tsx/)).toBeVisible()
    await expect(detail.getByText('Main agent')).toBeVisible()
  },
}

/** The same build over the chat: the tasks and an unfolded task use the whole width. */
export const TaskOpenedOverTheChat: Story = {
  args: { defaultOver: true, defaultTask: 'story-export-a-month:bt-t2' },
  play: async ({ canvasElement }) => {
    await expect(within(canvasElement).getByRole('region', { name: 'T2 in detail' })).toBeVisible()
  },
}

/** The pill's permission answered: it goes, and the pill with it. */
export const NoticeAnswered: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    const body = within(canvasElement.ownerDocument.body)
    await userEvent.click(await canvas.findByRole('button', { name: /Waiting for your answer/ }))
    await userEvent.click(await body.findByRole('button', { name: 'Run once' }))
    await waitFor(() =>
      expect(canvas.queryByRole('button', { name: /Waiting for your answer/ })).toBeNull(),
    )
  },
}
