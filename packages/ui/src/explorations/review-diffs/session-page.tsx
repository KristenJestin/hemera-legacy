import { animate, useMotionValue } from 'motion/react'
import { type ReactNode, useLayoutEffect, useRef, useState } from 'react'

import { Composer } from '../../composer/composer.tsx'
import { IconButton } from '../../components/button/button.tsx'
import { Tooltip } from '../../components/tooltip/tooltip.tsx'
import { IconChevronLeft, IconChevronRight } from '../../icons.ts'
import { AgentText } from '../../message/agent-text.tsx'
import { MessageScroller, type ScrollerEntry } from '../../message/scroller/scroller.tsx'
import { instant, morph, useTransition } from '../../motion.ts'
import { SessionHeader } from '../../session/session.tsx'
import { MissionBrief } from '../../spec/mission-brief.tsx'
import { Review, type ReviewStart } from './review.tsx'

/**
 * The build Session's page with its review open (exploration of issue #271).
 *
 * The page every Session has — the chat, its thread and its composer — and the build's panel on
 * its right, where the round is reviewed. Beside the chat the panel is its share of the row, as
 * the build panel is today. Widened, it goes over the chat to the whole row, the way the define
 * panel's Spec takes the room it needs: the chat stays laid where it was under it, untouched, and
 * the chevron at the head's end brings the panel back beside it.
 *
 * The width is what moves: how far over the chat the panel is, from 0 (beside) to 1 (the whole
 * row), written on the slot every frame as `--review-wide`, which its width is drawn from.
 */

const ROW = '@container relative flex h-full min-h-0 w-full'

/** The chat, laid beside the panel's share of the row whatever the panel's width. */
const CHAT = 'flex h-full min-h-0 min-w-0 flex-1 flex-col'

const CHAT_HEAD = 'mx-auto w-full max-w-3xl px-6 pt-6 pb-4'

const CHAT_FOOT = 'mx-auto flex w-full max-w-3xl flex-col gap-2 px-6 pb-4'

/** Where the panel stands beside the chat, which the chat never enters. */
const BESIDE = 'w-build-panel shrink-0'

const SLOT =
  'absolute inset-y-0 right-0 flex flex-col border-l border-border bg-surface-content shadow-lg'

function thread(start: ReviewStart): ScrollerEntry[] {
  return [
    {
      id: 'brief',
      content: (
        <MissionBrief
          title="What the agent was told · Review"
          detail="10:44"
          brief={`**Review** · round ${String(start.round.number)} of \`${start.round.specKey}\` is open: answer questions, change nothing until the fix pass.`}
        />
      ),
    },
    {
      id: 'said',
      content: (
        <AgentText text="Every story is done and the final checks are green. Three reviewers read the diff: their three findings are fixed in `e18a5f0` and `4be2d13`. The readmes and the usage page changed with the code." />
      ),
    },
  ]
}

function Chat({ start }: { start: ReviewStart }): ReactNode {
  const [value, setValue] = useState('')
  const [files, setFiles] = useState<string[]>([])
  return (
    <div className={CHAT}>
      <div className={CHAT_HEAD}>
        <SessionHeader title={`Build ${start.round.specTitle}`} onRename={() => undefined} />
      </div>
      <MessageScroller
        className="flex-1"
        label="The thread of this Session"
        entries={thread(start)}
      />
      <div className={CHAT_FOOT}>
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
      </div>
    </div>
  )
}

export interface SessionPageProps {
  start: ReviewStart
  /** Whether the review opens over the chat, the whole row wide. */
  wide: boolean
}

export function SessionPage({ start, wide: startWide }: SessionPageProps): ReactNode {
  const [wide, setWide] = useState(startWide)
  const slot = useRef<HTMLElement>(null)
  const share = useMotionValue(startWide ? 1 : 0)
  const width = useTransition(morph)

  function pose(value: number): void {
    slot.current?.style.setProperty('--review-wide', String(value))
  }

  useLayoutEffect(() => {
    pose(share.get())
  }, [])

  useLayoutEffect(() => {
    const target = wide ? 1 : 0
    if (share.get() === target) return
    if (width === instant) {
      share.jump(target)
      pose(target)
      return
    }
    const travel = animate(share, target, { ...width, onUpdate: pose })
    return () => travel.stop()
  }, [wide])

  const toggle = (
    <Tooltip label={wide ? 'Back beside the chat' : 'Over the chat'} side="left">
      <IconButton
        variant="ghost"
        size="sm"
        icon={wide ? <IconChevronRight size="sm" /> : <IconChevronLeft size="sm" />}
        aria-label={wide ? 'Back beside the chat' : 'Over the chat'}
        aria-pressed={wide}
        data-wide-toggle
        onClick={() => setWide((was) => !was)}
      />
    </Tooltip>
  )

  return (
    <div className={ROW}>
      <div inert={wide} aria-hidden={wide ? true : undefined} className={CHAT}>
        <Chat start={start} />
      </div>
      <div className={BESIDE} />
      <section
        ref={slot}
        data-review-slot=""
        aria-label={`Review of ${start.round.specKey}`}
        className={SLOT}
      >
        <Review start={start} controls={toggle} />
      </section>
    </div>
  )
}
