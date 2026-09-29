import { AnimatePresence, motion } from 'motion/react'
import { type ReactNode, useState } from 'react'

import { COMMAND_TYPE_ICONS } from '../../activity/command-type.ts'
import { Composer } from '../../composer/composer.tsx'
import { Button } from '../../components/button/button.tsx'
import { TooltipProvider } from '../../components/tooltip/tooltip.tsx'
import { IconBookmarkPlus, IconMessageQuestion, IconShield } from '../../icons.ts'
import { AgentText } from '../../message/agent-text.tsx'
import { collapse, expand, fold, useTransition } from '../../motion.ts'
import { TurnLine } from '../../session/turn-line.tsx'
import type { Kind, Waiting } from './fixtures.ts'

/**
 * What the variants of the notices' panel share (review of #250): the Session's foot with the
 * yellow pill the maintainer kept, what each kind is called and marked with, its two answers, and
 * what grows by its height. Only the panel differs from one variant to the next.
 */

/** What each kind is, said once: its mark, its tint, and the verbs of its two answers. */
export const KINDS: Record<
  Kind,
  { icon: ReactNode; name: string; mark: string; refuse: string; accept: string }
> = {
  permission: {
    icon: <IconShield size="sm" aria-hidden="true" />,
    name: 'Run once',
    mark: 'flex size-control-sm shrink-0 items-center justify-center rounded-md bg-warning-muted text-warning-muted-foreground',
    refuse: 'Refuse',
    accept: 'Allow once',
  },
  proposal: {
    icon: <IconBookmarkPlus size="sm" aria-hidden="true" />,
    name: 'Add to the catalogue',
    mark: 'flex size-control-sm shrink-0 items-center justify-center rounded-md bg-primary-muted text-primary-muted-foreground',
    refuse: 'Decline',
    accept: 'Add',
  },
  question: {
    icon: <IconMessageQuestion size="sm" aria-hidden="true" />,
    name: 'Questions',
    mark: 'flex size-control-sm shrink-0 items-center justify-center rounded-md bg-info-muted text-info-muted-foreground',
    refuse: '',
    accept: '',
  },
}

export const ORDER: readonly Kind[] = ['permission', 'question', 'proposal']

/** The kind's mark in its own tint: what tells the kinds apart at a glance. */
export function KindMark({ kind }: { kind: Kind }): ReactNode {
  return (
    <span className={KINDS[kind].mark} title={KINDS[kind].name}>
      {KINDS[kind].icon}
    </span>
  )
}

/** What an item is about, in one line: a proposal's name, the question, or the line itself. */
export function headOf(item: Waiting): string {
  if (item.kind === 'proposal') return item.name
  if (item.kind === 'question') return item.question
  return item.line
}

/** The type of a proposal with its fixed icon, before its name. */
export function TypeMark({ item }: { item: Waiting }): ReactNode {
  if (item.kind !== 'proposal') return null
  const TypeIcon = COMMAND_TYPE_ICONS[item.type]
  return (
    <span className="flex shrink-0 text-muted-foreground">
      <TypeIcon size="sm" aria-hidden="true" />
    </span>
  )
}

/** The two answers, the same everywhere: the quiet refusal, then the primary acceptance. */
export function Answers({ item, onAnswer }: { item: Waiting; onAnswer: () => void }): ReactNode {
  if (item.kind === 'question') return null
  const kind = KINDS[item.kind]
  return (
    <span className="flex shrink-0 items-center gap-1">
      <Button variant="ghost" size="sm" onClick={onAnswer}>
        {kind.refuse}
      </Button>
      <Button variant="primary" size="sm" onClick={onAnswer}>
        {kind.accept}
      </Button>
    </span>
  )
}

/** A question's answers: its choices, lettered, one press each. */
export function Choices({ item, onAnswer }: { item: Waiting; onAnswer: () => void }): ReactNode {
  if (item.kind !== 'question') return null
  return (
    <ul aria-label="Answers" className="flex flex-col gap-0.5">
      {item.choices.map((choice, index) => (
        <li key={choice.id}>
          <button
            type="button"
            className="flex w-full items-center gap-3 rounded-md px-2 py-1.5 text-left text-sm outline-none hover:bg-muted focus-ring"
            onClick={onAnswer}
          >
            <span className="flex size-5 shrink-0 items-center justify-center rounded-sm border border-border font-mono text-xs text-muted-foreground">
              {String.fromCodePoint(65 + index)}
            </span>
            {choice.label}
          </button>
        </li>
      ))}
    </ul>
  )
}

/** The line whole, and where it runs when that is not the Workspace root. */
export function Whole({ item }: { item: Waiting }): ReactNode {
  if (item.kind === 'question') return null
  return (
    <div className="flex flex-col gap-1">
      <pre className="rounded-md bg-muted px-2 py-1 font-mono text-xs break-all whitespace-pre-wrap text-foreground">
        {item.line}
      </pre>
      {item.place !== undefined && (
        <span className="text-xs text-muted-foreground">{`In ${item.place}`}</span>
      )}
    </div>
  )
}

/** What arrives and leaves by its height. */
export function Grow({ children }: { children: ReactNode }): ReactNode {
  const transition = useTransition(fold)
  return (
    <motion.div
      className="overflow-hidden"
      initial={collapse}
      animate={expand}
      exit={collapse}
      transition={transition}
    >
      {children}
    </motion.div>
  )
}

/** The yellow pill as the maintainer kept it: a mark and a count a kind. */
export function Pill({
  waiting,
  open,
  onPress,
}: {
  waiting: readonly Waiting[]
  open: boolean
  onPress: () => void
}): ReactNode {
  return (
    <span className="pb-2.5">
      <button
        type="button"
        aria-expanded={open}
        aria-label="Waiting for your answer"
        className="relative isolate inline-flex h-control-md items-center gap-3 overflow-hidden rounded-full border border-warning bg-card px-4 text-sm font-semibold text-warning-muted-foreground shadow-md outline-none focus-ring"
        onClick={onPress}
      >
        <span aria-hidden="true" className="absolute inset-0 -z-10 bg-warning-muted" />
        {ORDER.map((kind) => {
          const count = waiting.filter((one) => one.kind === kind).length
          if (count === 0) return null
          return (
            <span key={kind} className="flex items-center gap-1.5">
              {KINDS[kind].icon}
              <span className="font-mono">{String(count)}</span>
            </span>
          )
        })}
      </button>
    </span>
  )
}

const SAID = [
  'I read how the export streams its rows and where the currency is lost.',
  'The join on `invoice_lines` drops the rows whose currency is null; the stream then writes an empty column for them.',
  'Before I change anything I will run the CSV stream tests on their own, and I propose the commands this Project lacks.',
]

/**
 * The panel of a variant, handed what waits, whether it is open, and the answer: it draws itself
 * over the Session's foot, anchored as it chooses — above the pill, or over the composer's edge.
 */
export type Panel = (props: {
  waiting: readonly Waiting[]
  open: boolean
  onClose: () => void
  onAnswer: (id: string) => void
}) => ReactNode

/**
 * A Session's foot: the thread's end, the row above the box, the box, the pill on its edge, and
 * the variant's panel. What is answered leaves; the panel closes once nothing waits.
 */
export function Stage({
  panel: Drawn,
  waiting: first,
  defaultOpen = true,
}: {
  panel: Panel
  waiting: readonly Waiting[]
  defaultOpen?: boolean | undefined
}): ReactNode {
  const [waiting, setWaiting] = useState(first)
  const [open, setOpen] = useState(defaultOpen)
  const answer = (id: string): void => {
    const left = waiting.filter((one) => one.id !== id)
    setWaiting(left)
    if (left.length === 0) setOpen(false)
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
              waiting.length === 0 ? undefined : (
                <div className="pointer-events-auto relative flex w-full justify-center">
                  <Pill waiting={waiting} open={open} onPress={() => setOpen(!open)} />
                  <Drawn
                    waiting={waiting}
                    open={open}
                    onClose={() => setOpen(false)}
                    onAnswer={answer}
                  />
                </div>
              )
            }
          />
        </div>
      </div>
    </TooltipProvider>
  )
}

/** Whatever opens above the pill: centred on it, a panel's width, arriving by its height. */
export function AbovePill({ open, children }: { open: boolean; children: ReactNode }): ReactNode {
  return (
    <div className="absolute inset-x-0 bottom-full flex justify-center pb-2">
      <AnimatePresence initial={false}>
        {open && (
          <Grow key="panel">
            <div className="flex max-h-pinned w-notices flex-col overflow-y-auto rounded-lg border border-border bg-card p-3 shadow-lg">
              {children}
            </div>
          </Grow>
        )}
      </AnimatePresence>
    </div>
  )
}
