import { animate, motion, useMotionValue } from 'motion/react'
import {
  type ReactNode,
  createContext,
  useContext,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
} from 'react'

import { IconButton } from '../components/button/button.tsx'
import { Tooltip } from '../components/tooltip/tooltip.tsx'
import { IconArrowsDiagonal, IconArrowsDiagonalMinimize2, IconChevronRight } from '../icons.ts'
import { CROSSFADE, instant, onTheBeat, slide, swap, useTransition } from '../motion.ts'

/**
 * The row of a Session, under its head (issue #77): the chat, and beside it the panel of the
 * Session's mission when it has one — one mechanism for `define`'s Spec and `build`'s build.
 *
 * The chat is the row's first child whatever the Session is, so a `free` Session that becomes a
 * `define` one gets its panel beside a thread that stays exactly where it was: nothing of it is
 * drawn again. The panel, `PanelDock`, is one frame — its head on the rim, its body, its foot —
 * a share of the row wide, folded to a small frame at the window's edge.
 *
 * The two trade places by a swap (the `swap` kind of the preset). Opening, the small frame slides
 * out by the window's edge and fades, and a beat later, while it is still going, the panel slides
 * in from that edge and pushes the chat; closing, the panel slides out, and a beat later the small
 * frame comes back. The two moves always overlap, so there is no frame where neither is there.
 *
 * The panel is a slot of the row and the chat takes the rest. What moves is how far open the panel
 * is, from 0 to 1, which the slot's width (`panel-slot`) and the panel's place (`panel-in`) are
 * both drawn from, so the chat is pushed on the very spring the panel slides on and the two can
 * never part. A fold asked half-way turns that one value round from where it is. The panel is laid
 * at its open width from the first frame and clipped at the window's edge: nothing in it reflows
 * on the way.
 *
 * Beside the fold, one button lays the open panel over the chat, the whole width of the row, and
 * takes it back: arrows out while it is beside the chat, arrows in while it is over it. Over the
 * chat and not pushing it: the chat keeps its width under the panel and nothing in it reflows, so
 * what moves is the panel's own left edge, on the swap's spring. The chat is out of reach while it
 * is covered. Folding the panel takes it back beside the chat. The Session's notices come up over
 * the panel while it covers the chat: floated over its content where they stood over the chat —
 * on the composer's top edge, the same height from the row's foot — rising out of that edge and
 * popping as they do there, and never in a band of their own.
 *
 * The caller hands the panel its head, its body, its foot and its small frame, and decides whether
 * it is folded and whether it is over the chat: the dock holds nothing of what it shows, only how
 * it moves and where the keyboard lands once it has.
 */

/**
 * The row: the chat, the panel's slot, and what is laid over them. It is the container the open
 * panel's width is a share of, and it clips sideways (issue #181): the small frame leaves by
 * sliding out past the window's edge, and a frame laid out there would make the row scroll.
 */
const ROW = '@container relative flex min-h-0 flex-1 overflow-x-clip'

const CHAT = 'flex min-h-0 min-w-0 flex-1 flex-col'

export interface SessionRowProps {
  /** The chat of the Session: its thread and its composer. */
  chat: ReactNode
  /** The panel of the Session's mission, a `PanelDock`; nothing for a `free` Session. */
  children?: ReactNode
}

/** How the panel of a row tells it that it covers the chat, which is then out of reach. */
const Covering = createContext<(covers: boolean) => void>(() => undefined)

export function SessionRow({ chat, children }: SessionRowProps): ReactNode {
  const [covered, setCovered] = useState(false)
  return (
    <div className={ROW}>
      <div inert={covered} aria-hidden={covered ? true : undefined} className={CHAT}>
        {chat}
      </div>
      <Covering value={setCovered}>{children}</Covering>
    </div>
  )
}

/** The panel's slot in the row, and the margin it keeps at the content's edge. */
const DOCK = 'flex h-full min-h-0 shrink-0 py-3 pr-3'

/**
 * The panel's clip: what the panel slides in and out of. It reaches across the margin the dock
 * keeps at the content's edge and cuts there, where the small frame is cut (issue #181): the panel
 * is laid in its content box, in from that edge by the margin, and comes in and goes out by the
 * edge itself rather than out of nothing inside the margin.
 */
const CLIP =
  'pointer-events-none absolute inset-y-3 right-0 box-content panel-clip overflow-hidden pr-3'

/** The open panel: a frame the whole height of the row, its rim around the head, body and foot. */
const PANEL =
  'panel-in pointer-events-auto flex size-full flex-col rounded-xl border border-border bg-surface-rim p-1.5'

/** The panel folded and at rest: still laid out, so an unfold starts at once, and not drawn. */
const STOWED =
  'panel-in pointer-events-auto invisible flex size-full flex-col rounded-xl border border-border bg-surface-rim p-1.5'

/**
 * The small frame's place: on the window's edge, at the top of the row, over the panel (issue
 * #181). Its top and right edges are the open panel's, so its unfold chevron stands where the
 * head's fold chevron does.
 */
const FRAME = 'pointer-events-none absolute inset-y-3 right-3 z-1 flex items-start'

/**
 * The head on the rim, above the body. Its end is nearer the rim than its start: the fold chevron
 * at that end stands as far in from the panel's edge as the small frame's unfold chevron does from
 * the frame's (issue #181).
 */
const HEAD = 'flex shrink-0 items-start gap-1.5 pt-1 pr-1.5 pb-2.5 pl-2.5'

/** The end of the head: as tall as a control, so the chevron stays where the unfold's is. */
const END = 'flex min-h-control-md shrink-0 items-center gap-1'

/**
 * The notices over a panel that covers the chat: across the row, their foot anchored on the
 * composer's top edge under the panel — nothing measured — which clips them so they rise out of it
 * as they rise out of the composer, and room above for their pop to be seen whole.
 */
const FLOAT =
  'pointer-events-none absolute inset-x-0 notices-over flex justify-center overflow-hidden pt-4'

/** The body: what the panel shows, taking the rest of its height. */
const BODY =
  'relative flex min-h-0 flex-1 flex-col overflow-hidden rounded-lg border border-border bg-surface-body shadow-sm'

export interface PanelDockProps {
  /** What the panel is called, by what it holds: `Spec ATL-7`, `Build ATL-7`. */
  label: string
  /** The word its fold and unfold are named with: `Fold the Spec`, `Fold the build`. */
  name: string
  /** The panel's head, before the fold at its end. */
  head: ReactNode
  /** What the panel shows. */
  body: ReactNode
  /** What stands on the rim under the body, when the panel has anything there. */
  foot?: ReactNode
  /**
   * The Session's notices, the chat's own, floated over the panel while it covers the chat, on the
   * edge the chat's composer marks as theirs (`notices-edge`).
   */
  notices?: ReactNode
  /** The small frame the panel folds to, its unfold button marked `data-unfold`. */
  frame: ReactNode
  folded: boolean
  /** Asked by the fold at the end of the head; the small frame unfolds by its own button. */
  onFold: () => void
  /** Whether the open panel lies over the chat, the whole width of the row. */
  over: boolean
  /** Asked by the button beside the fold, to lay the panel over the chat or take it back. */
  onOver: (over: boolean) => void
  /**
   * Whether the panel arrives, opening from nothing on the swap's own spring, rather than standing
   * there: a Spec just created from the agent's proposal (#130).
   */
  arrives?: boolean | undefined
  /**
   * Where the keyboard lands once the hand unfolded the panel, as a selector inside it: the fold
   * when nothing is said.
   */
  landing?: string | undefined
}

export function PanelDock({
  label,
  name,
  head,
  body,
  foot,
  notices,
  frame,
  folded,
  onFold,
  over,
  onOver,
  arrives = false,
  landing,
}: PanelDockProps): ReactNode {
  const cover = useContext(Covering)
  const covers = over && !folded
  const dock = useRef<HTMLElement>(null)
  // Whether the swap is on its way. Folded and at rest, the panel is stowed: laid out, hidden.
  const [moving, setMoving] = useState(false)
  const [was, setWas] = useState(folded)
  // Whether the keyboard was in the panel as the fold or the unfold was asked: the control it was
  // on is gone, and it goes where that control's counterpart stands.
  const refocus = useRef(false)
  if (was !== folded) {
    setWas(folded)
    setMoving(true)
    // Read as the change is drawn, while the pressed control still holds the keyboard.
    refocus.current = dock.current?.contains(document.activeElement) ?? false
  }
  const move = useTransition(swap.move)
  const fade = useTransition(swap.fade)
  const still = move === instant
  // How far open the panel is, from its small frame (0) to its panel (1).
  const open = useMotionValue(folded ? 0 : 1)
  // How far in the panel has arrived, from nothing (0) to its place in the row (1).
  const present = useMotionValue(arrives ? 0 : 1)
  // How far over the chat the panel lies, from beside it (0) to the whole row (1).
  const covering = useMotionValue(over ? 1 : 0)

  /**
   * Writes how far open the panel is onto the row, which its slot's width and its panel's place
   * are drawn from.
   *
   * Called on every frame the value moves rather than subscribed to it, as the shell does with the
   * sidebar's width: a value that changes every frame cannot be a class, and a width assembled in
   * a style attribute is a length living outside the theme.
   */
  function pose(share: number): void {
    dock.current?.style.setProperty('--panel-open', String(share))
  }

  /** Writes how far in the panel has arrived, which scales its whole slot and places its panel. */
  function place(share: number): void {
    dock.current?.style.setProperty('--panel-in', String(share))
  }

  /** Writes how far over the chat the panel lies, which its clip's width is drawn from. */
  function lay(share: number): void {
    dock.current?.style.setProperty('--panel-over', String(share))
  }

  // The first frame has no animation to report a share: the resting one is written before it.
  useLayoutEffect(() => {
    pose(open.get())
    place(present.get())
    lay(covering.get())
  }, [])

  // Over the chat and back: only the panel's left edge moves, on the swap's spring, from wherever
  // it stands. Told to move less, it lands at once.
  useLayoutEffect(() => {
    const target = over ? 1 : 0
    if (covering.get() === target) return
    if (still) {
      covering.jump(target)
      lay(target)
      return
    }
    const travel = animate(covering, target, { ...move, onUpdate: lay })
    return () => travel.stop()
  }, [over])

  // The chat under the panel is out of reach for as long as the panel covers it.
  useEffect(() => {
    cover(covers)
    return () => cover(false)
  }, [covers])

  // Arriving, the panel opens from nothing on the swap's spring; told to move less, it is there.
  useLayoutEffect(() => {
    if (present.get() === 1) return
    if (still) {
      present.jump(1)
      place(1)
      return
    }
    const travel = animate(present, 1, { ...move, onUpdate: place })
    return () => travel.stop()
  }, [])

  // The swap. The panel moves on the swap's spring, from wherever it stands, pushing the chat on
  // every frame; opening from the small frame, it waits a beat for the frame to start leaving.
  // A swap turned round half-way waits for nothing: it is already under way. Told to move less,
  // it lands at once.
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

  // The keyboard goes where the control it was on stands now: the unfold, the fold, or where the
  // caller said. `preventScroll`, because the panel is sliding in a clip, and a focus that
  // scrolled the clip to show itself would drag the panel along.
  useEffect(() => {
    if (!refocus.current) return
    refocus.current = false
    const target = folded ? '[data-unfold]' : (landing ?? '[data-fold]')
    dock.current?.querySelector<HTMLElement>(target)?.focus({ preventScroll: true })
  }, [folded])

  // The small frame leaves at once, and comes back a beat after the panel started leaving.
  const frameMoves = folded ? onTheBeat(fade) : fade
  const away = slide('stage').enter
  const stowed = folded && !moving

  return (
    <section ref={dock} aria-label={label} className={DOCK}>
      <div aria-hidden="true" className="panel-slot shrink-0" />
      <div className={CLIP}>
        {/* Mounted whether the panel is folded or not, so that an unfold starts moving on the
              frame it is asked on rather than after the whole body has been laid out. Folded, it
              is out of reach of the keyboard and of a screen reader, and once it has left, not
              drawn at all. */}
        <div
          inert={folded}
          aria-hidden={folded ? true : undefined}
          data-panel
          data-over={covers ? '' : undefined}
          data-stowed={stowed ? '' : undefined}
          className={stowed ? STOWED : PANEL}
        >
          <header className={HEAD}>
            <div className="flex min-w-0 flex-1 flex-col gap-1">{head}</div>
            <span className={END}>
              <Tooltip label={over ? 'Back beside the chat' : 'Over the chat'}>
                <IconButton
                  variant="ghost"
                  size="sm"
                  icon={
                    over ? (
                      <IconArrowsDiagonalMinimize2 size="sm" />
                    ) : (
                      <IconArrowsDiagonal size="sm" />
                    )
                  }
                  aria-label="Over the chat"
                  aria-pressed={over}
                  data-over-toggle
                  onClick={() => onOver(!over)}
                />
              </Tooltip>
              <Tooltip label={`Fold the ${name}`}>
                <IconButton
                  variant="ghost"
                  size="sm"
                  icon={<IconChevronRight size="sm" />}
                  aria-label={`Fold the ${name}`}
                  data-fold
                  onClick={onFold}
                />
              </Tooltip>
            </span>
          </header>
          <div className={BODY}>{body}</div>
          {foot}
        </div>
      </div>
      {/* Drawn over the panel, so its leaving and its return are seen whole. */}
      <motion.div
        inert={!folded}
        aria-hidden={folded ? undefined : true}
        data-panel-frame
        className={FRAME}
        initial={false}
        animate={folded ? { x: 0, ...CROSSFADE.to } : { x: away, ...CROSSFADE.from }}
        transition={frameMoves}
      >
        <div className="pointer-events-auto">{frame}</div>
      </motion.div>
      {covers && notices !== undefined && (
        <div className={FLOAT} data-notices-over>
          {notices}
        </div>
      )}
    </section>
  )
}
