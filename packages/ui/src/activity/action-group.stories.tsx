import type { Meta, StoryObj } from '@storybook/react-vite'
import { type ReactNode, useEffect, useState } from 'react'
import { expect, userEvent, waitFor, within } from 'storybook/test'

import { AgentText } from '../message/agent-text.tsx'
import { ActionGroup } from './action-group.tsx'
import { HemeraToolCall } from './hemera-tool-call.tsx'
import { ThoughtBlock } from './thought-block.tsx'
import { ToolCallCard } from './tool-call-card.tsx'

/**
 * The tool calls of a turn between two things the agent said, folded into one row (recette of 26
 * September 2026, issue #149).
 *
 * The line says how many actions — `5 actions`, never the kinds (issue #159) — the latest action,
 * muted and cut short, while it is folded (issue #180), and a dot for where the run stands; it
 * unfolds to the rows it holds, each the row it always was. What is
 * judged here is the thread with and without it: the agent's answer, not the plumbing before it,
 * is what the eye lands on.
 */

/** The rows of a run: three reads, a thought, a command and one of Hemera's calls. */
function rows(failed = false) {
  return (
    <>
      <ToolCallCard
        title="Read src/billing/export.ts"
        kind="read"
        status="completed"
        subject={{ text: 'src/billing/export.ts' }}
      />
      <ToolCallCard
        title="Read src/billing/invoice.ts"
        kind="read"
        status="completed"
        subject={{ text: 'src/billing/invoice.ts' }}
      />
      <ThoughtBlock seconds={4}>The totals are computed in the export, not stored.</ThoughtBlock>
      <ToolCallCard
        title="Read src/billing/line.ts"
        kind="read"
        status="completed"
        subject={{ text: 'src/billing/line.ts' }}
      />
      <ToolCallCard
        title="pnpm test billing"
        kind="execute"
        status={failed ? 'failed' : 'completed'}
        subject={{ text: 'pnpm test billing' }}
        error={failed ? 'Exited with code 1.' : undefined}
      />
      <HemeraToolCall
        tool="spec_write"
        label="Write the Spec"
        subject={{ text: 'Problem' }}
        status="completed"
        summary="Wrote the problem."
      />
    </>
  )
}

const meta = {
  tags: ['autodocs', 'new'],
  title: 'Blocks/Activity/ActionGroup',
  component: ActionGroup,
  parameters: { layout: 'padded' },
  args: {
    count: 5,
    status: 'completed',
    latest: 'Write the Spec Problem',
    children: rows(),
  },
  argTypes: {
    count: { control: 'number', description: 'How many calls the run holds.' },
    status: {
      control: 'inline-radio',
      options: ['in_progress', 'failed', 'completed'],
      description: 'Where the run stands, as the dot at the end of the line.',
    },
    latest: { control: 'text', description: 'The latest action, named on the folded line.' },
    children: { table: { disable: true } },
    defaultOpen: { control: 'boolean', description: 'Whether it starts unfolded.' },
  },
} satisfies Meta<typeof ActionGroup>

export default meta

type Story = StoryObj<typeof meta>

/**
 * Folded, which is how a run of calls arrives in the thread: one line, the count and the latest
 * action, muted, never the kinds it holds (issue #159, #180).
 */
export const Folded: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    const row = canvas.getByRole('button', { name: /5 actions/ })
    await expect(row).toHaveAttribute('aria-expanded', 'false')
    await expect(within(row).getByText('· Write the Spec Problem')).toBeVisible()
    await expect(row, 'the line names the kinds it holds').not.toHaveTextContent(/Hemera|read/)
    await expect(canvas.queryByText('src/billing/export.ts')).toBeNull()
  },
}

/** A latest action longer than the line: cut short on one line, the dot still at its end. */
export const LongLatest: Story = {
  args: {
    status: 'in_progress',
    latest:
      'Read src/features/billing/exports/monthly/invoice-lines-with-taxes-and-discounts.test.ts',
  },
  render: (args) => (
    <div className="max-w-sm">
      <ActionGroup {...args} />
    </div>
  ),
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    const latest = canvas.getByText((text) => text.startsWith('· Read src/features'))
    await expect(latest.scrollWidth).toBeGreaterThan(latest.clientWidth)
    await expect(latest.getBoundingClientRect().height).toBeLessThan(
      2 * Number.parseFloat(getComputedStyle(latest).lineHeight),
    )
    await expect(canvas.getByRole('img', { name: 'Running' })).toBeVisible()
  },
}

/** The calls of a live run, one arriving every so often, the latest last. */
const LIVE = [
  'Read src/menu.html',
  'Read src/menu.css',
  'Search "menu-item" in src',
  'Run pnpm test menu',
] as const

/** How long the live run waits between two calls, in milliseconds. */
const LIVE_STEP = 600

/** A run still going: a call arrives, the count grows and the line follows its latest action. */
function LiveRun(): ReactNode {
  const [seen, setSeen] = useState(2)
  useEffect(() => {
    if (seen >= LIVE.length) return
    const next = setTimeout(() => setSeen(seen + 1), LIVE_STEP)
    return () => clearTimeout(next)
  }, [seen])
  const calls = LIVE.slice(0, seen)
  return (
    <ActionGroup
      count={calls.length}
      status={seen < LIVE.length ? 'in_progress' : 'completed'}
      latest={calls.at(-1)}
    >
      {calls.map((title, index) => (
        <ToolCallCard
          key={title}
          title={title}
          kind="read"
          status={index === calls.length - 1 && seen < LIVE.length ? 'in_progress' : 'completed'}
        />
      ))}
    </ActionGroup>
  )
}

/**
 * Live, while the turn runs: the folded line follows the latest action as each call arrives
 * (issue #180), and unfolding shows the rows as before, with the count alone on the line.
 */
export const Live: Story = {
  parameters: { controls: { disable: true } },
  render: () => <LiveRun />,
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    const row = canvas.getByRole('button', { name: /actions/ })
    await expect(row).toHaveTextContent('2 actions')
    await expect(within(row).getByText('· Read src/menu.css')).toBeVisible()
    await waitFor(
      () => {
        expect(row).toHaveTextContent('3 actions')
        expect(within(row).getByText('· Search "menu-item" in src')).toBeVisible()
      },
      { timeout: 4 * LIVE_STEP },
    )
    await waitFor(
      () => {
        expect(row).toHaveTextContent('4 actions')
        expect(within(row).getByText('· Run pnpm test menu')).toBeVisible()
      },
      { timeout: 4 * LIVE_STEP },
    )
    await userEvent.click(row)
    await expect(row).toHaveAttribute('aria-expanded', 'true')
    await expect(row, 'the unfolded line still names the latest action').not.toHaveTextContent('·')
    await userEvent.click(row)
  },
}

/** Unfolded by the hand: the rows it holds, each the row it always was, folding on its own. */
export const Unfolded: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    const row = canvas.getByRole('button', { name: /5 actions/ })
    await userEvent.click(row)
    await expect(row).toHaveAttribute('aria-expanded', 'true')
    await expect(await canvas.findByText('src/billing/export.ts')).toBeVisible()
    await expect(canvas.getByRole('button', { name: /Thought for 4s/ })).toBeVisible()
    row.focus()
    await userEvent.keyboard('{Enter}')
    await expect(row, 'the group does not fold back when asked').toHaveAttribute(
      'aria-expanded',
      'false',
    )
  },
}

/** Running: one of its calls has not answered yet, and the dot says so while folded. */
export const Running: Story = {
  args: { status: 'in_progress' },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await expect(canvas.getByRole('img', { name: 'Running' })).toBeInTheDocument()
  },
}

/** Failed: a call went wrong, and the folded line says so rather than hiding it. */
export const Failed: Story = {
  args: { status: 'failed', children: rows(true) },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await expect(canvas.getByRole('img', { name: 'One failed' })).toBeInTheDocument()
  },
}

/** In the thread: what the agent said, the run folded between, and its answer after it. */
export const InTheThread: Story = {
  parameters: { controls: { disable: true } },
  render: (args) => (
    <div className="flex max-w-3xl flex-col gap-5">
      <AgentText text="I'll look at how the export builds its totals first." />
      <ActionGroup {...args} />
      <AgentText text="The totals are computed in the export: each line needs its **HT** and **TTC** amounts." />
    </div>
  ),
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await expect(canvas.getAllByRole('button', { name: /actions/ })).toHaveLength(1)
    await expect(canvas.getByText(/each line needs its/)).toBeVisible()
  },
}
