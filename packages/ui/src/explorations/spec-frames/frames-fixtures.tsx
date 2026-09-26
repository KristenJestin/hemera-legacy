import { motion } from 'motion/react'
import { type ReactNode, type RefObject, useLayoutEffect, useRef, useState } from 'react'

import { Composer } from '../../composer/composer.tsx'
import { Button } from '../../components/button/button.tsx'
import { AgentText } from '../../message/agent-text.tsx'
import { MessageGroup } from '../../message/message.tsx'
import { MessageScroller, type ScrollerEntry } from '../../message/scroller/scroller.tsx'
import {
  CROSSFADE,
  LABEL_DELAY,
  LABEL_TRAVEL,
  arrival,
  instant,
  useTransition,
} from '../../motion.ts'
import { SessionHeader } from '../../session/session.tsx'
import { MissionBrief } from '../../spec/mission-brief.tsx'
import type { PhaseName, SpecTarget, SpecView } from '../../spec/model.ts'
import { MID_PLAN } from '../../spec/spec-fixtures.ts'
import { useLiveSpec } from '../../spec/spec-harness.tsx'
import { SpecHead } from '../../spec/spec-head.tsx'
import { SpecPart } from '../../spec/spec-panel.tsx'
import {
  type RailGroup,
  type SpecRailProps,
  type StageChoice,
  railOf,
} from '../../spec/spec-rail.tsx'
import { IconCheck } from '../../icons.ts'

/**
 * What the three variants share: the `define` Session they are drawn on, the Spec held live, the
 * rim and the body of a frame that fills its height, and the measures a frame animates towards.
 *
 * The Session is screen 1 of `Surfaces/Session/Define`: `ATL-7` being planned, Shape finished,
 * the agent writing the plan, one blocking question asked in the thread.
 */

// ---------------------------------------------------------------------------------------------
// The frame, at its full height

/**
 * The rim of a frame, as `Frame` draws it (`components/frame/frame.tsx`).
 *
 * Written again here for one reason: `Frame` sizes its body to what it holds, and the Spec panel
 * is a frame whose body takes the height of the window, and whose rim is what the transition
 * moves. Built, this is a `fill` option of `Frame` and an animated size, not a second frame.
 */
export const RIM =
  'flex flex-col overflow-hidden rounded-xl border border-border bg-surface-rim p-1.5'

/** The rim again, vertically centred on what it holds while it is larger than it. */
export const RIM_CENTRED =
  'flex flex-col justify-center overflow-hidden rounded-xl border border-border bg-surface-rim p-1.5'

/** The body of a frame that takes the rest of the rim's height. */
export const BODY_FILL =
  'flex min-h-0 flex-1 overflow-hidden rounded-lg border border-border bg-surface-body shadow-sm'

/** The body of a frame sized to what it holds. */
export const BODY_FIT =
  'flex flex-col overflow-hidden rounded-lg border border-border bg-surface-body shadow-sm'

/** The band of the rim above the body, where the Spec's head stands open on the rim. */
export const HEAD_BAND = 'shrink-0 px-2.5 pt-1 pb-2.5'

/** The band of the rim under the body, where `Mark ready` stands. */
export const FOOT_BAND = 'flex shrink-0 items-center justify-end gap-3 px-1 pt-1.5'

// ---------------------------------------------------------------------------------------------
// Measures

/** A type and not an interface, so that motion takes it as a target (see `Scales`). */
export type Size = {
  width: number
  height: number
}

/**
 * The box an element takes, followed. What a frame animates towards is measured on a probe that
 * wears the same classes as the frame in its other state, so every length stays a token of the
 * theme and none is written here.
 */
export function useSize(): [RefObject<HTMLDivElement | null>, Size | null] {
  const element = useRef<HTMLDivElement | null>(null)
  const [size, setSize] = useState<Size | null>(null)
  useLayoutEffect(() => {
    const node = element.current
    if (node === null) return
    const measure = (): void => {
      const { offsetWidth: width, offsetHeight: height } = node
      setSize((before) =>
        before?.width === width && before.height === height ? before : { width, height },
      )
    }
    measure()
    const observer = new ResizeObserver(measure)
    observer.observe(node)
    return () => {
      observer.disconnect()
    }
  }, [])
  return [element, size]
}

/**
 * A copy of a frame in the state it is not in, laid out and never seen: out of the page's flow,
 * invisible, and inert, so neither the keyboard nor a screen reader ever meets it.
 */
export function Probe({
  measure,
  className,
  children,
}: {
  measure: RefObject<HTMLDivElement | null>
  /** Where it is laid out, which is where the frame it measures stands. */
  className: string
  children?: ReactNode
}): ReactNode {
  return (
    <div ref={measure} inert className={className}>
      {children}
    </div>
  )
}

// ---------------------------------------------------------------------------------------------
// The Session

const AT = 'Today at'

const ASK: ScrollerEntry = {
  id: 'ask',
  mark: 'Accountants need a month of invoices as one CSV',
  content: (
    <MessageGroup
      author="user"
      name="You"
      at="10:31"
      atLabel={`${AT} 10:31`}
      state="saved"
      lines={[
        {
          id: 'ask-1',
          body: 'Accountants need a month of invoices as one CSV they can import into their ledger, from the billing page.',
        },
      ]}
    />
  ),
}

const THREAD: ScrollerEntry[] = [
  ASK,
  {
    id: 'brief',
    content: (
      <MissionBrief
        title="What the agent was told · Plan"
        detail="10:44"
        brief="**Plan** · analyse the code and fix the technical approach of `ATL-7`, its risks and how it is verified. Shape is finished; one blocking question is open."
      />
    ),
  },
  {
    id: 'answer',
    content: (
      <AgentText text="Shape is finished: the problem, the outcome, the scope and two stories are in the Spec. I am writing the plan: the export can reuse the invoice query of `export.service.ts` and stream its rows." />
    ),
  },
]

/** The chat of the Session: its head, its thread and its composer, taking the rest of the row. */
export function Chat(): ReactNode {
  const [value, setValue] = useState('')
  const [files, setFiles] = useState<string[]>([])
  return (
    <div className="flex min-h-0 min-w-0 flex-1 flex-col">
      <div className="flex w-full flex-col px-6 pt-6 pb-4">
        <SessionHeader
          title="Spec CSV"
          projectName="Atlas"
          onRename={() => undefined}
          onStartEditing={() => undefined}
          onArchive={() => undefined}
        />
      </div>
      <MessageScroller className="flex-1" label="The thread of this Session" entries={THREAD} />
      <div className="flex w-full flex-col px-6 pb-4">
        <Composer
          value={value}
          onValueChange={setValue}
          files={files}
          onFilesChange={setFiles}
          onSearchFiles={() => Promise.resolve([])}
          variant="inline"
          action="Send"
          placeholder="Answer, or ask the agent…"
          onSend={() => Promise.resolve(null)}
        />
      </div>
    </div>
  )
}

const NOTHING = (): void => undefined

/** The Spec of the Session, held live, and what the rail and the stage are handed from it. */
export interface SpecSession {
  spec: SpecView
  groups: RailGroup[]
  shown: StageChoice
  /** The rail's props, unfolded or folded, as `SpecPanel` hands them. */
  rail: SpecRailProps
  onMarkReady: () => void
  /** Puts a phase's parts on the stage, from a folded glyph that also unfolds. */
  choose: (choice: StageChoice) => void
}

export function useSpecSession(initial: SpecView = MID_PLAN): SpecSession {
  const { spec, actions } = useLiveSpec(initial, undefined, {
    onAnswer: NOTHING,
    onGoToQuestion: NOTHING,
    onMarkReady: NOTHING,
    onRework: NOTHING,
    onPickRevision: NOTHING,
    onTakeOver: NOTHING,
  })
  const [pinned, setPinned] = useState<StageChoice | null>(null)
  const shown: StageChoice = pinned ?? { part: spec.focus ?? 'problem' }
  const groups = railOf(spec)
  return {
    spec,
    groups,
    shown,
    rail: {
      label: `Parts of ${spec.key}`,
      groups,
      current: shown,
      following: spec.focus,
      onSelect: (target: SpecTarget) => setPinned({ part: target }),
      onSelectGroup: (phase: PhaseName) => setPinned({ group: phase }),
    },
    onMarkReady: actions.onMarkReady,
    choose: setPinned,
  }
}

/** The Spec's head, with the fold at its end, as the panel draws it. */
export function Head({
  session,
  onFold,
}: {
  session: SpecSession
  /** What folds the panel, when its fold stands in the head. */
  onFold?: (() => void) | undefined
}): ReactNode {
  const { spec } = session
  return (
    <SpecHead
      specKey={spec.key}
      title={spec.title}
      type={spec.type}
      status={spec.status}
      revision={spec.revision}
      revisions={spec.revisions}
      onPickRevision={NOTHING}
      onRework={NOTHING}
      onFold={onFold}
    />
  )
}

/** `Mark ready`, quiet until the agent confirmed the Spec, with what it was refused with. */
export function MarkReady({ session }: { session: SpecSession }): ReactNode {
  const { spec } = session
  const confirmed = spec.readiness.checks.some(
    (check) => check.check === 'attestation' && check.passed,
  )
  return (
    <>
      {spec.readiness.refused !== undefined && (
        <p role="alert" className="min-w-0 flex-1 text-sm text-destructive-muted-foreground">
          {spec.readiness.refused}
        </p>
      )}
      <Button variant={confirmed ? 'primary' : 'secondary'} size="sm" onClick={session.onMarkReady}>
        <IconCheck size="sm" aria-hidden="true" />
        Mark ready
      </Button>
    </>
  )
}

/** The parts a choice puts on the stage, in the order the rail lists them. */
export function partsOf(shown: StageChoice, groups: RailGroup[]): SpecTarget[] {
  if ('part' in shown) return [shown.part]
  return groups.find((group) => group.phase === shown.group)?.rows.map((row) => row.target) ?? []
}

// ---------------------------------------------------------------------------------------------
// What moves into place

/**
 * Something that moves into place once its frame has opened: it comes in from `LABEL_TRAVEL`
 * pixels along an axis and out of transparent, on `arrival`, `order` beats of `LABEL_DELAY`
 * after the frame. The fade is a filter, for the reason `motion.ts` gives: the contrast check
 * measures a text through an opacity, never through a filter.
 */
export function Arriving({
  order = 0,
  from = 'below',
  className,
  children,
}: {
  order?: number
  /** Where it comes from: from under its place, or from the side the frame opened from. */
  from?: 'below' | 'side'
  className?: string | undefined
  children: ReactNode
}): ReactNode {
  const answered = useTransition(arrival)
  const transition = answered === instant ? instant : { ...answered, delay: LABEL_DELAY * order }
  const start =
    from === 'below'
      ? { y: LABEL_TRAVEL, ...CROSSFADE.from }
      : { x: LABEL_TRAVEL, ...CROSSFADE.from }
  return (
    <motion.div
      className={className}
      initial={start}
      animate={{ x: 0, y: 0, ...CROSSFADE.to }}
      transition={transition}
    >
      {children}
    </motion.div>
  )
}

const SCROLL = 'min-h-0 min-w-0 flex-1 overflow-y-auto outline-none focus-ring'

const STAGE = 'flex flex-col gap-10 px-10 pt-5 pb-10'

/**
 * The stage, whose parts move into place one after the other when it arrives: the first beat
 * after the frame, then one beat each. A part chosen afterwards arrives alone.
 */
export function ArrivingStage({
  session,
  first = 1,
}: {
  session: SpecSession
  /** The beat the first part arrives on. */
  first?: number
}): ReactNode {
  const { spec, shown, groups } = session
  const key = 'part' in shown ? `part-${shown.part}` : `group-${shown.group}`
  return (
    <div role="region" aria-label={`Stage of ${spec.key}`} tabIndex={0} className={SCROLL}>
      <div key={key} className={STAGE}>
        {partsOf(shown, groups).map((target, index) => (
          <Arriving key={target} order={first + index}>
            <div data-part={target}>
              <SpecPart spec={spec} target={target} onGoToQuestion={NOTHING} />
            </div>
          </Arriving>
        ))}
      </div>
    </div>
  )
}
