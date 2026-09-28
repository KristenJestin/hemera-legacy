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
 * waits, the pill is that sentence. Pressed, it opens above itself on every item, grouped by kind,
 * each drawn by whoever knows what it asks. Something new arriving while it is closed pops it
 * again, and never opens it: the reader opens it.
 *
 * The kinds are the caller's, handed over as groups: a kind this component has never heard of is
 * one more group, with its icon and its items (the Project setup proposals to come, #222).
 */

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
  /** The kind's mark, on the pill beside its count. */
  icon: ReactNode
  /** Whether the kind holds the turn where it stands, drawn in the warning's tone. */
  urgent?: boolean | undefined
  items: readonly NoticeItem[]
  /** What answers the whole group at once, at its foot: `Accept all`. */
  actions?: ReactNode
}

export interface SessionNoticesProps {
  groups: readonly NoticeGroup[]
  /** Whether it is open as it is drawn: the stories' door, closed everywhere else. */
  defaultOpen?: boolean | undefined
}

const PILL =
  'inline-flex h-control-sm items-center gap-2.5 rounded-full border border-border bg-card px-3 text-xs font-medium text-foreground shadow-sm outline-none hover:bg-accent focus-ring data-popup-open:bg-accent'

const KIND = 'flex items-center gap-1 text-muted-foreground'

const URGENT = 'flex items-center gap-1 text-warning-muted-foreground'

const COUNT = 'font-mono text-foreground'

const PANEL = 'scroll-quiet flex max-h-pinned w-notices flex-col overflow-y-auto'

const GROUP = 'flex flex-col gap-2'

/** A group after the first: a rule between the two, and nothing that names either. */
const GROUP_APART = 'mt-3 flex flex-col gap-2 border-t border-border pt-3'

const FOOT = 'flex items-center justify-end gap-1'

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
          className="pointer-events-auto"
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
              open={open}
              onOpenChange={setOpen}
              trigger={
                <button type="button" className={PILL} aria-label={nameOf(waiting)}>
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
                <AnimatePresence initial={false}>
                  {waiting.map((group, index) => (
                    <Fold key={group.kind}>
                      <section
                        aria-label={group.label}
                        className={index === 0 ? GROUP : GROUP_APART}
                      >
                        <AnimatePresence initial={false}>
                          {group.items.map((item) => (
                            <Fold key={item.id}>{item.content}</Fold>
                          ))}
                        </AnimatePresence>
                        {group.actions !== undefined && <div className={FOOT}>{group.actions}</div>}
                      </section>
                    </Fold>
                  ))}
                </AnimatePresence>
              </div>
            </Popover>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  )
}
