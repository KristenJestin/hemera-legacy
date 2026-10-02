import { animate, useMotionValue } from 'motion/react'
import { type ReactNode, useEffect, useLayoutEffect, useRef, useState } from 'react'

import { Composer } from '../../composer/composer.tsx'
import { IconButton } from '../../components/button/button.tsx'
import { StatusDot } from '../../components/status-dot/status-dot.tsx'
import { Tooltip } from '../../components/tooltip/tooltip.tsx'
import { IconChevronLeft, IconChevronRight, IconMessage } from '../../icons.ts'
import { AgentText } from '../../message/agent-text.tsx'
import { MessageScroller, type ScrollerEntry } from '../../message/scroller/scroller.tsx'
import { instant, morph, useTransition } from '../../motion.ts'
import { SessionHeader } from '../../session/session.tsx'
import { MissionBrief } from '../../spec/mission-brief.tsx'
import { DELIVERY, FIX_GROUPS } from './fixtures.ts'
import {
  type Feedback,
  type FixGroup,
  type ReviewResult,
  type Shot,
  type Standing,
  readsAsQuestion,
  staleOf,
  tasksOf,
} from './model.ts'
import { Gestures } from './parts.tsx'

/** Where a story opens the round. */
export interface RoundStart {
  result: ReviewResult
  feedback: readonly Feedback[]
  standing: Standing
  /** Whether the fix pass was already asked for. */
  fixing: boolean
  /** Whether the chat opens folded to its band. */
  chatFolded: boolean
}

/** What every variant is handed. */
export interface VariantProps {
  start: RoundStart
}

/** The round as the page holds it: the result, the feedback, the fix pass, the three gestures. */
export interface Round {
  result: ReviewResult
  feedback: Feedback[]
  add: (text: string, shots: Shot[]) => void
  remove: (id: string) => void
  /** The feedback the fix pass would take: every remark, no question. */
  tasks: Feedback[]
  fixing: boolean
  groups: FixGroup[]
  fix: () => void
  standing: Standing
  stale: boolean
  retake: () => void
  gestures: ReactNode
}

/** The round's state, as the engine would hold it; the stories play it here. */
export function useRound(start: RoundStart): Round {
  const [result, setResult] = useState(start.result)
  const [feedback, setFeedback] = useState<Feedback[]>([...start.feedback])
  const [fixing, setFixing] = useState(start.fixing)
  const [standing, setStanding] = useState<Standing>(start.standing)
  const counter = useRef(0)
  const stale = staleOf(result).length > 0
  const tasks = tasksOf(feedback)
  const groups: FixGroup[] = fixing
    ? [
        ...FIX_GROUPS.filter((group) =>
          group.sources.every((id) => tasks.some((t) => t.id === id)),
        ),
        ...tasks
          .filter((one) => !FIX_GROUPS.some((group) => group.sources.includes(one.id)))
          .map((one) => ({ id: `fix-${one.id}`, title: one.text, sources: [one.id] })),
      ]
    : []

  function add(text: string, shots: Shot[]): void {
    counter.current += 1
    setFeedback((was) => [
      ...was,
      {
        id: `new-${String(counter.current)}`,
        text,
        shots,
        question: readsAsQuestion(text),
        answer: null,
      },
    ])
  }

  const gestures = (
    <Gestures
      specKey={result.specKey}
      standing={standing}
      delivery={DELIVERY}
      acceptRefused={stale || fixing}
      onAccept={() => setStanding('accepted')}
      onDeliver={() => setStanding('delivered')}
      onClose={() => setStanding('closed')}
    />
  )

  return {
    result,
    feedback,
    add,
    remove: (id) => setFeedback((was) => was.filter((one) => one.id !== id)),
    tasks,
    fixing,
    groups,
    fix: () => setFixing(true),
    standing,
    stale,
    retake: () =>
      setResult((was) => ({
        ...was,
        repositories: was.repositories.map((one) => ({ ...one, stale: [] })),
      })),
    gestures,
  }
}

/** The thread of the build Session once the review round opened. */
export function thread(result: ReviewResult): ScrollerEntry[] {
  return [
    {
      id: 'brief',
      content: (
        <MissionBrief
          title="What the agent was told · Review"
          detail="10:44"
          brief={`**Review** · round ${String(result.round)} of \`${result.specKey}\` is open: answer questions, change nothing until the fix pass.`}
        />
      ),
    },
    {
      id: 'said',
      content: (
        <AgentText
          text={
            result.git
              ? 'Every story is done and the final checks are green. Three reviewers read the diff: their three findings are fixed in `e18a5f0` and `4be2d13`. The readmes and the usage page changed with the code.'
              : 'Every story is done and the final checks are green. There is no Git history here, so no reviewer read a diff: the page is yours to try.'
          }
        />
      ),
    },
  ]
}

const HEAD = 'mx-auto w-full max-w-3xl px-6 pt-6 pb-4'

const FOOT = 'mx-auto flex w-full max-w-3xl flex-col gap-2 px-6 pb-4'

/** The chat of the Session: its head, its thread and, unless told otherwise, its composer. */
export function Chat({
  result,
  foot,
}: {
  result: ReviewResult
  /** What stands in the composer's place, for a variant that writes the feedback there. */
  foot?: ReactNode
}): ReactNode {
  const [value, setValue] = useState('')
  const [files, setFiles] = useState<string[]>([])
  return (
    <div className="flex h-full min-h-0 min-w-0 flex-col">
      <div className={HEAD}>
        <SessionHeader title={`Build ${result.specTitle}`} onRename={() => undefined} />
      </div>
      <MessageScroller
        className="flex-1"
        label="The thread of this Session"
        entries={thread(result)}
      />
      <div className={FOOT}>
        {foot ?? (
          <Composer
            value={value}
            onValueChange={setValue}
            files={files}
            onFilesChange={setFiles}
            onSearchFiles={() => Promise.resolve([])}
            variant="inline"
            action="Send"
            placeholder="Say something to the agent…"
            onSend={() => Promise.resolve(null)}
          />
        )}
      </div>
    </div>
  )
}

const SLOT = 'build-slot relative min-h-0 shrink-0 overflow-hidden border-r border-border'

const OPEN = 'absolute inset-y-0 left-0 flex w-build-panel flex-col bg-surface-content'

const BAND =
  'absolute inset-y-0 left-0 z-10 flex w-build-band flex-col items-center gap-3 bg-surface-content pt-2 text-muted-foreground'

/**
 * The chat in its slot on the row's left, which folds to a band so the review takes the row.
 *
 * The slot is the build panel's own (`build-slot`): a band, or a share of the row, and every
 * width between written on each frame of the fold, so what is beside it is pushed as it moves.
 * What it holds is laid at its unfolded width and clipped, so nothing in it reflows on the way.
 */
export function ChatSlot({
  defaultFolded,
  band,
  children,
}: {
  defaultFolded: boolean
  /** What the band says beside its unfold, when there is something to say. */
  band?: ReactNode
  children: ReactNode
}): ReactNode {
  const [folded, setFolded] = useState(defaultFolded)
  const [moving, setMoving] = useState(false)
  const slot = useRef<HTMLElement>(null)
  const width = useTransition(morph)
  const open = useMotionValue(defaultFolded ? 0 : 1)
  const refocus = useRef(false)

  function pose(share: number): void {
    slot.current?.style.setProperty('--build-open', String(share))
  }

  function fold(next: boolean): void {
    if (folded === next) return
    refocus.current = slot.current?.contains(document.activeElement) ?? false
    setFolded(next)
    setMoving(true)
  }

  useLayoutEffect(() => {
    pose(open.get())
  }, [])

  useLayoutEffect(() => {
    const target = folded ? 0 : 1
    if (open.get() === target) return
    if (width === instant) {
      open.jump(target)
      pose(target)
      setMoving(false)
      return
    }
    let live = true
    const travel = animate(open, target, { ...width, onUpdate: pose })
    void travel.then(() => {
      if (live) setMoving(false)
    })
    return () => {
      live = false
      travel.stop()
    }
  }, [folded])

  useEffect(() => {
    if (!refocus.current) return
    refocus.current = false
    const target = folded ? '[data-unfold-chat]' : '[data-fold-chat]'
    slot.current?.querySelector<HTMLElement>(target)?.focus()
  }, [folded])

  return (
    <section ref={slot} aria-label="Chat" className={SLOT}>
      {(!folded || moving) && (
        <div inert={folded} aria-hidden={folded ? true : undefined} className={OPEN}>
          <span className="absolute top-2 left-2 z-10 flex">
            <Tooltip label="Fold the chat">
              <IconButton
                variant="ghost"
                size="sm"
                icon={<IconChevronLeft size="sm" />}
                aria-label="Fold the chat"
                data-fold-chat
                onClick={() => fold(true)}
              />
            </Tooltip>
          </span>
          {children}
        </div>
      )}
      {folded && (
        <div className={BAND}>
          <Tooltip label="Unfold the chat" side="right">
            <IconButton
              variant="ghost"
              size="sm"
              icon={<IconChevronRight size="sm" />}
              aria-label="Unfold the chat"
              data-unfold-chat
              onClick={() => fold(false)}
            />
          </Tooltip>
          <IconMessage size="md" aria-hidden="true" />
          {band}
        </div>
      )}
    </section>
  )
}

/** The dot of the band while a question of the round waits for its answer. */
export function AnswerDot({ feedback }: { feedback: readonly Feedback[] }): ReactNode {
  const waiting = feedback.some((one) => one.question && one.answer === null)
  return waiting ? <StatusDot status="running" label="A question is being answered" /> : null
}

/** The row every variant is drawn in: the Session's width, measured as a container. */
export const ROW = '@container flex h-screen min-h-0 bg-background text-foreground'
