import type { Meta, StoryObj } from '@storybook/react-vite'
import type { ReactNode } from 'react'
import { expect, fn, userEvent, waitFor, within } from 'storybook/test'

import type { SpecAnswer, SpecQuestionView } from '../../spec/model.ts'
import { CardFrame, CardInline, CardLettered } from './question-cards.tsx'
import { CHOSE_MONTHLY, FILE_NAME, OWN_WORDS, SPLIT, TYPED_WORDS } from './question-fixtures.ts'

/**
 * The question card and a picked answer, in the app's theme (design exploration of 27 September
 * 2026, issue #182). Storybook only: nothing here is wired, and no component of the design system
 * changed for it.
 *
 * Cards · three question cards built from the frame, its rows and the tokens, each in its states:
 * open (blocking), a choice under the hand, the reader's own answer being written, answered, and
 * a question the Spec does not wait on.
 *
 * - A · Frame · a head `Question · Shape`, `blocking` a quiet chip at its end, rows with a radio,
 *   `Recommended` in words, `Write my own answer` opening its field under it; answered, the other
 *   rows fold away.
 * - B · Lettered · rows lettered A, B, C, the recommendation on a line under its label, `blocking`
 *   in a sentence in the rim below; `Other…` turns into its field in place; answered, every row
 *   stays and the chosen one is filled.
 * - C · Inline · a quiet head with a coloured chip, a badge for the recommendation, the field
 *   always open in the rim; answered, the card folds to one line.
 *
 * Every card is played by the hand: pressing a choice, or giving an answer of your own, answers.
 */

type CardVariant = 'frame' | 'lettered' | 'inline'

const CARDS = { frame: CardFrame, lettered: CardLettered, inline: CardInline }

function Card({
  variant,
  question,
  answered,
  ownWords,
  hovered,
  onAnswer,
}: {
  variant: CardVariant
  question: SpecQuestionView
  answered?: SpecAnswer | undefined
  ownWords?: string | undefined
  hovered?: string | undefined
  onAnswer?: ((answer: SpecAnswer) => void) | undefined
}): ReactNode {
  const Drawn = CARDS[variant]
  return (
    <div className="flex w-full max-w-2xl flex-col">
      <Drawn
        question={question}
        answered={answered}
        ownWords={ownWords}
        hovered={hovered}
        onAnswer={onAnswer}
      />
    </div>
  )
}

const meta = {
  title: 'Explorations/Questions',
  component: Card,
  tags: ['new'],
  parameters: { layout: 'padded' },
  args: { variant: 'frame', question: SPLIT, onAnswer: fn() },
  argTypes: {
    variant: { control: 'inline-radio', options: ['frame', 'lettered', 'inline'] },
    question: { control: 'object' },
    answered: { control: 'object' },
    ownWords: { control: 'text' },
    hovered: { control: 'text' },
  },
} satisfies Meta<typeof Card>

export default meta

type Story = StoryObj<typeof meta>

/** The card open: its question, its choices, and how it says the Spec waits on it. */
async function isOpen(canvasElement: HTMLElement, blocking: RegExp): Promise<void> {
  const canvas = within(canvasElement)
  await expect(
    canvas.getByRole('region', { name: /^Question: How should the export/ }),
  ).toBeVisible()
  await expect(canvas.getByRole('list', { name: 'Choices' })).toBeVisible()
  await expect(canvas.getByRole('button', { name: /One CSV per month/ })).toBeVisible()
  await expect(canvas.getByText(blocking)).toBeVisible()
}

/** The hand on the second choice, the recommended one: drawn under it, and moved onto it. */
async function hoverRecommended(canvasElement: HTMLElement): Promise<void> {
  const canvas = within(canvasElement)
  const recommended = canvas.getByRole('button', { name: /One CSV per month/ })
  await userEvent.hover(recommended)
  await expect(recommended).toHaveTextContent(/Recommended/)
  await expect(recommended).toHaveAttribute('data-hovered')
}

/** The reader's own words in their field, ready to be given. */
async function isWriting(canvasElement: HTMLElement): Promise<void> {
  const canvas = within(canvasElement)
  await expect(canvas.getByRole('textbox', { name: 'Your own answer' })).toHaveValue(OWN_WORDS)
  await expect(canvas.getByRole('button', { name: 'Answer' })).toBeEnabled()
}

/** Answered: the choice made is kept, checked, and nothing is left to press. */
async function isAnswered(canvasElement: HTMLElement): Promise<void> {
  const canvas = within(canvasElement)
  await waitFor(() => expect(canvas.queryByRole('button')).toBeNull())
  await expect(canvas.getByText('One CSV per month')).toBeVisible()
  await expect(canvas.getByText(/answered/i)).toBeVisible()
}

/** Pressing a choice answers, and the card turns answered in place. */
async function answerByPress(
  canvasElement: HTMLElement,
  onAnswer: (answer: SpecAnswer) => void,
): Promise<void> {
  const canvas = within(canvasElement)
  await userEvent.click(canvas.getByRole('button', { name: /One CSV per month/ }))
  await expect(onAnswer).toHaveBeenCalledWith(CHOSE_MONTHLY)
  await isAnswered(canvasElement)
}

/** Opening the reader's own field, writing in it, and giving it. */
async function answerInOwnWords(
  canvasElement: HTMLElement,
  onAnswer: (answer: SpecAnswer) => void,
  opener: RegExp | null,
): Promise<void> {
  const canvas = within(canvasElement)
  if (opener !== null) await userEvent.click(canvas.getByRole('button', { name: opener }))
  const field = await canvas.findByRole('textbox', { name: 'Your own answer' })
  await userEvent.type(field, TYPED_WORDS)
  await userEvent.keyboard('{Enter}')
  await expect(onAnswer).toHaveBeenCalledWith({ text: TYPED_WORDS })
  await waitFor(() => expect(canvas.getByText(TYPED_WORDS)).toBeVisible())
}

// ---------------------------------------------------------------------------------------------
// A · Frame

/** A · Frame, open: `blocking` a quiet chip at the end of the head. */
export const CardAOpen: Story = {
  name: 'Card A · Frame · 1 open',
  play: async ({ canvasElement }) => isOpen(canvasElement, /^blocking$/),
}

/** A · Frame, the hand on a choice: the row answers as every row of the app does. */
export const CardAHovered: Story = {
  name: 'Card A · Frame · 2 a choice hovered',
  args: { hovered: 'monthly' },
  play: async ({ canvasElement }) => hoverRecommended(canvasElement),
}

/** A · Frame, `Write my own answer` open under its row, words in it. */
export const CardAOther: Story = {
  name: 'Card A · Frame · 3 other with text',
  args: { ownWords: OWN_WORDS },
  play: async ({ canvasElement }) => isWriting(canvasElement),
}

/** A · Frame, answered: the other rows folded away, the chosen one checked. */
export const CardAAnswered: Story = {
  name: 'Card A · Frame · 4 answered',
  args: { answered: CHOSE_MONTHLY },
  play: async ({ canvasElement }) => {
    await isAnswered(canvasElement)
    await expect(within(canvasElement).queryByText('One CSV per client')).toBeNull()
  },
}

/** A · Frame, a question the Spec does not wait on: no chip at all. */
export const CardANotBlocking: Story = {
  name: 'Card A · Frame · 5 not blocking',
  args: { question: FILE_NAME },
  play: async ({ canvasElement }) => {
    await expect(within(canvasElement).queryByText('blocking')).toBeNull()
  },
}

/** A · Frame, answered by the hand: the other rows fold away under it. */
export const CardAAnswering: Story = {
  name: 'Card A · Frame · 6 answering',
  play: async ({ canvasElement, args }) => answerByPress(canvasElement, args.onAnswer!),
}

/** A · Frame, answered in the reader's own words. */
export const CardAOwnAnswer: Story = {
  name: 'Card A · Frame · 7 answering in own words',
  play: async ({ canvasElement, args }) =>
    answerInOwnWords(canvasElement, args.onAnswer!, /Write my own answer/),
}

// ---------------------------------------------------------------------------------------------
// B · Lettered

/** B · Lettered, open: `blocking` said in a sentence in the rim below the body. */
export const CardBOpen: Story = {
  name: 'Card B · Lettered · 1 open',
  args: { variant: 'lettered' },
  play: async ({ canvasElement }) => isOpen(canvasElement, /^Blocking · /),
}

/** B · Lettered, the hand on the recommended choice. */
export const CardBHovered: Story = {
  name: 'Card B · Lettered · 2 a choice hovered',
  args: { variant: 'lettered', hovered: 'monthly' },
  play: async ({ canvasElement }) => hoverRecommended(canvasElement),
}

/** B · Lettered, `Other…` turned into its field in place, words in it. */
export const CardBOther: Story = {
  name: 'Card B · Lettered · 3 other with text',
  args: { variant: 'lettered', ownWords: OWN_WORDS },
  play: async ({ canvasElement }) => isWriting(canvasElement),
}

/** B · Lettered, answered: every row stays, the chosen one filled, the rim says so. */
export const CardBAnswered: Story = {
  name: 'Card B · Lettered · 4 answered',
  args: { variant: 'lettered', answered: CHOSE_MONTHLY },
  play: async ({ canvasElement }) => {
    await isAnswered(canvasElement)
    await expect(within(canvasElement).getByText('One CSV per client')).toBeVisible()
  },
}

/** B · Lettered, a question the Spec does not wait on: the sentence says it can wait. */
export const CardBNotBlocking: Story = {
  name: 'Card B · Lettered · 5 not blocking',
  args: { variant: 'lettered', question: FILE_NAME },
  play: async ({ canvasElement }) => {
    await expect(within(canvasElement).getByText(/^Not blocking · /)).toBeVisible()
  },
}

/** B · Lettered, answered by the hand. */
export const CardBAnswering: Story = {
  name: 'Card B · Lettered · 6 answering',
  args: { variant: 'lettered' },
  play: async ({ canvasElement, args }) => answerByPress(canvasElement, args.onAnswer!),
}

/** B · Lettered, answered in the reader's own words: `Other…` becomes the field. */
export const CardBOwnAnswer: Story = {
  name: 'Card B · Lettered · 7 answering in own words',
  args: { variant: 'lettered' },
  play: async ({ canvasElement, args }) =>
    answerInOwnWords(canvasElement, args.onAnswer!, /^D Other/),
}

// ---------------------------------------------------------------------------------------------
// C · Inline

/** C · Inline, open: a coloured chip at the end of a quiet head, the field open below. */
export const CardCOpen: Story = {
  name: 'Card C · Inline · 1 open',
  args: { variant: 'inline' },
  play: async ({ canvasElement }) => isOpen(canvasElement, /^Blocks the Spec$/),
}

/** C · Inline, the hand on the recommended choice. */
export const CardCHovered: Story = {
  name: 'Card C · Inline · 2 a choice hovered',
  args: { variant: 'inline', hovered: 'monthly' },
  play: async ({ canvasElement }) => hoverRecommended(canvasElement),
}

/** C · Inline, words in the field that is always open. */
export const CardCOther: Story = {
  name: 'Card C · Inline · 3 other with text',
  args: { variant: 'inline', ownWords: OWN_WORDS },
  play: async ({ canvasElement }) => isWriting(canvasElement),
}

/** C · Inline, answered: folded to one line, the question in the head, the choice under it. */
export const CardCAnswered: Story = {
  name: 'Card C · Inline · 4 answered',
  args: { variant: 'inline', answered: CHOSE_MONTHLY },
  play: async ({ canvasElement }) => {
    await isAnswered(canvasElement)
    await expect(within(canvasElement).queryByRole('textbox')).toBeNull()
  },
}

/** C · Inline, a question the Spec does not wait on: `Can wait`. */
export const CardCNotBlocking: Story = {
  name: 'Card C · Inline · 5 not blocking',
  args: { variant: 'inline', question: FILE_NAME },
  play: async ({ canvasElement }) => {
    await expect(within(canvasElement).getByText('Can wait')).toBeVisible()
  },
}

/** C · Inline, answered by the hand: the card folds to its line. */
export const CardCAnswering: Story = {
  name: 'Card C · Inline · 6 answering',
  args: { variant: 'inline' },
  play: async ({ canvasElement, args }) => answerByPress(canvasElement, args.onAnswer!),
}

/** C · Inline, answered in the reader's own words, from the field already open. */
export const CardCOwnAnswer: Story = {
  name: 'Card C · Inline · 7 answering in own words',
  args: { variant: 'inline' },
  play: async ({ canvasElement, args }) => answerInOwnWords(canvasElement, args.onAnswer!, null),
}
