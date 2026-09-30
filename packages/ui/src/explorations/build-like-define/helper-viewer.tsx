import type { ReactNode } from 'react'

import { Dialog } from '../../components/dialog/dialog.tsx'
import { Face } from '../../components/face/face.tsx'
import type { FaceState } from '../../components/face/states.ts'
import { MessageScroller } from '../../message/scroller/scroller.tsx'
import type { Helper } from './fixtures.ts'
import { HelperIcon } from './helper-icons.tsx'
import { threadOf } from './threads.tsx'

/**
 * A helper's thread, read only, opened from its chip (the maintainer's choice of 30 September on
 * issue #77): a dialog, as the Session details are one, the same in every kind of Session. It
 * shows the helper that was opened and nothing else — its live face leading the head, the step it
 * is in and since when, then its live thread, with no composer. It closes by its close or by Escape, and the keyboard goes
 * back to the chip that opened it.
 */

/**
 * The dialog's head under its title: the helper's live face, large, leading it — what it is doing
 * is read off the face as in the turn line — then the step it is in and since when.
 */
const HEAD = 'flex shrink-0 items-center gap-3'

const DOING = 'flex min-w-0 items-center gap-1.5 text-sm'

const SINCE = 'text-xs text-muted-foreground'

/** What the face says to a screen reader. */
const FACE_WORDS: Record<FaceState, string> = {
  loading: 'starting',
  thinking: 'thinking',
  reading: 'reading',
  writing: 'writing',
  running: 'running a command',
  checking: 'checking',
  question: 'asking',
  permission: 'asking for permission',
  blocked: 'silent, waiting',
  done: 'done',
  error: 'failed',
  asleep: 'stopped',
}

/** The face a helper wears: what its step does while it works, where it ended once it has. */
function faceOf(helper: Helper): FaceState {
  if (helper.state === 'finished') return 'done'
  if (helper.state === 'failed') return 'error'
  if (helper.state === 'stopped') return 'asleep'
  if (helper.state === 'stuck') return 'blocked'
  const step = helper.steps.at(-1) ?? ''
  if (step.startsWith('Read') || step.startsWith('Search')) return 'reading'
  if (step.startsWith('Edit') || step.startsWith('Write')) return 'writing'
  if (step.startsWith('Run') || step.startsWith('Serve')) return 'running'
  return 'thinking'
}

export interface HelperViewerProps {
  helpers: readonly Helper[]
  /** The helper whose thread is open, or none. */
  open: string | null
  onClose: () => void
}

export function HelperViewer({ helpers, open, onClose }: HelperViewerProps): ReactNode {
  const helper = helpers.find((one) => one.id === open)
  return (
    <Dialog
      title={helper?.name ?? ''}
      size="wide"
      open={helper !== undefined}
      onOpenChange={(next) => {
        if (!next) onClose()
      }}
    >
      {helper !== undefined && (
        <div className="flex h-pinned min-h-0 flex-col gap-2">
          <div className={HEAD}>
            <Face
              state={faceOf(helper)}
              size="md"
              seed={helper.id.length}
              label={`${helper.name}, ${FACE_WORDS[faceOf(helper)]}`}
            />
            <span className="flex min-w-0 flex-col gap-0.5">
              <span className={DOING}>
                <HelperIcon name={helper.icon} size="sm" />
                <span className="truncate font-mono text-xs">{helper.steps.at(-1)}</span>
              </span>
              <span className={SINCE}>
                since {helper.at} · {helper.for}
              </span>
            </span>
          </div>
          <MessageScroller
            className="flex-1"
            label={`What ${helper.name} is doing`}
            entries={threadOf(helper)}
          />
        </div>
      )}
    </Dialog>
  )
}
