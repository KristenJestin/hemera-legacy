import { AnimatePresence, animate, motion, useIsPresent, useMotionValue } from 'motion/react'
import { type ReactNode, useEffect, useLayoutEffect, useRef, useState } from 'react'

import { IconButton } from '../../components/button/button.tsx'
import { StatusDot } from '../../components/status-dot/status-dot.tsx'
import { Tooltip } from '../../components/tooltip/tooltip.tsx'
import { IconChevronLeft, IconChevronRight, IconHammer } from '../../icons.ts'
import {
  CROSSFADE,
  collapse,
  expand,
  instant,
  morph,
  onTheBeat,
  slide,
  swap,
  useTransition,
} from '../../motion.ts'

/**
 * A `build` Session's row laid as a `define` Session's is (issue #77, the maintainer's design of
 * 30 September): the chat on the left, and on the right the build where `define` has its Spec —
 * the same frame on its rim, the same widths, the same fold to a small frame at the window's edge,
 * and the same swap between the two, which pushes the chat on the very spring the panel slides on.
 * It is drawn from the Spec panel's own utilities (`spec-slot`, `spec-panel-in`, `w-spec-panel`,
 * `w-spec-frame`), so the two panels cannot drift apart.
 *
 * What the build adds is one control on the rim's head, beside the fold: the panel laid over the
 * chat, the whole width of the row, and back. Over the chat and not pushing it: the chat keeps its
 * width under the panel and nothing in it reflows, so the only thing that moves is the panel's own
 * left edge, on the swap's spring. The chat is out of reach while it is covered.
 *
 * The panel is handed what its body shows — the build view, the frozen Spec, or a helper's thread
 * in the second placement — and what its foot shows while it covers the chat: the Session's
 * notices, which would otherwise be under it on the composer's edge.
 */

/** The row, and the container the open panel's width is a share of. */
const ROW = '@container relative flex min-h-0 flex-1 overflow-x-clip'

/** The chat, which keeps its width whatever the panel does. */
const CHAT = 'flex min-h-0 min-w-0 flex-1 flex-col'

/** The panel's slot in the row, at the window's edge, as the Spec's dock keeps it. */
const DOCK = 'flex h-full min-h-0 shrink-0 py-3 pr-3'

/**
 * The panel's clip, laid against the row rather than the slot so that it can reach over the chat.
 * Its width is written once, from the Spec panel's width and how far over the chat it is.
 */
const CLIP = 'pointer-events-none absolute inset-y-3 right-0 z-10 box-content overflow-hidden pr-3'

/** How wide the clip is: the Spec's open width, or the row less its two margins, or between. */
const CLIP_WIDTH =
  'calc(var(--spacing-spec-panel) + (100cqw - var(--spacing) * 6 - var(--spacing-spec-panel)) * var(--build-over, 0))'

const PANEL =
  'spec-panel-in pointer-events-auto flex size-full flex-col rounded-xl border border-border bg-surface-rim p-1.5'

const STOWED =
  'spec-panel-in pointer-events-auto invisible flex size-full flex-col rounded-xl border border-border bg-surface-rim p-1.5'

const FRAME = 'pointer-events-none absolute inset-y-3 right-3 z-10 flex items-start'

const HEAD = 'flex shrink-0 items-center gap-2 pt-1 pr-1.5 pb-2.5 pl-2.5'

const HEAD_LINE = 'flex min-h-control-md min-w-0 flex-1 items-center gap-2'

const TITLE = 'text-sm font-medium'

const END = 'ml-auto flex shrink-0 items-center gap-1.5'

const BODY =
  'relative flex min-h-0 flex-1 flex-col overflow-hidden rounded-lg border border-border bg-surface-body shadow-sm'

const FOOT = 'flex items-center justify-center px-1 pt-2.5'

/** The small frame, as the Spec's: its rim, the unfold on it, and its body. */
const RIM = 'flex w-spec-frame flex-col rounded-xl border border-border bg-surface-rim p-1.5'

const RIM_TOP = 'flex shrink-0 justify-end pt-1.5 pr-1.5 pb-1.5'

const RIM_BODY =
  'flex flex-col items-center gap-2 rounded-lg border border-border bg-surface-body py-2 text-muted-foreground shadow-sm'

export interface BuildDockProps {
  /** The chat column: the main agent's chat, or a helper's thread in the first placement. */
  chat: ReactNode
  /** What the panel's body shows. */
  body: ReactNode
  /** What the panel's foot shows while it covers the chat. */
  foot: ReactNode
  folded: boolean
  over: boolean
  /** Whether something in the build waits for the hand, which the small frame's dot says. */
  waits: boolean
  onFold: (folded: boolean) => void
  onOver: (over: boolean) => void
}

export function BuildDock({
  chat,
  body,
  foot,
  folded,
  over,
  waits,
  onFold,
  onOver,
}: BuildDockProps): ReactNode {
  const row = useRef<HTMLDivElement>(null)
  const clip = useRef<HTMLDivElement>(null)
  // Whether the swap is on its way. Folded and at rest, the panel is stowed: laid out, hidden.
  const [moving, setMoving] = useState(false)
  const [wasFolded, setWasFolded] = useState(folded)
  if (wasFolded !== folded) {
    setWasFolded(folded)
    setMoving(true)
  }
  // Whether the keyboard was on the control the fold took away.
  const refocus = useRef(false)
  const move = useTransition(swap.move)
  const fade = useTransition(swap.fade)
  const still = move === instant
  const open = useMotionValue(folded ? 0 : 1)
  const covering = useMotionValue(over ? 1 : 0)

  function pose(share: number): void {
    row.current?.style.setProperty('--spec-open', String(share))
  }

  function cover(share: number): void {
    row.current?.style.setProperty('--build-over', String(share))
  }

  function asked(next: boolean): void {
    refocus.current = row.current?.contains(document.activeElement) ?? false
    onFold(next)
  }

  // The resting shares before the first frame, and the clip's width drawn from them.
  useLayoutEffect(() => {
    pose(open.get())
    cover(covering.get())
    clip.current?.style.setProperty('width', CLIP_WIDTH)
  }, [])

  // The swap, as the Spec's: the panel waits a beat for the small frame to start leaving.
  useLayoutEffect(() => {
    const target = folded ? 0 : 1
    const from = open.get()
    if (from === target) {
      setMoving(false)
      return
    }
    if (still) {
      open.jump(target)
      pose(target)
      setMoving(false)
      return
    }
    const late = !folded && from === 0 ? onTheBeat(move) : move
    let live = true
    const travel = animate(open, target, { ...late, onUpdate: pose })
    void travel.then(() => {
      if (live) setMoving(false)
    })
    return () => {
      live = false
      travel.stop()
    }
  }, [folded])

  // Over the chat and back: only the panel's left edge moves, on the swap's spring.
  useLayoutEffect(() => {
    const target = over ? 1 : 0
    if (covering.get() === target) return
    if (still) {
      covering.jump(target)
      cover(target)
      return
    }
    const travel = animate(covering, target, { ...move, onUpdate: cover })
    return () => travel.stop()
  }, [over])

  // Once folded or unfolded under the keyboard, it lands where the control it was on stands now.
  useEffect(() => {
    if (!refocus.current) return
    refocus.current = false
    const target = folded ? '[data-unfold]' : '[data-fold]'
    row.current?.querySelector<HTMLElement>(target)?.focus({ preventScroll: true })
  }, [folded])

  const frameMoves = folded ? onTheBeat(fade) : fade
  const away = slide('stage').enter
  const stowed = folded && !moving

  return (
    <div ref={row} className={ROW}>
      <div
        inert={over && !folded}
        aria-hidden={over && !folded ? true : undefined}
        className={CHAT}
      >
        {chat}
      </div>
      <div className={DOCK}>
        <div aria-hidden="true" className="spec-slot shrink-0" />
      </div>
      <div ref={clip} className={CLIP}>
        <section
          aria-label="Build ATL-7"
          inert={folded}
          aria-hidden={folded ? true : undefined}
          data-build-panel
          data-over={over ? '' : undefined}
          data-stowed={stowed ? '' : undefined}
          className={stowed ? STOWED : PANEL}
        >
          <header className={HEAD}>
            <span className={HEAD_LINE}>
              <IconHammer size="sm" aria-hidden="true" />
              <h2 className={TITLE}>Build</h2>
            </span>
            <span className={END}>
              <Tooltip label="Build over the chat">
                <IconButton
                  variant="ghost"
                  size="sm"
                  icon={<CoverIcon over={over} />}
                  aria-label="Build over the chat"
                  aria-pressed={over}
                  data-over-toggle
                  onClick={() => onOver(!over)}
                />
              </Tooltip>
              <Tooltip label="Fold the build">
                <IconButton
                  variant="ghost"
                  size="sm"
                  icon={<IconChevronRight size="sm" />}
                  aria-label="Fold the build"
                  data-fold
                  onClick={() => asked(true)}
                />
              </Tooltip>
            </span>
          </header>
          <div className={BODY}>{body}</div>
          <Foot shown={over}>{foot}</Foot>
        </section>
      </div>
      <motion.div
        inert={!folded}
        aria-hidden={folded ? undefined : true}
        data-build-frame
        className={FRAME}
        initial={false}
        animate={folded ? { x: 0, ...CROSSFADE.to } : { x: away, ...CROSSFADE.from }}
        transition={frameMoves}
      >
        <div className="pointer-events-auto">
          <div className={RIM}>
            <div className={RIM_TOP}>
              <Tooltip label="Unfold the build" side="left">
                <IconButton
                  variant="ghost"
                  size="sm"
                  icon={<IconChevronLeft size="sm" />}
                  aria-label="Unfold the build"
                  data-unfold
                  onClick={() => asked(false)}
                />
              </Tooltip>
            </div>
            <div className={RIM_BODY}>
              <IconHammer size="md" aria-hidden="true" />
              {waits && <StatusDot status="running" label="Something in the build waits for you" />}
            </div>
          </div>
        </div>
      </motion.div>
    </div>
  )
}

/** The foot on the rim, which opens under the body as the panel covers the chat. */
function Foot({ shown, children }: { shown: boolean; children: ReactNode }): ReactNode {
  const transition = useTransition(morph)
  return (
    <AnimatePresence initial={false}>
      {shown && (
        <motion.div
          key="foot"
          className="shrink-0 overflow-hidden"
          initial={collapse}
          animate={expand}
          exit={collapse}
          transition={transition}
        >
          <Leaving>{children}</Leaving>
        </motion.div>
      )}
    </AnimatePresence>
  )
}

/** The foot's content, out of reach from the moment it starts leaving. */
function Leaving({ children }: { children: ReactNode }): ReactNode {
  const present = useIsPresent()
  return (
    <div className={FOOT} inert={!present} aria-hidden={present ? undefined : true}>
      {children}
    </div>
  )
}

/**
 * The toggle's icon, on Tabler's grid and stroke: a window and the panel's edge in it, the chevron
 * saying which way the edge goes — out over the chat, or back to its place.
 */
function CoverIcon({ over }: { over: boolean }): ReactNode {
  return (
    <svg
      viewBox="0 0 24 24"
      xmlns="http://www.w3.org/2000/svg"
      aria-hidden="true"
      fill="none"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      className="size-icon-sm shrink-0 stroke-current"
    >
      <path d="M4 6a2 2 0 0 1 2 -2h12a2 2 0 0 1 2 2v12a2 2 0 0 1 -2 2h-12a2 2 0 0 1 -2 -2z" />
      <path d={over ? 'M9 4v16' : 'M15 4v16'} />
      <path d={over ? 'M13 9l3 3l-3 3' : 'M11 9l-3 3l3 3'} />
    </svg>
  )
}
