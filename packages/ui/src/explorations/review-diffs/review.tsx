import { AnimatePresence, motion } from 'motion/react'
import { type ReactNode, useRef, useState } from 'react'

import { Button } from '../../components/button/button.tsx'
import { StatusDot } from '../../components/status-dot/status-dot.tsx'
import { Tooltip } from '../../components/tooltip/tooltip.tsx'
import { IconCircleCheck, IconLayoutList, IconLayoutSidebar, IconMessages } from '../../icons.ts'
import { CROSSFADE, crossfade, useTransition } from '../../motion.ts'
import { ChangesTree } from './changes-tree.tsx'
import { type DiffLayout, DiffStage, type StageTarget } from './diff-stage.tsx'
import { FeedbackList } from './feedback-list.tsx'
import {
  type FeedbackAnchor,
  type FeedbackKind,
  type ReviewRound,
  type RoundFeedback,
  type Standing,
  isStale,
  waitsForFix,
} from './model.ts'
import { SpecReview } from './spec-review.tsx'

/**
 * The review round of a build around its diff (exploration of issue #271, the one design).
 *
 * The head across the top says which round this is — `Spec review · round n` — whether the
 * Workspace moved since it opened, and holds the three acts: Accept, then Deliver, then Close. An
 * act that cannot be done is not drawn: Accept is not there while the round is stale or some
 * feedback waits for a fix, and each act waits for the one before; an act done is its check.
 *
 * Under it three columns: the tree of what the round changed, the Spec first (left); the diff of
 * every file, or the Spec story by story when its entry is chosen (centre); the round's feedback
 * as it accumulates, with "Fix these" (side). Narrower than a wide window — the review beside the
 * chat — the side column gives way, and its icon in the head swaps it with the centre.
 */

export interface ReviewStart {
  round: ReviewRound
  feedback: readonly RoundFeedback[]
  standing?: Standing | undefined
  fixing?: boolean | undefined
  layout?: DiffLayout | undefined
  /** Whether the centre opens on the Spec rather than on the diff. */
  spec?: boolean | undefined
}

export interface ReviewProps {
  start: ReviewStart
  /** What the head holds before its acts: the panel's own controls, beside the round's. */
  controls?: ReactNode
}

const HEAD = 'flex h-12 shrink-0 items-center gap-3 border-b border-border px-4'

const TITLE = 'text-sm font-medium'

const SUB = 'font-mono text-xs text-muted-foreground'

const LAYOUT =
  'flex size-control-sm items-center justify-center rounded-md text-muted-foreground outline-none focus-ring hover:bg-accent aria-pressed:bg-accent aria-pressed:text-foreground'

const DONE = 'flex text-success'

/** The three columns, the side one only where the review has the width for it. */
const BODY = 'flex min-h-0 flex-1'

const TREE = 'flex w-menu shrink-0 flex-col border-r border-border'

const CENTRE = 'relative flex min-w-0 flex-1 flex-col'

const STAGE = 'flex min-h-0 flex-1 flex-col'

const STAGE_UNDER = 'invisible flex min-h-0 flex-1 flex-col'

const OVER = 'absolute inset-0 flex flex-col bg-surface-content'

const SIDE = 'hidden w-menu shrink-0 flex-col border-l border-border @5xl/review:flex'

const SIDE_OVER = 'absolute inset-0 flex flex-col bg-surface-content @5xl/review:hidden'

const NARROW_ONLY = 'flex @5xl/review:hidden'

let made = 0

export function Review({ start, controls }: ReviewProps): ReactNode {
  const { round } = start
  const [feedback, setFeedback] = useState<RoundFeedback[]>([...start.feedback])
  const [standing, setStanding] = useState<Standing>(start.standing ?? 'open')
  const [fixing, setFixing] = useState(start.fixing ?? false)
  const [layout, setLayout] = useState<DiffLayout>(start.layout ?? 'split')
  const [specShown, setSpecShown] = useState(start.spec ?? false)
  const [listOver, setListOver] = useState(false)
  const [lit, setLit] = useState<string | null>(null)
  const [target, setTarget] = useState<StageTarget | null>(null)
  const nonce = useRef(0)
  const fade = useTransition(crossfade)
  const stale = isStale(round)
  const writable = standing === 'open' && !fixing
  const acceptable = writable && !stale && !waitsForFix(feedback)

  function add(kind: FeedbackKind, body: string, anchor: FeedbackAnchor | null): void {
    made += 1
    setFeedback((was) => [
      ...was,
      {
        id: `new-${String(made)}`,
        kind,
        body,
        anchor,
        createdAt: new Date().toISOString(),
        withdrawnAt: null,
      },
    ])
  }

  function toggle(id: string): void {
    setFeedback((was) =>
      was.map((one) =>
        one.id === id
          ? { ...one, withdrawnAt: one.withdrawnAt === null ? new Date().toISOString() : null }
          : one,
      ),
    )
  }

  /** The list sent the reader to a feedback: the centre turns to where it points, and lights it. */
  function go(id: string): void {
    const anchor = feedback.find((one) => one.id === id)?.anchor
    if (anchor === null || anchor === undefined) return
    nonce.current += 1
    setSpecShown(anchor.kind === 'spec')
    setListOver(false)
    setLit(id)
    setTarget({ kind: 'feedback', id, nonce: nonce.current })
  }

  function openFile(id: string): void {
    nonce.current += 1
    setSpecShown(false)
    setListOver(false)
    setTarget({ kind: 'file', id, nonce: nonce.current })
  }

  const list = (
    <FeedbackList
      round={round}
      feedback={feedback}
      lit={lit}
      writable={writable}
      fixing={fixing}
      onGo={go}
      onToggle={toggle}
      onAdd={add}
      onFix={() => setFixing(true)}
    />
  )

  return (
    <div className="@container/review flex min-h-0 flex-1 flex-col">
      <header className={HEAD}>
        <div className="flex min-w-0 items-baseline gap-2">
          <h2 className={TITLE}>Spec review · round {round.number}</h2>
          <span className={SUB}>{round.specKey}</span>
        </div>
        {stale && (
          <StatusDot
            status="running"
            label="The Workspace changed since the round opened"
            title={round.repositories
              .filter((one) => one.stale)
              .map((one) => one.name)
              .join(', ')}
          />
        )}
        <span className="ml-auto flex items-center gap-1">
          {!specShown && (
            <div role="group" aria-label="Layout of the diff" className="flex gap-0.5">
              <Tooltip label="Split">
                <button
                  type="button"
                  aria-pressed={layout === 'split'}
                  aria-label="Split"
                  className={LAYOUT}
                  onClick={() => setLayout('split')}
                >
                  <IconLayoutSidebar size="sm" aria-hidden="true" />
                </button>
              </Tooltip>
              <Tooltip label="Stacked">
                <button
                  type="button"
                  aria-pressed={layout === 'stacked'}
                  aria-label="Stacked"
                  className={LAYOUT}
                  onClick={() => setLayout('stacked')}
                >
                  <IconLayoutList size="sm" aria-hidden="true" />
                </button>
              </Tooltip>
            </div>
          )}
          <span className={NARROW_ONLY}>
            <Tooltip label="Feedback">
              <button
                type="button"
                aria-pressed={listOver}
                aria-label="Feedback"
                className={LAYOUT}
                onClick={() => setListOver((was) => !was)}
              >
                <IconMessages size="sm" aria-hidden="true" />
              </button>
            </Tooltip>
          </span>
        </span>
        <span className="flex items-center gap-2 border-l border-border pl-3">
          {standing !== 'open' && (
            <span role="img" aria-label="Accepted" title="Accepted" className={DONE}>
              <IconCircleCheck size="md" aria-hidden="true" />
            </span>
          )}
          {(standing === 'delivered' || standing === 'closed') && (
            <span role="img" aria-label="Delivered" title="Delivered" className={DONE}>
              <IconCircleCheck size="md" aria-hidden="true" />
            </span>
          )}
          {standing === 'closed' && (
            <span role="img" aria-label="Closed" title="Closed" className={DONE}>
              <IconCircleCheck size="md" aria-hidden="true" />
            </span>
          )}
          {standing === 'open' && acceptable && (
            <Button variant="primary" size="sm" onClick={() => setStanding('accepted')}>
              Accept
            </Button>
          )}
          {standing === 'accepted' && (
            <Button variant="primary" size="sm" onClick={() => setStanding('delivered')}>
              Deliver
            </Button>
          )}
          {standing === 'delivered' && (
            <Button size="sm" onClick={() => setStanding('closed')}>
              Close
            </Button>
          )}
          {fixing && <StatusDot status="running" label="The feedback is being fixed" />}
        </span>
        {controls}
      </header>
      <div className={BODY}>
        <div className={TREE}>
          <ChangesTree
            round={round}
            specShown={specShown}
            onSpec={() => {
              setSpecShown(true)
              setListOver(false)
            }}
            onFile={openFile}
          />
        </div>
        <div className={CENTRE}>
          {/* The diff stays drawn under the Spec, where it was read to, and out of reach while
              the Spec covers it. */}
          <div
            inert={specShown}
            aria-hidden={specShown ? true : undefined}
            className={specShown ? STAGE_UNDER : STAGE}
          >
            <DiffStage
              round={round}
              feedback={feedback}
              layout={layout}
              lit={lit}
              target={target}
              writable={writable}
              onComment={add}
              onToggle={toggle}
            />
          </div>
          <AnimatePresence initial={false}>
            {specShown && (
              <motion.div
                key="spec"
                className={OVER}
                initial={CROSSFADE.from}
                animate={CROSSFADE.to}
                exit={CROSSFADE.from}
                transition={fade}
              >
                <SpecReview
                  round={round}
                  feedback={feedback}
                  lit={lit}
                  target={target?.kind === 'feedback' ? target : null}
                  writable={writable}
                  onComment={add}
                  onToggle={toggle}
                />
              </motion.div>
            )}
          </AnimatePresence>
          {listOver && <div className={SIDE_OVER}>{list}</div>}
        </div>
        <div className={SIDE}>{list}</div>
      </div>
    </div>
  )
}
