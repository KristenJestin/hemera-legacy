import type { ReactNode } from 'react'

import { Button } from '../../components/button/button.tsx'
import { StatusDot } from '../../components/status-dot/status-dot.tsx'
import { IconChevronLeft } from '../../icons.ts'
import { MessageScroller } from '../../message/scroller/scroller.tsx'
import { HELPER_TONES, HELPER_WORDS, type Helper } from './fixtures.ts'
import { HelperIcon } from './helper-icons.tsx'
import { threadOf } from './threads.tsx'

/**
 * A helper's thread, read only (decision of 30 September on issue #77): the whole of it, live, as
 * any Session's thread is drawn, with no composer and no way to answer. Its head is the way back
 * — to the main agent's chat, or to the build — then the helper as its chip draws it.
 *
 * A permission it asks is never answered here: it is the main agent's policy's, or it comes to the
 * user among the main Session's notices.
 */

const PAGE = 'flex min-h-0 min-w-0 flex-1 flex-col'

const HEAD = 'flex shrink-0 items-center gap-2 px-4 py-2'

const WHO = 'flex min-w-0 items-center gap-1.5 text-sm'

const NAME = 'min-w-0 truncate font-medium'

export interface HelperThreadProps {
  helper: Helper
  /** What the way back goes to, which its button says. */
  back: string
  onBack: () => void
}

export function HelperThread({ helper, back, onBack }: HelperThreadProps): ReactNode {
  return (
    <section aria-label={`The thread of ${helper.name}`} className={PAGE}>
      <header className={HEAD}>
        <Button variant="ghost" size="sm" onClick={onBack} data-back>
          <IconChevronLeft size="sm" aria-hidden="true" />
          {back}
        </Button>
        <span className={WHO}>
          <span className="flex shrink-0 text-muted-foreground">
            <HelperIcon name={helper.icon} size="md" />
          </span>
          <StatusDot
            status={HELPER_TONES[helper.state]}
            size="sm"
            label={HELPER_WORDS[helper.state]}
          />
          <span className={NAME}>{helper.name}</span>
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
