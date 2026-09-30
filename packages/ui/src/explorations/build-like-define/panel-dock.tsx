import { AnimatePresence, animate, motion, useMotionValue } from 'motion/react'
import { type ReactNode, useEffect, useLayoutEffect, useRef, useState } from 'react'

import { IconButton } from '../../components/button/button.tsx'
import { Tooltip } from '../../components/tooltip/tooltip.tsx'
import { IconChevronRight } from '../../icons.ts'
import {
  CROSSFADE,
  crossfade,
  instant,
  onTheBeat,
  slide,
  swap,
  useTransition,
} from '../../motion.ts'

/**
 * The side panel of a Session, one mechanism for `define`'s Spec and `build`'s build (issue #77,
 * maintainer's feedback of 30 September): the chat on the left, the panel on the right in the Spec
 * panel's frame, its widths, its fold to a small frame at the window's edge, and its swap, which
 * pushes the chat on the very spring the panel slides on. It is drawn from the Spec panel's own
 * utilities (`spec-slot`, `spec-panel-in`, `w-spec-panel`), so every panel of a Session is the
 * same panel.
 *
 * Beside the fold, a choice in two words — beside the chat, over the chat — lays the panel over
 * the chat, the whole width of the row, and takes it back. Over the chat and not pushing it: the chat keeps its width under the panel and nothing
 * in it reflows, so what moves is the panel's own left edge, on the swap's spring. The chat is out
 * of reach while it is covered, and two things of it come up over the panel:
 *
 * - the Session's notices, which float over the panel's content where they stood over the chat —
 *   the same height from the page's foot, rising and popping as they do there;
 * - the head line, when the page lays it over the chat only (placement B): it goes into the
 *   panel's head, and back to the chat once the panel is back beside it.
 *
 * The page hands the panel its title, its body and its small frame; the panel holds nothing of
 * what it shows. Over the chat, the page hands it a richer body than beside it: the width is for
 * showing more, not the same thing spread out.
 */

/** The row, and the container the open panel's width is a share of. */
const ROW = '@container relative flex min-h-0 flex-1 overflow-x-clip'

const CHAT = 'flex min-h-0 min-w-0 flex-1 flex-col'

const DOCK = 'flex h-full min-h-0 shrink-0 py-3 pr-3'

/** The panel's clip, laid against the row so that it can reach over the chat. */
const CLIP = 'pointer-events-none absolute inset-y-3 right-0 box-content overflow-hidden pr-3'

/** How wide the clip is: the Spec's open width, the row less its two margins, or between. */
const CLIP_WIDTH =
  'calc(var(--spacing-spec-panel) + (100cqw - var(--spacing) * 6 - var(--spacing-spec-panel)) * var(--panel-over, 0))'

const PANEL =
  'spec-panel-in pointer-events-auto flex size-full flex-col rounded-xl border border-border bg-surface-rim p-1.5'

const STOWED =
  'spec-panel-in pointer-events-auto invisible flex size-full flex-col rounded-xl border border-border bg-surface-rim p-1.5'

const FRAME = 'pointer-events-none absolute inset-y-3 right-3 flex items-start'

const HEAD = 'flex min-h-control-md shrink-0 items-center gap-2 pt-1 pr-1.5 pb-2.5 pl-2.5'

const TITLE = 'flex min-w-0 shrink-0 items-center gap-2'

/** Where the head line stands in the panel's head while the panel covers the chat. */
const LINE = 'relative flex min-w-0 flex-1 items-center'

/**
 * Where the panel stands, said in words and chosen by a press: beside the chat, or over it. Two
 * words rather than an icon, since an icon for "a panel over another" reads as nothing.
 */
const PLACES = 'flex items-center gap-0.5 rounded-md border border-border p-0.5'

const PLACE =
  'rounded-sm px-2 py-0.5 text-xs text-muted-foreground outline-none hover:text-foreground focus-ring aria-pressed:bg-background aria-pressed:font-medium aria-pressed:text-foreground aria-pressed:shadow-sm'

const END = 'ml-auto flex shrink-0 items-center gap-1.5'

const BODY =
  'relative flex min-h-0 flex-1 flex-col overflow-hidden rounded-lg border border-border bg-surface-body shadow-sm'

/**
 * The notices over the panel: a layer across the row holding, at its foot and never drawn, the
 * chat's own foot — the composer as it is — so that the notices stand on its top edge exactly
 * where they stood over the chat, with nothing measured. They are clipped at that edge, so they
 * rise out of it as they rise out of the composer, and the room above lets the pop be seen whole.
 */
const FLOAT_LAYER = 'pointer-events-none absolute inset-0 flex flex-col justify-end'

const FLOAT = 'absolute inset-x-0 bottom-full flex justify-center overflow-hidden pt-4'

export interface PanelDockProps {
  /** What the panel is called. */
  label: string
  /** The chat column. */
  chat: ReactNode
  /** The panel's name on its head: its icon and its words. */
  title: ReactNode
  body: ReactNode
  /** The small frame the panel folds to, its unfold button marked `data-unfold`. */
  frame: ReactNode
  /** The head line, drawn in the panel's head while it covers the chat (placement B). */
  line?: ReactNode
  /** The Session's notices, floated over the panel while it covers the chat. */
  notices?: ReactNode
  /** The chat's foot, drawn nowhere: what the floated notices stand on. */
  foot?: ReactNode
  folded: boolean
  over: boolean
  onFold: (folded: boolean) => void
  onOver: (over: boolean) => void
}

export function PanelDock({
  label,
  chat,
  title,
  body,
  frame,
  line,
  notices,
  foot,
  folded,
  over,
  onFold,
  onOver,
}: PanelDockProps): ReactNode {
  const row = useRef<HTMLDivElement>(null)
  const clip = useRef<HTMLDivElement>(null)
  const [moving, setMoving] = useState(false)
  const [wasFolded, setWasFolded] = useState(folded)
  if (wasFolded !== folded) {
    setWasFolded(folded)
    setMoving(true)
  }
  const refocus = useRef(false)
  const move = useTransition(swap.move)
  const fade = useTransition(swap.fade)
  const swapLine = useTransition(crossfade)
  const still = move === instant
  const open = useMotionValue(folded ? 0 : 1)
  const covering = useMotionValue(over ? 1 : 0)
  const covers = over && !folded

  function pose(share: number): void {
    row.current?.style.setProperty('--spec-open', String(share))
  }

  function cover(share: number): void {
    row.current?.style.setProperty('--panel-over', String(share))
  }

  function asked(next: boolean): void {
    refocus.current = row.current?.contains(document.activeElement) ?? false
    onFold(next)
  }

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
      <div inert={covers} aria-hidden={covers ? true : undefined} className={CHAT}>
        {chat}
      </div>
      <div className={DOCK}>
        <div aria-hidden="true" className="spec-slot shrink-0" />
      </div>
      <div ref={clip} className={CLIP}>
        <section
          aria-label={label}
          inert={folded}
          aria-hidden={folded ? true : undefined}
          data-panel
          data-over={over ? '' : undefined}
          data-stowed={stowed ? '' : undefined}
          className={stowed ? STOWED : PANEL}
        >
          <header className={HEAD}>
            <span className={TITLE}>{title}</span>
            <span className={LINE}>
              <AnimatePresence initial={false}>
                {covers && line !== undefined && (
                  <motion.span
                    key="line"
                    className="flex min-w-0 flex-1"
                    initial={CROSSFADE.from}
                    animate={CROSSFADE.to}
                    exit={CROSSFADE.from}
                    transition={swapLine}
                  >
                    {line}
                  </motion.span>
                )}
              </AnimatePresence>
            </span>
            <span className={END}>
              <div role="group" aria-label="Where the panel stands" className={PLACES}>
                <button
                  type="button"
                  className={PLACE}
                  aria-pressed={!over}
                  data-beside
                  onClick={() => onOver(false)}
                >
                  Beside the chat
                </button>
                <button
                  type="button"
                  className={PLACE}
                  aria-pressed={over}
                  data-over-toggle
                  onClick={() => onOver(true)}
                >
                  Over the chat
                </button>
              </div>
              <Tooltip label="Fold the panel">
                <IconButton
                  variant="ghost"
                  size="sm"
                  icon={<IconChevronRight size="sm" />}
                  aria-label="Fold the panel"
                  data-fold
                  onClick={() => asked(true)}
                />
              </Tooltip>
            </span>
          </header>
          <div className={BODY}>{body}</div>
        </section>
      </div>
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
      <div className={FLOAT_LAYER}>
        <div className="relative">
          <div inert aria-hidden="true" className="invisible">
            {foot}
          </div>
          <div className={FLOAT} data-notices-over>
            {covers && notices}
          </div>
        </div>
      </div>
    </div>
  )
}
