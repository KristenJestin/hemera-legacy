import { type ReactNode, useMemo, useRef } from 'react'

import { Badge } from '../components/badge/badge.tsx'
import { IconButton } from '../components/button/button.tsx'
import { Tooltip } from '../components/tooltip/tooltip.tsx'
import { IconLock, IconX } from '../icons.ts'
import { instant, swap, useTransition } from '../motion.ts'
import type { SpecView } from '../spec/model.ts'
import { SpecColumn } from '../spec/spec-column.tsx'
import { phasesOf } from '../spec/spec-phases.ts'

/**
 * The frozen Spec, opened from a build (D10-12; scenario "The Spec is read only in a build").
 *
 * The Spec as the Spec panel reads it since #164 — one column, each phase under a heading that
 * sticks while it is read — on the revision the build works from, with no edit control anywhere:
 * a frozen Spec edits nothing, and once a build started nothing reworks it either, so neither
 * Rework nor Mark ready is drawn. It stands in the build panel in place of the build view, and it
 * is closed rather than folded: it is one of the views around the build.
 */

const PANEL = 'flex h-full min-h-0 min-w-0 flex-col bg-surface-content'

const HEAD = 'flex flex-col gap-1.5 border-b border-border px-5 pt-4 pb-3'

const HEAD_LINE = 'flex min-h-control-sm items-center gap-2.5'

const KEY = 'shrink-0 font-mono text-xs text-muted-foreground'

const TITLE = 'min-w-0 truncate text-base font-semibold'

const FROZEN = 'flex shrink-0 items-center gap-1 text-xs text-muted-foreground'

const END = 'ml-auto flex shrink-0 items-center'

const BODY = 'flex min-h-0 flex-1 flex-col'

export interface BuildSpecPanelProps {
  /** The revision the build works from, frozen. */
  spec: SpecView
  /** Closes the panel. */
  onClose: () => void
}

export function BuildSpecPanel({ spec, onClose }: BuildSpecPanelProps): ReactNode {
  const column = useRef<HTMLDivElement>(null)
  const still = useTransition(swap.move) === instant
  const groups = useMemo(() => phasesOf(spec), [spec])
  return (
    <section aria-label={`Spec ${spec.key}`} className={PANEL}>
      <header className={HEAD}>
        <div className={HEAD_LINE}>
          <span className={KEY}>{spec.key}</span>
          <h2 className={TITLE}>{spec.title}</h2>
          <Badge>{spec.type}</Badge>
          <span className={FROZEN}>
            <IconLock size="sm" aria-hidden="true" />
            read only
          </span>
          <span className={END}>
            <Tooltip label="Close the Spec">
              <IconButton
                variant="ghost"
                size="sm"
                icon={<IconX size="sm" />}
                aria-label="Close the Spec"
                onClick={onClose}
              />
            </Tooltip>
          </span>
        </div>
      </header>
      <div className={BODY}>
        <SpecColumn spec={spec} groups={groups} column={column} still={still} />
      </div>
    </section>
  )
}
