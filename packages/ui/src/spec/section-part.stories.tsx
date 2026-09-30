import type { Meta, StoryObj } from '@storybook/react-vite'
import { type ReactNode, useState } from 'react'
import { expect, userEvent, within } from 'storybook/test'

import { Button } from '../components/button/button.tsx'
import type { SectionView } from './model.ts'
import { BUG, GATE_FULL, MID_PLAN, STALE } from './spec-fixtures.ts'
import { SectionPart } from './section-part.tsx'

/**
 * One section of the Spec document: its name alone as its heading, the facts beside it, and the
 * text read, its Markdown rendered. The agent writes it; nothing of it is edited by hand (issue
 * #135).
 */

/** The marks drawn beside a heading, which a heading no longer wears: empty and dot-sized. */
function dotsBeside(heading: HTMLElement): Element[] {
  return [...(heading.parentElement?.querySelectorAll('span') ?? [])].filter((span) => {
    const box = span.getBoundingClientRect()
    return span.textContent === '' && box.width > 0 && box.width <= 8 && box.height <= 8
  })
}

function sectionOf(sections: SectionView[], name: SectionView['name']): SectionView {
  return sections.find((section) => section.name === name)!
}

const meta = {
  title: 'Blocks/Spec/SectionPart',
  component: SectionPart,
  tags: ['autodocs'],
  parameters: { layout: 'padded' },
  args: { section: sectionOf(GATE_FULL.sections, 'expected_outcome') },
  argTypes: {
    section: { control: 'object', description: 'The section: body, author, mark.' },
  },
} satisfies Meta<typeof SectionPart>

export default meta

type Story = StoryObj<typeof meta>

/** Written by the agent: nothing among the facts, the text read, and nothing to edit. */
export const ByTheAgent: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    const heading = canvas.getByRole('heading', { name: /^Expected outcome/ })
    await expect(heading).toBeVisible()
    // The heading is the title alone: no state dot in its margin.
    await expect(dotsBeside(heading)).toEqual([])
    await expect(canvas.queryByText('agent')).toBeNull()
    await expect(canvas.queryByText(/^v\d+$/)).toBeNull()
    await expect(canvas.queryByRole('textbox')).toBeNull()
    await expect(canvas.queryByRole('button')).toBeNull()
    // Whether the Spec is ready is the head's status to say: no section says `frozen`.
    await expect(canvas.queryByText(/frozen/i)).toBeNull()
  },
}

/** Its Markdown rendered, always: no eye to toggle and no source to see. */
export const Markdown: Story = {
  args: { section: sectionOf(GATE_FULL.sections, 'behaviour') },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await expect(canvas.getByText('Export', { selector: 'strong' })).toBeVisible()
    await expect(canvas.queryByRole('button', { name: /Preview/ })).toBeNull()
    await expect(canvas.queryByRole('textbox')).toBeNull()
  },
}

/** Written by you, before editing went: `you` among the facts, and the text read like the rest. */
export const ByYou: Story = {
  args: { section: sectionOf(BUG.sections, 'reproduction') },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await expect(canvas.getByText('you')).toBeVisible()
    await expect(dotsBeside(canvas.getByRole('heading', { name: /^Reproduction/ }))).toEqual([])
    await expect(canvas.queryByText('sent to the agent next turn')).toBeNull()
    await expect(canvas.getByText(/Replayed after the build/)).toBeVisible()
  },
}

/** Nothing written yet: a quiet line, and nothing that invites a hand to write it. */
export const NotWritten: Story = {
  args: { section: sectionOf(BUG.sections, 'scope') },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await expect(canvas.queryByText('empty')).toBeNull()
    await expect(canvas.getByText('Nothing written yet.')).toBeVisible()
    await expect(canvas.queryByRole('textbox')).toBeNull()
  },
}

/**
 * Rewritten by the agent: the text it held stays, and the loader and `writing…` stand among the
 * facts beside the heading until the new text replaces it.
 */
export const Writing: Story = {
  args: { section: sectionOf(MID_PLAN.sections, 'plan') },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await expect(canvas.getByText('writing…')).toBeVisible()
    await expect(canvas.getByRole('status', { name: 'Writing' })).toBeVisible()
    await expect(canvas.getByText(/Reuse the invoice query/)).toBeVisible()
  },
}

/** Nothing written yet, and the agent writing it now: `Writing…` with the loader, in its place. */
export const WritingFirstDraft: Story = {
  args: { section: { name: 'plan', body: '', author: null, mark: 'writing' } },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await expect(canvas.getByText('Writing…')).toBeVisible()
    await expect(canvas.getByRole('status', { name: 'Writing' })).toBeVisible()
    await expect(canvas.queryByText('Nothing written yet.')).toBeNull()
    // Said once, in the body: the facts do not say it a second time.
    await expect(canvas.queryByText('writing…')).toBeNull()
  },
}

/**
 * A write as it ends, one way or the other: the section the agent started writing goes back to
 * `Nothing written yet.` when the write fails, and the new text replaces `Writing…` when it
 * succeeds. The two buttons stand in for the call's answer.
 */
function WriteOutcome(): ReactNode {
  const [section, setSection] = useState<SectionView>({
    name: 'plan',
    body: '',
    author: null,
    mark: 'writing',
  })
  return (
    <div className="flex flex-col gap-4">
      <SectionPart section={section} />
      <div className="flex gap-2">
        <Button variant="secondary" onClick={() => setSection({ ...section, mark: 'empty' })}>
          Fail the write
        </Button>
        <Button
          variant="secondary"
          onClick={() =>
            setSection({ ...section, body: 'Stream the rows.', author: 'agent', mark: 'agent' })
          }
        >
          Finish the write
        </Button>
      </div>
    </div>
  )
}

/** The write failed: the section says `Nothing written yet.` again, and nothing is loading. */
export const WriteFailed: Story = {
  render: () => <WriteOutcome />,
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await expect(canvas.getByText('Writing…')).toBeVisible()
    await userEvent.click(canvas.getByRole('button', { name: 'Fail the write' }))
    await expect(canvas.getByText('Nothing written yet.')).toBeVisible()
    await expect(canvas.queryByText('Writing…')).toBeNull()
    await expect(canvas.queryByRole('status', { name: 'Writing' })).toBeNull()
  },
}

/** The write went through: the new text takes the place of `Writing…`. */
export const WriteSucceeded: Story = {
  render: () => <WriteOutcome />,
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await userEvent.click(canvas.getByRole('button', { name: 'Finish the write' }))
    await expect(canvas.getByText('Stream the rows.')).toBeVisible()
    await expect(canvas.queryByText('Writing…')).toBeNull()
    await expect(canvas.queryByRole('status', { name: 'Writing' })).toBeNull()
  },
}

/** Copied by a Rework, and to review until the agent goes over its phase again. */
export const Stale: Story = {
  args: { section: sectionOf(STALE.sections, 'plan') },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await expect(canvas.getByText('to review')).toBeVisible()
  },
}
