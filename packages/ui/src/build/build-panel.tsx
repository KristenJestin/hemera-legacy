import { AnimatePresence, animate, motion, useMotionValue } from 'motion/react'
import { type ReactNode, useEffect, useLayoutEffect, useRef, useState } from 'react'

import { IconButton } from '../components/button/button.tsx'
import { StatusDot } from '../components/status-dot/status-dot.tsx'
import { Tooltip } from '../components/tooltip/tooltip.tsx'
import { IconChevronLeft, IconChevronRight, IconHammer } from '../icons.ts'
import { CROSSFADE, crossfade, instant, morph, useTransition } from '../motion.ts'
import type { SpecView } from '../spec/model.ts'
import { BuildSpecPanel } from './build-spec-panel.tsx'
import { type BuildViewProps, BuildView } from './build-view.tsx'
import { waitsOf } from './model.ts'

/**
 * The panel of a `build` Session (D10-12): the build beside the chat, in the Session's row, where a
 * `define` Session has its Spec.
 *
 * The Session's page is the one every Session has — its head and what goes on in it, the thread,
 * the composer and the notices on its edge — and the build is what stands on its right: the build
 * view, or the frozen Spec in its place while "Spec" is pressed. What waits for the user in the
 * build is among the Session's notices too, since that is where everything that waits for a human
 * is answered from.
 *
 * It opens unfolded, a share of the row wide, and folds to a band beside the chat: the band's
 * hammer, and a dot while something in the build waits for the hand. The width is what moves, and
 * it pushes the chat: what moves is how far open the panel is, from 0 to 1, which the slot's width
 * is drawn from (`build-slot`). What the panel holds is laid at its unfolded width from the first
 * frame and clipped by the slot, so its text never reflows on the way; only the chat's does.
 */

/** The slot the panel takes in its row, whose width moves; what it holds past it is clipped. */
const SLOT = 'build-slot relative min-h-0 shrink-0 overflow-hidden border-l border-border'

/** What the unfolded panel holds, laid at the unfolded width whatever the slot's own is. */
const OPEN = 'absolute inset-y-0 left-0 flex w-build-panel flex-col bg-surface-content'

const HEAD = 'flex shrink-0 items-center gap-2 border-b border-border px-4 py-2'

const TITLE = 'text-sm font-medium'

/** The build view and the frozen Spec, which takes its place while it is open. */
const STAGE = 'relative flex min-h-0 min-w-0 flex-1 flex-col'

const OVER = 'absolute inset-0 flex flex-col'

/** The build view, and the same view kept drawn and hidden under the Spec. */
const VIEW = 'flex min-h-0 flex-1 flex-col'

const VIEW_UNDER = 'invisible flex min-h-0 flex-1 flex-col'

const BAND =
  'absolute inset-y-0 left-0 z-10 flex w-build-band flex-col items-center gap-3 bg-surface-content pt-2 text-muted-foreground'

export interface BuildPanelProps extends Omit<BuildViewProps, 'specOpen' | 'onToggleSpec'> {
  /** The frozen revision the build works from, which "Spec" opens read only. */
  spec: SpecView
  /** Whether the panel starts folded to its band, which it does not unless told. */
  defaultFolded?: boolean | undefined
  /** Whether the frozen Spec is open in place of the view, for the story that shows it. */
  defaultSpecOpen?: boolean | undefined
}

export function BuildPanel({
  spec,
  defaultFolded = false,
  defaultSpecOpen = false,
  ...view
}: BuildPanelProps): ReactNode {
  const { build } = view
  const [folded, setFolded] = useState(defaultFolded)
  // Whether the width is on its way. Folding, what was open stays in the slot until it has closed.
  const [moving, setMoving] = useState(false)
  const [specOpen, setSpecOpen] = useState(defaultSpecOpen)
  const slot = useRef<HTMLElement>(null)
  // Whether the keyboard was in the panel when the hand folded or unfolded it: the control it
  // was on is gone, and the focus goes to what stands in its place.
  const refocus = useRef(false)
  const width = useTransition(morph)
  const fade = useTransition(crossfade)
  // How far open the panel is, from the band (0) to the unfolded width (1).
  const open = useMotionValue(defaultFolded ? 0 : 1)
  const over = build.phase === 'accepted' || build.phase === 'stopped'
  const waits = !over && waitsOf(build)

  function fold(next: boolean): void {
    if (folded === next) return
    refocus.current = slot.current?.contains(document.activeElement) ?? false
    setFolded(next)
    setMoving(true)
  }

  // Where the keyboard goes once the Spec opened or closed: its Close, or back to what opened it.
  const toSpec = useRef<'open' | 'close' | null>(null)

  function openSpec(): void {
    toSpec.current = 'open'
    setSpecOpen(true)
  }

  function closeSpec(): void {
    toSpec.current = 'close'
    setSpecOpen(false)
  }

  // Once the view is out of reach or back, the keyboard goes where the control it was on stands.
  useEffect(() => {
    const target = toSpec.current
    toSpec.current = null
    if (target === null) return
    const selector = target === 'open' ? '[aria-label="Close the Spec"]' : '[data-spec-toggle]'
    slot.current?.querySelector<HTMLElement>(selector)?.focus()
  }, [specOpen])

  /**
   * Writes how far open the panel is onto its slot, which draws its width from it.
   *
   * Called on every frame the value moves rather than subscribed to it: a value that changes every
   * frame cannot be a class, and a width assembled in a style attribute is a length living outside
   * the theme.
   */
  function pose(share: number): void {
    slot.current?.style.setProperty('--build-open', String(share))
  }

  // The first frame has no animation to report a width: the resting one is written before it.
  useLayoutEffect(() => {
    pose(open.get())
  }, [])

  // A fold moves the width on `morph`, from wherever it stands, pushing the chat on every frame.
  // Told to move less, it lands at once.
  useLayoutEffect(() => {
    const target = folded ? 0 : 1
    if (open.get() === target) return
    if (width === instant) {
      open.jump(target)
      pose(target)
      setMoving(false)
      return
    }
    let live = true
    const travel = animate(open, target, { ...width, onUpdate: pose })
    void travel.then(() => {
      if (live) setMoving(false)
    })
    return () => {
      live = false
      travel.stop()
    }
  }, [folded])

  // Folded, the keyboard lands on the band's unfold button; unfolded, on the head's fold button.
  useEffect(() => {
    if (!refocus.current) return
    refocus.current = false
    const target = folded ? '[data-unfold]' : '[data-fold]'
    slot.current?.querySelector<HTMLElement>(target)?.focus()
  }, [folded])

  return (
    <section ref={slot} aria-label={`Build ${build.specKey}`} className={SLOT}>
      {(!folded || moving) && (
        // Folding, what was open stays under the band until the slot has closed on it, and is out
        // of reach of the keyboard and of a screen reader the whole way.
        <div inert={folded} aria-hidden={folded ? true : undefined} className={OPEN}>
          <header className={HEAD}>
            <IconHammer size="sm" aria-hidden="true" />
            <h2 className={TITLE}>Build</h2>
            <span className="ml-auto flex">
              <Tooltip label="Fold the build">
                <IconButton
                  variant="ghost"
                  size="sm"
                  icon={<IconChevronRight size="sm" />}
                  aria-label="Fold the build"
                  data-fold
                  onClick={() => fold(true)}
                />
              </Tooltip>
            </span>
          </header>
          <div className={STAGE}>
            {/* The view stays drawn under the Spec, so what was unfolded in it is there when the
                Spec closes; it is out of reach while the Spec covers it. */}
            <div
              inert={specOpen}
              aria-hidden={specOpen ? true : undefined}
              className={specOpen ? VIEW_UNDER : VIEW}
            >
              <BuildView
                {...view}
                stories={spec.stories}
                specOpen={specOpen}
                onToggleSpec={() => (specOpen ? closeSpec() : openSpec())}
              />
            </div>
            <AnimatePresence initial={false}>
              {specOpen && (
                <motion.div
                  key="spec"
                  className={OVER}
                  initial={CROSSFADE.from}
                  animate={CROSSFADE.to}
                  exit={CROSSFADE.from}
                  transition={fade}
                >
                  <BuildSpecPanel spec={spec} onClose={closeSpec} />
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        </div>
      )}
      <AnimatePresence initial={false}>
        {folded && (
          <motion.div
            key="band"
            className={BAND}
            initial={CROSSFADE.from}
            animate={CROSSFADE.to}
            transition={fade}
            onClick={() => fold(false)}
          >
            <Tooltip label="Unfold the build" side="left">
              <IconButton
                variant="ghost"
                size="sm"
                icon={<IconChevronLeft size="sm" />}
                aria-label="Unfold the build"
                data-unfold
                onClick={() => fold(false)}
              />
            </Tooltip>
            <IconHammer size="md" aria-hidden="true" />
            {waits && <StatusDot status="running" label="Something in the build waits for you" />}
          </motion.div>
        )}
      </AnimatePresence>
    </section>
  )
}
