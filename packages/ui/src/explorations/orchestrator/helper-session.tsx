import type { ReactNode } from 'react'

import { Button } from '../../components/button/button.tsx'
import { Face } from '../../components/face/face.tsx'
import { StatusDot } from '../../components/status-dot/status-dot.tsx'
import { IconChevronLeft, IconClock } from '../../icons.ts'
import { MessageScroller } from '../../message/scroller/scroller.tsx'
import { type Helper, iconOf, placeOf } from './fixtures.ts'
import { HelperIcon } from './helper-icons.tsx'
import { HELPER_TONES } from './helper-line.tsx'
import { threadOf } from './threads.tsx'

/**
 * A helper's session, read only (decision of 30 September on issue #77): its whole thread, live, as
 * any Session shows it, with no composer and no way to answer. Its head says who it is — its live
 * face, its icon, where it stands, who launched it — and the one way back to the main Session.
 *
 * A permission it asks is never answered here: it is the main agent's policy's, or it comes to the
 * user among the main Session's notices.
 */

const PAGE = 'flex min-h-0 min-w-0 flex-1 flex-col bg-surface-content'

const HEAD = 'flex shrink-0 items-center gap-3 border-b border-border px-4 py-2'

const WHO = 'flex min-w-0 flex-1 flex-col'

const NAME_LINE = 'flex min-w-0 items-center gap-1.5 text-sm'

const NAME = 'min-w-0 truncate font-medium'

const QUIET = 'flex min-w-0 items-center gap-1.5 text-xs text-muted-foreground'

const DOING = 'min-w-0 truncate font-mono'

export interface HelperSessionProps {
  helper: Helper
  helpers: readonly Helper[]
  onBack: () => void
}

export function HelperSession({ helper, helpers, onBack }: HelperSessionProps): ReactNode {
  return (
    <section aria-label={`The session of ${helper.name}`} className={PAGE}>
      <header className={HEAD}>
        <Button variant="ghost" size="sm" onClick={onBack} data-back>
          <IconChevronLeft size="sm" aria-hidden="true" />
          Main Session
        </Button>
        <Face state={helper.face} size="md" seed={helper.seed} />
        <span className={WHO}>
          <span className={NAME_LINE}>
            <span className="flex shrink-0 text-muted-foreground">
              <HelperIcon name={iconOf(helper)} size="md" />
            </span>
            <StatusDot status={HELPER_TONES[helper.state]} size="sm" />
            <span className={NAME}>{helper.name}</span>
            <span className="shrink-0 text-xs text-muted-foreground">
              {placeOf(helper, helpers)}
            </span>
          </span>
          <span className={QUIET}>
            <span className={DOING}>{helper.doing}</span>
            {helper.quiet !== undefined && (
              <span className="flex shrink-0 items-center gap-0.5 font-mono">
                <IconClock size="sm" aria-hidden="true" />
                {helper.quiet}
              </span>
            )}
          </span>
        </span>
      </header>
      <MessageScroller
        className="flex-1"
        label={`What ${helper.name} is doing`}
        entries={threadOf(helper)}
      />
    </section>
  )
}
