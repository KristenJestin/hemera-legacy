import type { Meta, StoryObj } from '@storybook/react-vite'
import { type ReactNode, useState } from 'react'
import { expect, fn, screen, userEvent, waitFor, within } from 'storybook/test'

import { Button } from '../components/button/button.tsx'
import { Composer } from '../composer/composer.tsx'
import { AgentText } from '../message/agent-text.tsx'
import { MessageScroller, type ScrollerEntry } from '../message/scroller/scroller.tsx'
import { TurnLine } from '../session/turn-line.tsx'
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

/** Resolves on the next frame, once whatever was asked has been drawn. */
function nextFrame(): Promise<void> {
  return new Promise((resolve) => requestAnimationFrame(() => resolve()))
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
 * The recommended choice wears a small mark after its label, which takes no line of its own: the row
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
 * Answered, the question still reads its Markdown, and the card's name says it in words: no star
 * or backtick is read out.
 */
export const MarkdownAnswered: Story = {
  args: {
    question: {
      ...CREDIT_NOTES,
      body: 'Credit notes: **where do they go** in the `export`?',
      answer: { optionId: 'negative' },
    },
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await expect(canvas.getByText('where do they go').tagName).toBe('STRONG')
    await expect(
      canvas.getByRole('group', {
        name: 'You answered «Credit notes: where do they go in the export?»: A, Negative rows in the same file',
      }),
    ).toBeVisible()
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

/** The question asked in the stories, as its card names it once answered. */
const ASKED = 'Credit notes: negative rows in the same file, or left out of the export?'

/**
 * Answered by a choice: the card stays as it was asked. The chosen row is filled and checked,
 * the others quieted, and nothing can be pressed any more. No line says which was chosen: the
 * card shows it, and its name says it.
 */
export const AnsweredByAChoice: Story = {
  args: { question: { ...CREDIT_NOTES, answer: { optionId: 'separate' } } },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    const card = canvas.getByRole('group', {
      name: `You answered «${ASKED}»: B, A second file for credit notes`,
    })
    await expect(card).toBeVisible()
    const rows = rowsOf(canvasElement)
    await expect(rows).toHaveLength(4)
    await expect(rows[0]).toHaveTextContent('Negative rows in the same file')
    await expect(rows[2]).toHaveTextContent('Left out of the export')
    await expect(rows[3]).toHaveTextContent(/^DOther$/)
    for (const button of canvas.queryAllByRole('button')) expect(button).toBeDisabled()
    await expect(canvas.getByRole('button', { name: /A second file/ })).toHaveAttribute(
      'aria-pressed',
      'true',
    )
    await expect(canvas.getByRole('button', { name: /Negative rows/ })).toHaveAttribute(
      'aria-pressed',
      'false',
    )
    await expect(card).not.toHaveTextContent(/Answered/)
    await expect(canvas.queryByText(/^Blocking · /)).toBeNull()
  },
}

/** Answered in your own words: `Other` is the row chosen, and holds the words you gave. */
export const AnsweredInOwnWords: Story = {
  args: {
    question: { ...CREDIT_NOTES, answer: { text: 'Negative rows, marked by a type column.' } },
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await expect(
      canvas.getByRole('group', {
        name: `You answered «${ASKED}»: D, Other: Negative rows, marked by a type column.`,
      }),
    ).toBeVisible()
    const rows = rowsOf(canvasElement)
    await expect(rows).toHaveLength(4)
    await expect(rows[3]).toHaveTextContent(/^DNegative rows, marked by a type column\.$/)
    await expect(canvas.queryByRole('textbox')).toBeNull()
    for (const button of canvas.queryAllByRole('button')) expect(button).toBeDisabled()
  },
}

/** The card as the thread holds it: the answer, once given, is the question's own. */
function Answerable(props: Parameters<typeof SpecQuestion>[0]): ReactNode {
  const [answer, setAnswer] = useState(props.question.answer)
  return (
    <SpecQuestion
      {...props}
      question={{ ...props.question, answer }}
      onAnswer={(given) => {
        props.onAnswer(given)
        setAnswer(given)
      }}
    />
  )
}

/**
 * Answering: a press answers at once, and the card does not fold or move. The rows stay where
 * they were, the chosen one draws its check.
 */
export const Answering: Story = {
  render: (args) => <Answerable {...args} />,
  play: async ({ canvasElement, args }) => {
    const canvas = within(canvasElement)
    const card = canvas.getByRole('group', { name: /^Question: / })
    const before = rowsOf(canvasElement).map((row) => row.getBoundingClientRect().top)
    await userEvent.click(canvas.getByRole('button', { name: /A second file/ }))
    await expect(args.onAnswer).toHaveBeenCalledWith({ optionId: 'separate' })
    await expect(card).toHaveAccessibleName(/^You answered /)
    await expect(rowsOf(canvasElement).map((row) => row.getBoundingClientRect().top)).toEqual(
      before,
    )
    await expect(canvas.getByRole('button', { name: /A second file/ })).toHaveAttribute(
      'aria-pressed',
      'true',
    )
  },
}

/** Answering in your own words: the field gives way to the words, in the row `Other` was. */
export const AnsweringInOwnWords: Story = {
  render: (args) => <Answerable {...args} />,
  play: async ({ canvasElement, args }) => {
    const canvas = within(canvasElement)
    await userEvent.click(canvas.getByRole('button', { name: /Other/ }))
    await userEvent.type(
      await canvas.findByRole('textbox', { name: 'Other' }),
      'A type column.{Enter}',
    )
    await expect(args.onAnswer).toHaveBeenCalledWith({ text: 'A type column.' })
    await waitFor(() => expect(canvas.queryByRole('textbox')).toBeNull())
    await expect(rowsOf(canvasElement)[3]).toHaveTextContent(/^DA type column\.$/)
  },
}

/**
 * Answered while you watched: the card the page pinned above the composer comes back to its place
 * in the thread answered, and its check draws itself there.
 */
export const AnsweredJustNow: Story = {
  args: { question: { ...CREDIT_NOTES, answer: { optionId: 'negative' } }, arrives: true },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    const chosen = canvas.getByRole('button', { name: /Negative rows/ })
    await expect(chosen).toHaveAttribute('aria-pressed', 'true')
    await expect(chosen.querySelector('svg path')).not.toBeNull()
  },
}

/**
 * Pinned: while it waits, the page draws the card above the composer (issue #130), where the
 * agent's words going on under it cannot carry it away.
 */
export const Pinned: Story = {
  render: (args) => (
    <Composer
      value=""
      onValueChange={fn()}
      files={[]}
      onFilesChange={fn()}
      onSearchFiles={async () => await Promise.resolve([])}
      onSend={async () => await Promise.resolve(null)}
      variant="inline"
      action="Send"
      placeholder="Say something to claude…"
      pinned={[{ id: args.question.id, content: <SpecQuestion {...args} /> }]}
    />
  ),
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    const area = canvas.getByRole('region', { name: 'Waiting for your answer' })
    await expect(within(area).getByRole('group', { name: /^Question: / })).toBeVisible()
    await expect(within(area).getByText(/^Blocking · /)).toBeVisible()
  },
}

/** What the agent wrote before it asked, enough of it for the thread to overflow its room. */
const EARLIER = Array.from({ length: 12 }, (_, index) => ({
  id: `earlier-${String(index)}`,
  content: (
    <AgentText
      text={`Step ${String(index + 1)} of the plan: the export reuses the invoice query of \`export.service.ts\`, streams its rows in the order the ledger imports them, and writes one line per invoice with its number, its date, its customer and its amount, the totals checked against the billing page before the file is handed over.`}
    />
  ),
}))

/**
 * A Session's chat as the page lays it out: the thread, the row of the turn under it, and the
 * composer with the question pinned above its box. Answered, the card leaves the pin and comes
 * back to its place in the thread, and the turn starts thinking again, as the page does. Asked
 * later, the question arrives in the pin on a press of `Ask`, which stands over the page and takes
 * none of its room.
 */
function ThreadWithAPinnedQuestion({
  asksLater = false,
  ...props
}: Parameters<typeof SpecQuestion>[0] & { asksLater?: boolean }): ReactNode {
  const [asked, setAsked] = useState(!asksLater)
  const [answer, setAnswer] = useState(props.question.answer)
  const card = (
    <SpecQuestion
      {...props}
      question={{ ...props.question, answer }}
      arrives
      onAnswer={(given) => {
        props.onAnswer(given)
        setAnswer(given)
      }}
    />
  )
  const entries: ScrollerEntry[] = [
    ...EARLIER,
    ...(answer === null ? [] : [{ id: props.question.id, content: card }]),
    {
      id: 'after',
      content: <AgentText text="One question blocks the plan; I wait for your answer." />,
    },
  ]
  return (
    <div className="relative flex h-screen min-h-0 flex-col bg-background text-foreground">
      {asksLater && (
        <div className="absolute top-2 right-2 z-1">
          <Button size="sm" onClick={() => setAsked(true)}>
            Ask
          </Button>
        </div>
      )}
      <MessageScroller className="flex-1" label="The thread of this Session" entries={entries} />
      <div className="mx-auto flex w-full max-w-3xl flex-col gap-2 px-6 pb-4">
        <TurnLine
          activity={answer === null ? { state: 'done', elapsedMs: 12_000 } : { state: 'thinking' }}
          usage={null}
        />
        <Composer
          value=""
          onValueChange={fn()}
          files={[]}
          onFilesChange={fn()}
          onSearchFiles={async () => await Promise.resolve([])}
          onSend={async () => await Promise.resolve(null)}
          variant="inline"
          action="Send"
          placeholder="Say something to claude…"
          running={answer !== null}
          pinned={asked && answer === null ? [{ id: props.question.id, content: card }] : []}
        />
      </div>
    </div>
  )
}

/**
 * Answered from the pin (issue #209): a press on a choice takes the card from above the composer
 * back to its place in the thread, and the thread does not move — no jump down and back.
 */
export const AnsweredFromThePin: Story = {
  parameters: { layout: 'fullscreen' },
  render: (args) => <ThreadWithAPinnedQuestion {...args} />,
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    const area = canvas.getByRole('region', { name: 'Waiting for your answer' })
    await expect(within(area).getByRole('group', { name: /^Question: / })).toBeVisible()
    const thread = canvas.getByRole('log', { name: 'The thread of this Session' })
    // The reader follows the end of the thread, the card pinned under it.
    await waitFor(() =>
      expect(thread.scrollHeight - thread.scrollTop - thread.clientHeight).toBeLessThanOrEqual(1),
    )
    const before = thread.scrollTop
    const tops = await topsThrough(thread, async () => {
      await userEvent.click(within(area).getByRole('button', { name: /Negative rows/ }))
      await waitFor(() =>
        expect(within(thread).getByRole('group', { name: /^You answered / })).toBeVisible(),
      )
    })
    // Never scrolled down: the thread did not jump by the card it took back.
    await expect(Math.max(...tops), 'the thread jumped down').toBeLessThanOrEqual(before)
    // And never slid back: from the frame the card is in the thread, the position holds. All the
    // thread gives is, at once, what the pin gave back beyond what the card takes in the thread.
    const settled = tops.at(-1)!
    await expect(
      tops.filter((top) => top !== before && top !== settled),
      'the thread slid',
    ).toEqual([])
    await expect(thread.scrollHeight - settled - thread.clientHeight).toBeLessThanOrEqual(1)
  },
}

/**
 * Where the thread is scrolled, read on every frame while `act` runs and for 45 frames after it,
 * longer than any fold or fade of the preset.
 */
async function topsThrough(thread: HTMLElement, act: () => Promise<void>): Promise<number[]> {
  const tops: number[] = []
  let reading = true
  const read = (): void => {
    tops.push(thread.scrollTop)
    if (reading) requestAnimationFrame(read)
  }
  requestAnimationFrame(read)
  await act()
  for (const _ of Array.from({ length: 45 })) {
    // oxlint-disable-next-line no-await-in-loop -- one frame after the other
    await nextFrame()
  }
  reading = false
  return tops
}

/**
 * Asked while the reader follows the thread (issue #209): the question takes its place in the pin
 * above the composer at once and fades in. The thread keeps its end in sight by moving once, in
 * the frame the card arrives, and never again: it is not dragged up the height of a card growing
 * under it frame by frame.
 */
export const ArrivesInThePin: Story = {
  parameters: { layout: 'fullscreen' },
  render: (args) => <ThreadWithAPinnedQuestion {...args} asksLater />,
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    const thread = canvas.getByRole('log', { name: 'The thread of this Session' })
    await waitFor(() =>
      expect(thread.scrollHeight - thread.scrollTop - thread.clientHeight).toBeLessThanOrEqual(1),
    )
    const before = thread.scrollTop
    const tops = await topsThrough(thread, async () => {
      await userEvent.click(canvas.getByRole('button', { name: 'Ask' }))
      // The pinned area is hidden while it is empty: it is found once the question is in it.
      const area = await canvas.findByRole('region', { name: 'Waiting for your answer' })
      await expect(within(area).getByRole('group', { name: /^Question: / })).toBeInTheDocument()
    })
    const settled = tops.at(-1)!
    await expect(
      tops.filter((top) => top !== before && top !== settled),
      'the thread was dragged',
    ).toEqual([])
    // Still following: the end of the thread is in sight above the card.
    await expect(thread.scrollHeight - settled - thread.clientHeight).toBeLessThanOrEqual(1)
  },
}

/**
 * Asked while the reader reads further up (issue #209): the card takes its place in the pin, and
 * what the reader is reading does not move at all.
 */
export const ArrivesInThePinScrolledUp: Story = {
  parameters: { layout: 'fullscreen' },
  render: (args) => <ThreadWithAPinnedQuestion {...args} asksLater />,
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    const thread = canvas.getByRole('log', { name: 'The thread of this Session' })
    await waitFor(() => expect(thread.scrollHeight).toBeGreaterThan(thread.clientHeight + 200))
    thread.scrollTop = 100
    await waitFor(() => expect(thread.scrollTop).toBe(100))
    const tops = await topsThrough(thread, async () => {
      await userEvent.click(canvas.getByRole('button', { name: 'Ask' }))
      // The pinned area is hidden while it is empty: it is found once the question is in it.
      const area = await canvas.findByRole('region', { name: 'Waiting for your answer' })
      await expect(within(area).getByRole('group', { name: /^Question: / })).toBeInTheDocument()
    })
    await expect(new Set(tops), 'the thread moved').toEqual(new Set([100]))
  },
}
