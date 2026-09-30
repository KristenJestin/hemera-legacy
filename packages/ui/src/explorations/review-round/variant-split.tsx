import { cn } from 'cn'
import { AnimatePresence } from 'motion/react'
import { type ReactNode, useState } from 'react'

import { IconAlertTriangle, IconBook, IconFolder, IconGitBranch, IconShield } from '../../icons.ts'
import { countsOf, staleOf } from './model.ts'
import { AnswerDot, Chat, ChatSlot, ROW, type VariantProps, useRound, type Round } from './page.tsx'
import {
  Counts,
  Docs,
  Evidence,
  FeedbackBox,
  FeedbackList,
  FixGroups,
  FixThese,
  Fold,
  FolderCard,
  Mark,
  RepositoryCard,
  RoundState,
  StaleStrip,
} from './parts.tsx'

/**
 * C · Split. The build panel keeps its frame and splits: the list of the result on its left —
 * each repository with its counts, the evidence, the documentation — and what is chosen in it on
 * the right. The feedback is said where everything else is said to the main agent: in the chat,
 * the box in the composer's place and the list above it, "Fix these" at the list's head.
 */

const PANEL = 'flex min-h-0 min-w-0 flex-1 flex-col bg-surface-content'

const HEAD = 'flex shrink-0 flex-col gap-2 border-b border-border px-6 pt-5 pb-4'

const HEAD_LINE = 'flex min-w-0 items-center gap-3'

const LIST =
  'scroll-quiet flex w-menu shrink-0 flex-col gap-0.5 overflow-y-auto border-r border-border p-2'

const ENTRY =
  'flex w-full min-w-0 items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm outline-none hover:bg-accent focus-ring aria-[current=true]:bg-muted'

const DETAIL =
  'scroll-quiet flex min-h-0 min-w-0 flex-1 flex-col gap-4 overflow-y-auto px-6 py-5 outline-none focus-ring'

const TRAY = 'flex max-h-pinned min-h-0 flex-col gap-2'

const TRAY_HEAD = 'flex shrink-0 items-center gap-2 text-sm font-medium'

/** What the list of the result can open on its right. */
type Chosen = { kind: 'repository'; path: string } | { kind: 'evidence' } | { kind: 'docs' }

function same(one: Chosen, other: Chosen): boolean {
  if (one.kind !== other.kind) return false
  return one.kind !== 'repository' || (other.kind === 'repository' && one.path === other.path)
}

/** The feedback in the chat: the list and "Fix these" above the box that takes the composer's place. */
function Tray({ round }: { round: Round }): ReactNode {
  return (
    <div className="flex flex-col gap-2">
      <section aria-label="Feedback" className={TRAY}>
        <h2 className={TRAY_HEAD}>
          {`Feedback · ${String(round.feedback.length)}`}
          <span className="ml-auto flex">
            <FixThese count={round.tasks.length} fixing={round.fixing} onFix={round.fix} />
          </span>
        </h2>
        <div className="scroll-quiet min-h-0 overflow-y-auto">
          {round.fixing && <FixGroups groups={round.groups} feedback={round.feedback} />}
          <FeedbackList feedback={round.feedback} locked={round.fixing} onRemove={round.remove} />
        </div>
      </section>
      <FeedbackBox onAdd={round.add} disabled={round.standing !== 'open'} />
    </div>
  )
}

export function SplitSession({ start }: VariantProps): ReactNode {
  const round = useRound(start)
  const { result } = round
  const first: Chosen =
    result.repositories[0] === undefined
      ? { kind: 'evidence' }
      : { kind: 'repository', path: result.repositories[0].path }
  const [chosen, setChosen] = useState<Chosen>(first)

  function entry(of: Chosen, icon: ReactNode, label: ReactNode, end: ReactNode): ReactNode {
    return (
      <button
        type="button"
        className={ENTRY}
        aria-current={same(chosen, of)}
        onClick={() => setChosen(of)}
      >
        <span aria-hidden="true" className="flex shrink-0 text-muted-foreground">
          {icon}
        </span>
        {label}
        <span className="ml-auto flex shrink-0 items-center gap-2">{end}</span>
      </button>
    )
  }

  const shown = result.repositories.find(
    (one) => chosen.kind === 'repository' && one.path === chosen.path,
  )

  return (
    <div className={ROW}>
      <ChatSlot
        defaultFolded={start.chatFolded}
        band={
          <>
            <AnswerDot feedback={round.feedback} />
            <span className="font-mono text-xs">{String(round.feedback.length)}</span>
          </>
        }
      >
        <Chat result={result} foot={<Tray round={round} />} />
      </ChatSlot>
      <section aria-label={`Build ${result.specKey}`} className={PANEL}>
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
        <AnimatePresence initial={false}>
          {round.stale && (
            <Fold key="stale" className="shrink-0">
              <div className="px-6 pt-3">
                <StaleStrip files={staleOf(result)} onRetake={round.retake} />
              </div>
            </Fold>
          )}
        </AnimatePresence>
        <div className="flex min-h-0 flex-1">
          <nav aria-label="Result" className={LIST}>
            {result.git ? (
              result.repositories.map((repository) => {
                const { added, removed } = countsOf(repository.files)
                return (
                  <div key={repository.path} className="flex">
                    {entry(
                      { kind: 'repository', path: repository.path },
                      <IconGitBranch size="sm" />,
                      <span className="min-w-0 truncate font-mono text-xs">{repository.path}</span>,
                      <>
                        {repository.stale.length > 0 && (
                          <Mark
                            label="Changed outside Hemera"
                            className="text-warning-muted-foreground"
                          >
                            <IconAlertTriangle size="sm" />
                          </Mark>
                        )}
                        <Counts added={added} removed={removed} />
                      </>,
                    )}
                  </div>
                )
              })
            ) : (
              <div className="flex min-w-0 items-center gap-2 px-2 py-1.5 text-sm text-muted-foreground">
                <IconFolder size="sm" aria-hidden="true" />
                <span className="min-w-0 truncate font-mono text-xs">{result.folder}</span>
              </div>
            )}
            {entry(
              { kind: 'evidence' },
              <IconShield size="sm" />,
              'Evidence',
              <span className="font-mono text-xs text-muted-foreground">
                {String(result.checks.length + result.findings.length)}
              </span>,
            )}
            {entry(
              { kind: 'docs' },
              <IconBook size="sm" />,
              'Documentation',
              <span className="font-mono text-xs text-muted-foreground">
                {String(result.docs.length)}
              </span>,
            )}
          </nav>
          <div
            className={cn(DETAIL)}
            role="region"
            tabIndex={0}
            aria-label={`Review of ${result.specKey}`}
          >
            {!result.git && chosen.kind === 'evidence' && <FolderCard folder={result.folder} />}
            {shown !== undefined && <RepositoryCard repository={shown} commitsOpen />}
            {chosen.kind === 'evidence' && <Evidence result={result} />}
            {chosen.kind === 'docs' && <Docs result={result} />}
          </div>
        </div>
      </section>
    </div>
  )
}
