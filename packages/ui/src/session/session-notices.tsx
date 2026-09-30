import { AnimatePresence, motion, useAnimate } from 'motion/react'
import { type ReactNode, useEffect, useRef, useState } from 'react'

import { Popover } from '../components/popover/popover.tsx'
import { collapse, expand, fold, POP, pop, RISE, rise, useTransition } from '../motion.ts'

/**
 * The Session's notices (issue #237): the one place for everything that waits for a human — a
 * permission, the commands the agent proposes, the Spec it proposes, the questions it asks — as a
 * pill attached to the top edge of the composer, whatever the thread's scroll.
 *
 * It rises out from behind the composer when something starts waiting, and pops once it is in
 * place, so its arrival cannot be missed; it goes back behind the composer when nothing waits any
 * more. It stands over the page rather than in it: nothing else moves when it comes or goes.
 *
 * Closed, it is an icon a kind and how many wait of it, and nothing else — no sentence says it
 * waits, the pill is that sentence. Pressed, it opens above itself on a compact list (variant A of
 * the exploration after #250): one row an item, kind after kind, each after its kind's coloured
 * tile — the one place the kind is said — and each a `NoticeRow`, the same anatomy and the same
 * two answers for every kind; a group's `Add all` is a last row of its own. It opens with the focus
 * left on the pill, and Escape closes it. Something new arriving while it is closed pops it again,
 * and never opens it: the reader opens it.
 *
 * The kinds are the caller's, handed over as groups: a kind this component has never heard of is
 * one more group, with its icon and its items: the Project setup proposals are one (#218).
 */

/** The tones a kind's tile is drawn in. */
export type NoticeTone = 'warning' | 'primary' | 'info' | 'success' | 'build'

/** One thing that waits: what answers it, already drawn, under the key it keeps while it waits. */
export interface NoticeItem {
  id: string
  content: ReactNode
}

/** The items of one kind, and what answers all of them at once, when the kind has that. */
export interface NoticeGroup {
  /** The kind, which keys the group: `permission`, `proposal`, … */
  kind: string
  /** What the kind is called, which is what a screen reader counts it by: `Permissions`. */
  label: string
  /**
   * What accepting its items does: `Run once`, `Add to the catalogue`, `Start a Spec`;
   * `Questions` for the questions. Said under the pointer on its tile.
   */
  title: string
  /** The kind's mark, on the pill beside its count and on the tile before each of its rows. */
  icon: ReactNode
  /** The tone of the kind's tile: what tells the kinds apart at a glance. */
  tone: NoticeTone
  /** Whether the kind holds the turn where it stands, drawn in the warning's tone. */
  urgent?: boolean | undefined
  items: readonly NoticeItem[]
  /** What answers the whole group at once, as a last row of its own: `Add all`. */
  actions?: ReactNode
}

export interface SessionNoticesProps {
  groups: readonly NoticeGroup[]
  /** Whether it is open as it is drawn: the stories' door, closed everywhere else. */
  defaultOpen?: boolean | undefined
}

/**
 * Where the pill rests: detached from the composer by a clear gap. The gap is inside what rises,
 * so the whole of it goes behind the composer's edge on the way down and nothing shows under it.
 */
const REST = 'pointer-events-auto pb-2.5'

/**
 * The pill, in the warning's tone (review of #250: "trop collé, pas assez mis en avant"): it has
 * to read as something waiting for the reader at a glance, not as one more neutral chip. The
 * tinted fill is laid over the card's own, so the thread never shows through it in the dark
 * theme, where the warning's fill is a tint and not a colour.
 */
const PILL =
  'relative isolate inline-flex h-control-md items-center gap-3 overflow-hidden rounded-full border border-warning bg-card px-4 text-sm font-semibold text-warning-muted-foreground shadow-md outline-none hover:border-warning-muted-foreground focus-ring data-popup-open:border-warning-muted-foreground'

/** The warning's tint, laid over the card's fill. */
const TINT = 'pointer-events-none absolute inset-0 -z-10 bg-warning-muted'

const KIND = 'flex items-center gap-1.5'

const URGENT = KIND

const COUNT = 'font-mono'

const PANEL = 'scroll-quiet flex max-h-pinned w-notices flex-col overflow-y-auto'

/** The list: a rule between every two rows, whatever their kind. */
const ROWS = 'flex flex-col divide-y divide-border'

/** A group of rows: a section a kind, with no head — the tiles say the kind. */
const GROUP = 'flex flex-col divide-y divide-border'

/**
 * A row: the kind's tile, then the row. The room around a row is inside it,
 * so a row folding away takes all of its room with it.
 */
const ITEM = 'flex min-w-0 items-start gap-2.5 py-2'

/** What answers a whole group, as a last row of its own. */
const GROUP_ACTIONS = 'flex justify-end py-1.5'

/** The kind's tile, in its tone: what tells the kinds apart at a glance. */
const TILES: Record<NoticeTone, string> = {
  warning:
    'flex size-control-sm shrink-0 items-center justify-center rounded-md bg-warning-muted text-warning-muted-foreground',
  primary:
    'flex size-control-sm shrink-0 items-center justify-center rounded-md bg-primary-muted text-primary-muted-foreground',
  info: 'flex size-control-sm shrink-0 items-center justify-center rounded-md bg-info-muted text-info-muted-foreground',
  success:
    'flex size-control-sm shrink-0 items-center justify-center rounded-md bg-success-muted text-success-muted-foreground',
  // The Project's setup (#218): the build's teal, which no other kind wears.
  build:
    'flex size-control-sm shrink-0 items-center justify-center rounded-md bg-mission-build-muted text-mission-build-muted-foreground',
}

/** What a group of the list and an item of a group arrive and leave on: their height. */
function Fold({ children }: { children: ReactNode }): ReactNode {
  const transition = useTransition(fold)
  return (
    <motion.div
      className="shrink-0 overflow-hidden"
      initial={collapse}
      animate={expand}
      exit={collapse}
      transition={transition}
    >
      {children}
    </motion.div>
  )
}

/** What the pill is called: the one sentence, said to a screen reader and to nobody else. */
function nameOf(groups: readonly NoticeGroup[]): string {
  return `Waiting for your answer: ${groups
    .map((group) => `${group.label} ${String(group.items.length)}`)
    .join(', ')}`
}

export function SessionNotices({ groups, defaultOpen = false }: SessionNoticesProps): ReactNode {
  const waiting = groups.filter((group) => group.items.length > 0)
  const count = waiting.reduce((sum, group) => sum + group.items.length, 0)
  const [open, setOpen] = useState(defaultOpen)
  // Nothing left to answer closes it: the pill goes back behind the composer with it.
  if (count === 0 && open) setOpen(false)
  const rising = useTransition(rise)
  const popping = useTransition(pop)
  const [pill, animate] = useAnimate<HTMLDivElement>()
  // Whether the pill is in its place, which is when a pop can be seen: one played while it is
  // still behind the composer is a pop nobody saw.
  const landed = useRef(false)
  const before = useRef(count)

  function popNow(): void {
    if (pill.current === null) return
    void animate(pill.current, POP, popping)
  }

  // Something new while it is closed pops it again; an item answered is not news.
  useEffect(() => {
    if (count > before.current && landed.current && !open) popNow()
    before.current = count
  }, [count])

  return (
    <AnimatePresence>
      {count > 0 && (
        <motion.div
          key="notices"
          className={REST}
          initial={RISE.hidden}
          animate={RISE.shown}
          exit={RISE.hidden}
          transition={rising}
          onAnimationStart={() => {
            landed.current = false
          }}
          onAnimationComplete={(done) => {
            if (done !== RISE.shown) return
            landed.current = true
            popNow()
          }}
        >
          <motion.div ref={pill}>
            <Popover
              side="top"
              align="center"
              label="Waiting for your answer"
              // Opened by a press, it leaves the focus on the pill (review of #250): no answer is
              // picked out before the reader has read them all, and Tab goes on into the panel.
              keepFocus
              // It comes out of the pill and closes back into it (review of #250).
              grows
              open={open}
              onOpenChange={setOpen}
              trigger={
                <button type="button" className={PILL} aria-label={nameOf(waiting)}>
                  <span aria-hidden="true" className={TINT} />
                  {waiting.map((group) => (
                    <span key={group.kind} className={group.urgent === true ? URGENT : KIND}>
                      {group.icon}
                      <span className={COUNT}>{String(group.items.length)}</span>
                    </span>
                  ))}
                </button>
              }
            >
              <div className={PANEL}>
                <div className={ROWS}>
                  <AnimatePresence initial={false}>
                    {waiting.map((group) => (
                      <Fold key={group.kind}>
                        <section aria-label={group.label} className={GROUP}>
                          <AnimatePresence initial={false}>
                            {group.items.map((item) => (
                              <Fold key={item.id}>
                                <div className={ITEM}>
                                  <span
                                    aria-hidden="true"
                                    className={TILES[group.tone]}
                                    title={group.title}
                                  >
                                    {group.icon}
                                  </span>
                                  <div className="min-w-0 flex-1">{item.content}</div>
                                </div>
                              </Fold>
                            ))}
                          </AnimatePresence>
                          {/* What answers the group at once comes and goes by its height too:
                                Add all leaves with the last but one proposal. */}
                          <AnimatePresence initial={false}>
                            {group.actions !== undefined && (
                              <Fold key="actions">
                                <div className={GROUP_ACTIONS}>{group.actions}</div>
                              </Fold>
                            )}
                          </AnimatePresence>
                        </section>
                      </Fold>
                    ))}
                  </AnimatePresence>
                </div>
              </div>
            </Popover>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  )
}
