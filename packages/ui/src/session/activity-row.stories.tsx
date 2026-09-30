import type { Meta, StoryObj } from '@storybook/react-vite'
import { MotionConfig } from 'motion/react'
import { type ReactNode, useEffect, useState } from 'react'
import { expect, fn, userEvent, waitFor, within } from 'storybook/test'

import { FACE_STATES } from '../components/face/states.ts'
import { ActivityRow, type ActivityRowProps } from './activity-row.tsx'

/**
 * What the turn is doing right now, at the end of the thread (design D17-04, D17-13).
 *
 * Four states, one row. A turn writes nothing for minutes at a time, and a thread that said
 * nothing while it ran was a thread the reader could not tell from a dead one. Each state is a
 * story, because each of them is a different promise: thinking and writing are work in flight,
 * running names the command it is on, and waiting is the Session asking the reader for whatever
 * its notices hold. Three more say how the turn ended, and stay until the next message: done,
 * stopped, failed.
 *
 * The mark at the start of the line is Hemera's face (issue #140), and it wears the work: a tool
 * that reads wears `reading`, one that writes `writing`, a command `running`, and a Session that
 * waits wears `question` for a question and `permission` for anything else. `Faces` shows
 * every one of them, and `ATurnGoesOn` is the one to watch a turn change its face on.
 */
const THOUGHT = `The join on invoice_lines is the cost, not the formatting. Streaming will not fix
it on its own, so the query goes first and the loop after.`

const meta = {
  tags: ['autodocs'],
  title: 'Blocks/Session/ActivityRow',
  component: ActivityRow,
  parameters: { layout: 'padded' },
  args: { state: 'thinking' },
  argTypes: {
    state: {
      control: 'inline-radio',
      options: ['thinking', 'running', 'waiting', 'streaming', 'done', 'stopped', 'failed'],
      description: 'What the turn is doing, as the engine reports it.',
    },
    face: {
      control: 'select',
      options: FACE_STATES,
      description: 'The face the line wears when the caller knows more than the state says.',
    },
    detail: {
      control: 'text',
      description: 'What it is doing it to: the title of the tool call. Only `running` has one.',
    },
    doing: {
      control: 'text',
      description:
        'What is being done, as a whole phrase, read in place of `Running` and its detail.',
    },
    thought: { control: 'text', description: 'The thought arriving now, which the chevron opens.' },
    elapsedMs: {
      control: 'number',
      description: 'How long the turn took, in milliseconds. Only `done` says it.',
    },
    className: { table: { disable: true } },
  },
} satisfies Meta<typeof ActivityRow>

export default meta
type Story = StoryObj<typeof meta>

/** The row on its own, in whichever state and with whatever it is carrying. */
export const Playground: Story = {}

/** Thinking: the turn is between two blocks, and the row is what says so. */
export const Thinking: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await expect(canvas.getByText('Thinking…')).toBeVisible()
    // Nothing to open: the thought is not arriving yet, and a chevron over an empty body lies.
    await expect(canvas.queryByRole('button')).toBeNull()
    // The face is what says the turn is alive, and what it is doing: thinking.
    const face = canvas.getByRole('img', { name: 'Thinking…' })
    await expect(face).toHaveAttribute('data-state', 'thinking')
  },
}

/** Running: the row names the command, because that is what the reader is watching for. */
export const Running: Story = {
  args: { state: 'running', detail: 'cat recap.md' },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await expect(canvas.getByText('Running cat recap.md')).toBeVisible()
    await expect(canvas.getByRole('img')).toHaveAttribute('data-state', 'running')
  },
}

/**
 * One of Hemera's own tools running says what it is doing in a phrase of its own, "Writing the
 * Spec", rather than "Running Write Spec" (issue #170).
 */
export const RunningHemeraTool: Story = {
  args: { state: 'running', doing: 'Writing the Spec', face: 'writing' },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await expect(canvas.getByText('Writing the Spec')).toBeVisible()
    // The face writes, where the state only says a tool is running.
    const face = canvas.getByRole('img', { name: 'Writing the Spec' })
    await expect(face).toHaveAttribute('data-state', 'writing')
    await expect(canvas.queryByText(/Running/)).toBeNull()
  },
}

/**
 * Waiting: the Session's notices hold a permission, or a proposal to take or leave, and the face
 * asks for it.
 */
export const Waiting: Story = {
  args: { state: 'waiting' },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await expect(canvas.getByText('Waiting for your answer')).toBeVisible()
    await expect(canvas.getByRole('img', { name: 'Waiting for your answer' })).toHaveAttribute(
      'data-state',
      'permission',
    )
  },
}

/** A question of the Spec waits in the notices: the same words, and the face that asks. */
export const Question: Story = {
  args: { state: 'waiting', face: 'question' },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await expect(canvas.getByText('Waiting for your answer')).toBeVisible()
    await expect(canvas.getByRole('img', { name: 'Waiting for your answer' })).toHaveAttribute(
      'data-state',
      'question',
    )
  },
}

/** Writing: an answer is arriving into the thread above, and the row is the edge of it. */
export const Streaming: Story = {
  args: { state: 'streaming' },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await expect(canvas.getByText('Writing…')).toBeVisible()
    await expect(canvas.getByRole('img')).toHaveAttribute('data-state', 'writing')
  },
}

/**
 * Done: the turn is over, and the row says so quietly, with how long it took. The face that
 * worked through the turn is the one that says it is done: one mark for the whole turn.
 */
export const Done: Story = {
  args: { state: 'done', elapsedMs: 12_400 },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await expect(canvas.getByText('Done in 12 s')).toBeVisible()
    await expect(canvas.getByRole('img')).toHaveAttribute('data-state', 'done')
    await expect(canvas.queryByRole('button')).toBeNull()
  },
}

/** Stopped: the reader stopped the turn, and the row says so without a figure. */
export const Stopped: Story = {
  args: { state: 'stopped', elapsedMs: 40_000 },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await expect(canvas.getByText('Stopped')).toBeVisible()
    // Stopped is at rest, and rest is asleep.
    await expect(canvas.getByRole('img')).toHaveAttribute('data-state', 'asleep')
  },
}

/** Failed: the agent went away under the turn. */
export const Failed: Story = {
  args: { state: 'failed' },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await expect(canvas.getByText('Failed')).toBeVisible()
    await expect(canvas.getByRole('img')).toHaveAttribute('data-state', 'error')
  },
}

/**
 * The thought arriving now, one press away.
 *
 * Only the thought that is arriving: the thoughts already in the thread are blocks of their own
 * and stay exactly where they are, because a row that swallowed them would be a second copy of
 * the turn drawn at the bottom of it.
 */
export const WithAThought: Story = {
  args: { state: 'thinking', thought: THOUGHT },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    const row = canvas.getByRole('button', { name: /Thinking…/ })
    await expect(row).toHaveAttribute('aria-expanded', 'false')
    await userEvent.click(row)
    await expect(row).toHaveAttribute('aria-expanded', 'true')
    await expect(canvas.getByText(/The join on invoice_lines is the cost/)).toBeVisible()
    await userEvent.click(row)
    await expect(row).toHaveAttribute('aria-expanded', 'false')
  },
}

/**
 * Quiet: the turn has heard nothing from its agent for half a minute, and the line says for how
 * long (issue #131). Nothing is offered yet: an agent thinking hard is quiet for that long too.
 */
export const Quiet: Story = {
  args: { state: 'thinking', quietMs: 47_000, onStop: fn(), onOpenTrace: fn() },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await expect(canvas.getByText('Thinking… · 45 s, no answer yet')).toBeVisible()
    await expect(canvas.queryByRole('button', { name: 'Stop' })).toBeNull()
    // Silent for too long, the face falls asleep: nothing is coming (issue #131).
    await expect(canvas.getByRole('img')).toHaveAttribute('data-state', 'asleep')
  },
}

/**
 * Stuck: two minutes of nothing, and the line offers what can be done about it — stop the turn,
 * or open the trace of what the agent and Hemera said to find out why nothing comes.
 */
export const Stuck: Story = {
  args: {
    state: 'running',
    detail: 'fs_read src/app.ts',
    quietMs: 150_000,
    onStop: fn(),
    onOpenTrace: fn(),
  },
  play: async ({ args, canvasElement }) => {
    const canvas = within(canvasElement)
    await expect(
      canvas.getByText('Running fs_read src/app.ts · 2 min, no answer yet'),
    ).toBeVisible()
    await userEvent.click(canvas.getByRole('button', { name: 'Stop' }))
    await expect(args.onStop).toHaveBeenCalledOnce()
    await userEvent.click(canvas.getByRole('button', { name: 'Open the trace' }))
    await expect(args.onOpenTrace).toHaveBeenCalledOnce()
  },
}

/** A Session with no trace offers Stop alone: there is nothing to open. */
export const StuckWithoutATrace: Story = {
  args: { state: 'thinking', quietMs: 600_000, onStop: fn() },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await expect(canvas.getByText('Thinking… · 10 min, no answer yet')).toBeVisible()
    await expect(canvas.getByRole('button', { name: 'Stop' })).toBeVisible()
    await expect(canvas.queryByRole('button', { name: 'Open the trace' })).toBeNull()
  },
}

/** Waiting on the reader is not the agent being silent, however long it lasts. */
export const WaitingIsNotQuiet: Story = {
  args: { state: 'waiting', quietMs: 600_000, onStop: fn(), onOpenTrace: fn() },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await expect(canvas.getByText('Waiting for your answer')).toBeVisible()
    await expect(canvas.queryByRole('button', { name: 'Stop' })).toBeNull()
    await expect(canvas.getByRole('img')).toHaveAttribute('data-state', 'permission')
  },
}

/** The seven states in one column, which is the only way to check that seven read as seven. */
export const States: Story = {
  parameters: { controls: { disable: true } },
  render: () => (
    <div className="flex w-full flex-col gap-3">
      <ActivityRow state="thinking" />
      <ActivityRow state="running" detail="cat recap.md" />
      <ActivityRow state="waiting" />
      <ActivityRow state="streaming" />
      <ActivityRow state="done" elapsedMs={72_000} />
      <ActivityRow state="stopped" />
      <ActivityRow state="failed" />
    </div>
  ),
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    const said = [
      'Thinking…',
      'Running cat recap.md',
      'Waiting for your answer',
      'Writing…',
      'Done in 1 min 12 s',
      'Stopped',
      'Failed',
    ]
    await Promise.all(said.map(async (one) => expect(canvas.getByText(one)).toBeVisible()))
  },
}

/** Each line, and the face it wears. */
const FACES: readonly (ActivityRowProps & { wears: string })[] = [
  { state: 'thinking', wears: 'thinking' },
  { state: 'running', detail: 'Read src/export.ts', face: 'reading', wears: 'reading' },
  { state: 'running', doing: 'Reading the Spec', face: 'reading', wears: 'reading' },
  { state: 'running', doing: 'Writing the Spec', face: 'writing', wears: 'writing' },
  { state: 'running', detail: 'Edit src/export.ts', face: 'writing', wears: 'writing' },
  { state: 'streaming', wears: 'writing' },
  { state: 'running', detail: 'pnpm test', wears: 'running' },
  { state: 'waiting', wears: 'permission' },
  { state: 'waiting', face: 'question', wears: 'question' },
  { state: 'done', elapsedMs: 72_000, wears: 'done' },
  { state: 'failed', wears: 'error' },
  { state: 'stopped', wears: 'asleep' },
  { state: 'thinking', quietMs: 47_000, wears: 'asleep' },
]

/**
 * Every face the line wears, beside what it says: the state's own face, and the finer one the
 * page hands for a tool that reads or writes. Telling them apart never depends on the colour —
 * switch the catalogue to both themes, or look through a grey filter.
 */
export const Faces: Story = {
  parameters: { controls: { disable: true } },
  render: () => (
    <div className="flex w-full flex-col gap-3">
      {FACES.map(({ wears, ...row }, index) => (
        <ActivityRow key={`${String(index)}-${wears}`} {...row} />
      ))}
    </div>
  ),
  play: async ({ canvasElement }) => {
    const worn = [...canvasElement.querySelectorAll('[data-state]')].map((face) =>
      face.getAttribute('data-state'),
    )
    await expect(worn).toEqual(FACES.map(({ wears }) => wears))
  },
}

/** One turn, as the engine reports it one step after the other. */
const TURN: readonly ActivityRowProps[] = [
  { state: 'thinking' },
  { state: 'running', doing: 'Reading the Spec', face: 'reading' },
  { state: 'thinking' },
  { state: 'running', doing: 'Writing the Spec', face: 'writing' },
  { state: 'running', detail: 'pnpm test', face: 'running' },
  { state: 'waiting' },
  { state: 'streaming' },
  { state: 'waiting', face: 'question' },
  { state: 'done', elapsedMs: 48_000 },
]

/** How long the turn stays on each step, in milliseconds: long enough to watch a change land. */
const STEP_MS = 2400

/** The row, stepped through a turn and started over. */
function Turn(): ReactNode {
  const [step, setStep] = useState(0)
  useEffect(() => {
    const timer = setInterval(() => setStep((was) => (was + 1) % TURN.length), STEP_MS)
    return () => clearInterval(timer)
  }, [])
  return <ActivityRow {...TURN[step]!} />
}

/**
 * A turn going on: thinking, reading the Spec, writing it, running the tests, asking for a
 * permission, writing the answer, leaving a question, done — and over again. Every change of the
 * line is a change of the face, played rather than swapped.
 */
export const ATurnGoesOn: Story = {
  parameters: { controls: { disable: true } },
  render: () => <Turn />,
  play: async ({ canvasElement }) => {
    const face = within(canvasElement).getByRole('img')
    await expect(face).toHaveAttribute('data-state', 'thinking')
    await waitFor(() => expect(face).toHaveAttribute('data-state', 'reading'), {
      timeout: STEP_MS * 2,
    })
  },
}

/** The drawn strokes of a face, read off the page: what a frame changed, or did not. */
function strokesOf(face: Element): string[] {
  return [...face.querySelectorAll('[data-face-part]')].map((part) => part.getAttribute('d') ?? '')
}

/** Waits for the next frames, as many as asked. */
function frames(count: number): Promise<void> {
  return new Promise((settle) => {
    const look = (left: number): void => {
      if (left === 0) settle()
      else requestAnimationFrame(() => look(left - 1))
    }
    look(count)
  })
}

/**
 * The same row for a reader who asked for less movement: the words, and a still face.
 *
 * Asked by the tree, with `MotionConfig reducedMotion="always"`, which the face reads exactly as it
 * reads the system's own preference, as the face's own story does.
 */
export const ReducedMotion: Story = {
  parameters: { controls: { disable: true } },
  args: { state: 'running', detail: 'cat recap.md' },
  render: (args) => (
    <MotionConfig reducedMotion="always">
      <ActivityRow {...args} />
    </MotionConfig>
  ),
  play: async ({ canvasElement }) => {
    const face = within(canvasElement).getByRole('img')
    await frames(2)
    const before = strokesOf(face)
    await frames(20)
    await expect(strokesOf(face)).toEqual(before)
  },
}
