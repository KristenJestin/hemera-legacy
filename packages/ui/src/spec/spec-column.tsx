import { type ReactNode, type RefObject, memo } from 'react'

import { Menu } from '../components/menu/menu.tsx'
import { IconChevronDown } from '../icons.ts'
import { PHASE_TITLES, type PhaseName, type SpecView, specCalledOf } from './model.ts'
import { PhaseGlyph } from './phase-glyph.tsx'
import { SpecPart } from './spec-part.tsx'
import {
  PHASE_STATE_WORDS,
  type PhaseGroup,
  isWriting,
  phaseProgressOf,
  writtenWords,
} from './spec-phases.ts'

/**
 * The Spec as one column, read from top to bottom (issue #164): every phase under a heading of its
 * own, its parts one after the other. No band of phases above it and no tabs: the headings are
 * the way through.
 *
 * A heading is the phase's glyph, tinted by how far along the phase is, its name, and a quiet
 * "5 of 5 written". It sticks to the top of the column while its phase scrolls under it, and it is
 * held inside its phase: when the next phase's heading arrives it pushes this one away, so the
 * heading stuck at the top is always the phase being read, and two headings never stack. Pressed,
 * a heading opens the menu of the three phases, each with how far along it is, to go to one.
 */

/** The column: the region that scrolls, and the one stop of the keyboard it takes to read it. */
const COLUMN = 'relative isolate min-h-0 min-w-0 flex-1 overflow-y-auto outline-none focus-ring'

/**
 * A phase, parted from the next by a rule. The last one is at least the column's height, so that
 * whatever it holds it can be brought up to the top, its heading stuck there as every other's is.
 */
const PHASE = 'border-b border-border last:min-h-full last:border-b-0'

/** The heading of a phase, on the body's surface so what scrolls under it is hidden. */
const HEADING = 'sticky top-0 z-1 flex border-b border-border bg-surface-body px-4 py-1.5'

const PARTS = 'flex flex-col gap-8 px-6 pt-4 pb-8'

/**
 * Scrolls the column to a phase, its heading at the top: smoothly, or at once when the reader
 * asked for less movement or the column has only just arrived. Read off the column rather than
 * through `scrollIntoView`, which would also scroll whatever holds the column — the panel's clip
 * while it slides in.
 */
export function goToPhase(
  column: RefObject<HTMLElement | null>,
  phase: PhaseName,
  instantly: boolean,
): void {
  const scroller = column.current
  const section = scroller?.querySelector<HTMLElement>(`[data-phase="${phase}"]`)
  if (scroller === null || scroller === undefined || section === null || section === undefined) {
    return
  }
  scroller.scrollTo({ top: section.offsetTop, behavior: instantly ? 'instant' : 'smooth' })
}

export interface SpecColumnProps {
  spec: SpecView
  /** The Spec's phases, and the parts each one writes. */
  groups: PhaseGroup[]
  /** The column's element, which a phase is scrolled into. */
  column: RefObject<HTMLDivElement | null>
  /** Whether a phase is gone to at once rather than scrolled to: less movement asked for. */
  still: boolean
}

/**
 * Memoised: the column is the heavy part of the panel — every part of the Spec, its Markdown
 * rendered — and nothing about it changes when the Spec folds or unfolds. Drawn again on that
 * press, it would hold the swap's first frame back.
 */
export const SpecColumn = memo(function SpecColumn({
  spec,
  groups,
  column,
  still,
}: SpecColumnProps): ReactNode {
  return (
    <div
      ref={column}
      role="region"
      aria-label={`Contents of ${specCalledOf(spec)}`}
      tabIndex={0}
      className={COLUMN}
    >
      {groups.map((group) => (
        <section
          key={group.phase}
          data-phase={group.phase}
          aria-label={`${PHASE_TITLES[group.phase]} phase`}
          className={PHASE}
        >
          <div className={HEADING}>
            <PhaseHeading
              spec={spec}
              group={group}
              groups={groups}
              onGoTo={(phase) => goToPhase(column, phase, still)}
            />
          </div>
          <div className={PARTS}>
            {group.rows.map((row) => (
              <div key={row.target} data-part={row.target}>
                <SpecPart spec={spec} target={row.target} />
              </div>
            ))}
          </div>
        </section>
      ))}
    </div>
  )
})

/**
 * A phase's heading, which is also the way to the others: pressed, the menu of the three phases.
 * Named with where the phase stands and how much of it is written, since the glyph's tint says it
 * to the eye alone.
 */
function PhaseHeading({
  spec,
  group,
  groups,
  onGoTo,
}: {
  spec: SpecView
  group: PhaseGroup
  groups: PhaseGroup[]
  onGoTo: (phase: PhaseName) => void
}): ReactNode {
  const title = PHASE_TITLES[group.phase]
  const writing = isWriting(group, spec.focus)
  const said = [
    `${title} phase`,
    PHASE_STATE_WORDS[group.state],
    writtenWords(group),
    ...(writing ? ['the agent is writing it'] : []),
    'go to another phase',
  ]
  return (
    <h3 data-heading className="flex min-w-0">
      <Menu
        label={said.join(', ')}
        trigger={
          <>
            <PhaseGlyph
              phase={group.phase}
              progress={phaseProgressOf(group, spec.focus)}
              writing={writing}
            />
            <span className="font-medium text-foreground">{title}</span>
            <span className="truncate text-muted-foreground">
              {writing ? `${writtenWords(group)} · writing…` : writtenWords(group)}
            </span>
            <IconChevronDown
              size="sm"
              aria-hidden="true"
              className="shrink-0 text-muted-foreground"
            />
          </>
        }
        groups={[
          groups.map((one) => ({
            label: PHASE_TITLES[one.phase],
            icon: (
              <PhaseGlyph
                phase={one.phase}
                progress={phaseProgressOf(one, spec.focus)}
                writing={isWriting(one, spec.focus)}
              />
            ),
            detail: writtenWords(one),
            onSelect: () => onGoTo(one.phase),
          })),
        ]}
      />
    </h3>
  )
}
