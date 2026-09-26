import { cn } from 'cn'
import { motion } from 'motion/react'
import { type ReactNode, useEffect, useRef, useState } from 'react'

import { OVER_MARK, SlidingMark } from '../../components/sliding-mark/sliding-mark.tsx'
import { Tooltip } from '../../components/tooltip/tooltip.tsx'
import { CROSSFADE, crossfade, instant, morph, useTransition } from '../../motion.ts'
import { PHASE_TITLES, type PhaseName } from '../../spec/model.ts'
import { SPEC_PHASE_ICONS } from '../../spec/spec-icons.ts'
import { SpecPart } from '../../spec/spec-panel.tsx'
import type { RailGroup } from '../../spec/spec-rail.tsx'
import {
  Arriving,
  BODY_FIT,
  FOOT_BAND,
  HEAD_BAND,
  Head,
  MarkReady,
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
  STATE_WORDS,
  type VariantProps,
  phaseProgress,
  useRefocus,
} from './variants.tsx'

/**
 * V4 and V4b, the answer to the verdict of 26 September on issue #159: folded, V3's small frame
 * of the three phases' glyphs, tinted by progress and centred on the window's height; open, ONE
 * frame holding the whole Spec as one column read from top to bottom — every phase and its parts
 * one after the other — with the phases' glyphs at its top saying where the reader is and taking
 * them to a phase. No rail beside a stage, no card per phase, no margin lost to either.
 *
 * - V4 · Strip · the glyphs stand in a strip at the top of the body, over the column, a mark on
 *   the phase being read and its name beside them.
 * - V4b · Rim · the glyphs stand on the rim, under the head, each in a segment with its name, how
 *   much of it is written and a hairline of how much of it has been read; the body is the column
 *   alone.
 *
 * The way between the two is one movement in both: the frame grows from the folded one to the
 * panel on `morph` while each glyph travels from the folded frame to its place at the top, and
 * the head, the column and `Mark ready` arrive into the frame as it opens. Folding, the glyphs
 * travel back and the frame closes on them.
 */

/** Where the frame is: folded, growing into the panel, or open. */
type Growth = 'folded' | 'opening' | 'open'

/** The body of the folded frame with nothing of it drawn: the glyphs alone, where they stand. */
// Nothing clipped: a glyph travelling into it is drawn the whole of its way, not only once it
// is inside the body.
const BODY_BARE = 'flex flex-col rounded-lg border border-transparent'

/** The frame folded: V3's rail, the unfold on the rim and the phases' glyphs in the body. */
export function FoldedPhases({
  session,
  family,
  travels,
  onOpen,
  chrome = true,
  glyphs = true,
}: {
  session: SpecSession
  family: string
  travels: boolean
  onOpen: (phase: PhaseName | null) => void
  /**
   * Whether the unfold and the body are drawn. A transition lays the glyphs alone on top, and
   * fades the frame they stand in on a copy underneath.
   */
  chrome?: boolean | undefined
  /** Whether the glyphs are drawn: that copy keeps their room and shows none of them. */
  glyphs?: boolean | undefined
}): ReactNode {
  return (
    <>
      <div className={chrome ? 'flex flex-col' : 'invisible flex flex-col'}>
        <FoldToggle folded onToggle={() => onOpen(null)} />
      </div>
      <div className={chrome ? BODY_FIT : BODY_BARE}>
        <nav aria-label={`Phases of ${session.spec.key}`} className="flex flex-col gap-1 p-1">
          {session.groups.map((group) => {
            const progress = phaseProgress(group, session.spec.focus)
            const title = PHASE_TITLES[group.phase]
            return (
              <Tooltip
                key={group.phase}
                label={`${title} · ${PROGRESS_WORDS[progress]}`}
                side="left"
              >
                <button
                  type="button"
                  aria-label={`${title} phase, ${PROGRESS_WORDS[progress]}, open it`}
                  className={cn('flex rounded-md outline-none focus-ring', !glyphs && 'invisible')}
                  onClick={() => onOpen(group.phase)}
                >
                  <PhaseGlyph
                    phase={group.phase}
                    progress={progress}
                    travels={travels}
                    family={family}
                  />
                </button>
              </Tooltip>
            )
          })}
        </nav>
      </div>
    </>
  )
}

/** How many of a phase's parts hold something, as the rail counts them. */
export function writtenOf(group: RailGroup): number {
  return group.rows.filter((row) => row.mark !== 'empty').length
}

/**
 * The whole Spec as one column: every phase under a quiet heading of its own, its parts one after
 * the other, the phases parted by a rule. The column is the region the stage was, and what the
 * scroll-spy reads: each phase is a block of it. Its content arrives a phase per beat, from
 * `first` on.
 */
function SpecColumn({
  session,
  spy,
  first,
}: {
  session: SpecSession
  spy: ScrollSpy<PhaseName>
  /** The beat the first phase arrives on; null when the column is uncovered, never arriving. */
  first: number | null
}): ReactNode {
  const { spec } = session
  const Rise = first === null ? Still : Arriving
  return (
    <div
      ref={spy.scroller}
      role="region"
      aria-label={`Stage of ${spec.key}`}
      tabIndex={0}
      className="relative min-h-0 min-w-0 flex-1 overflow-y-auto outline-none focus-ring"
    >
      {session.groups.map((group, index) => {
        const Icon = SPEC_PHASE_ICONS[group.phase]
        const title = PHASE_TITLES[group.phase]
        return (
          <section
            key={group.phase}
            ref={spy.anchor(group.phase)}
            data-phase={group.phase}
            aria-label={`${title} phase`}
            className="flex flex-col gap-6 border-b border-border px-6 pt-5 pb-8 last:border-b-0"
          >
            <Rise order={(first ?? 0) + index}>
              <h3 className="flex items-center gap-2 text-sm font-medium text-muted-foreground">
                <Icon size="sm" aria-hidden="true" />
                <span className="text-foreground">{title}</span>
                <span>· {STATE_WORDS[group.state]}</span>
              </h3>
            </Rise>
            {group.rows.map((row) => (
              <Rise key={row.target} order={(first ?? 0) + index}>
                <div data-part={row.target}>
                  <SpecPart spec={spec} target={row.target} onGoToQuestion={() => undefined} />
                </div>
              </Rise>
            ))}
          </section>
        )
      })}
    </div>
  )
}

/** What stands in place of `Arriving` where nothing arrives. */
function Still({
  className,
  children,
}: {
  order?: number
  from?: 'below' | 'side'
  className?: string | undefined
  children: ReactNode
}): ReactNode {
  return <div className={className}>{children}</div>
}

/**
 * A piece of the open frame that is not a glyph: it arrives on its beat as V4b has it, or, handed
 * `shown`, it is there or not and fades between the two on `crossfade` — for a transition that
 * lands the frame first and fills it after, and empties it before it folds.
 */
function Piece({
  shown,
  order = 0,
  from = 'below',
  className,
  onHidden,
  stays = false,
  children,
}: {
  shown: boolean | undefined
  order?: number
  from?: 'below' | 'side'
  className?: string | undefined
  onHidden?: (() => void) | undefined
  /** Whether, handed no `shown`, it stands where it is rather than arriving. */
  stays?: boolean | undefined
  children: ReactNode
}): ReactNode {
  const fade = useTransition(crossfade)
  if (shown === undefined && stays) return <div className={className}>{children}</div>
  if (shown === undefined) {
    return (
      <Arriving order={order} from={from} className={className}>
        {children}
      </Arriving>
    )
  }
  return (
    <motion.div
      className={className}
      initial={false}
      animate={shown ? CROSSFADE.to : CROSSFADE.from}
      transition={fade}
      onAnimationComplete={() => {
        if (!shown) onHidden?.()
      }}
    >
      {children}
    </motion.div>
  )
}

/** What the open frame of a variant is handed to lay itself out. */
export interface OpenLayer {
  session: SpecSession
  spy: ScrollSpy<PhaseName>
  family: string
  /** Whether the frame has finished opening: a mark waits for its glyph to have landed. */
  settled: boolean
  /** Whether the reader asked for less movement. */
  still: boolean
  fold: () => void
}

/** The body of the frame taking the rest of its height, its strip over its column. */
export const BODY_COLUMN =
  'flex min-h-0 flex-1 flex-col overflow-hidden rounded-lg border border-border bg-surface-body shadow-sm'

/**
 * A laid-out layer of the frame, held on its right edge and its vertical centre by the frame, which
 * lets it overflow to the left and equally up and down while it is smaller than it.
 */
export const ANCHORED = 'flex shrink-0 flex-col border border-transparent p-1.5'

/**
 * The frame both variants share: folded to V3's glyphs, grown into the panel on `morph`, and what
 * it holds laid out at the size it is going to, held on its right edge and its vertical centre —
 * which do not move while it grows — so that the rim uncovers it and a glyph travels to where it
 * lands, not to where it stood the frame the growth began.
 *
 * The rim's line is drawn over what it holds rather than around it: the layers inside are placed
 * against the rim's edge and have to wear the same one-pixel room to line up with the probe.
 */
function ColumnFrame({
  session,
  defaultFolded,
  family,
  layer: Layer,
}: VariantProps & {
  family: string
  layer: (props: OpenLayer) => ReactNode
}): ReactNode {
  const [growth, setGrowth] = useState<Growth>(defaultFolded ? 'folded' : 'open')
  const [foldedProbe, folded] = useSize()
  const [openProbe, opened] = useSize()
  const answered = useTransition(morph)
  const still = answered === instant
  const dock = useRef<HTMLDivElement>(null)
  const byHand = useRef(false)
  const placed = useRef<Size | null>(null)
  const [pressed, setPressed] = useState<PhaseName | null>(null)
  const spy = useScrollSpy(session.groups.map((group) => group.phase))
  const target = growth === 'folded' ? folded : opened
  const transition = placed.current === null ? instant : answered
  useEffect(() => {
    if (target !== null) placed.current = target
  })
  useRefocus(growth === 'folded', byHand, dock, growth)
  // A glyph pressed on the folded frame opens the column on its phase, at once: the content is
  // arriving, and a scroll on top of it would be two journeys at once.
  useEffect(() => {
    if (growth === 'folded' || pressed === null) return
    spy.goTo(pressed, true)
    setPressed(null)
  }, [growth, pressed])

  function unfold(phase: PhaseName | null): void {
    if (growth !== 'folded') return
    byHand.current = true
    setPressed(phase)
    setGrowth(still ? 'open' : 'opening')
  }

  function fold(): void {
    byHand.current = true
    setGrowth('folded')
  }

  return (
    <div ref={dock} className="relative flex h-full shrink-0 items-center py-3 pr-3">
      <Probe measure={openProbe} className="invisible absolute inset-y-3 right-3 w-mission-panel" />
      <Probe measure={foldedProbe} className="invisible absolute right-3">
        <div className={RIM}>
          <FoldedPhases
            session={session}
            family={family}
            travels={false}
            onOpen={() => undefined}
          />
        </div>
      </Probe>
      <motion.section
        aria-label={`Spec ${session.spec.key}`}
        className="relative flex shrink-0 items-center justify-end overflow-hidden rounded-xl bg-surface-rim"
        initial={false}
        animate={target ?? {}}
        transition={transition}
        onAnimationComplete={() => {
          if (growth === 'opening') setGrowth('open')
        }}
      >
        {growth === 'folded' ? (
          <div className={ANCHORED}>
            <FoldedPhases session={session} family={family} travels onOpen={unfold} />
          </div>
        ) : (
          opened !== null && (
            // Laid at the size the frame is going to: placed there, never travelling.
            <motion.div
              className={ANCHORED}
              initial={false}
              animate={{ width: opened.width, height: opened.height }}
              transition={instant}
            >
              <Layer
                session={session}
                spy={spy}
                family={family}
                settled={growth === 'open'}
                still={still}
                fold={fold}
              />
            </motion.div>
          )
        )}
        <span
          aria-hidden="true"
          className="pointer-events-none absolute inset-0 rounded-xl border border-border"
        />
      </motion.section>
    </div>
  )
}

/** The words of the phase being read: its name, its state, and how much of it is written. */
function phaseWords(group: RailGroup): string {
  return `${STATE_WORDS[group.state]} · ${writtenOf(group)} of ${group.rows.length} written`
}

// ---------------------------------------------------------------------------------------------
// V4 · the strip over the column

/** The mark of the phase being read, behind its glyph. */
const STRIP_MARK = 'absolute inset-0 rounded-lg bg-accent'

/**
 * V4's strip: at the top of the body, over the column and never scrolled with it, the three
 * glyphs, a mark behind the one being read, and that phase's words beside them. A glyph pressed
 * scrolls the column to its phase.
 */
function StripLayer({ session, spy, family, settled, still, fold }: OpenLayer): ReactNode {
  const fade = useTransition(crossfade)
  const current = session.groups.find((group) => group.phase === spy.active)
  return (
    <>
      <Arriving from="side" className={HEAD_BAND}>
        <Head session={session} onFold={fold} />
      </Arriving>
      <div className={BODY_COLUMN}>
        <div className="flex shrink-0 items-center gap-3 border-b border-border px-3 py-2">
          <nav
            aria-label={`Phases of ${session.spec.key}`}
            className="relative isolate flex shrink-0 gap-1"
          >
            {session.groups.map((group) => {
              const progress = phaseProgress(group, session.spec.focus)
              const title = PHASE_TITLES[group.phase]
              return (
                <Tooltip
                  key={group.phase}
                  label={`${title} · ${PROGRESS_WORDS[progress]}`}
                  side="bottom"
                >
                  <button
                    type="button"
                    data-mark={group.phase}
                    aria-current={spy.active === group.phase ? 'location' : undefined}
                    aria-label={`Go to the ${title} phase, ${PROGRESS_WORDS[progress]}`}
                    className="relative flex rounded-lg p-1 outline-none focus-ring"
                    onClick={() => spy.goTo(group.phase, still)}
                  >
                    <span className={cn('flex', OVER_MARK)}>
                      <PhaseGlyph phase={group.phase} progress={progress} travels family={family} />
                    </span>
                  </button>
                </Tooltip>
              )
            })}
            <SlidingMark target={settled ? spy.active : null} shape={STRIP_MARK} />
          </nav>
          {current !== undefined && (
            <motion.p
              key={current.phase}
              aria-live="polite"
              className="min-w-0 truncate text-sm text-muted-foreground"
              initial={CROSSFADE.from}
              animate={CROSSFADE.to}
              transition={fade}
            >
              <span className="font-medium text-foreground">{PHASE_TITLES[current.phase]}</span>
              {` · ${phaseWords(current)}`}
            </motion.p>
          )}
        </div>
        <SpecColumn session={session} spy={spy} first={1} />
      </div>
      <Arriving order={3} className={FOOT_BAND}>
        <MarkReady session={session} />
      </Arriving>
    </>
  )
}

/**
 * V4. Folded, V3's frame: the three phases' glyphs tinted by progress. Open, one frame: the head
 * on the rim, then the body — a strip of the three glyphs at its top, the whole Spec under it as
 * one column, phase after phase — and `Mark ready` on the rim at the foot. The strip is a
 * scroll-spy: a mark sits behind the glyph of the phase being read, and slides to the next as the
 * reader scrolls into it; the phase's name and how much of it is written stand beside the glyphs.
 * A glyph pressed, in the strip or on the folded frame, takes the column to its phase.
 *
 * Unfolding, the frame grows into the panel while the three glyphs travel from the folded frame
 * into the strip; the head comes in from the side, the phases rise into the column one beat after
 * the other, and once the frame is open the mark lands on the phase being read.
 */
export function V4Strip(props: VariantProps): ReactNode {
  return <ColumnFrame {...props} family="v4" layer={StripLayer} />
}

// ---------------------------------------------------------------------------------------------
// V4b · the phases on the rim

/** The mark of the phase being read: a piece of the body raised on the rim, as a frame's is. */
const RIM_MARK = 'absolute inset-0 rounded-lg border border-border bg-surface-body shadow-sm'

/**
 * V4b's segments: on the rim, under the head, one per phase, each its glyph, its name, how much of
 * it is written, and a hairline of how much of it the reader has scrolled past.
 */
export function RimLayer({
  session,
  spy,
  family,
  settled,
  still,
  fold,
  shown,
  onHidden,
  glyphsAway = false,
  segments = true,
}: OpenLayer & {
  /**
   * Whether what is not a glyph is there, for a transition that fills the frame once it landed
   * and empties it before folding; left out, it arrives as V4b has it.
   */
  shown?: boolean | undefined
  /** Called once it is all gone, `shown` turned false. */
  onHidden?: (() => void) | undefined
  /** Whether the glyphs are elsewhere — carried outside the frame — their room kept empty. */
  glyphsAway?: boolean | undefined
  /**
   * Whether the phases stand on the rim. Without them, the phases and the fold are a frame of
   * their own docked beside this one, and the head folds nothing.
   */
  segments?: boolean | undefined
}): ReactNode {
  const fade = useTransition(crossfade)
  return (
    <>
      <Piece shown={shown} from="side" className={HEAD_BAND}>
        <Head session={session} onFold={segments ? fold : undefined} />
      </Piece>
      {segments && (
        <nav
          aria-label={`Phases of ${session.spec.key}`}
          className="relative isolate z-1 grid shrink-0 grid-cols-3 gap-1 pb-1.5"
        >
          {session.groups.map((group) => {
            const progress = phaseProgress(group, session.spec.focus)
            const title = PHASE_TITLES[group.phase]
            const reading = spy.active === group.phase
            return (
              <button
                key={group.phase}
                type="button"
                data-mark={group.phase}
                aria-current={reading ? 'location' : undefined}
                aria-label={`Go to the ${title} phase, ${PROGRESS_WORDS[progress]}`}
                className="relative flex min-w-0 flex-col gap-1.5 rounded-lg p-1.5 text-left outline-none focus-ring"
                onClick={() => spy.goTo(group.phase, still)}
              >
                <span className={cn('flex min-w-0 items-center gap-2', OVER_MARK)}>
                  <span className={glyphsAway ? 'invisible flex' : 'flex'}>
                    <PhaseGlyph
                      phase={group.phase}
                      progress={progress}
                      travels={!glyphsAway}
                      family={family}
                    />
                  </span>
                  <Piece shown={shown} from="side" order={1} className="flex min-w-0 flex-col">
                    <span
                      className={cn(
                        'truncate text-sm font-medium',
                        reading ? 'text-foreground' : 'text-muted-foreground',
                      )}
                    >
                      {title}
                    </span>
                    <span className="truncate text-xs text-muted-foreground">
                      {writtenOf(group)} of {group.rows.length} written
                    </span>
                  </Piece>
                </span>
                <Piece
                  shown={shown}
                  stays
                  className={cn('block h-0.5 overflow-hidden rounded-full bg-border', OVER_MARK)}
                >
                  {/* Where the reader is, followed as they scroll: set, never travelled. */}
                  <motion.span
                    className="block h-full origin-left rounded-full bg-muted-foreground"
                    initial={false}
                    animate={{ scaleX: spy.read[group.phase] }}
                    transition={instant}
                  />
                </Piece>
              </button>
            )
          })}
          {shown === undefined ? (
            <SlidingMark target={settled ? spy.active : null} shape={RIM_MARK} />
          ) : (
            // Faded as a whole with what it marks. An opacity and not a filter: a filter would hold
            // the mark's box, which is placed against the list.
            <motion.div initial={false} animate={{ opacity: shown ? 1 : 0 }} transition={fade}>
              <SlidingMark target={settled ? spy.active : null} shape={RIM_MARK} />
            </motion.div>
          )}
        </nav>
      )}
      {shown === undefined ? (
        <div className={BODY_COLUMN}>
          <SpecColumn session={session} spy={spy} first={2} />
        </div>
      ) : (
        <Piece shown={shown} className={BODY_COLUMN} onHidden={onHidden}>
          <SpecColumn session={session} spy={spy} first={null} />
        </Piece>
      )}
      <Piece shown={shown} order={4} className={FOOT_BAND}>
        <MarkReady session={session} />
      </Piece>
    </>
  )
}

/**
 * V4b. The same frame and the same column as V4, and the phases moved out of the body onto the
 * rim, where the frame keeps everything that is not what it holds: under the head, three segments
 * as wide as each other, each a phase's glyph, its name and how much of it is written. The body
 * is then the column alone, from edge to edge, nothing laid over it.
 *
 * Where the reader is says itself twice, without a word added: the phase being read is raised as
 * a piece of the body on the rim — the mark slides from one segment to the next — and a hairline
 * under each segment fills as the reader scrolls through that phase, so the strip is also how
 * much of the Spec has been read. Unfolding, the glyphs travel from the folded frame into their
 * segments and the names come in beside them once they have landed.
 */
export function V4bRim(props: VariantProps): ReactNode {
  return <ColumnFrame {...props} family="v4b" layer={RimLayer} />
}
