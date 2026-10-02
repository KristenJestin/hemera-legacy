import { AnimatePresence } from 'motion/react'
import type { ReactNode } from 'react'

import { IconMessage } from '../../icons.ts'
import { staleOf } from './model.ts'
import { AnswerDot, Chat, ChatSlot, ROW, type VariantProps, useRound } from './page.tsx'
import {
  Docs,
  Evidence,
  FeedbackBox,
  FeedbackList,
  FixGroups,
  FixThese,
  Fold,
  ResultCards,
  RoundState,
  StaleStrip,
} from './parts.tsx'

/**
 * B · Review mode. The round takes the Session's row: the build panel's frame gives way to a
 * page of its own, the chat folded to its band on the left. The head across the row holds the
 * round and the three gestures; under it the result reads on the left, the repositories side by
 * side, and the feedback has a column of its own on the right, the box on top, the list under
 * it and "Fix these" in its head, all of it seen beside the result it is about.
 */

const MAIN = 'flex min-h-0 min-w-0 flex-1 flex-col bg-surface-content'

const HEAD = 'flex shrink-0 flex-col gap-2 border-b border-border px-6 pt-5 pb-4'

const HEAD_LINE = 'flex min-w-0 items-center gap-3'

const BODY =
  '@container scroll-quiet flex min-h-0 min-w-0 flex-1 flex-col gap-6 overflow-y-auto px-6 py-5 outline-none focus-ring'

const PAIR = 'grid grid-cols-1 items-start gap-6 @3xl:grid-cols-2'

const SIDE = 'flex min-h-0 w-menu-panel shrink-0 flex-col border-l border-border'

const SIDE_HEAD = 'flex shrink-0 items-center gap-2 px-4 pt-4 pb-2 text-sm font-medium'

const SIDE_BODY = 'scroll-quiet flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto px-4 pb-4'

export function ModeSession({ start }: VariantProps): ReactNode {
  const round = useRound(start)
  const { result } = round
  return (
    <div className={ROW}>
      <ChatSlot defaultFolded={start.chatFolded} band={<AnswerDot feedback={round.feedback} />}>
        <Chat result={result} />
      </ChatSlot>
      <main aria-label={`Review of ${result.specKey}`} className={MAIN}>
        <header className={HEAD}>
          <div className={HEAD_LINE}>
            <span className="shrink-0 font-mono text-xs text-muted-foreground">
              {result.specKey}
            </span>
            <h1 className="min-w-0 truncate text-xl font-medium">{result.specTitle}</h1>
            <span className="ml-auto flex">{round.gestures}</span>
          </div>
          <RoundState
            round={result.round}
            stale={round.stale}
            fixing={round.fixing}
            standing={round.standing}
          />
        </header>
        <div className="flex min-h-0 flex-1">
          <div className={BODY} role="region" tabIndex={0} aria-label="Result and evidence">
            <AnimatePresence initial={false}>
              {round.stale && (
                <Fold key="stale">
                  <StaleStrip files={staleOf(result)} onRetake={round.retake} />
                </Fold>
              )}
            </AnimatePresence>
            <ResultCards result={result} side />
            <div className={PAIR}>
              <Evidence result={result} />
              <Docs result={result} />
            </div>
          </div>
          <aside aria-label="Feedback" className={SIDE}>
            <h2 className={SIDE_HEAD}>
              <IconMessage size="sm" aria-hidden="true" className="text-muted-foreground" />
              {`Feedback · ${String(round.feedback.length)}`}
              <span className="ml-auto flex">
                <FixThese count={round.tasks.length} fixing={round.fixing} onFix={round.fix} />
              </span>
            </h2>
            <div className={SIDE_BODY}>
              <FeedbackBox onAdd={round.add} disabled={round.standing !== 'open'} />
              {round.fixing && <FixGroups groups={round.groups} feedback={round.feedback} />}
              <FeedbackList
                feedback={round.feedback}
                locked={round.fixing}
                onRemove={round.remove}
              />
            </div>
          </aside>
        </div>
      </main>
    </div>
  )
}
