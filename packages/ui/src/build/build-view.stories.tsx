import type { Meta, StoryObj } from '@storybook/react-vite'
import type { ReactNode } from 'react'
import { expect, fn, screen, userEvent, waitFor, within } from 'storybook/test'

import { useBeat } from '../../.storybook/beat.ts'
import { steadyClock } from '../../.storybook/clock.ts'
import { journeyOf, readEveryFrame } from '../../.storybook/journey.ts'
import { movesLess } from '../../.storybook/reduced-motion.ts'

import { STORIES as SPEC_STORIES } from '../spec/spec-fixtures.ts'
import {
  ACCEPTED,
  BLOCKED,
  BUG_NOT_REPLAYED,
  BUG_REPLAYED,
  BUILDING,
  FINAL_CHECKS,
  FINAL_CHECKS_JUST_RED,
  FINAL_CHECKS_RED,
  GETTING_READY,
  NOW,
  NO_STORIES,
  PAUSED,
  READY_TO_ACCEPT,
  STOPPED,
  THREE_RED,
  YOURS,
} from './build-fixtures.ts'
import { BuildView, type BuildViewProps } from './build-view.tsx'

/**
 * The build view (issue #116): the head with the phase in plain words and what can be done with
 * the build, the agent's approach, then the stories of the frozen Spec — each with the words it
 * was written with, the criteria it is judged on, and where it stands — with the build's tasks
 * unfolded under them, one stage at a time, and the final checks of the whole Spec. One story per
 * state of the build `ATL-7`; the view in its Session, beside the chat, is
 * `Surfaces/Session/Build`.
 */
const meta = {
  title: 'Blocks/Build/BuildView',
  component: BuildView,
  tags: ['autodocs'],
  parameters: { layout: 'fullscreen' },
  decorators: [
    (Story) => (
      <div className="h-screen">
        <Story />
      </div>
    ),
  ],
  args: {
    build: BUILDING,
    now: NOW,
    // The stories of the frozen Spec, which the build's own take their words from.
    stories: SPEC_STORIES,
    specOpen: false,
    onToggleSpec: fn(),
    onPause: fn(),
    onResume: fn(),
    onAccept: fn(),
    onStop: fn(),
    onTaskDone: fn(),
    onTaskSkip: fn(),
    onDismissBlocker: fn(),
    onOpenChat: fn(),
    onSelect: fn(),
  },
  argTypes: {
    build: { control: 'object', description: 'The build, as the engine answers it.' },
    now: { control: 'text', description: 'The caller’s now, every time is said from.' },
    stories: { control: 'object', description: 'The stories of the frozen Spec, its own words.' },
    selected: {
      control: 'text',
      description: 'The task that is unfolded, by its build task id; for a caller that keeps it.',
    },
    specOpen: { control: 'boolean', description: 'Whether the frozen Spec is open beside it.' },
    onToggleSpec: { action: 'spec toggled' },
    onPause: { action: 'paused' },
    onResume: { action: 'resumed' },
    onAccept: { action: 'accepted' },
    onStop: { action: 'stopped' },
    onTaskDone: { action: 'task done' },
    onTaskSkip: { action: 'task skipped' },
    onDismissBlocker: { action: 'blocker dismissed' },
    onOpenChat: { action: 'chat opened' },
    onSelect: { action: 'task chosen' },
  },
} satisfies Meta<typeof BuildView>

export default meta

type Story = StoryObj<typeof meta>

/** The stories of the Spec as the view draws them, in the Spec's own order. */
function storiesList(canvasElement: HTMLElement): HTMLElement {
  return within(canvasElement).getByRole('list', { name: 'Stories of ATL-7' })
}

/** The one story of the Spec, by its title, with everything drawn under it. */
function storyOf(canvasElement: HTMLElement, title: string): HTMLElement {
  return within(storiesList(canvasElement)).getByRole('article', { name: title })
}

/**
 * Getting ready: the stories of the Spec with their words, T1 ready and the others waiting on it,
 * and a line that waits for the agent's approach — no task starts before it.
 */
export const GettingReady: Story = {
  args: { build: GETTING_READY },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await expect(canvas.getByText('Getting ready')).toBeVisible()
    // A turning mark waits for the approach, its words the tooltip's (#77): no sentence.
    await expect(
      canvas.getByRole('img', {
        name: "Waiting for the agent's approach: no task starts before it",
      }),
    ).toBeVisible()
    await expect(canvas.queryByText(/no task starts before it/)).toBeNull()
    const waiting = canvas.getByRole('img', {
      name: "Waiting for the agent's approach: no task starts before it",
    })
    await userEvent.hover(waiting)
    await waitFor(() =>
      expect(screen.getByRole('tooltip')).toHaveTextContent(
        "Waiting for the agent's approach: no task starts before it",
      ),
    )
    await userEvent.unhover(waiting)
    await expect(storiesList(canvasElement).children).toHaveLength(2)
    await expect(
      within(storyOf(canvasElement, 'Export a month')).getByRole('img', { name: 'to do' }),
    ).toBeVisible()
    await expect(
      within(storyOf(canvasElement, 'Credit notes in the same file')).getByRole('img', {
        name: 'to do',
      }),
    ).toBeVisible()
    const one = storyOf(canvasElement, 'Export a month')
    await expect(within(one).getByRole('button', { name: /^T1\b/ })).toHaveAttribute(
      'aria-expanded',
      'true',
    )
    await expect(within(one).getByRole('button', { name: /^T1 / })).toHaveTextContent(
      'The invoice lines of the month',
    )
    await expect(
      within(storyOf(canvasElement, 'Credit notes in the same file')).getByRole('button', {
        name: 'Tasks · 1',
      }),
    ).toBeVisible()
  },
}

/**
 * Building: everything the panel holds at once — the phase and how far the build is, the stories
 * with the words they were written with and the criteria they are judged on, the task being worked
 * on unfolded into its stage, and the approach folded now that tasks started.
 */
export const Building: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await expect(canvas.getByText('Building')).toBeVisible()
    // How far the build is: a mark and a count a state, and the bar of every task (#77).
    await expect(canvas.getByRole('img', { name: '1 done' })).toBeVisible()
    await expect(canvas.getByRole('img', { name: '2 in progress' })).toBeVisible()
    await expect(canvas.getByRole('img', { name: '1 to do' })).toBeVisible()
    await expect(canvas.queryByRole('img', { name: /waiting for you/ })).toBeNull()
    await expect(canvas.getByRole('img', { name: 'Where each task stands' })).toBeVisible()
    await expect(canvas.getByRole('heading', { name: 'CSV invoice export' })).toBeVisible()
    const one = storyOf(canvasElement, 'Export a month')
    await expect(within(one).getByRole('img', { name: 'in progress' })).toBeVisible()
    await expect(within(one).getByText(/As an accountant closing a month/)).toBeVisible()
    await expect(within(one).getByRole('list', { name: 'Criteria of S1' })).toHaveTextContent(
      'An empty month downloads the header row only.',
    )
    // The task on the stage: its story is unfolded, and so is it.
    const on = within(one).getByRole('button', { name: /^T2\b/ })
    await expect(on).toHaveAttribute('aria-expanded', 'true')
    await expect(
      within(one).getByRole('region', { name: 'A CSV in the column order of the ledger' }),
    ).toBeVisible()
    // The approach: folded once tasks started, and it opens on the note.
    const approach = canvas.getByRole('button', { name: 'Approach' })
    await expect(approach).toHaveAttribute('aria-expanded', 'false')
    await userEvent.click(approach)
    await expect(await canvas.findByText(/the invoice query of/)).toBeVisible()
  },
}

/**
 * A `bug` Spec with no story (issue #203): its tasks stand in a group of their own, each opening
 * its stage, and the head counts its tasks as it always does.
 */
export const NoStories: Story = {
  args: { build: NO_STORIES, stories: [] },
  play: async ({ canvasElement, args }) => {
    const canvas = within(canvasElement)
    await expect(canvas.queryByText(/No story of the Spec/)).toBeNull()
    await expect(canvas.getByRole('img', { name: '1 done' })).toBeVisible()
    const tasks = within(canvas.getByRole('region', { name: 'Tasks of ATL-9' }))
    // The user's task is on the stage from the start, with its Done and its Skip.
    await expect(
      tasks.getByRole('region', { name: 'The September total matches the ledger' }),
    ).toBeVisible()
    await userEvent.click(tasks.getByRole('button', { name: 'Done' }))
    await expect(args.onTaskDone).toHaveBeenCalledWith('bt-4')
    await expect(tasks.getByRole('button', { name: 'Skip…' })).toBeVisible()
    // Any other task opens its own stage.
    await userEvent.click(tasks.getByRole('button', { name: /^T1 / }))
    await expect(
      await tasks.findByRole('region', { name: 'The failing total, as a test' }),
    ).toBeVisible()
  },
}

/** The human task is ready: it is Yours, its stage unfolded with Done and Skip. */
export const Yours: Story = {
  args: { build: YOURS },
  play: async ({ canvasElement, args }) => {
    const canvas = within(canvasElement)
    await expect(
      canvas.getByRole('region', { name: 'The file imports into the ledger' }),
    ).toBeVisible()
    await userEvent.click(canvas.getByRole('button', { name: 'Done' }))
    await expect(args.onTaskDone).toHaveBeenCalledWith('bt-4')
  },
}

/** T2 came back after three red tries: its failures on top of its stage. */
export const ThreeRedTries: Story = {
  args: { build: THREE_RED },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await expect(
      canvas.getByRole('group', { name: 'T2 came back to you after 3 red tries' }),
    ).toBeVisible()
  },
}

/**
 * The agent says T3 contradicts the Spec: T3 and T4 are blocked, T2 goes on; the blocker stands on
 * T3's story, and T4 says what it waits on.
 */
export const Blocked: Story = {
  args: { build: BLOCKED },
  play: async ({ canvasElement, args }) => {
    const canvas = within(canvasElement)
    await expect(canvas.getByText('The agent says this task contradicts the Spec')).toBeVisible()
    await userEvent.click(canvas.getByRole('button', { name: 'The Spec stands' }))
    await expect(args.onDismissBlocker).toHaveBeenCalledWith('blocker-1', null)
    const one = storyOf(canvasElement, 'Export a month')
    await userEvent.click(within(one).getByRole('button', { name: 'Tasks · 3' }))
    await userEvent.click(within(one).getByRole('button', { name: /^T4 / }))
    const waits = canvas.getByRole('img', {
      name: 'Waits on T3, which the agent says contradicts the Spec',
    })
    await expect(waits).toBeVisible()
    await userEvent.hover(waits)
    await waitFor(() =>
      expect(screen.getByRole('tooltip')).toHaveTextContent(
        'Waits on T3, which the agent says contradicts the Spec',
      ),
    )
  },
}

/** Paused: the head says it, with how long since, and Resume stands where Pause was. */
export const Paused: Story = {
  args: { build: PAUSED },
  play: async ({ canvasElement, args }) => {
    const canvas = within(canvasElement)
    await expect(canvas.getByText('Paused', { selector: 'span' })).toBeVisible()
    await expect(canvas.getByText(/^since /)).toBeVisible()
    await expect(canvas.queryByRole('status')).toBeNull()
    await expect(canvas.queryByRole('button', { name: 'Pause' })).toBeNull()
    await userEvent.click(canvas.getByRole('button', { name: 'Resume' }))
    await expect(args.onResume).toHaveBeenCalled()
  },
}

/** Final checks: every task done, the checks of the whole Spec drawn under the stories. */
export const FinalChecks: Story = {
  args: { build: FINAL_CHECKS },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await expect(canvas.getByText('Final checks', { selector: 'span' })).toBeVisible()
    await expect(canvas.getByRole('img', { name: 'Final checks on try 1 of 3' })).toBeVisible()
    await expect(canvas.getByRole('heading', { name: 'Final checks' })).toBeVisible()
    await expect(canvas.getByRole('list', { name: 'Tries of the final checks' })).toBeVisible()
    await expect(
      within(storyOf(canvasElement, 'Export a month')).getByRole('img', { name: 'done' }),
    ).toBeVisible()
  },
}

/**
 * A build with no task yet, and no story to build: a quiet mark in the body rather than nothing,
 * its words in its tooltip.
 */
export const NoTaskYet: Story = {
  args: { build: { ...GETTING_READY, tasks: [], stories: [] } },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    const body = canvas.getByRole('region', { name: 'The build of ATL-7' })
    const mark = within(body).getByRole('img', { name: 'No task of the build yet' })
    await expect(mark).toBeVisible()
    await userEvent.hover(mark)
    await waitFor(() =>
      expect(screen.getByRole('tooltip')).toHaveTextContent('No task of the build yet'),
    )
  },
}

/**
 * Every task done and no final try yet: the final checks' head wears the mark of what is to do,
 * its words in its tooltip.
 */
export const FinalChecksNotRun: Story = {
  args: { build: { ...FINAL_CHECKS, endAttempts: [] } },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    const mark = canvas.getByRole('img', { name: 'They run once every task is done' })
    await userEvent.hover(mark)
    await waitFor(() =>
      expect(screen.getByRole('tooltip')).toHaveTextContent('They run once every task is done'),
    )
  },
}

/** Final checks red: the e2e failed its first try, and the agent is on its second. */
export const FinalChecksRed: Story = {
  args: { build: FINAL_CHECKS_RED },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    const running = canvas.getByRole('img', { name: 'Final checks on try 2 of 3' })
    await expect(running).toBeVisible()
    await expect(running).toHaveClass('text-warning')
    await userEvent.click(canvas.getByRole('button', { name: /^Try 1 of 3/ }))
    await expect(await canvas.findByText('exited with 1')).toBeVisible()
  },
}

/**
 * Final checks just red, before the next try starts: the state line wears the red cross, never the
 * arc of something under way.
 */
export const FinalChecksJustRed: Story = {
  args: { build: FINAL_CHECKS_JUST_RED },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    const mark = canvas.getByRole('img', { name: 'Final checks red on try 1 of 3' })
    await expect(mark).toBeVisible()
    await expect(mark).toHaveClass('text-destructive')
  },
}

/** Green and nothing waiting: Accept is offered, and it is the one thing to press. */
export const ReadyToAccept: Story = {
  args: { build: READY_TO_ACCEPT },
  play: async ({ canvasElement, args }) => {
    const canvas = within(canvasElement)
    await expect(canvas.getByRole('img', { name: 'Final checks green' })).toBeVisible()
    await expect(canvas.queryByRole('button', { name: 'Pause' })).toBeNull()
    await userEvent.click(canvas.getByRole('button', { name: 'Accept' }))
    await expect(args.onAccept).toHaveBeenCalled()
  },
}

/**
 * A `bug` in its final checks (issue #203): the replay of its reproduction the agent reported
 * stands under "Final checks", its dot saying the bug is gone, and Accept is offered.
 */
export const BugReplayed: Story = {
  args: { build: BUG_REPLAYED },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    const replay = within(canvas.getByRole('region', { name: 'Reproduction' }))
    await expect(replay.getByRole('img', { name: 'Gone' })).toBeVisible()
    await expect(replay.getByText(/the file totals 12 490.00/)).toBeVisible()
    await expect(canvas.getByRole('button', { name: 'Accept' })).toBeVisible()
  },
}

/** A `bug` whose final checks are green but whose reproduction was not replayed: no Accept. */
export const BugNotReplayed: Story = {
  args: { build: BUG_NOT_REPLAYED },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await expect(canvas.getByRole('img', { name: 'Final checks green' })).toBeVisible()
    const replay = within(canvas.getByRole('region', { name: 'Reproduction' }))
    await expect(replay.getByRole('img', { name: 'Not replayed' })).toBeVisible()
    await expect(canvas.queryByRole('button', { name: 'Accept' })).toBeNull()
  },
}

/** Accepted: over and readable, the head says it; only the Spec button is left. */
export const Accepted: Story = {
  args: { build: ACCEPTED },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await expect(canvas.getByText('Accepted')).toBeVisible()
    await expect(canvas.queryByText(/stay in the Workspace/)).toBeNull()
    await expect(canvas.queryByRole('button', { name: 'Stop build' })).toBeNull()
    await expect(canvas.getByRole('button', { name: 'Spec' })).toBeVisible()
  },
}

/** Stopped: over and readable, why it stopped said, T3 skipped with its reason on its row. */
export const Stopped: Story = {
  args: { build: STOPPED },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await expect(canvas.getByText('Stopped')).toBeVisible()
    await expect(canvas.getByText('You stopped the build.')).toBeVisible()
    await expect(canvas.queryByRole('button', { name: 'Resume' })).toBeNull()
    const two = storyOf(canvasElement, 'Credit notes in the same file')
    await userEvent.click(within(two).getByRole('button', { name: 'Tasks · 1' }))
    await expect(within(two).getAllByRole('button', { name: /^T3\b/ })[0]).toHaveTextContent(
      'Skipped',
    )
  },
}

/**
 * The keyboard: the head's controls in order, Stop asking first and giving the focus back, then
 * the approach, then the fold of a story's tasks and the stage of a task.
 */
export const Keyboard: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    const spec = canvas.getByRole('button', { name: 'Spec' })
    spec.focus()
    await userEvent.tab()
    await expect(canvas.getByRole('button', { name: 'Pause' })).toHaveFocus()
    await userEvent.tab()
    const stop = canvas.getByRole('button', { name: 'Stop build' })
    await expect(stop).toHaveFocus()
    await userEvent.keyboard('{Enter}')
    const page = within(document.body)
    await waitFor(() => expect(page.getByRole('dialog')).toBeVisible())
    await userEvent.keyboard('{Escape}')
    await waitFor(() => expect(page.queryByRole('dialog')).toBeNull())
    await waitFor(() => expect(stop).toHaveFocus())
    await userEvent.tab()
    await expect(canvas.getByRole('button', { name: 'Approach' })).toHaveFocus()
  },
}

/** How far a stroke drawn by its length has gone, from the dash motion writes on it: 0 to 1. */
function drawnOf(stroke: Element | null): number {
  if (stroke === null) return Number.NaN
  if (Number(getComputedStyle(stroke).opacity) === 0) return 0
  return Number.parseFloat(stroke.getAttribute('stroke-dasharray') ?? '1')
}

/** How far a stroke drawn by its width has gone, from the scale the browser computed: 0 to 1. */
function struckOf(strike: Element | null): number {
  if (strike === null) return Number.NaN
  const written = getComputedStyle(strike).transform
  return written === 'none' ? 1 : new DOMMatrixReadOnly(written).a
}

/**
 * Each task's line leads with the mark of where it stands (issue #77): a check for what is done,
 * an arc for what is being worked on or checked, a dashed ring for what waits. The line already
 * says the state in words, so the mark says nothing to a screen reader. A done task's title is
 * struck through, and quiet.
 */
export const TaskMarks: Story = {
  play: async ({ canvasElement }) => {
    const one = storyOf(canvasElement, 'Export a month')
    const two = storyOf(canvasElement, 'Credit notes in the same file')
    await userEvent.click(within(two).getByRole('button', { name: /^Tasks/ }))
    const task = (story: HTMLElement, label: string) =>
      within(story).getAllByRole('button', { name: new RegExp(`^${label}\\b`) })[0]!
    // T4 realises both stories, and is drawn under the first.
    await waitFor(() => expect(task(two, 'T3')).toBeVisible())
    const marks = [task(one, 'T1'), task(one, 'T2'), task(two, 'T3'), task(one, 'T4')].map((line) =>
      line.querySelector('[data-mark]')?.getAttribute('data-mark'),
    )
    await expect(marks).toEqual(['done', 'progress', 'progress', 'todo'])
    await expect(task(one, 'T1').querySelector('[data-mark]')).toHaveAttribute(
      'aria-hidden',
      'true',
    )
    await expect(task(one, 'T1').querySelector('[data-strike]')).not.toBeNull()
    await expect(task(one, 'T2').querySelector('[data-strike]')).toBeNull()
  },
}

/**
 * The view, whose T2 is worked on for a beat, done for a beat, and worked on again: the story plays
 * the change by itself, with nothing beside the view to drive it.
 */
function Finishing(props: BuildViewProps): ReactNode {
  const step = useBeat(2)
  const build = {
    ...props.build,
    tasks: props.build.tasks.map((one) =>
      one.label === 'T2' && step === 1 ? { ...one, state: 'done' as const } : one,
    ),
  }
  return <BuildView {...props} build={build} />
}

/**
 * A task done while watched: its arc closes into the ring and the check draws itself in it, and the
 * stroke across its title draws from its start on the same beat.
 */
export const TaskDone: Story = {
  render: (args) => <Finishing {...args} />,
  play: async ({ canvasElement }) => {
    const line = within(storyOf(canvasElement, 'Export a month')).getAllByRole('button', {
      name: /^T2\b/,
    })[0]!
    const mark = line.querySelector('[data-mark]')!
    // The draw is a quarter of a second, which one late frame of a busy runner can step over
    // whole: on the play's own clock, it is drawn on frames close enough to be seen, and the
    // readings are timed by the clock it is drawn on.
    const clock = await steadyClock()
    try {
      // In hundredths, which is the unit a journey of a share is told in.
      const watch = readEveryFrame(
        () =>
          Math.min(
            drawnOf(mark.querySelector('[data-figure="check"]')),
            struckOf(line.querySelector('[data-strike]')),
          ) * 100,
        clock.now,
      )
      await waitFor(() => expect(mark).toHaveAttribute('data-mark', 'done'))
      await waitFor(() => expect(struckOf(line.querySelector('[data-strike]'))).toBe(1))
      await waitFor(() => expect(drawnOf(mark.querySelector('[data-figure="check"]'))).toBe(1))
      const both = watch.stop().filter((reading) => !Number.isNaN(reading.value))
      if (movesLess()) return
      // The check and the stroke drew together, neither of them whole at once.
      await expect(journeyOf(both, 0, 100)).toBe('travelled')
    } finally {
      clock.stop()
    }
  },
}
