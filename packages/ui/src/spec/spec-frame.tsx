import type { ReactNode } from 'react'

import { IconButton } from '../components/button/button.tsx'
import { Tooltip } from '../components/tooltip/tooltip.tsx'
import { IconChevronLeft } from '../icons.ts'
import { PHASE_TITLES, type PhaseName, type SpecTarget } from './model.ts'
import { PhaseGlyph } from './phase-glyph.tsx'
import { PROGRESS_WORDS, type PhaseGroup, isWriting, phaseProgressOf } from './spec-phases.ts'

/**
 * The Spec folded (issue #164): a small frame at the window's edge, centred on its height, that
 * holds the unfold chevron on its rim and the three phases' glyphs in its body — Shape, Plan and
 * Decompose, each tinted by how far along it is. The chevron unfolds the panel; a glyph unfolds it
 * on its phase.
 *
 * A frame as every surface of Hemera is one (`components/frame/frame.tsx`): a rim, and a body
 * inside it. Its width is the theme's `spec-frame` rather than what it holds, because it is one
 * end of the slot the swap moves.
 */

const RIM = 'flex w-spec-frame flex-col rounded-xl border border-border bg-surface-rim p-1.5'

const TOP = 'flex shrink-0 justify-center pb-1.5'

const BODY = 'flex flex-col rounded-lg border border-border bg-surface-body shadow-sm'

const GLYPH = 'flex rounded-md outline-none focus-ring'

export interface SpecFrameProps {
  specKey: string
  groups: PhaseGroup[]
  /** The part the agent is writing, whose phase's glyph breathes. */
  writing: SpecTarget | undefined
  /** Unfolds the panel: on a phase when a glyph was pressed, as it was left otherwise. */
  onUnfold: (phase: PhaseName | null) => void
}

export function SpecFrame({ specKey, groups, writing, onUnfold }: SpecFrameProps): ReactNode {
  return (
    <div className={RIM}>
      <div className={TOP}>
        <Tooltip label="Unfold the Spec" side="left">
          <IconButton
            variant="ghost"
            size="sm"
            icon={<IconChevronLeft size="sm" />}
            aria-label="Unfold the Spec"
            data-unfold
            onClick={() => onUnfold(null)}
          />
        </Tooltip>
      </div>
      <div className={BODY}>
        <nav aria-label={`Phases of ${specKey}`} className="flex flex-col gap-1 p-1">
          {groups.map((group) => {
            const title = PHASE_TITLES[group.phase]
            const progress = phaseProgressOf(group, writing)
            const written = isWriting(group, writing)
            const words = written
              ? `${PROGRESS_WORDS[progress]}, the agent is writing it`
              : PROGRESS_WORDS[progress]
            return (
              <Tooltip key={group.phase} label={`${title} · ${words}`} side="left">
                <button
                  type="button"
                  data-phase={group.phase}
                  aria-label={`${title} phase, ${words}, unfold the Spec on it`}
                  className={GLYPH}
                  onClick={() => onUnfold(group.phase)}
                >
                  <PhaseGlyph phase={group.phase} progress={progress} writing={written} />
                </button>
              </Tooltip>
            )
          })}
        </nav>
      </div>
    </div>
  )
}
