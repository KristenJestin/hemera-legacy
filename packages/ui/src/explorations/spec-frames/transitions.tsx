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
import type { PhaseName } from '../../spec/model.ts'
import { ANCHORED, FoldedPhases, RimLayer } from './column-variants.tsx'
import {
  Probe,
  RIM,
  type Size,
  type SpecSession,
  useScrollSpy,
  useSize,
} from './frames-fixtures.tsx'
import type { VariantProps } from './variants.tsx'

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
 *   yet): the folded frame trading places with the panel, or carried in on the panel's edge.
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

/** Where B and C are: folded, on the way in, open, on the way out. */
type PanelStage = 'folded' | 'opening' | 'open' | 'closing'

/**
 * What B and C share: the stage, the probes, and the room the panel takes in the row — an empty
 * box whose width goes from the folded frame's to the panel's on `morph`, so that the chat is
 * pushed on the same spring the panel moves on and never covered.
 */
function usePanel({ session, defaultFolded, signal, onSettle }: TransitionProps) {
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
    setStage(still ? 'open' : 'opening')
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
 * places as one gesture. Unfolding, the folded frame leaves by the window's edge, sliding out and
 * fading on the `crossfade` beat, while the panel slides in from that edge on `morph` above it —
 * the frame is gone before the panel's edge reaches where it stood. Folding, the panel slides out
 * the same way, and once it has gone the folded frame comes back in from the edge on `arrival`,
 * something putting itself in place. They are never both in sight at the same spot.
 */
export function DrawerSwap(props: TransitionProps): ReactNode {
  const { session } = props
  const family = 'v4b-swap'
  const panel = usePanel(props)
  const leave = useTransition(crossfade)
  const come = useTransition(arrival)
  const away = slide('stage').enter
  const present = panel.stage === 'folded'
  return (
    <div ref={panel.dock} className="relative flex h-full shrink-0 items-center py-3 pr-3">
      {panel.probes}
      {panel.spacer}
      {/* Drawn first: the panel slides in over the place it is leaving. */}
      <motion.div
        inert={!present}
        aria-hidden={present ? undefined : 'true'}
        className="pointer-events-none absolute inset-y-3 right-3 flex items-center"
        initial={false}
        animate={present ? { x: 0, ...CROSSFADE.to } : { x: away, ...CROSSFADE.from }}
        transition={present ? come : leave}
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

/**
 * Where Drawer 2 is, in order both ways: folded; the panel riding in with the folded frame on its
 * left edge; the folded frame handing its glyphs to the segments; open. And back: the glyphs
 * leaving the segments for the frame on the panel's edge; the panel riding out with it.
 */
type CarriedStage = 'folded' | 'riding-in' | 'merging' | 'open' | 'detaching' | 'riding-out'

/**
 * Drawer 2 · Carried. The folded frame is fixed to the panel's left edge, outside it, and stands
 * where it does because the panel is out of the window: the two are one piece sliding on `morph`.
 *
 * Unfolding, the piece slides in from the edge — the panel entering, the folded frame riding on
 * its left side — and the chat is pushed by exactly the frame's left edge, so nothing covers it.
 * Once the panel has landed, the frame hands over: its glyphs travel into their segments, its
 * unfold and body fade away, and the room it took beside the panel closes (`morph`, the push's
 * spring). Folding, the reverse: the room opens again beside the panel, the glyphs leave the
 * segments for the frame, which comes back around them on the panel's edge, and the piece slides
 * out until the panel has gone — leaving the frame where the folded state stands.
 */
export function DrawerCarried({
  session,
  defaultFolded,
  signal,
  onSettle,
}: TransitionProps): ReactNode {
  const family = 'v4b-carried'
  const [stage, setStage] = useState<CarriedStage>(defaultFolded ? 'folded' : 'open')
  const [foldedProbe, folded] = useSize()
  const [openProbe, opened] = useSize()
  const answered = useTransition(morph)
  const still = answered === instant
  const dock = useRef<HTMLDivElement>(null)
  const byHand = useRef(false)
  const [pressed, setPressed] = useState<PhaseName | null>(null)
  const spy = useScrollSpy(session.groups.map((group) => group.phase))
  const away = slide('stage').enter
  const inside = stage !== 'folded' && stage !== 'riding-out'
  // The room in the row: the frame alone, the panel with the frame beside it, the panel alone.
  const beside = stage === 'riding-in' || stage === 'detaching'
  const lone = stage === 'folded' || stage === 'riding-out'
  const room =
    opened === null || folded === null
      ? null
      : lone
        ? folded.width
        : beside
          ? opened.width + folded.width
          : opened.width
  const roomTransition = usePlaced(room === null ? null : { width: room, height: 0 }, answered)
  useLanding(stage === 'folded' || stage === 'open' ? stage : null, byHand, dock, onSettle)
  const shown = stage !== 'folded'
  useEffect(() => {
    if (!shown || pressed === null) return
    spy.goTo(pressed, true)
    setPressed(null)
  }, [shown, pressed])

  function unfold(phase: PhaseName | null): void {
    if (stage !== 'folded') return
    byHand.current = true
    setPressed(phase)
    setStage(still ? 'open' : 'riding-in')
  }

  function fold(): void {
    if (stage !== 'open') return
    byHand.current = true
    setStage(still ? 'folded' : 'detaching')
  }

  useSignal(signal, () => {
    if (stage === 'folded') unfold(null)
    else fold()
  })

  // The frame as it is carried, against the panel's left edge: whole while it rides, fading away
  // as it hands its glyphs over, coming back around them as it takes them again.
  let carried: ReactNode = null
  if (stage === 'merging') {
    carried = <Dress session={session} family={family} on={false} rim />
  } else if (stage === 'detaching') {
    carried = (
      <>
        <Dress session={session} family={family} on rim />
        <div className={`${ANCHORED} relative z-1`}>
          <FoldedPhases session={session} family={family} travels chrome={false} onOpen={NOTHING} />
        </div>
      </>
    )
  } else if (stage !== 'open') {
    carried = (
      <div className={`${RIM} pointer-events-auto relative z-1`}>
        <FoldedPhases session={session} family={family} travels onOpen={unfold} />
      </div>
    )
  }

  return (
    <div ref={dock} className="relative flex h-full shrink-0 items-center py-3 pr-3">
      <Probes session={session} family={family} open={openProbe} folded={foldedProbe} />
      <motion.div
        aria-hidden="true"
        className="shrink-0"
        initial={false}
        animate={room === null ? {} : { width: room }}
        transition={roomTransition}
        onAnimationComplete={() => {
          if (stage === 'merging') setStage('open')
          if (stage === 'detaching') setStage('riding-out')
        }}
      />
      <motion.div
        className="pointer-events-none absolute inset-y-3 right-3 w-mission-panel"
        initial={false}
        animate={{ x: inside ? 0 : away }}
        transition={answered}
        onAnimationComplete={() => {
          if (stage === 'riding-in') setStage('merging')
          if (stage === 'riding-out') setStage('folded')
        }}
      >
        {shown && (
          <section
            aria-label={`Spec ${session.spec.key}`}
            className="pointer-events-auto relative flex size-full flex-col rounded-xl bg-surface-rim"
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
                glyphsAway={stage === 'riding-in' || stage === 'riding-out'}
              />
            </div>
            <RimLine />
          </section>
        )}
        {carried !== null && (
          // Only the folded state's own frame is reached: on its way, it is being carried.
          <div
            inert={stage !== 'folded'}
            aria-hidden={stage === 'folded' ? undefined : 'true'}
            className="pointer-events-none absolute inset-y-0 right-full flex items-center"
          >
            {carried}
          </div>
        )}
      </motion.div>
    </div>
  )
}
