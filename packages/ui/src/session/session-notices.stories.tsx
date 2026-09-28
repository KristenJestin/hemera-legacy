import type { Meta, StoryObj } from '@storybook/react-vite'
import { type ReactNode, useEffect, useState } from 'react'
import { expect, fn, screen, userEvent, waitFor, within } from 'storybook/test'

import { Composer } from '../composer/composer.tsx'
import { Button } from '../components/button/button.tsx'
import { TooltipProvider } from '../components/tooltip/tooltip.tsx'
import { IconBookmarkPlus, IconShield } from '../icons.ts'
import { AgentText } from '../message/agent-text.tsx'
import { type NoticeGroup, SessionNotices } from './session-notices.tsx'
import { TurnLine } from './turn-line.tsx'

/**
 * The Session's notices at the foot of a Session (issue #237): the pill attached to the top edge
 * of the composer, over the row that says what the turn is doing and what it has spent, the
 * thread above it. Everything that waits for a human is in it, grouped by kind.
 *
 * The motion is checked frame by frame against a running Storybook (`Arrival`); the tests play
 * the states.
 */

/** Something waiting, as the page would hand it: a line and its answer. */
interface Waiting {
  id: string
  kind: 'permission' | 'proposal'
  line: string
}

const ASK: Waiting = { id: 'ask', kind: 'permission', line: 'pnpm vitest run csv.stream' }

const PROPOSED: Waiting[] = [
  { id: 'dev', kind: 'proposal', line: 'pnpm dev' },
  { id: 'test', kind: 'proposal', line: 'pnpm test' },
]

function Item({
  waiting,
  onAnswer,
}: {
  waiting: Waiting
  onAnswer: (id: string) => void
}): ReactNode {
  return (
    <div className="flex items-center gap-2">
      <span className="min-w-0 flex-1 font-mono text-xs">{waiting.line}</span>
      <Button variant="ghost" size="sm" onClick={() => onAnswer(waiting.id)}>
        Refuse
      </Button>
      <Button variant="primary" size="sm" onClick={() => onAnswer(waiting.id)}>
        Allow once
      </Button>
    </div>
  )
}

function groupsOf(waiting: readonly Waiting[], onAnswer: (id: string) => void): NoticeGroup[] {
  const of = (kind: Waiting['kind']) =>
    waiting
      .filter((one) => one.kind === kind)
      .map((one) => ({ id: one.id, content: <Item waiting={one} onAnswer={onAnswer} /> }))
  return [
    {
      kind: 'permission',
      label: 'Permissions',
      icon: <IconShield size="sm" aria-hidden="true" />,
      urgent: true,
      items: of('permission'),
    },
    {
      kind: 'proposal',
      label: 'Proposed commands',
      icon: <IconBookmarkPlus size="sm" aria-hidden="true" />,
      items: of('proposal'),
    },
  ]
}

const SAID = [
  'I read how the export streams its rows and where the currency is lost.',
  'The join on `invoice_lines` drops the rows whose currency is null; the stream then writes an empty column for them.',
  'I will run the CSV stream tests on their own before I change anything.',
]

/** One step of what arrives: after how long, and what waits from then on. */
interface Step {
  at: number
  waiting: Waiting[]
}

interface BenchProps {
  /** What waits as the Session is drawn. */
  waiting: Waiting[]
  /** What arrives or leaves after it, in order: the motion is judged on it. */
  script?: Step[] | undefined
  defaultOpen?: boolean | undefined
  onAnswer: (id: string) => void
}

/** The foot of a Session: the thread's end, the row above the box, the box, and the pill. */
function Bench({ waiting: first, script = [], defaultOpen, onAnswer }: BenchProps): ReactNode {
  const [waiting, setWaiting] = useState(first)
  useEffect(() => {
    const timers = script.map((step) => window.setTimeout(() => setWaiting(step.waiting), step.at))
    return () => timers.forEach((timer) => window.clearTimeout(timer))
  }, [])
  const answer = (id: string): void => {
    onAnswer(id)
    setWaiting((before) => before.filter((one) => one.id !== id))
  }
  return (
    <TooltipProvider>
      <div className="flex h-screen flex-col bg-background text-foreground">
        <div className="mx-auto flex w-full max-w-3xl flex-1 flex-col justify-end gap-3 px-6">
          {SAID.map((text) => (
            <AgentText key={text} text={text} />
          ))}
        </div>
        <div className="mx-auto flex w-full max-w-3xl flex-col gap-2 px-6 pt-4 pb-4">
          <TurnLine
            activity={{ state: 'waiting' }}
            usage={{ used: 12400, size: 200000, cost: { amount: 0.42, currency: 'EUR' } }}
            notched={waiting.length > 0}
          />
          <Composer
            value=""
            onValueChange={() => undefined}
            files={[]}
            onFilesChange={() => undefined}
            onSearchFiles={() => Promise.resolve([])}
            variant="inline"
            action="Send"
            placeholder="Say something to claude…"
            onSend={() => Promise.resolve(null)}
            running
            notices={
              <SessionNotices groups={groupsOf(waiting, answer)} defaultOpen={defaultOpen} />
            }
          />
        </div>
      </div>
    </TooltipProvider>
  )
}

const meta = {
  title: 'Blocks/Session/SessionNotices',
  component: Bench,
  tags: ['autodocs', 'new'],
  parameters: { layout: 'fullscreen' },
  args: { waiting: [ASK], onAnswer: fn() },
} satisfies Meta<typeof Bench>

export default meta

type Story = StoryObj<typeof meta>

const PILL = /^Waiting for your answer/

/** The pill's own box and the composer's, as the page lays them. */
function boxesOf(canvasElement: HTMLElement) {
  const canvas = within(canvasElement)
  const pill = canvas.getByRole('button', { name: PILL }).getBoundingClientRect()
  const field = canvas.getByRole('textbox', { name: 'Say something to claude…' })
  // The frame is the box's rim: the first ancestor of the field that wears a border all round.
  let rim: HTMLElement | null = field
  while (rim !== null && !rim.className.includes('bg-surface-rim')) rim = rim.parentElement
  if (rim === null) throw new Error('the composer has no rim')
  return { pill, box: rim.getBoundingClientRect() }
}

/**
 * Closed, as it always opens: the kind's mark and its count on the composer's top edge, and not a
 * word of what waits until it is pressed.
 */
export const Closed: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    const pill = await canvas.findByRole('button', {
      name: 'Waiting for your answer: Permissions 1',
    })
    expect(pill).toHaveTextContent('1')
    expect(canvas.queryByText(ASK.line)).toBeNull()
    expect(screen.queryByRole('dialog')).toBeNull()
    // On the top edge of the box, centred on it, once it has risen.
    await waitFor(() => {
      const { pill: face, box } = boxesOf(canvasElement)
      expect(Math.abs(face.bottom - box.top)).toBeLessThan(1)
      expect(Math.abs(face.left + face.width / 2 - (box.left + box.width / 2))).toBeLessThan(1)
    })
  },
}

/** Pressed, it opens above itself on what waits, grouped by kind, each with its answer. */
export const Opened: Story = {
  args: { waiting: [ASK, ...PROPOSED] },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    const pill = await canvas.findByRole('button', {
      name: 'Waiting for your answer: Permissions 1, Proposed commands 2',
    })
    await userEvent.click(pill)
    const panel = await screen.findByRole('dialog', { name: 'Waiting for your answer' })
    const groups = within(panel).getAllByRole('region')
    expect(groups.map((group) => group.getAttribute('aria-label'))).toEqual([
      'Permissions',
      'Proposed commands',
    ])
    await waitFor(() => {
      expect(within(panel).getByText(ASK.line)).toBeVisible()
    })
    // Above the pill, never over it.
    await waitFor(() => {
      expect(panel.getBoundingClientRect().bottom).toBeLessThanOrEqual(
        pill.getBoundingClientRect().top,
      )
    })
  },
}

/** The last thing answered: the item leaves, and the pill goes back behind the composer. */
export const LastAnswered: Story = {
  play: async ({ canvasElement, args }) => {
    const canvas = within(canvasElement)
    await userEvent.click(await canvas.findByRole('button', { name: PILL }))
    const panel = await screen.findByRole('dialog', { name: 'Waiting for your answer' })
    await userEvent.click(within(panel).getByRole('button', { name: 'Allow once' }))
    expect(args.onAnswer).toHaveBeenCalledWith(ASK.id)
    await waitFor(() => {
      expect(canvas.queryByRole('button', { name: PILL })).toBeNull()
    })
    await waitFor(() => {
      expect(screen.queryByRole('dialog')).toBeNull()
    })
  },
}

/** Nothing waits: there is no pill at all, and the row above the box is whole. */
export const NothingWaits: Story = {
  args: { waiting: [] },
  play: async ({ canvasElement }) => {
    expect(within(canvasElement).queryByRole('button', { name: PILL })).toBeNull()
  },
}

/**
 * What the motion is judged on: a permission arrives and the pill rises out of the composer and
 * pops; two proposals join it while it is closed, and it pops again without opening; then all is
 * answered and it slides back behind the composer.
 */
export const Arrival: Story = {
  args: {
    waiting: [],
    script: [
      { at: 800, waiting: [ASK] },
      { at: 2600, waiting: [ASK, ...PROPOSED] },
      { at: 4400, waiting: [] },
    ],
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await waitFor(
      () => {
        expect(canvas.getByRole('button', { name: /Proposed commands 2$/ })).toBeVisible()
      },
      { timeout: 4000 },
    )
    // A new arrival while closed does not open it.
    expect(screen.queryByRole('dialog')).toBeNull()
    await waitFor(
      () => {
        expect(canvas.queryByRole('button', { name: PILL })).toBeNull()
      },
      { timeout: 4000 },
    )
  },
}
