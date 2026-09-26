import { cn } from 'cn'
import type { ReactNode } from 'react'

import type { PhaseName } from './model.ts'
import { SPEC_PHASE_ICONS } from './spec-icons.ts'
import type { Progress } from './spec-phases.ts'

/**
 * A phase's glyph in its square, tinted by how far along the phase is (issue #164): the success
 * tint once every part is done, the primary one while it is started, and the quiet one while
 * nothing is written. The same square on the small frame the Spec folds to, on the phase's
 * heading in the column, and in the menu of the phases, so the three read as one thing.
 *
 * While the agent writes one of the phase's parts, the tint breathes: a layer under the glyph, so
 * the glyph itself keeps its contrast. It says nothing on its own: whoever holds it names it, with
 * the words its tint stands for.
 */

const SQUARE = 'relative isolate flex size-control-sm shrink-0 items-center justify-center'

const TINT = 'pointer-events-none absolute inset-0 -z-10 rounded-md'

/** The glyph's colour, and its layer's, for each step of progress. */
const TONES: Record<Progress, { glyph: string; layer: string }> = {
  done: { glyph: 'text-success-muted-foreground', layer: 'bg-success-muted' },
  started: { glyph: 'text-primary-muted-foreground', layer: 'bg-primary-muted' },
  empty: { glyph: 'text-muted-foreground', layer: 'bg-muted-foreground/15' },
}

export interface PhaseGlyphProps {
  phase: PhaseName
  progress: Progress
  /** Whether the agent is writing one of the phase's parts. */
  writing?: boolean | undefined
}

export function PhaseGlyph({ phase, progress, writing = false }: PhaseGlyphProps): ReactNode {
  const Icon = SPEC_PHASE_ICONS[phase]
  const tone = TONES[progress]
  return (
    <span
      aria-hidden="true"
      data-progress={progress}
      data-writing={writing ? '' : undefined}
      className={cn(SQUARE, tone.glyph)}
    >
      <span className={cn(TINT, tone.layer, writing && 'motion-safe:animate-breathe')} />
      <Icon size="md" />
    </span>
  )
}
