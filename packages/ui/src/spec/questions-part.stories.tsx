import type { Meta, StoryObj } from '@storybook/react-vite'
import { expect, within } from 'storybook/test'

import { QuestionsPart } from './questions-part.tsx'
import { QUESTIONS } from './spec-fixtures.ts'

const MARKS = ['empty', 'agent', 'human', 'stale', 'conflict', 'writing']

/**
 * The register of the questions: each one, open or answered, with its answer once there is one.
 * Nothing is answered here, and nothing is pressed: a question is answered on its card, in the chat.
 */
const meta = {
  title: 'Blocks/Spec/QuestionsPart',
  component: QuestionsPart,
  tags: ['autodocs', 'updated'],
  parameters: { layout: 'padded' },
  args: { questions: QUESTIONS, mark: 'agent' },
  argTypes: {
    questions: { control: 'object', description: 'The questions, open and answered.' },
    mark: {
      control: 'select',
      options: MARKS,
      description: 'The state, said to a screen reader in the heading.',
    },
  },
} satisfies Meta<typeof QuestionsPart>

export default meta

type Story = StoryObj<typeof meta>

/**
 * One open and blocking, one answered and quiet: its chips say it is blocking and its phase, and
 * nothing else — no answer field and no link to the chat (issue #181).
 */
export const Register: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await expect(canvas.getByRole('heading', { name: /^Questions · 1 open/ })).toBeVisible()
    await expect(canvas.getByText('blocking')).toBeVisible()
    await expect(canvas.getByText('The issue date')).toBeVisible()
    await expect(canvas.queryByRole('textbox')).toBeNull()
    await expect(canvas.queryByRole('button')).toBeNull()
    await expect(canvas.queryByText(/answer in the chat/i)).toBeNull()
  },
}

/** Every question answered: the register is a record. */
export const AllAnswered: Story = {
  args: {
    questions: [
      { ...QUESTIONS[0]!, answer: { text: 'Negative rows, marked by a type column.' } },
      QUESTIONS[1]!,
    ],
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await expect(canvas.getByText('Negative rows, marked by a type column.')).toBeVisible()
    await expect(canvas.queryByRole('button')).toBeNull()
  },
}

/** Nothing left to decide. */
export const None: Story = {
  args: { questions: [], mark: 'empty' },
}
