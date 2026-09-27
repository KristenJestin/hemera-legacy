import { AnimatePresence, animate, motion, useIsPresent, useMotionValue } from 'motion/react'
import { type ReactNode, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'

import { Button } from '../components/button/button.tsx'
import { IconCheck } from '../icons.ts'
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
} from '../motion.ts'
import type { PhaseName, ReaderView, SpecView } from './model.ts'
import { ReaderBar } from './reader-bar.tsx'
import { ReworkDialog } from './rework-dialog.tsx'
import { SpecColumn, goToPhase } from './spec-column.tsx'
import { SpecFrame } from './spec-frame.tsx'
import { SpecHead } from './spec-head.tsx'
import { phasesOf } from './spec-phases.ts'
import { WorkspaceActions, type WorkspaceActionsProps } from './workspace-actions.tsx'

/**
 * The Spec panel: the working surface of a `define` Session, beside the chat (lot 19; issues
 * #135, #150 and #164).
 *
 * Folded, the Spec is a small frame at the window's edge (`spec-frame.tsx`): the unfold chevron and
 * the three phases' glyphs, each tinted by how far along it is. Open, it is one frame the height of
 * the window: on its rim the head — the key, the title, the status, the revisions, `Rework` on a
 * ready Spec and the fold chevron — then the body, which is the Spec as one column read from top
 * to bottom, each phase under a heading that sticks while it is read (`spec-column.tsx`), and on
 * the rim again one footer across the panel: on a draft, `Mark ready` as the primary action once
 * the whole gate passes, and until then one quiet line of how much is left, the list in its
 * tooltip (issue #205); once the Spec is ready, the build's actions in its place, until it is
 * reworked.
 *
 * The two trade places by a swap (the `swap` kind of the preset). Opening, the small frame slides
 * out by the window's edge and fades, and a beat later, while it is still going, the panel slides
 * in from that edge and pushes the chat; closing, the panel slides out, and a beat later the small
 * frame comes back. The two moves always overlap, so there is no frame where neither is there.
 *
 * The panel is a slot of the Session's row and the chat takes the rest: nothing stands over the
 * chat at any time. What moves is how far open the Spec is, from 0 to 1, which the slot's width
 * (`spec-slot`) and the panel's place (`spec-panel-in`) are both drawn from, so the chat is pushed
 * on the very spring the panel slides on and the two can never part. A fold asked half-way turns
 * that one value round from where it is. The panel is laid at its open width from the first frame
 * and clipped at the window's edge: nothing in it reflows on the way.
 *
 * Who opens it: the chevron and the glyphs; and the agent starting on a part opens it on that
 * part's phase, unless the hand folded it during this Session — a fold by the hand holds until the
 * hand unfolds. A Spec just created from the agent's proposal arrives, opening from nothing
 * (issue #130).
 *
 * Everything it shows is handed to it, and everything it does is reported: the panel holds only
 * whether it is folded and whether the rework dialog is open. The agent writes the Spec; the
 * reader reads it and answers, and edits nothing (issue #135).
 */

/**
 * The Spec in the Session's row: its slot, and what is laid over it at the window's edge. It clips
 * sideways (issue #181): the small frame leaves by sliding out past the window's edge, and a frame
 * laid out there made the row scroll sideways for as long as the panel was open. A clip and not
 * `hidden`, so the dock never becomes a scroller a focus could move.
 */
const DOCK = 'relative flex h-full min-h-0 shrink-0 overflow-x-clip py-3 pr-3'

/**
 * The panel's clip: what the panel slides in and out of. It reaches across the margin the dock
 * keeps at the content's edge and cuts there, where the small frame is cut (issue #181): the
 * panel is laid in its content box, in from that edge by the margin, and comes in and goes out by
 * the edge itself rather than out of nothing inside the margin.
 */
const CLIP =
  'pointer-events-none absolute inset-y-3 right-0 box-content w-spec-panel overflow-hidden pr-3'

/** The open panel: a frame the whole height of the row, its rim around the head, body and foot. */
const PANEL =
  'spec-panel-in pointer-events-auto flex size-full flex-col rounded-xl border border-border bg-surface-rim p-1.5'

/** The panel folded and at rest: still laid out, so an unfold starts at once, and not drawn. */
const STOWED =
  'spec-panel-in pointer-events-auto invisible flex size-full flex-col rounded-xl border border-border bg-surface-rim p-1.5'

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
const HEAD = 'flex shrink-0 flex-col gap-1 pt-1 pr-1.5 pb-2.5 pl-2.5'

const NOW = 'text-sm text-muted-foreground'

/** The body: the column, taking the rest of the panel's height. */
const BODY =
  'flex min-h-0 flex-1 flex-col overflow-hidden rounded-lg border border-border bg-surface-body shadow-sm'

/** What `Mark ready` was refused with, beside it in the footer, taking the room it leaves. */
const REFUSED = 'min-w-0 flex-1 text-sm text-destructive-muted-foreground'

/** How much is left before ready, while `Mark ready` cannot be pressed: quiet, on one line. */
const LEFT = 'min-w-0 truncate text-sm text-muted-foreground'

/** The footer on the rim, under the body, its actions at its end. */
const FOOT = 'flex items-center justify-end gap-3 px-1 pt-1.5'

export interface SpecPanelProps {
  spec: SpecView
  /** Present when this Session reads a draft another Session writes. */
  reader?: ReaderView | undefined
  /** Whether the rework dialog starts open, for the story that shows it. */
  defaultReworkOpen?: boolean | undefined
  /** Whether the Spec starts folded to its small frame, which it does unless told otherwise. */
  defaultFolded?: boolean | undefined
  /** Told each time the panel folds or unfolds, by the hand or because the agent writes. */
  onFoldChange?: ((folded: boolean) => void) | undefined
  /**
   * Whether the Spec was just created in this Session, from the agent's proposal: the panel then
   * arrives, opening from nothing on the swap's own spring, rather than standing there (#130).
   */
  arrives?: boolean | undefined
  onMarkReady: () => void
  onRework: (reason: string) => void
  onPickRevision: (revision: number) => void
  onTakeOver: () => void
  /**
   * Where the build stands, and what it is launched in (D8-12, D8-13), which the application
   * composes. Drawn in the panel's footer on a Spec that is not being written: a draft offers
   * nothing to build, and says a launch already asked for beside `Mark ready`; an older revision
   * of a ready one is read as it was (D7-05).
   */
  build?: WorkspaceActionsProps | undefined
}

/** Where the keyboard goes once the Spec folded or unfolded under it. */
type Refocus = 'unfold' | 'fold' | PhaseName

/** The control the keyboard lands on: the small frame's unfold, or the head's fold. */
const LANDINGS = {
  unfold: '[data-unfold]',
  fold: '[aria-label="Fold the Spec"]',
} as const

export function SpecPanel({
  spec,
  reader,
  defaultReworkOpen = false,
  defaultFolded = true,
  onFoldChange,
  arrives = false,
  onMarkReady,
  onRework,
  onPickRevision,
  onTakeOver,
  build,
}: SpecPanelProps): ReactNode {
  const startsFolded = arrives ? false : defaultFolded
  const [folded, setFolded] = useState(startsFolded)
  // Whether the swap is on its way. Folded and at rest, the panel is stowed: laid out, hidden.
  const [moving, setMoving] = useState(false)
  const [reworking, setReworking] = useState(defaultReworkOpen)
  // The fold as it is now, read by the several hands one click may bubble through.
  const isFolded = useRef(startsFolded)
  // Whether the last fold was the hand's: it holds against the agent until the hand unfolds.
  const byHand = useRef(false)
  const followed = useRef(spec.focus)
  const dock = useRef<HTMLElement>(null)
  const column = useRef<HTMLDivElement>(null)
  // The phase the panel is to open on, gone to once its column is there.
  const onPhase = useRef<PhaseName | null>(null)
  // Where the keyboard goes once the swap was asked, when it was in the Spec as it was asked.
  const refocus = useRef<Refocus | null>(null)
  const move = useTransition(swap.move)
  const fade = useTransition(swap.fade)
  const still = move === instant
  // How far open the Spec is, from its small frame (0) to its panel (1).
  const open = useMotionValue(startsFolded ? 0 : 1)
  // How far in the Spec has arrived, from nothing (0) to its place in the row (1).
  const present = useMotionValue(arrives ? 0 : 1)
  // Read once per Spec, so the column is handed the same phases across a fold and is not drawn again.
  const groups = useMemo(() => phasesOf(spec), [spec])

  function fold(next: boolean, hand: boolean, phase: PhaseName | null = null): void {
    if (hand) byHand.current = next
    if (isFolded.current === next) return
    const inside = dock.current?.contains(document.activeElement) ?? false
    refocus.current = hand && inside ? (next ? 'unfold' : (phase ?? 'fold')) : null
    onPhase.current = next ? null : phase
    isFolded.current = next
    setFolded(next)
    setMoving(true)
    onFoldChange?.(next)
  }

  // The agent starting on something opens the panel on its phase — unless the hand folded it.
  useEffect(() => {
    const before = followed.current
    followed.current = spec.focus
    if (spec.focus === undefined || spec.focus === before) return
    if (!isFolded.current || byHand.current) return
    const phase = groups.find((group) => group.rows.some((row) => row.target === spec.focus))
    fold(false, false, phase?.phase ?? null)
  }, [spec.focus])

  /**
   * Writes how far open the Spec is onto its dock, which its slot's width and its panel's place
   * are drawn from.
   *
   * Called on every frame the value moves rather than subscribed to it, as the shell does with the
   * sidebar's width: a value that changes every frame cannot be a class, and a width assembled in
   * a style attribute is a length living outside the theme.
   */
  function pose(share: number): void {
    dock.current?.style.setProperty('--spec-open', String(share))
  }

  /** Writes how far in the Spec has arrived, which scales its whole slot and places its panel. */
  function place(share: number): void {
    dock.current?.style.setProperty('--spec-in', String(share))
  }

  // The first frame has no animation to report a share: the resting one is written before it.
  useLayoutEffect(() => {
    pose(open.get())
    place(present.get())
  }, [])

  // Arriving, the Spec opens from nothing on the swap's spring; told to move less, it is there.
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

  // Opened on a phase, the column is there at once on it: its content is arriving, and a scroll
  // on top of the slide would be two journeys at once. Then the keyboard goes where the control it
  // was on stands now: the fold, the heading of the phase it opened on, or back to the unfold.
  // `preventScroll`, because the panel is sliding in a clip, and a focus that scrolled the clip to
  // show itself would drag the panel along.
  useEffect(() => {
    const phase = onPhase.current
    onPhase.current = null
    if (!folded && phase !== null) goToPhase(column, phase, true)
    const target = refocus.current
    refocus.current = null
    if (target === null) return
    const selector =
      target === 'unfold' || target === 'fold'
        ? LANDINGS[target]
        : `[data-phase="${target}"] [data-heading] button`
    dock.current?.querySelector<HTMLElement>(selector)?.focus({ preventScroll: true })
  }, [folded])

  // The build is offered on a Spec that is not being written, and never on an older revision of
  // one: only the current revision of a Spec is built, as only it can be reworked (D7-05, D8-12).
  // A launch already asked for stays where it stands once the Spec moves on: a build that started
  // takes its Spec on (`in_progress`), and a Rework takes a waiting launch back — either way the
  // panel is where the Session it opened, or what became of it, is said (D8-13). On a draft, what
  // became of it is said beside `Mark ready`, never in its place, and offers nothing to start.
  const buildable = spec.replacedBy === undefined && spec.status !== 'draft'
  const launch = build?.launch ?? null
  // `Mark ready` is offered on the current revision of a draft once the whole gate passes — the
  // agent's attestation on the content the Spec is at now among it (D7-10) — as the primary
  // action. Before, a press could only be refused: the footer says how much is left instead, and
  // nothing when nothing is named (issue #205).
  const markable =
    spec.status === 'draft' && spec.replacedBy === undefined && spec.provisional !== true
  const confirmed = spec.readiness.checks.every((check) => check.passed)
  const left = confirmed ? [] : spec.readiness.todo.map((item) => item.label)
  const draftLaunch =
    build === undefined || launch === null ? null : { ...build, onRetry: undefined }
  const foot: FootContent | null =
    buildable && build !== undefined
      ? { kind: 'build', build }
      : markable &&
          (confirmed ||
            left.length > 0 ||
            draftLaunch !== null ||
            spec.readiness.refused !== undefined)
        ? {
            kind: 'ready',
            confirmed,
            left,
            refused: spec.readiness.refused,
            onMarkReady,
            launch: draftLaunch,
          }
        : null

  // The small frame leaves at once, and comes back a beat after the panel started leaving.
  const frameMoves = folded ? onTheBeat(fade) : fade
  const away = slide('stage').enter
  // A provisional Spec has no key to be named by (issue #198).
  const named = spec.provisional === true ? 'Provisional Spec' : `Spec ${spec.key}`

  return (
    <>
      <section ref={dock} aria-label={named} className={DOCK}>
        <div aria-hidden="true" className="spec-slot shrink-0" />
        <div className={CLIP}>
          {/* Mounted whether the Spec is folded or not, so that an unfold starts moving on the
              frame it is asked on rather than after the whole column has been laid out. Folded,
              it is out of reach of the keyboard and of a screen reader, and once it has left,
              not drawn at all. */}
          <div
            inert={folded}
            aria-hidden={folded ? true : undefined}
            data-spec-panel
            data-stowed={folded && !moving ? '' : undefined}
            className={folded && !moving ? STOWED : PANEL}
          >
            <header className={HEAD}>
              <SpecHead
                specKey={spec.key}
                title={spec.title}
                type={spec.type}
                status={spec.status}
                revision={spec.revision}
                revisions={spec.revisions}
                superseded={spec.replacedBy !== undefined}
                onPickRevision={onPickRevision}
                onRework={() => setReworking(true)}
                onFold={() => fold(true, true)}
                provisional={spec.provisional}
              />
              {spec.replacedBy !== undefined && (
                // The one line under the head, and only for an older revision: where the phases
                // stand is their headings' to say, and whether it is done the footer's (#150).
                <p className={NOW}>An earlier version · read only</p>
              )}
            </header>
            <div className={BODY}>
              {reader !== undefined && (
                <ReaderBar
                  writer={reader.writer}
                  takeOverRefused={reader.takeOverRefused}
                  onTakeOver={onTakeOver}
                />
              )}
              <SpecColumn spec={spec} groups={groups} column={column} still={still} />
            </div>
            <SpecFoot content={foot} />
          </div>
        </div>
        {/* Drawn over the panel, so its leaving and its return are seen whole. */}
        <motion.div
          inert={!folded}
          aria-hidden={folded ? undefined : true}
          data-spec-frame
          className={FRAME}
          initial={false}
          animate={folded ? { x: 0, ...CROSSFADE.to } : { x: away, ...CROSSFADE.from }}
          transition={frameMoves}
        >
          <div className="pointer-events-auto">
            <SpecFrame
              specKey={spec.provisional === true ? 'the provisional Spec' : spec.key}
              groups={groups}
              writing={spec.focus}
              onUnfold={(phase) => fold(false, true, phase)}
            />
          </div>
        </motion.div>
      </section>
      <ReworkDialog
        open={reworking}
        onOpenChange={setReworking}
        specKey={spec.key}
        revision={spec.revision}
        onRework={(reason) => {
          setReworking(false)
          onRework(reason)
        }}
      />
    </>
  )
}

/** What the footer holds: `Mark ready` on a draft, the build's actions once the Spec is ready. */
type FootContent =
  | { kind: 'build'; build: WorkspaceActionsProps }
  | {
      kind: 'ready'
      /** Whether the whole gate passes, the agent's attestation among it: `Mark ready` offered. */
      confirmed: boolean
      /** What is left before ready while it does not, in the order the gate says it. */
      left: readonly string[]
      /** What the last `Mark ready` was refused with. */
      refused: string | undefined
      onMarkReady: () => void
      /** A launch asked for on the revision a Rework left, said beside `Mark ready`: no Retry. */
      launch: WorkspaceActionsProps | null
    }

/**
 * The footer of the panel (issues #135, #150, #205): one across the panel, on the rim under the
 * body, what the Spec offers at its end — on a draft, `Mark ready` once it can be pressed and how
 * much is left until then; once ready, `Use an existing Workspace` and `Prepare and start the build`, then where the
 * launch stands.
 *
 * What it holds arrives and leaves on the `expand` and `collapse` kinds: its height is what makes
 * room, so the body above it gives it room rather than being covered, and it fades as it goes.
 * Marked ready, `Mark ready` folds away as the build's actions unfold in its place; a Rework takes
 * the build's actions back and brings `Mark ready` back. A Spec opened in either state finds its
 * footer there. While a content leaves it is still in the page, and a button there is a button a
 * second press reaches: so the moment it starts leaving it is `inert` and hidden from assistive
 * technology.
 */
function SpecFoot({ content }: { content: FootContent | null }): ReactNode {
  const transition = useTransition(morph)
  return (
    <AnimatePresence initial={false}>
      {content !== null && (
        <motion.div
          key={content.kind}
          className="shrink-0 overflow-hidden"
          initial={collapse}
          animate={expand}
          exit={collapse}
          transition={transition}
        >
          <Leaving kind={content.kind}>
            {content.kind === 'build' ? (
              <WorkspaceActions {...content.build} />
            ) : (
              <>
                {content.launch !== null && <WorkspaceActions {...content.launch} />}
                {content.refused !== undefined && (
                  // What the draft still lacks, or that it changed as it was pressed (D7-10).
                  <p role="alert" className={REFUSED}>
                    {content.refused}
                  </p>
                )}
                {content.confirmed ? (
                  <Button variant="primary" size="sm" onClick={content.onMarkReady}>
                    <IconCheck size="sm" aria-hidden="true" />
                    Mark ready
                  </Button>
                ) : (
                  content.left.length > 0 && (
                    <p className={LEFT} title={['Still to do:', ...content.left].join('\n')}>
                      {`${content.left.length} ${content.left.length === 1 ? 'thing' : 'things'} left before ready`}
                    </p>
                  )
                )}
              </>
            )}
          </Leaving>
        </motion.div>
      )}
    </AnimatePresence>
  )
}

/** The footer's content, out of reach from the moment it starts leaving. */
function Leaving({
  kind,
  children,
}: {
  kind: FootContent['kind']
  children: ReactNode
}): ReactNode {
  const present = useIsPresent()
  return (
    <div
      className={FOOT}
      inert={!present}
      aria-hidden={present ? undefined : true}
      data-foot={kind}
    >
      {children}
    </div>
  )
}
