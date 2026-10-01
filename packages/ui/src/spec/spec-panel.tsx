import { AnimatePresence, motion, useIsPresent } from 'motion/react'
import { type ReactNode, useEffect, useMemo, useRef, useState } from 'react'

import { Button } from '../components/button/button.tsx'
import { IconCheck } from '../icons.ts'
import { collapse, expand, instant, morph, swap, useTransition } from '../motion.ts'
import { PanelDock } from '../session/session-row.tsx'
import type { PhaseName, ReaderView, SpecView } from './model.ts'
import { ReaderBar } from './reader-bar.tsx'
import { ReworkDialog } from './rework-dialog.tsx'
import { SpecColumn, goToPhase } from './spec-column.tsx'
import { SpecFrame } from './spec-frame.tsx'
import { SpecHead } from './spec-head.tsx'
import { phasesOf } from './spec-phases.ts'
import { SpecWide } from './spec-wide.tsx'
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
 * the whole gate passes, and nothing until then (issue #209); once the Spec is ready, the build's
 * actions in its place, until it is reworked.
 *
 * The two trade places by a swap (the `swap` kind of the preset). Opening, the small frame slides
 * out by the window's edge and fades, and a beat later, while it is still going, the panel slides
 * in from that edge and pushes the chat; closing, the panel slides out, and a beat later the small
 * frame comes back. The two moves always overlap, so there is no frame where neither is there.
 *
 * The frame, its widths, the swap and the fold are the Session's panel's (`session/session-row.tsx`),
 * which the build's panel is drawn by too (#77): this file says what the Spec puts in it. Laid over
 * the chat, the Spec is read at a reading measure beside a sidebar of its phases and their sections
 * (`spec-wide.tsx`).
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

const NOW = 'text-sm text-muted-foreground'

/** What `Mark ready` was refused with, beside it in the footer, taking the room it leaves. */
const REFUSED = 'min-w-0 flex-1 text-sm text-destructive-muted-foreground'

/** The footer on the rim, under the body, its actions at its end. */
const FOOT = 'flex items-center justify-end gap-3 px-1 pt-1.5'

export interface SpecPanelProps {
  spec: SpecView
  /**
   * The Session's notices, the ones the chat's composer holds: floated over the panel while it
   * covers the chat (#77).
   */
  notices?: ReactNode
  /** Present when this Session reads a draft another Session writes. */
  reader?: ReaderView | undefined
  /** Whether the rework dialog starts open, for the story that shows it. */
  defaultReworkOpen?: boolean | undefined
  /** Whether the Spec starts folded to its small frame, which it does unless told otherwise. */
  defaultFolded?: boolean | undefined
  /** Whether the open Spec starts over the chat, for the stories that show it. */
  defaultOver?: boolean | undefined
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

export function SpecPanel({
  spec,
  notices,
  reader,
  defaultReworkOpen = false,
  defaultFolded = true,
  defaultOver = false,
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
  const [over, setOver] = useState(defaultOver)
  const [reworking, setReworking] = useState(defaultReworkOpen)
  // Where the keyboard lands once the hand unfolded the Spec on a phase: that phase's heading.
  const [landing, setLanding] = useState<string | undefined>(undefined)
  // The fold as it is now, read by the several hands one click may bubble through.
  const isFolded = useRef(startsFolded)
  // Whether the last fold was the hand's: it holds against the agent until the hand unfolds.
  const byHand = useRef(false)
  const followed = useRef(spec.focus)
  const column = useRef<HTMLDivElement>(null)
  // The phase the panel is to open on, gone to once its column is there.
  const onPhase = useRef<PhaseName | null>(null)
  const still = useTransition(swap.move) === instant
  // Read once per Spec, so the column is handed the same phases across a fold and is not drawn again.
  const groups = useMemo(() => phasesOf(spec), [spec])

  function fold(next: boolean, hand: boolean, phase: PhaseName | null = null): void {
    if (hand) byHand.current = next
    if (isFolded.current === next) return
    setLanding(
      hand && !next && phase !== null ? `[data-phase="${phase}"] [data-heading] button` : undefined,
    )
    onPhase.current = next ? null : phase
    isFolded.current = next
    setFolded(next)
    // Folded, the Spec comes back beside the chat: it unfolds where it always does.
    if (next) setOver(false)
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

  // Opened on a phase, the column is there at once on it: its content is arriving, and a scroll
  // on top of the slide would be two journeys at once.
  useEffect(() => {
    const phase = onPhase.current
    onPhase.current = null
    if (!folded && phase !== null) goToPhase(column, phase, true)
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
  // action. Before, a press could only be refused, and the footer shows nothing (issue #209).
  const markable =
    spec.status === 'draft' && spec.replacedBy === undefined && spec.provisional !== true
  const confirmed = spec.readiness.checks.every((check) => check.passed)
  const draftLaunch =
    build === undefined || launch === null ? null : { ...build, onRetry: undefined }
  const foot: FootContent | null =
    buildable && build !== undefined
      ? { kind: 'build', build }
      : markable && (confirmed || draftLaunch !== null || spec.readiness.refused !== undefined)
        ? {
            kind: 'ready',
            confirmed,
            refused: spec.readiness.refused,
            onMarkReady,
            launch: draftLaunch,
          }
        : null

  // A provisional Spec has no key to be named by (issue #198).
  const named = spec.provisional === true ? 'Provisional Spec' : `Spec ${spec.key}`

  return (
    <>
      <PanelDock
        label={named}
        name="Spec"
        folded={folded}
        onFold={() => fold(true, true)}
        over={over}
        onOver={setOver}
        notices={notices}
        arrives={arrives}
        landing={landing}
        head={
          <>
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
              provisional={spec.provisional}
            />
            {spec.replacedBy !== undefined && (
              // The one line under the head, and only for an older revision: where the phases
              // stand is their headings' to say, and whether it is done the footer's (#150).
              <p className={NOW}>An earlier version · read only</p>
            )}
          </>
        }
        body={
          <>
            {reader !== undefined && (
              <ReaderBar
                writer={reader.writer}
                takeOverRefused={reader.takeOverRefused}
                onTakeOver={onTakeOver}
              />
            )}
            <SpecColumn spec={spec} groups={groups} column={column} still={still} />
          </>
        }
        wide={
          <>
            {reader !== undefined && (
              <ReaderBar
                writer={reader.writer}
                takeOverRefused={reader.takeOverRefused}
                onTakeOver={onTakeOver}
              />
            )}
            <SpecWide spec={spec} groups={groups} still={still} />
          </>
        }
        foot={<SpecFoot content={foot} />}
        frame={
          <SpecFrame
            specKey={spec.provisional === true ? 'the provisional Spec' : spec.key}
            groups={groups}
            writing={spec.focus}
            onUnfold={(phase) => fold(false, true, phase)}
          />
        }
      />
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
      /** What the last `Mark ready` was refused with. */
      refused: string | undefined
      onMarkReady: () => void
      /** A launch asked for on the revision a Rework left, said beside `Mark ready`: no Retry. */
      launch: WorkspaceActionsProps | null
    }

/**
 * The footer of the panel (issues #135, #150, #205, #209): one across the panel, on the rim under
 * the body, what the Spec offers at its end — on a draft, `Mark ready` once it can be pressed and
 * nothing until then; once ready, `Use an existing Workspace` and `Prepare and start the build`, then where the
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
                {content.confirmed && (
                  <Button variant="primary" size="sm" onClick={content.onMarkReady}>
                    <IconCheck size="sm" aria-hidden="true" />
                    Mark ready
                  </Button>
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
