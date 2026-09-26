import { AnimatePresence, type Transition, motion } from 'motion/react'
import { type ReactNode, type RefObject, useEffect, useRef, useState } from 'react'

import {
  CROSSFADE,
  arrival,
  crossfade,
  instant,
  morph,
  slide,
  useTransition,
} from '../../motion.ts'
import { PHASE_TITLES, type PhaseName } from '../../spec/model.ts'
import { OVER_MARK, SlidingMark } from '../../components/sliding-mark/sliding-mark.tsx'
import { Tooltip } from '../../components/tooltip/tooltip.tsx'
import { ANCHORED, FoldedPhases, RimLayer } from './column-variants.tsx'
import {
  BODY_FIT,
  Probe,
  RIM,
  type ScrollSpy,
  type Size,
  type SpecSession,
  useScrollSpy,
  useSize,
} from './frames-fixtures.tsx'
import {
  FoldToggle,
  PROGRESS_WORDS,
  PhaseGlyph,
  type VariantProps,
  phaseProgress,
} from './variants.tsx'

/**
 * Three ways between V4b's two states (issue #159, second verdict of 26 September: V4b kept, its
 * fold refused both ways). The folded frame and the open frame are V4b's, untouched; only the
 * journey between them changes.
 *
 * - A · Morph · the folded frame *is* the rim: one shape, growing, with the glyphs inside it
 *   sliding into their segments; the rest fills it once it has landed.
 * - B · Drawer · the panel, laid at its size, slides in from the window's edge behind the folded
 *   frame, which fades away into it. Nothing grows.
 * - C · Reveal · the panel, laid at its size, is uncovered from the folded frame's rectangle to
 *   its whole, the glyphs travelling to their segments while it is.
 * - Drawer 1 · Swap and Drawer 2 · Carried · two takes on B (third verdict: B leaned to, not there
 *   yet): the folded frame trading places with the panel, one after the other; or the folded
 *   frame kept as it is and docked as the panel's navigation, the panel sliding in beside it.
 *
 * Every one pushes the chat on the same spring as its own movement, and every one answers a
 * reader asking for less movement by landing at once.
 */

export interface TransitionProps extends VariantProps {
  /** Each change folds the Spec if it is open and unfolds it if it is folded: the replay. */
  signal?: number | undefined
  /** Told each time the Spec has landed, folded or open. */
  onSettle?: ((folded: boolean) => void) | undefined
}

const NOTHING = (): void => undefined

/**
 * Where the keyboard goes once the Spec has landed after the hand folded or unfolded it: onto
 * the control that does the other. Only on landing: on the way, the control is not there yet or
 * not seen yet.
 */
function useLanding(
  landed: 'folded' | 'open' | null,
  byHand: { current: boolean },
  dock: { current: HTMLElement | null },
  onSettle: ((folded: boolean) => void) | undefined,
): void {
  useEffect(() => {
    if (landed === null) return
    onSettle?.(landed === 'folded')
    if (!byHand.current) return
    const name = landed === 'folded' ? 'Unfold the Spec' : 'Fold the Spec'
    const buttons = dock.current?.querySelectorAll<HTMLElement>(`[aria-label="${name}"]`) ?? []
    const target = [...buttons].find((button) => button.closest('[inert]') === null)
    if (target === undefined) return
    byHand.current = false
    target.focus()
  }, [landed])
}

/** Calls `toggle` each time the replay's signal changes. */
function useSignal(signal: number | undefined, toggle: () => void): void {
  const seen = useRef(signal)
  useEffect(() => {
    if (signal === seen.current) return
    seen.current = signal
    toggle()
  }, [signal])
}

/**
 * What the folded frame draws besides its glyphs — the unfold, the body, and with `rim` its rim —
 * alone, the glyphs' room kept empty: laid under the glyphs, it fades out as they leave and in as
 * they come back. Held on the right edge and the vertical centre of what it is laid in, as the
 * folded frame is.
 */
function Dress({
  session,
  family,
  on,
  rim = false,
  onDone,
}: {
  session: SpecSession
  family: string
  /** Whether it fades in (true) or out (false). */
  on: boolean
  rim?: boolean | undefined
  onDone?: (() => void) | undefined
}): ReactNode {
  const fade = useTransition(crossfade)
  return (
    <motion.div
      inert
      aria-hidden="true"
      className="pointer-events-none absolute inset-y-0 right-0 z-1 flex items-center"
      initial={on ? CROSSFADE.from : CROSSFADE.to}
      animate={on ? CROSSFADE.to : CROSSFADE.from}
      transition={fade}
      onAnimationComplete={() => onDone?.()}
    >
      <div className={rim ? RIM : ANCHORED}>
        <FoldedPhases
          session={session}
          family={family}
          travels={false}
          glyphs={false}
          onOpen={NOTHING}
        />
      </div>
    </motion.div>
  )
}

/** The rim's line, drawn over what the frame holds so that what it holds lines up with a probe. */
function RimLine(): ReactNode {
  return (
    <span
      aria-hidden="true"
      className="pointer-events-none absolute inset-0 rounded-xl border border-border"
    />
  )
}

/** The probes of both states: the panel's box, and the folded frame's. */
function Probes({
  session,
  family,
  open,
  folded,
}: {
  session: SpecSession
  family: string
  open: RefObject<HTMLDivElement | null>
  folded: RefObject<HTMLDivElement | null>
}): ReactNode {
  return (
    <>
      <Probe measure={open} className="invisible absolute inset-y-3 right-3 w-mission-panel" />
      <Probe measure={folded} className="invisible absolute right-3">
        <div className={RIM}>
          <FoldedPhases session={session} family={family} travels={false} onOpen={NOTHING} />
        </div>
      </Probe>
    </>
  )
}

/**
 * The first size a box is given is where it stands, not somewhere it travels to: the transition
 * to play towards `target`, `instant` until it has been placed once.
 */
function usePlaced(target: Size | null, answered: Transition): Transition {
  const placed = useRef<Size | null>(null)
  const transition = placed.current === null ? instant : answered
  useEffect(() => {
    if (target !== null) placed.current = target
  })
  return transition
}

// ---------------------------------------------------------------------------------------------
// A · Morph

/**
 * Where A is, in order both ways: the folded frame shedding its unfold and its body, the shape
 * growing with the glyphs sliding inside it, the open frame filling; and back.
 */
type MorphStage = 'folded' | 'shedding' | 'growing' | 'open' | 'emptying' | 'shrinking' | 'dressing'

const MORPH_OPEN: readonly MorphStage[] = ['growing', 'open', 'emptying']

/**
 * A · Morph. The folded frame is the shape that becomes the rim: one box, whose size and place
 * are played on `morph` from the folded frame's to the panel's, radius and line unchanged, never
 * emptied and refilled. It goes in three beats, and closes on the same three backwards:
 *
 * 1. the unfold and the little body around the glyphs fade away, the glyphs staying where they
 *    are (`crossfade`);
 * 2. the shape grows into the panel while each glyph slides inside it, from the folded frame
 *    into its segment (`morph`, the glyphs on the shape's own spring);
 * 3. once the shape has landed, and only then, the head, the segments' names, the column and
 *    `Mark ready` fade in, and the mark settles on the phase being read (`crossfade`).
 *
 * What is laid inside the shape is laid at the size it is going to and held on its right edge
 * and vertical centre, which do not move: nothing is reflowed on the way, only uncovered.
 */
export function TransitionMorph({
  session,
  defaultFolded,
  signal,
  onSettle,
}: TransitionProps): ReactNode {
  const family = 'v4b-a'
  const [stage, setStage] = useState<MorphStage>(defaultFolded ? 'folded' : 'open')
  const [foldedProbe, folded] = useSize()
  const [openProbe, opened] = useSize()
  const answered = useTransition(morph)
  const still = answered === instant
  const dock = useRef<HTMLDivElement>(null)
  const byHand = useRef(false)
  const [pressed, setPressed] = useState<PhaseName | null>(null)
  const spy = useScrollSpy(session.groups.map((group) => group.phase))
  const grown = MORPH_OPEN.includes(stage)
  const target = grown ? opened : folded
  const transition = usePlaced(target, answered)
  useLanding(stage === 'folded' || stage === 'open' ? stage : null, byHand, dock, onSettle)
  useEffect(() => {
    if (!grown || pressed === null) return
    spy.goTo(pressed, true)
    setPressed(null)
  }, [grown, pressed])

  function unfold(phase: PhaseName | null): void {
    if (stage !== 'folded') return
    byHand.current = true
    setPressed(phase)
    setStage(still ? 'open' : 'shedding')
  }

  function fold(): void {
    if (stage !== 'open') return
    byHand.current = true
    setStage(still ? 'folded' : 'emptying')
  }

  useSignal(signal, () => {
    if (stage === 'folded') unfold(null)
    else fold()
  })

  // The glyphs alone, standing where the folded frame has them, over what fades around them.
  const bare = (
    <div className={`${ANCHORED} relative z-1`}>
      <FoldedPhases session={session} family={family} travels chrome={false} onOpen={NOTHING} />
    </div>
  )

  return (
    <div ref={dock} className="relative flex h-full shrink-0 items-center py-3 pr-3">
      <Probes session={session} family={family} open={openProbe} folded={foldedProbe} />
      <motion.section
        aria-label={`Spec ${session.spec.key}`}
        className="relative flex shrink-0 items-center justify-end overflow-hidden rounded-xl bg-surface-rim"
        initial={false}
        animate={target ?? {}}
        transition={transition}
        onAnimationComplete={() => {
          if (stage === 'growing') setStage('open')
          if (stage === 'shrinking') setStage('dressing')
        }}
      >
        {stage === 'folded' && (
          <div className={ANCHORED}>
            <FoldedPhases session={session} family={family} travels onOpen={unfold} />
          </div>
        )}
        {stage === 'shedding' && (
          <>
            <Dress
              session={session}
              family={family}
              on={false}
              onDone={() => setStage('growing')}
            />
            {bare}
          </>
        )}
        {grown && opened !== null && (
          <motion.div
            className={ANCHORED}
            initial={false}
            animate={{ width: opened.width, height: opened.height }}
            transition={instant}
          >
            <RimLayer
              session={session}
              spy={spy}
              family={family}
              settled={stage !== 'growing'}
              still={still}
              fold={fold}
              shown={stage === 'open'}
              onHidden={() => setStage('shrinking')}
            />
          </motion.div>
        )}
        {stage === 'shrinking' && bare}
        {stage === 'dressing' && (
          <>
            <Dress session={session} family={family} on onDone={() => setStage('folded')} />
            {bare}
          </>
        )}
        <RimLine />
      </motion.section>
    </div>
  )
}

// ---------------------------------------------------------------------------------------------
// B · Drawer and C · Reveal: the panel laid at its size

/**
 * Where B and C are: folded, on the way in, open, on the way out — and, for Drawer 1, the folded
 * frame retreating before the panel comes in.
 */
type PanelStage = 'folded' | 'retreating' | 'opening' | 'open' | 'closing'

/**
 * What B and C share: the stage, the probes, and the room the panel takes in the row — an empty
 * box whose width goes from the folded frame's to the panel's on `morph`, so that the chat is
 * pushed on the same spring the panel moves on and never covered.
 */
function usePanel(
  { session, defaultFolded, signal, onSettle }: TransitionProps,
  /** Whether the folded frame leaves first, the panel coming in only once it has. */
  retreat = false,
) {
  const [stage, setStage] = useState<PanelStage>(defaultFolded ? 'folded' : 'open')
  const [foldedProbe, folded] = useSize()
  const [openProbe, opened] = useSize()
  const answered = useTransition(morph)
  const still = answered === instant
  const dock = useRef<HTMLDivElement>(null)
  const byHand = useRef(false)
  const [pressed, setPressed] = useState<PhaseName | null>(null)
  const spy = useScrollSpy(session.groups.map((group) => group.phase))
  const shown = stage === 'opening' || stage === 'open'
  const room = shown ? opened : folded
  const transition = usePlaced(room, answered)
  useLanding(stage === 'folded' || stage === 'open' ? stage : null, byHand, dock, onSettle)
  useEffect(() => {
    if (!shown || pressed === null) return
    spy.goTo(pressed, true)
    setPressed(null)
  }, [shown, pressed])

  function unfold(phase: PhaseName | null): void {
    if (stage !== 'folded') return
    byHand.current = true
    setPressed(phase)
    setStage(still ? 'open' : retreat ? 'retreating' : 'opening')
  }

  function fold(): void {
    if (stage !== 'open') return
    byHand.current = true
    setStage(still ? 'folded' : 'closing')
  }

  useSignal(signal, () => {
    if (stage === 'folded') unfold(null)
    else fold()
  })

  const spacer = (
    <motion.div
      aria-hidden="true"
      className="shrink-0"
      initial={false}
      animate={room === null ? {} : { width: room.width }}
      transition={transition}
    />
  )

  const probes = <Probes session={session} family="" open={openProbe} folded={foldedProbe} />

  return {
    stage,
    setStage,
    shown,
    opened,
    folded,
    answered,
    still,
    dock,
    spy,
    unfold,
    fold,
    spacer,
    probes,
  }
}

/** The panel's rim and what it holds, at the panel's size. */
function PanelContent({
  session,
  panel,
  family,
}: {
  session: SpecSession
  panel: ReturnType<typeof usePanel>
  family: string
}): ReactNode {
  return (
    <div className="flex size-full flex-col border border-transparent p-1.5">
      <RimLayer
        session={session}
        spy={panel.spy}
        family={family}
        settled={panel.stage === 'open'}
        still={panel.still}
        fold={panel.fold}
        shown
      />
    </div>
  )
}

/**
 * B · Drawer. The panel is laid at its size from the first frame, clipped to its own box at the
 * window's edge, and slides into that box from the edge on `morph` — the spring the chat is
 * pushed on — behind the folded frame, which fades away over it (`crossfade`): its glyphs give
 * way to the segments the panel brings with it. Nothing grows; nothing is laid out twice.
 * Folding, the panel slides back out by the edge while the folded frame fades back in over it.
 */
export function TransitionDrawer(props: TransitionProps): ReactNode {
  const { session } = props
  const family = 'v4b-b'
  const panel = usePanel(props)
  const fade = useTransition(crossfade)
  const away = slide('stage').enter
  const present = panel.stage === 'folded' || panel.stage === 'closing'
  return (
    <div ref={panel.dock} className="relative flex h-full shrink-0 items-center py-3 pr-3">
      {panel.probes}
      {panel.spacer}
      <div className="pointer-events-none absolute inset-y-3 right-3 w-mission-panel overflow-hidden rounded-xl">
        <AnimatePresence initial={false} onExitComplete={() => panel.setStage('folded')}>
          {panel.shown && (
            <motion.section
              key="panel"
              aria-label={`Spec ${session.spec.key}`}
              className="pointer-events-auto relative flex size-full flex-col rounded-xl bg-surface-rim"
              initial={{ x: away }}
              animate={{ x: 0 }}
              exit={{ x: away }}
              transition={panel.answered}
              onAnimationComplete={() => {
                if (panel.stage === 'opening') panel.setStage('open')
              }}
            >
              <PanelContent session={session} panel={panel} family={family} />
              <RimLine />
            </motion.section>
          )}
        </AnimatePresence>
      </div>
      {/* Faded out, it is neither reached nor read, and the hand goes through it to the panel. */}
      <motion.div
        inert={!present}
        aria-hidden={present ? undefined : 'true'}
        className="pointer-events-none absolute inset-y-3 right-3 flex items-center"
        initial={false}
        animate={present ? CROSSFADE.to : CROSSFADE.from}
        transition={fade}
      >
        <div className={`${RIM} pointer-events-auto`}>
          <FoldedPhases session={session} family={family} travels={false} onOpen={panel.unfold} />
        </div>
      </motion.div>
    </div>
  )
}

/**
 * C · Reveal. The panel is laid at its size from the first frame and never resized: what moves
 * is what is shown of it, a `clip-path` opening on `morph` from the folded frame's rectangle —
 * its place, its size, its radius — to the whole panel, the chat pushed on the same spring. The
 * glyphs travel from the folded frame into their segments while it opens, on the same spring,
 * which keeps each of them inside what is already uncovered all the way; the folded frame's
 * unfold and body fade away under them as it starts. Folding, the panel is clipped back onto the
 * folded frame's rectangle, the glyphs travel back, and the unfold and body fade back in.
 */
export function TransitionReveal(props: TransitionProps): ReactNode {
  const { session } = props
  const family = 'v4b-c'
  const panel = usePanel(props)
  const { opened, folded } = panel
  // The folded frame's rectangle, in the panel's own terms: on its right edge, centred.
  const shut =
    opened === null || folded === null
      ? undefined
      : `inset(${String((opened.height - folded.height) / 2)}px 0px ${String((opened.height - folded.height) / 2)}px ${String(opened.width - folded.width)}px round var(--radius-xl))`
  const whole = 'inset(0px 0px 0px 0px round var(--radius-xl))'
  return (
    <div ref={panel.dock} className="relative flex h-full shrink-0 items-center py-3 pr-3">
      {panel.probes}
      {panel.spacer}
      <div className="pointer-events-none absolute inset-y-3 right-3 w-mission-panel">
        <AnimatePresence initial={false} onExitComplete={() => panel.setStage('folded')}>
          {panel.shown && shut !== undefined && (
            <motion.section
              key="panel"
              aria-label={`Spec ${session.spec.key}`}
              className="pointer-events-auto relative flex size-full flex-col rounded-xl bg-surface-rim"
              initial={{ clipPath: shut }}
              animate={{ clipPath: whole }}
              exit={{ clipPath: shut }}
              transition={panel.answered}
              onAnimationComplete={() => {
                if (panel.stage === 'opening') panel.setStage('open')
              }}
            >
              {panel.stage === 'opening' && (
                <Dress session={session} family={family} on={false} rim />
              )}
              <PanelContent session={session} panel={panel} family={family} />
              <RimLine />
            </motion.section>
          )}
        </AnimatePresence>
      </div>
      {!panel.shown && (
        <div className="pointer-events-none absolute inset-y-3 right-3 flex items-center">
          {panel.stage === 'closing' && <Dress session={session} family={family} on rim />}
          <div
            className={
              panel.stage === 'folded'
                ? `${RIM} pointer-events-auto relative z-1`
                : `${ANCHORED} relative z-1`
            }
          >
            <FoldedPhases
              session={session}
              family={family}
              travels
              chrome={panel.stage === 'folded'}
              onOpen={panel.unfold}
            />
          </div>
        </div>
      )}
    </div>
  )
}

// ---------------------------------------------------------------------------------------------
// Drawer 1 · Swap

/**
 * Drawer 1 · Swap. B's drawer, the folded frame no longer fading in place over it: the two trade
 * places one after the other, each way the mirror of the other. Unfolding, the folded frame first
 * retreats by the window's edge — sliding out and fading on the `crossfade` beat — and only once
 * it has gone does the panel slide in from that edge on `morph`, the chat pushed on the same
 * spring. Folding, the panel slides out the same way, and once it has gone the folded frame comes
 * back in from the edge on `arrival`, something putting itself in place. They are never in sight
 * together.
 */
export function DrawerSwap(props: TransitionProps): ReactNode {
  const { session } = props
  const family = 'v4b-swap'
  const panel = usePanel(props, true)
  const leave = useTransition(crossfade)
  const come = useTransition(arrival)
  const away = slide('stage').enter
  const present = panel.stage === 'folded'
  return (
    <div ref={panel.dock} className="relative flex h-full shrink-0 items-center py-3 pr-3">
      {panel.probes}
      {panel.spacer}
      <motion.div
        inert={!present}
        aria-hidden={present ? undefined : 'true'}
        className="pointer-events-none absolute inset-y-3 right-3 flex items-center"
        initial={false}
        animate={present ? { x: 0, ...CROSSFADE.to } : { x: away, ...CROSSFADE.from }}
        transition={present ? come : leave}
        onAnimationComplete={() => {
          if (panel.stage === 'retreating') panel.setStage('opening')
        }}
      >
        <div className={`${RIM} pointer-events-auto`}>
          <FoldedPhases session={session} family={family} travels={false} onOpen={panel.unfold} />
        </div>
      </motion.div>
      <div className="pointer-events-none absolute inset-y-3 right-3 w-mission-panel overflow-hidden rounded-xl">
        <AnimatePresence initial={false} onExitComplete={() => panel.setStage('folded')}>
          {panel.shown && (
            <motion.section
              key="panel"
              aria-label={`Spec ${session.spec.key}`}
              className="pointer-events-auto relative flex size-full flex-col rounded-xl bg-surface-rim"
              initial={{ x: away }}
              animate={{ x: 0 }}
              exit={{ x: away }}
              transition={panel.answered}
              onAnimationComplete={() => {
                if (panel.stage === 'opening') panel.setStage('open')
              }}
            >
              <PanelContent session={session} panel={panel} family={family} />
              <RimLine />
            </motion.section>
          )}
        </AnimatePresence>
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------------------------
// Drawer 2 · Carried

/** The mark of the phase being read, behind its glyph in the docked frame. */
const DOCK_MARK = 'absolute -inset-1 rounded-lg bg-accent ring-1 ring-border'

/**
 * The folded frame, which is also the open panel's navigation: the same frame in both states,
 * never remounted, so that nothing about it changes but what its controls say. Folded, its
 * chevron unfolds and a glyph unfolds onto its phase; open, its chevron folds, a mark sits behind
 * the glyph of the phase being read, and a glyph scrolls the column to its phase.
 */
function DockedPhases({
  session,
  open,
  spy,
  onUnfold,
  onFold,
}: {
  session: SpecSession
  open: boolean
  spy: ScrollSpy<PhaseName>
  onUnfold: (phase: PhaseName | null) => void
  onFold: () => void
}): ReactNode {
  const fade = useTransition(crossfade)
  return (
    <div className={RIM}>
      <FoldToggle folded={!open} onToggle={() => (open ? onFold() : onUnfold(null))} />
      <div className={BODY_FIT}>
        <nav
          aria-label={`Phases of ${session.spec.key}`}
          className="relative isolate flex flex-col gap-1 p-1"
        >
          {session.groups.map((group) => {
            const progress = phaseProgress(group, session.spec.focus)
            const title = PHASE_TITLES[group.phase]
            const reading = open && spy.active === group.phase
            return (
              <Tooltip
                key={group.phase}
                label={`${title} · ${PROGRESS_WORDS[progress]}`}
                side="left"
              >
                <button
                  type="button"
                  data-mark={group.phase}
                  aria-current={reading ? 'location' : undefined}
                  aria-label={
                    open
                      ? `Go to the ${title} phase, ${PROGRESS_WORDS[progress]}`
                      : `${title} phase, ${PROGRESS_WORDS[progress]}, open it`
                  }
                  className="relative flex rounded-md outline-none focus-ring"
                  onClick={() =>
                    open ? spy.goTo(group.phase, fade === instant) : onUnfold(group.phase)
                  }
                >
                  <span className={`flex ${OVER_MARK}`}>
                    <PhaseGlyph phase={group.phase} progress={progress} travels={false} />
                  </span>
                </button>
              </Tooltip>
            )
          })}
          <motion.div initial={false} animate={{ opacity: open ? 1 : 0 }} transition={fade}>
            <SlidingMark target={open ? spy.active : null} shape={DOCK_MARK} />
          </motion.div>
        </nav>
      </div>
    </div>
  )
}

/** Where Drawer 2 is: folded, the panel sliding in, open, the panel sliding out. */
type DockStage = 'folded' | 'opening' | 'open' | 'closing'

/**
 * Drawer 2 · Carried. The folded frame stays what it is and becomes the panel's navigation: open,
 * it stands docked against the panel's left side, the three phases tinted by progress, the phase
 * being read marked, a phase pressed scrolling the column to it — so the panel drops the phases
 * of its rim and is V4b's head, column and `Mark ready` alone.
 *
 * Unfolding, only the panel moves: it slides in from the window's edge on the frame's right, on
 * `morph`, and the room it takes in the row opens on the same spring, so the frame — the panel's
 * left neighbour — is carried along the row with it, never covered and never redrawn; the chat
 * is pushed the same. Folding, the panel slides back out by the edge and the room closes behind
 * it, leaving the frame as it was.
 */
export function DrawerCarried({
  session,
  defaultFolded,
  signal,
  onSettle,
}: TransitionProps): ReactNode {
  const family = 'v4b-carried'
  const [stage, setStage] = useState<DockStage>(defaultFolded ? 'folded' : 'open')
  const [roomProbe, roomSize] = useSize()
  const answered = useTransition(morph)
  const still = answered === instant
  const dock = useRef<HTMLDivElement>(null)
  const byHand = useRef(false)
  const [pressed, setPressed] = useState<PhaseName | null>(null)
  const spy = useScrollSpy(session.groups.map((group) => group.phase))
  const shown = stage === 'opening' || stage === 'open'
  const mounted = stage !== 'folded'
  const room = roomSize === null ? null : { width: shown ? roomSize.width : 0 }
  const placedAt = room === null ? null : { width: room.width, height: 0 }
  const roomTransition = usePlaced(placedAt, answered)
  useLanding(stage === 'folded' || stage === 'open' ? stage : null, byHand, dock, onSettle)
  useEffect(() => {
    if (!mounted || pressed === null) return
    spy.goTo(pressed, true)
    setPressed(null)
  }, [mounted, pressed])

  // The same control unfolds and folds, and only the room moves: either can be asked for on
  // the way, and the room turns round from where it is.
  function unfold(phase: PhaseName | null): void {
    if (stage !== 'folded' && stage !== 'closing') return
    byHand.current = true
    setPressed(phase)
    setStage(still ? 'open' : 'opening')
  }

  function fold(): void {
    if (stage !== 'open' && stage !== 'opening') return
    byHand.current = true
    setStage(still ? 'folded' : 'closing')
  }

  useSignal(signal, () => {
    if (stage === 'folded') unfold(null)
    else fold()
  })

  return (
    <div ref={dock} className="relative flex h-full shrink-0 items-center py-3 pr-3">
      {/* The room the panel takes beside the frame: its width and the gap before it. */}
      <Probe measure={roomProbe} className="invisible absolute box-content w-mission-panel pl-2" />
      <div className="shrink-0">
        <DockedPhases session={session} open={shown} spy={spy} onUnfold={unfold} onFold={fold} />
      </div>
      {/* The panel is held on the room's left edge, so it slides in as the room opens, the
          window's edge cutting it; the frame on the room's left is carried the same. */}
      <motion.div
        className="relative shrink-0 self-stretch overflow-hidden"
        initial={false}
        animate={room ?? {}}
        transition={roomTransition}
        onAnimationComplete={() => {
          if (stage === 'opening') setStage('open')
          if (stage === 'closing') setStage('folded')
        }}
      >
        {mounted && (
          <section
            aria-label={`Spec ${session.spec.key}`}
            className="absolute inset-y-0 left-2 flex w-mission-panel flex-col rounded-xl bg-surface-rim"
          >
            <div className="flex size-full flex-col border border-transparent p-1.5">
              <RimLayer
                session={session}
                spy={spy}
                family={family}
                settled={stage === 'open'}
                still={still}
                fold={fold}
                shown
                segments={false}
              />
            </div>
            <RimLine />
          </section>
        )}
      </motion.div>
    </div>
  )
}
