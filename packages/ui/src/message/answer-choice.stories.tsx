import type { Meta, StoryObj } from '@storybook/react-vite'
import { expect, waitFor, within } from 'storybook/test'

import { AgentText } from './agent-text.tsx'
import { AnswerChoice } from './answer-choice.tsx'
import { MessageGroup } from './message.tsx'

/**
 * The reader's answer to a question of the agent (issue #165).
 *
 * On the reader's side, as their messages are, but drawn as the choice they made rather than as
 * words they typed: an outlined pill with the card's letter, the label and a check, under a muted
 * `↳` line that names the question. Only what the reader did type under `Other` is a message.
 */
const meta = {
  tags: ['autodocs', 'new'],
  title: 'Blocks/Message/AnswerChoice',
  component: AnswerChoice,
  parameters: { layout: 'padded' },
  args: {
    question: 'How should the export be split?',
    choices: [{ letter: 'B', label: 'One CSV per month' }],
    at: '14:07',
    atLabel: 'Saturday 26 September 2026 at 14:07',
  },
  argTypes: {
    question: { control: 'text', description: 'The question answered, as the agent asked it.' },
    choices: { control: 'object', description: 'The choices made, lettered as the card did.' },
    text: { control: 'text', description: 'What the reader typed under `Other`.' },
    name: { control: 'text', description: 'The reader’s name, said under the answer.' },
    at: { control: 'text', description: 'HH:MM, already written for the platform.' },
    atLabel: { control: 'text', description: 'The whole date behind that time.' },
  },
} satisfies Meta<typeof AnswerChoice>

export default meta
type Story = StoryObj<typeof meta>

/**
 * One choice: a pill on the right, with no filled surface, and the question it answers above it.
 * The accessible name says the whole of it.
 */
export const Single: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    const answer = canvas.getByRole('group', {
      name: 'You answered «How should the export be split?»: B, One CSV per month',
    })
    await expect(answer).toBeVisible()
    const pill = within(answer).getByRole('listitem')
    await expect(pill).toHaveTextContent('BOne CSV per month')
    // An outline, not the bubble of a message: nothing fills it.
    await expect(getComputedStyle(pill).backgroundColor).toBe('rgba(0, 0, 0, 0)')
    // On the reader's side: once it has arrived, its right edge is the group's.
    const edge = answer.getBoundingClientRect().right
    await waitFor(() =>
      expect(Math.round(pill.getBoundingClientRect().right)).toBe(Math.round(edge)),
    )
    await expect(within(answer).getByText('How should the export be split?')).toBeVisible()
    await expect(within(answer).getByText('You')).toBeVisible()
  },
}

/** The choice the agent recommended keeps the badge the card gave it. */
export const Recommended: Story = {
  args: {
    choices: [{ letter: 'A', label: 'One CSV for the whole year', recommended: true }],
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await expect(
      canvas.getByRole('group', {
        name: 'You answered «How should the export be split?»: A, One CSV for the whole year',
      }),
    ).toBeVisible()
    await expect(canvas.getByText('recommended')).toBeVisible()
  },
}

/**
 * `Other`, with what the reader typed: the pill says `Other`, and the words under it are a real
 * message, because those the reader did write.
 */
export const OtherWithText: Story = {
  args: {
    choices: [{ letter: 'C', label: 'Other' }],
    text: 'One CSV per client, named after the client',
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    const answer = canvas.getByRole('group', {
      name: 'You answered «How should the export be split?»: C, Other: One CSV per client, named after the client',
    })
    await expect(within(answer).getByRole('listitem')).toHaveTextContent('COther')
    const typed = within(answer).getByText('One CSV per client, named after the client')
    await expect(typed).toBeVisible()
    // The typed words sit under the pill, in a bubble that is filled.
    const pill = within(answer).getByRole('listitem').getBoundingClientRect()
    await expect(typed.getBoundingClientRect().top).toBeGreaterThan(pill.bottom - 1)
    await expect(getComputedStyle(typed).backgroundColor).not.toBe('rgba(0, 0, 0, 0)')
  },
}

/** Several choices, for a question that takes several: pills stacked under one `↳` line. */
export const SeveralChoices: Story = {
  args: {
    question: 'Which columns go in the export?',
    choices: [
      { letter: 'A', label: 'The amount before tax' },
      { letter: 'B', label: 'The amount with tax', recommended: true },
      { letter: 'D', label: 'The client’s VAT number' },
    ],
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    const answer = canvas.getByRole('group', {
      name: 'You answered «Which columns go in the export?»: A, The amount before tax; B, The amount with tax; D, The client’s VAT number',
    })
    const pills = within(answer).getAllByRole('listitem')
    await expect(pills).toHaveLength(3)
    await expect(within(answer).getAllByText('Which columns go in the export?')).toHaveLength(1)
    const [first, second] = pills.map((pill) => pill.getBoundingClientRect())
    await expect(second!.top).toBeGreaterThanOrEqual(first!.bottom)
  },
}

const LONG =
  'The invoices of a month can be exported in several shapes, and the accountant reads them in a spreadsheet that has a limit on the rows it opens: should the export be split per month, per quarter, or left as one file for the whole year, knowing that the yearly file goes over that limit for the largest clients?'

/** A long question stays on one line, truncated; the whole of it is under the hand. */
export const LongQuestion: Story = {
  args: { question: LONG },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    const line = canvas.getByTitle(LONG)
    const words = within(line).getByText(LONG)
    // One line, cut: what it holds is wider than what it shows.
    await expect(words.scrollWidth).toBeGreaterThan(words.clientWidth)
    await expect(words.getClientRects()).toHaveLength(1)
    await expect(
      canvas.getByRole('group', { name: `You answered «${LONG}»: B, One CSV per month` }),
    ).toBeVisible()
  },
}

/**
 * A question the agent wrote in Markdown: the `↳` line, the whole question under the hand and
 * the accessible name read it as words, without its stars and backticks (issue #170).
 */
export const MarkdownQuestion: Story = {
  args: { question: 'How should **the export** be split by `month` or _quarter_?' },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    const plain = 'How should the export be split by month or quarter?'
    await expect(
      canvas.getByRole('group', { name: `You answered «${plain}»: B, One CSV per month` }),
    ).toBeVisible()
    const line = canvas.getByTitle(plain)
    await expect(within(line).getByText(plain)).toBeVisible()
  },
}

/** In a thread: the agent asked, the reader answered on their side, and it reads as a choice. */
export const InTheThread: Story = {
  render: (args) => (
    <div className="flex flex-col gap-4">
      <MessageGroup
        author="agent"
        name="Claude"
        at="14:06"
        lines={[
          {
            id: 'asked',
            body: <AgentText text="I need one thing before I write the export section." />,
          },
        ]}
      />
      <AnswerChoice {...args} />
      <MessageGroup
        author="user"
        name="You"
        at="14:08"
        lines={[{ id: 'typed', body: 'And name the files after the month, please.' }]}
      />
    </div>
  ),
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await expect(
      canvas.getByRole('group', {
        name: 'You answered «How should the export be split?»: B, One CSV per month',
      }),
    ).toBeVisible()
    await expect(canvas.getByRole('group', { name: 'Messages from You' })).toBeVisible()
  },
}

/**
 * An answer whose question is no longer in the thread never vanishes: the same pill, with no `↳`
 * line. Without the card to say which letter it had, the pill is the label alone.
 */
export const WithoutItsQuestion: Story = {
  args: { question: undefined },
  render: (args) => (
    <div className="flex flex-col gap-4">
      <AnswerChoice {...args} />
      <AnswerChoice {...args} choices={[{ label: 'One CSV per quarter' }]} />
    </div>
  ),
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    const lettered = canvas.getByRole('group', { name: 'You answered: B, One CSV per month' })
    await expect(within(lettered).getByRole('listitem')).toHaveTextContent('BOne CSV per month')
    const bare = canvas.getByRole('group', { name: 'You answered: One CSV per quarter' })
    await expect(within(bare).getByRole('listitem')).toHaveTextContent(/^One CSV per quarter$/)
    await expect(canvas.queryByText('↳')).toBeNull()
  },
}
