import { AnimatePresence, motion } from 'motion/react'
import { type ReactNode, useEffect, useRef, useState } from 'react'

import { IconButton } from '../../components/button/button.tsx'
import { Frame, FrameHeader } from '../../components/frame/frame.tsx'
import { Tooltip } from '../../components/tooltip/tooltip.tsx'
import { IconChevronLeft, IconChevronRight } from '../../icons.ts'
import {
  CROSSFADE,
  LABEL_DELAY,
  MARK_SCALE,
  MARK_TRAVEL,
  arrival,
  crossfade,
  instant,
  morph,
  useTransition,
} from '../../motion.ts'
import { PHASE_TITLES, type PhaseName, type PhaseState } from '../../spec/model.ts'
import { SPEC_PHASE_ICONS } from '../../spec/spec-icons.ts'
import { SpecPart } from '../../spec/spec-panel.tsx'
import { type RailGroup, SpecRail, progressOf } from '../../spec/spec-rail.tsx'
import {
  Arriving,
  ArrivingStage,
  BODY_FILL,
  BODY_FIT,
  FOOT_BAND,
  HEAD_BAND,
  Head,
  MarkReady,
  Probe,
  RIM,
  RIM_CENTRED,
  type Size,
  type SpecSession,
  useSize,
} from './frames-fixtures.tsx'

/**
 * The three answers to the question of issue #159: the Spec panel and its rail as frames, the
 * rail folded to a small floating frame, and a designed way from one to the other.
 *
 * - V1 · the rail's frame grows into the panel: one frame, which opens as a card, and whose
 *   head, rail and parts then move into place.
 * - V2 · the rail stays where it is, and the Spec opens beside it: two frames, the rail's gaining
 *   its words while the stage's unrolls from behind it.
 * - V3 · a frame per phase: folded, the phases' glyphs; unfolded, each glyph travels into the
 *   head of its phase's card, and the cards open one after the other.
 */

export interface VariantProps {
  session: SpecSession
  /** Whether the panel stands folded when the Session opens. */
  defaultFolded: boolean
}

/**
 * Where the keyboard goes once the hand folded or unfolded: onto the control that does the
 * other, which is what stands in place of the one pressed.
 */
export function useRefocus(
  folded: boolean,
  byHand: { current: boolean },
  within: { current: HTMLElement | null },
  /** What changes when the control may have arrived: V1's frame opens before its head does. */
  step: string = String(folded),
): void {
  useEffect(() => {
    if (!byHand.current) return
    const name = folded ? 'Unfold the Spec' : 'Fold the Spec'
    const buttons = within.current?.querySelectorAll<HTMLElement>(`[aria-label="${name}"]`) ?? []
    // A probe's copy is inert and never the one the keyboard lands on.
    const target = [...buttons].find((button) => button.closest('[inert]') === null)
    if (target === undefined) return
    byHand.current = false
    target.focus()
  }, [step])
}

/** The chevron that unfolds or folds the Spec, standing open on a rim. */
export function FoldToggle({
  folded,
  onToggle,
}: {
  folded: boolean
  onToggle: () => void
}): ReactNode {
  const label = folded ? 'Unfold the Spec' : 'Fold the Spec'
  return (
    <div className="flex shrink-0 justify-center pb-1.5">
      <Tooltip label={label} side="left">
        <IconButton
          variant="ghost"
          size="sm"
          icon={folded ? <IconChevronLeft size="sm" /> : <IconChevronRight size="sm" />}
          aria-label={label}
          onClick={onToggle}
        />
      </Tooltip>
    </div>
  )
}

// ---------------------------------------------------------------------------------------------
// V1 · the rail's frame grows into the panel

/** Where V1's frame is: folded, growing into the panel with nothing in it yet, or open. */
type Growth = 'folded' | 'opening' | 'open'

/** The rail folded: the unfold on the rim, the glyphs in the body. */
function FoldedRail({
  session,
  onUnfold,
}: {
  session: SpecSession
  onUnfold: () => void
}): ReactNode {
  return (
    <>
      <FoldToggle folded onToggle={onUnfold} />
      {/* A glyph pressed puts its part on the stage and unfolds, as the band of `MissionPanel`. */}
      <div className={BODY_FIT} onClickCapture={onUnfold}>
        <SpecRail {...session.rail} folded />
      </div>
    </>
  )
}

/**
 * V1. Folded, the rail is a frame of its own, sized to its glyphs and centred on the height of
 * the window, a margin off its edge. Unfolding, that frame *is* the panel: its rim grows on
 * `morph` — the spring made for a dimension — to the panel's width and the window's height, empty,
 * the way a card opens; once it has, the head comes in from the side, then the rail's words, then
 * the parts rise into place one beat after the other. Folding, what it holds leaves at once, the
 * glyphs fade back in, and the rim closes onto them.
 *
 * The chat is pushed, never covered: the frame is a slot of the row, as the panel is today.
 */
export function V1Grow({ session, defaultFolded }: VariantProps): ReactNode {
  const [growth, setGrowth] = useState<Growth>(defaultFolded ? 'folded' : 'open')
  const [panelProbe, panel] = useSize()
  const [railProbe, rail] = useSize()
  const answered = useTransition(morph)
  const fade = useTransition(crossfade)
  const dock = useRef<HTMLDivElement>(null)
  const byHand = useRef(false)
  // The first size the frame is given is where it stands, not somewhere it travels to.
  const placed = useRef<Size | null>(null)
  const target = growth === 'folded' ? rail : panel
  const transition = placed.current === null ? instant : answered
  useEffect(() => {
    if (target !== null) placed.current = target
  })
  const folded = growth === 'folded'
  useRefocus(folded, byHand, dock, growth)

  function unfold(): void {
    if (growth !== 'folded') return
    byHand.current = true
    // Told to move less, there is no growth to wait for.
    setGrowth(answered === instant ? 'open' : 'opening')
  }

  function fold(): void {
    byHand.current = true
    setGrowth('folded')
  }

  return (
    <div ref={dock} className="relative flex h-full shrink-0 items-center py-3 pr-3">
      <Probe
        measure={panelProbe}
        className="invisible absolute inset-y-3 right-3 w-mission-panel"
      />
      <Probe measure={railProbe} className="invisible absolute right-3">
        <div className={RIM}>
          <FoldedRail session={session} onUnfold={unfold} />
        </div>
      </Probe>
      <motion.section
        aria-label={`Spec ${session.spec.key}`}
        className={RIM_CENTRED}
        initial={false}
        animate={target ?? {}}
        transition={transition}
        onAnimationComplete={() => {
          if (growth === 'opening') setGrowth('open')
        }}
      >
        {growth === 'folded' && (
          <motion.div
            className="flex flex-col"
            initial={CROSSFADE.from}
            animate={CROSSFADE.to}
            transition={fade}
          >
            <FoldedRail session={session} onUnfold={unfold} />
          </motion.div>
        )}
        {growth === 'opening' && <div className={BODY_FILL} />}
        {growth === 'open' && (
          <>
            <Arriving from="side" className={HEAD_BAND}>
              <Head session={session} onFold={fold} />
            </Arriving>
            <div className={BODY_FILL}>
              <Arriving from="side" order={1} className="flex">
                <SpecRail {...session.rail} />
              </Arriving>
              <ArrivingStage session={session} first={2} />
            </div>
            <Arriving order={3} className={FOOT_BAND}>
              <MarkReady session={session} />
            </Arriving>
          </>
        )}
      </motion.section>
    </div>
  )
}

// ---------------------------------------------------------------------------------------------
// V2 · the rail stays, the Spec opens beside it

/**
 * V2. Two frames. The rail is a frame of its own, folded or not, and never leaves its place at
 * the window's edge, centred on its height: unfolding, it only gains its words, its rim widening
 * and growing up and down around the glyph the hand is on. The Spec — its head, its stage and
 * `Mark ready` — is the second frame, which unrolls from behind the rail towards the chat,
 * pushing it: what it holds is laid at its full width from the first frame and uncovered as it
 * opens, while the parts rise into place. Folding, it rolls back behind the rail.
 *
 * The rail is the handle in both states: the chevron on its rim unfolds and folds.
 */
export function V2Beside({ session, defaultFolded }: VariantProps): ReactNode {
  const [open, setOpen] = useState(!defaultFolded)
  const [foldedProbe, foldedRail] = useSize()
  const [openProbe, openRail] = useSize()
  const [stageProbe, stage] = useSize()
  const answered = useTransition(morph)
  const dock = useRef<HTMLDivElement>(null)
  const byHand = useRef(false)
  const placed = useRef<Size | null>(null)
  const target = open ? openRail : foldedRail
  const transition = placed.current === null ? instant : answered
  useEffect(() => {
    if (target !== null) placed.current = target
  })
  useRefocus(!open, byHand, dock)

  function toggle(next: boolean): void {
    if (next === open) return
    byHand.current = true
    setOpen(next)
  }

  const railFrame = (unfolded: boolean): ReactNode => (
    <>
      <FoldToggle folded={!unfolded} onToggle={() => toggle(!unfolded)} />
      {unfolded ? (
        <div className={BODY_FIT}>
          {/* The rail's own rule on its right edge goes under the body's border. */}
          <Arriving from="side" className="-mr-0.5 flex">
            <SpecRail {...session.rail} />
          </Arriving>
        </div>
      ) : (
        <div className={BODY_FIT} onClickCapture={() => toggle(true)}>
          <SpecRail {...session.rail} folded />
        </div>
      )}
    </>
  )

  return (
    <div ref={dock} className="relative flex h-full shrink-0 items-center gap-2 py-3 pr-3">
      <Probe measure={foldedProbe} className="invisible absolute right-3">
        <div className={RIM}>{railFrame(false)}</div>
      </Probe>
      <Probe measure={openProbe} className="invisible absolute right-3">
        <div className={RIM}>
          <FoldToggle folded={false} onToggle={() => undefined} />
          <div className={BODY_FIT}>
            <div className="-mr-0.5 flex">
              <SpecRail {...session.rail} />
            </div>
          </div>
        </div>
      </Probe>
      <Probe measure={stageProbe} className="invisible absolute">
        <div className={RIM}>
          <div className="w-mission-panel" />
        </div>
      </Probe>
      <AnimatePresence initial={false}>
        {open && stage !== null && (
          <motion.section
            key="spec"
            aria-label={`Spec ${session.spec.key}`}
            className="relative h-full shrink-0 overflow-hidden rounded-xl border border-border bg-surface-rim"
            initial={{ width: 0 }}
            animate={{ width: stage.width }}
            exit={{ width: 0 }}
            transition={answered}
          >
            {/* Laid at its full width, against the rail: the rim uncovers it as it opens. */}
            <div className="absolute inset-y-1.5 right-1.5 flex w-mission-panel flex-col">
              <Arriving from="side" className={HEAD_BAND}>
                <Head session={session} />
              </Arriving>
              <div className={BODY_FILL}>
                <ArrivingStage session={session} first={1} />
              </div>
              <div className={FOOT_BAND}>
                <MarkReady session={session} />
              </div>
            </div>
          </motion.section>
        )}
      </AnimatePresence>
      <motion.div
        className={RIM_CENTRED}
        initial={false}
        animate={target ?? {}}
        transition={transition}
      >
        {railFrame(open)}
      </motion.div>
    </div>
  )
}

// ---------------------------------------------------------------------------------------------
// V3 · a frame per phase

/** How far along a phase is, as its glyph says it. */
export type PhaseProgress = 'done' | 'started' | 'empty'

export function phaseProgress(group: RailGroup, following: string | undefined): PhaseProgress {
  const each = group.rows.map((row) =>
    progressOf(row.target === following ? 'writing' : row.mark, group.state),
  )
  if (each.length > 0 && each.every((one) => one === 'done')) return 'done'
  return each.some((one) => one !== 'empty') ? 'started' : 'empty'
}

/** A phase's glyph in its square, tinted by how far along the phase is. */
const GLYPH: Record<PhaseProgress, string> = {
  done: 'flex size-control-sm items-center justify-center rounded-md bg-success-muted text-success-muted-foreground',
  started:
    'flex size-control-sm items-center justify-center rounded-md bg-primary-muted text-primary-muted-foreground',
  empty:
    'flex size-control-sm items-center justify-center rounded-md bg-muted-foreground/15 text-muted-foreground',
}

export const PROGRESS_WORDS: Record<PhaseProgress, string> = {
  done: 'done',
  started: 'started',
  empty: 'nothing written',
}

export const STATE_WORDS: Record<PhaseState, string> = {
  finished: 'Finished',
  open: 'Open',
  pending: 'Not started',
  stale: 'To review',
  unavailable: 'Unavailable',
}

/**
 * The glyph of a phase, which travels between the folded rail and the head of its card: the
 * same `layoutId` on both, on `morph`, so it reads as one glyph moving and not two.
 */
export function PhaseGlyph({
  phase,
  progress,
  travels,
  family = 'phase',
}: {
  phase: PhaseName
  progress: PhaseProgress
  /** Whether it is the one that travels; a probe's copy never is. */
  travels: boolean
  /** Whose glyphs they are: two variants' glyphs never travel into each other. */
  family?: string | undefined
}): ReactNode {
  const transition = useTransition(morph)
  const Icon = SPEC_PHASE_ICONS[phase]
  if (!travels) {
    return (
      <span aria-hidden="true" className={GLYPH[progress]}>
        <Icon size="md" />
      </span>
    )
  }
  return (
    <motion.span
      aria-hidden="true"
      layoutId={`${family}-${phase}`}
      transition={transition}
      className={GLYPH[progress]}
    >
      <Icon size="md" />
    </motion.span>
  )
}

/** The rail of V3 folded: a frame of the phases' glyphs, and the unfold on its rim. */
function PhaseRail({
  session,
  travels,
  onOpen,
}: {
  session: SpecSession
  travels: boolean
  onOpen: (phase: PhaseName | null) => void
}): ReactNode {
  return (
    <Frame header={<FoldToggle folded onToggle={() => onOpen(null)} />}>
      <nav aria-label={`Phases of ${session.spec.key}`} className="flex flex-col gap-1 p-1">
        {session.groups.map((group) => {
          const progress = phaseProgress(group, session.spec.focus)
          const title = PHASE_TITLES[group.phase]
          return (
            <Tooltip key={group.phase} label={`${title} · ${PROGRESS_WORDS[progress]}`} side="left">
              <button
                type="button"
                aria-label={`${title} phase, ${PROGRESS_WORDS[progress]}, open it`}
                className="flex rounded-md outline-none focus-ring"
                onClick={() => onOpen(group.phase)}
              >
                <PhaseGlyph phase={group.phase} progress={progress} travels={travels} />
              </button>
            </Tooltip>
          )
        })}
      </nav>
    </Frame>
  )
}

/** A phase's card: its glyph and name open on the rim, its parts in the body. */
function PhaseCard({
  session,
  group,
  order,
  anchor,
}: {
  session: SpecSession
  group: RailGroup
  order: number
  anchor: (node: HTMLDivElement | null) => void
}): ReactNode {
  const answered = useTransition(arrival)
  const transition = answered === instant ? instant : { ...answered, delay: LABEL_DELAY * order }
  const progress = phaseProgress(group, session.spec.focus)
  const written = group.rows.filter((row) => row.mark !== 'empty').length
  const title = PHASE_TITLES[group.phase]
  return (
    <motion.div
      ref={anchor}
      data-phase={group.phase}
      className="flex shrink-0 flex-col"
      initial={{ scale: MARK_SCALE, y: MARK_TRAVEL, ...CROSSFADE.from }}
      animate={{ scale: 1, y: 0, ...CROSSFADE.to }}
      transition={transition}
    >
      <Frame
        header={
          <FrameHeader
            icon={<PhaseGlyph phase={group.phase} progress={progress} travels />}
            title={title}
            description={`${STATE_WORDS[group.state]} · ${written} of ${group.rows.length} written`}
          />
        }
      >
        <div className="flex flex-col gap-8 px-6 py-5">
          {group.rows.map((row) => (
            <div key={row.target} data-part={row.target}>
              <SpecPart spec={session.spec} target={row.target} onGoToQuestion={() => undefined} />
            </div>
          ))}
        </div>
      </Frame>
    </motion.div>
  )
}

/**
 * V3. The panel is not one frame but a frame per phase, the way the rest of the app is cards.
 * Folded, the rail is a small frame of the three phases' glyphs, each tinted by how far along its
 * phase is — done, started, nothing written — centred on the window's height. Unfolding, the
 * column opens to the panel's width, pushing the chat, and each glyph travels from the rail into
 * the head of its phase's card while the cards open one after the other, from a little smaller
 * and a little lower; the phase pressed is scrolled to. Folding, the glyphs travel back into the
 * rail and the column closes on it. There is no stage to choose: the cards are the Spec, read
 * from top to bottom.
 */
export function V3Cards({ session, defaultFolded }: VariantProps): ReactNode {
  const [open, setOpen] = useState(!defaultFolded)
  const [foldedProbe, folded] = useSize()
  const [openProbe, opened] = useSize()
  const answered = useTransition(morph)
  const dock = useRef<HTMLDivElement>(null)
  const byHand = useRef(false)
  const placed = useRef<Size | null>(null)
  const cards = useRef(new Map<PhaseName, HTMLDivElement>())
  const [goTo, setGoTo] = useState<PhaseName | null>(null)
  const target = open ? opened : folded
  const transition = placed.current === null ? instant : answered
  useEffect(() => {
    if (target !== null) placed.current = target
  })
  useRefocus(!open, byHand, dock)
  useEffect(() => {
    if (!open || goTo === null) return
    cards.current.get(goTo)?.scrollIntoView({ block: 'start' })
    setGoTo(null)
  }, [open, goTo])

  return (
    <motion.div
      ref={dock}
      className="relative flex h-full shrink-0 justify-end overflow-hidden"
      initial={false}
      animate={target === null ? {} : { width: target.width }}
      transition={transition}
    >
      <Probe measure={foldedProbe} className="invisible absolute flex py-3 pr-3">
        <PhaseRail session={session} travels={false} onOpen={() => undefined} />
      </Probe>
      <Probe measure={openProbe} className="invisible absolute w-mission-panel" />
      {open ? (
        <section
          aria-label={`Spec ${session.spec.key}`}
          className="flex w-mission-panel shrink-0 flex-col gap-2 py-3 pr-3"
        >
          <Arriving from="side" className="shrink-0 px-2 pt-1">
            <Head
              session={session}
              onFold={() => {
                byHand.current = true
                setOpen(false)
              }}
            />
          </Arriving>
          <div
            role="region"
            aria-label={`Stage of ${session.spec.key}`}
            tabIndex={0}
            className="flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto rounded-xl outline-none focus-ring"
          >
            {session.groups.map((group, index) => (
              <PhaseCard
                key={group.phase}
                session={session}
                group={group}
                order={index + 1}
                anchor={(node) => {
                  if (node === null) cards.current.delete(group.phase)
                  else cards.current.set(group.phase, node)
                }}
              />
            ))}
          </div>
          <div className={FOOT_BAND}>
            <MarkReady session={session} />
          </div>
        </section>
      ) : (
        <div className="flex items-center py-3 pr-3">
          <PhaseRail
            session={session}
            travels
            onOpen={(phase) => {
              byHand.current = true
              setGoTo(phase)
              setOpen(true)
            }}
          />
        </div>
      )}
    </motion.div>
  )
}
