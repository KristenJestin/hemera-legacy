import { type ReactNode, useEffect, useRef, useState } from 'react'

import { IconButton } from '../../components/button/button.tsx'
import { StatusDot } from '../../components/status-dot/status-dot.tsx'
import { Tooltip } from '../../components/tooltip/tooltip.tsx'
import { IconMessage } from '../../icons.ts'
import { instant, useTransition } from '../../motion.ts'
import { Arrive } from './arrive.tsx'
import { CommentBox } from './comment-box.tsx'
import { FeedbackNote } from './feedback-note.tsx'
import type { FeedbackAnchor, FeedbackKind, ReviewRound, RoundFeedback } from './model.ts'

/**
 * The Spec review, story by story: what the round is judged against.
 *
 * Each story of the frozen revision, its sentence, and its criteria in order; each criterion with
 * a dot — shown met or not — and the evidence that shows it, the test or the check, in a line. The
 * hand leaves a feedback on a story or on one criterion from the speech mark at its end, and what
 * was left there stands under it.
 */

/** Where a box is open: on a story, or on one of its criteria. */
interface Opened {
  storyId: string
  criterion: number | null
}

const STORY = 'flex flex-col gap-3 border-b border-border px-6 py-5 last:border-b-0'

const STORY_HEAD = 'flex items-baseline gap-2'

const KEY = 'font-mono text-xs text-muted-foreground'

const CRITERION = 'group flex items-start gap-2.5 rounded-md px-2 py-1.5 hover:bg-accent'

const EVIDENCE = 'text-xs text-muted-foreground'

const NOTES = 'flex flex-col gap-1.5 pl-6'

export interface SpecReviewProps {
  round: ReviewRound
  feedback: readonly RoundFeedback[]
  lit: string | null
  /** A feedback on the Spec the list sent the reader to. */
  target: { id: string; nonce: number } | null
  writable: boolean
  onComment: (kind: FeedbackKind, body: string, anchor: FeedbackAnchor) => void
  onToggle: (id: string) => void
}

export function SpecReview({
  round,
  feedback,
  lit,
  target,
  writable,
  onComment,
  onToggle,
}: SpecReviewProps): ReactNode {
  const [opened, setOpened] = useState<Opened | null>(null)
  const scroller = useRef<HTMLDivElement>(null)
  const moving = useTransition()

  useEffect(() => {
    if (target === null) return
    const note = scroller.current?.querySelector(`[data-feedback="${target.id}"]`)
    note?.scrollIntoView({ block: 'center', behavior: moving === instant ? 'instant' : 'smooth' })
  }, [target])

  function notesOn(storyId: string, criterion: number | null): RoundFeedback[] {
    return feedback.filter(
      (one) =>
        one.anchor?.kind === 'spec' &&
        one.anchor.storyId === storyId &&
        one.anchor.criterion === criterion,
    )
  }

  function box(storyId: string, criterion: number | null, where: string): ReactNode {
    if (opened?.storyId !== storyId || opened.criterion !== criterion) return null
    return (
      <Arrive>
        <CommentBox
          label={`Comment on ${where}`}
          placeholder="Say what the build missed here…"
          autoFocus
          onCancel={() => setOpened(null)}
          onSubmit={(kind, body) => {
            onComment(kind, body, { kind: 'spec', storyId, criterion })
            setOpened(null)
          }}
        />
      </Arrive>
    )
  }

  function speak(storyId: string, criterion: number | null, where: string): ReactNode {
    if (!writable) return null
    return (
      <Tooltip label={`Comment on ${where}`}>
        <IconButton
          variant="ghost"
          size="sm"
          icon={<IconMessage size="sm" />}
          aria-label={`Comment on ${where}`}
          onClick={() => setOpened({ storyId, criterion })}
        />
      </Tooltip>
    )
  }

  return (
    <div
      ref={scroller}
      role="region"
      aria-label={`Spec of ${round.specKey}`}
      className="min-h-0 flex-1 overflow-y-auto"
    >
      <div className="mx-auto flex max-w-3xl flex-col">
        {round.stories.map((story) => {
          const verdicts = round.verdicts.get(story.id) ?? []
          const onStory = notesOn(story.id, null)
          return (
            <article key={story.id} aria-label={`${story.key} ${story.title}`} className={STORY}>
              <header className={STORY_HEAD}>
                <span className={KEY}>{story.key}</span>
                <h3 className="flex-1 text-base font-medium">{story.title}</h3>
                {speak(story.id, null, story.key)}
              </header>
              <p className="text-sm text-muted-foreground">{story.narrative}</p>
              {onStory.length > 0 && (
                <div className="flex flex-col gap-1.5">
                  {onStory.map((one) => (
                    <FeedbackNote
                      key={one.id}
                      feedback={one}
                      lit={lit === one.id}
                      onToggle={writable ? onToggle : undefined}
                    />
                  ))}
                </div>
              )}
              {box(story.id, null, story.key)}
              <ol className="flex flex-col gap-1">
                {story.criteria.map((criterion, index) => {
                  const verdict = verdicts[index]
                  const where = `${story.key} · ${String(index + 1)}`
                  const notes = notesOn(story.id, index)
                  return (
                    <li key={criterion} className="flex flex-col gap-1.5">
                      <div className={CRITERION}>
                        <span className="mt-1.5 flex">
                          <StatusDot
                            status={verdict?.met === true ? 'success' : 'failure'}
                            label={verdict?.met === true ? 'Shown met' : 'Not shown met'}
                          />
                        </span>
                        <div className="flex min-w-0 flex-1 flex-col gap-0.5">
                          <span className="text-sm">{criterion}</span>
                          {verdict !== undefined && (
                            <span className={EVIDENCE}>{verdict.evidence}</span>
                          )}
                        </div>
                        {speak(story.id, index, where)}
                      </div>
                      {notes.length > 0 && (
                        <div className={NOTES}>
                          {notes.map((one) => (
                            <FeedbackNote
                              key={one.id}
                              feedback={one}
                              lit={lit === one.id}
                              onToggle={writable ? onToggle : undefined}
                            />
                          ))}
                        </div>
                      )}
                      {opened?.storyId === story.id && opened.criterion === index && (
                        <div className={NOTES}>{box(story.id, index, where)}</div>
                      )}
                    </li>
                  )
                })}
              </ol>
            </article>
          )
        })}
      </div>
    </div>
  )
}
