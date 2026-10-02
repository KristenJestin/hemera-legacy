import { AnimatePresence } from 'motion/react'
import { type ReactNode, useState } from 'react'

import { BuildView } from '../../build/build-view.tsx'
import { NOW, READY_TO_ACCEPT } from '../../build/build-fixtures.ts'
import { Button } from '../../components/button/button.tsx'
import { IconEye, IconHammer, IconMessage } from '../../icons.ts'
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
  Section,
  StaleStrip,
} from './parts.tsx'
import { staleOf } from './model.ts'

/**
 * A · Panel. The review is the build panel's: its stage turns from the build view to the round,
 * and a press gives the build view back. One column read from the top — the result, the
 * evidence, the documentation, then the feedback left so far — with the feedback box and "Fix
 * these" held at its foot, where a composer would be. The chat folds to its band and the panel
 * takes the row.
 */

const PANEL = 'flex min-h-0 min-w-0 flex-1 flex-col bg-surface-content'

const PANEL_HEAD = 'flex shrink-0 items-center gap-1 border-b border-border px-4 py-2'

const HEAD = 'flex shrink-0 flex-col gap-2 border-b border-border px-6 pt-5 pb-4'

const HEAD_LINE = 'flex min-w-0 items-center gap-3'

const BODY =
  'scroll-quiet flex min-h-0 flex-1 flex-col gap-6 overflow-y-auto px-6 py-5 outline-none focus-ring'

const FOOT = 'flex shrink-0 flex-col gap-2 border-t border-border px-6 py-3'

const NOOP = () => undefined

export function PanelSession({ start }: VariantProps): ReactNode {
  const round = useRound(start)
  const [stage, setStage] = useState<'review' | 'build'>('review')
  const { result } = round
  return (
    <div className={ROW}>
      <ChatSlot defaultFolded={start.chatFolded} band={<AnswerDot feedback={round.feedback} />}>
        <Chat result={result} />
      </ChatSlot>
      <section aria-label={`Build ${result.specKey}`} className={PANEL}>
        <header className={PANEL_HEAD}>
          <Button
            variant="ghost"
            size="sm"
            aria-pressed={stage === 'build'}
            onClick={() => setStage('build')}
          >
            <IconHammer size="sm" />
            Build
          </Button>
          <Button
            variant="ghost"
            size="sm"
            aria-pressed={stage === 'review'}
            onClick={() => setStage('review')}
          >
            <IconEye size="sm" />
            Review
          </Button>
        </header>
        {stage === 'build' ? (
          <BuildView
            build={READY_TO_ACCEPT}
            now={NOW}
            onToggleSpec={NOOP}
            onPause={NOOP}
            onResume={NOOP}
            onAccept={NOOP}
            onStop={NOOP}
            onTaskDone={NOOP}
            onTaskSkip={NOOP}
            onDismissBlocker={NOOP}
            onOpenChat={NOOP}
          />
        ) : (
          <>
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
            <div
              className={BODY}
              role="region"
              tabIndex={0}
              aria-label={`Review of ${result.specKey}`}
            >
              <AnimatePresence initial={false}>
                {round.stale && (
                  <Fold key="stale">
                    <StaleStrip files={staleOf(result)} onRetake={round.retake} />
                  </Fold>
                )}
              </AnimatePresence>
              <ResultCards result={result} />
              <Evidence result={result} />
              <Docs result={result} />
              <Section
                icon={<IconMessage size="sm" />}
                title={`Feedback · ${String(round.feedback.length)}`}
              >
                {round.fixing && <FixGroups groups={round.groups} feedback={round.feedback} />}
                <FeedbackList
                  feedback={round.feedback}
                  locked={round.fixing}
                  onRemove={round.remove}
                />
              </Section>
            </div>
            <div className={FOOT}>
              <FeedbackBox onAdd={round.add} disabled={round.standing !== 'open'} />
              <div className="flex justify-end">
                <FixThese count={round.tasks.length} fixing={round.fixing} onFix={round.fix} />
              </div>
            </div>
          </>
        )}
      </section>
    </div>
  )
}
