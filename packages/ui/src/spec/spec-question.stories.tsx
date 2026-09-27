import type { Meta, StoryObj } from '@storybook/react-vite'
import { expect, fn, screen, userEvent, waitFor, within } from 'storybook/test'

import { CREDIT_NOTES } from './spec-fixtures.ts'
import { SpecQuestion } from './spec-question.tsx'

/**
 * A question of the Spec asked in the thread (issue #199, card B of the exploration of issue
 * #182): a frame whose choices are lettered A, B, C, the recommended one marked without a line of
 * its own, `Other…` turning into its field in place, and whether the Spec waits on the answer said
 * in the rim below. Pressing a choice answers.
 */
const meta = {
  title: 'Blocks/Spec/SpecQuestion',
  component: SpecQuestion,
  tags: ['autodocs', 'updated'],
  parameters: { layout: 'padded' },
  args: { question: CREDIT_NOTES, onAnswer: fn() },
  argTypes: {
    question: { control: 'object', description: 'The question, its options and its answer.' },
    cancelled: { control: 'boolean', description: 'The turn was stopped before an answer.' },
    onAnswer: { description: 'An option pressed, or your own words.' },
  },
} satisfies Meta<typeof SpecQuestion>

export default meta

type Story = StoryObj<typeof meta>

/** The rows of the card: the choices the agent offered, then `Other`. */
function rowsOf(canvasElement: HTMLElement): HTMLElement[] {
  const canvas = within(canvasElement)
  return within(canvas.getByRole('list', { name: 'Answers' })).getAllByRole('listitem')
}

/**
 * Open, and blocking: the agent asks, the phase at the end of the head, the choices lettered, and
 * the rim below saying the Spec waits on the answer. No `Answer` button: a press is the answer.
 */
export const Open: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await expect(canvas.getByText('The agent asks')).toBeVisible()
    await expect(canvas.getByText('Plan')).toBeVisible()
    await expect(canvas.getByText(/^Blocking · /)).toBeVisible()
    await expect(canvas.getByRole('button', { name: /Other/ })).toBeVisible()
    await expect(canvas.queryByRole('button', { name: 'Answer' })).toBeNull()
    await expect(canvas.queryByRole('textbox')).toBeNull()
  },
}

/** A question the Spec goes on without: the rim says it can wait. */
export const NotBlocking: Story = {
  args: { question: { ...CREDIT_NOTES, blocking: false } },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await expect(canvas.getByText(/^Not blocking · /)).toBeVisible()
    await expect(canvas.queryByText(/^Blocking · /)).toBeNull()
  },
}

/**
 * The recommended choice wears a small mark at its end, which takes no line of its own: the row
 * is as tall as the others and its label where theirs is. The words are in its tooltip and its
 * name. Pressing it answers at once.
 */
export const Recommended: Story = {
  play: async ({ canvasElement, args }) => {
    const canvas = within(canvasElement)
    const recommended = canvas.getByRole('button', { name: /recommended by the agent/ })
    await expect(recommended).toHaveTextContent('Negative rows in the same file')
    await expect(canvas.queryByText('Recommended by the agent')).toBeNull()
    const other = canvas.getByRole('button', { name: /A second file for credit notes/ })
    expect(recommended.getBoundingClientRect().height).toBe(other.getBoundingClientRect().height)
    await userEvent.hover(recommended)
    await expect(await screen.findByRole('tooltip')).toHaveTextContent('Recommended by the agent')
    recommended.focus()
    await userEvent.keyboard('{Enter}')
    await expect(args.onAnswer).toHaveBeenCalledWith({ optionId: 'negative' })
  },
}

/**
 * `Other…` pressed turns into its field in place, the caret in it; Enter sends the words typed.
 * Escape leaves the field and gives `Other…` back.
 */
export const OtherBeingTyped: Story = {
  play: async ({ canvasElement, args }) => {
    const canvas = within(canvasElement)
    await userEvent.click(canvas.getByRole('button', { name: /Other/ }))
    const field = await canvas.findByRole('textbox', { name: 'Other' })
    await waitFor(() => expect(field).toHaveFocus())
    await userEvent.keyboard('{Escape}')
    const back = await canvas.findByRole('button', { name: /Other/ })
    await waitFor(() => expect(back).toHaveFocus())
    await userEvent.click(canvas.getByRole('button', { name: /Other/ }))
    await userEvent.type(
      await canvas.findByRole('textbox', { name: 'Other' }),
      'Negative rows, marked by a type column.{Enter}',
    )
    await expect(args.onAnswer).toHaveBeenCalledWith({
      text: 'Negative rows, marked by a type column.',
    })
  },
}

/** The small send icon inside the field sends as Enter does, once there are words. */
export const OtherSentByItsIcon: Story = {
  play: async ({ canvasElement, args }) => {
    const canvas = within(canvasElement)
    await userEvent.click(canvas.getByRole('button', { name: /Other/ }))
    const send = await canvas.findByRole('button', { name: 'Send your answer' })
    await expect(send).toBeDisabled()
    await userEvent.type(canvas.getByRole('textbox', { name: 'Other' }), 'A type column.')
    await userEvent.click(send)
    await expect(args.onAnswer).toHaveBeenCalledWith({ text: 'A type column.' })
  },
}

/** Cancelled: the turn was stopped; nothing can be pressed, and it stays open in the Spec. */
export const Cancelled: Story = {
  args: { cancelled: true },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await expect(canvas.getByText(/the turn was stopped/)).toBeVisible()
    for (const button of canvas.queryAllByRole('button')) expect(button).toBeDisabled()
  },
}

/** The question as the agent wrote it, in Markdown: bold, code and a list read as the thread's. */
export const Markdown: Story = {
  args: {
    question: {
      ...CREDIT_NOTES,
      body: 'Credit notes: **where do they go** in the export?\n\n- `amount` stays signed\n- the `type` column is new',
    },
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await expect(canvas.getByText('where do they go').tagName).toBe('STRONG')
    await expect(canvas.getByText('amount').tagName).toBe('CODE')
    const card = canvas.getByRole('group', { name: /^Question/ })
    await expect(canvas.getByText(/column is new/).tagName).toBe('LI')
    await expect(card).not.toHaveTextContent('**')
    await expect(card).not.toHaveTextContent('`')
  },
}

/**
 * Hemera labels the choices (issue #134): A, B, C in the order the agent gave them, and `Other`
 * always last, lettered after them.
 */
export const Lettered: Story = {
  play: async ({ canvasElement }) => {
    const choices = rowsOf(canvasElement)
    await expect(choices).toHaveLength(4)
    await expect(choices[0]).toHaveTextContent(/^ANegative rows in the same file/)
    await expect(choices[1]).toHaveTextContent(/^BA second file for credit notes$/)
    await expect(choices[2]).toHaveTextContent(/^CLeft out of the export$/)
    await expect(choices[3]).toHaveTextContent(/^DOther…$/)
  },
}

/** A question the agent offered no answer to: `Other` alone, lettered A. */
export const OtherOnly: Story = {
  args: { question: { ...CREDIT_NOTES, options: [] } },
  play: async ({ canvasElement, args }) => {
    const canvas = within(canvasElement)
    const choices = rowsOf(canvasElement)
    await expect(choices).toHaveLength(1)
    await expect(choices[0]).toHaveTextContent(/^A/)
    await userEvent.click(canvas.getByRole('button', { name: /Other/ }))
    await userEvent.type(
      await canvas.findByRole('textbox', { name: 'Other' }),
      'A type column.{Enter}',
    )
    await expect(args.onAnswer).toHaveBeenCalledWith({ text: 'A type column.' })
  },
}
