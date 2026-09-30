import { type ReactNode, useState } from 'react'

import { IconHammer } from '../icons.ts'
import { NoticeRow } from '../session/notice-row.tsx'
import type { NoticeGroup, NoticeItem } from '../session/session-notices.tsx'
import { type BuildViewProps, dependantsOf } from './build-view.tsx'
import { type BuildTaskView, openBlockerOf } from './model.ts'
import { SkipDialog } from './yours-block.tsx'

/**
 * What a build waits for the user on, as one kind of the Session's notices (issue #237): the pill
 * on the composer's edge is where everything that waits for a human is answered from, and a build
 * is one more thing that does.
 *
 * One row a decision, in the notices' own anatomy — the quiet answer that refuses, the primary one
 * that accepts, `Open` between them where the build view says more:
 *
 * - a task that is the user's: `Skip…`, then `Done`;
 * - a blocker the agent raised: `The Spec stands`, then `Open`, where a note can be written beside
 *   the answer.
 *
 * The view keeps every one of them too: the notices are where they are answered at a glance, and
 * the view where they are read.
 */

type BuildHandlers = Omit<BuildViewProps, 'specOpen' | 'onToggleSpec'>

/** A task that is the user's, with the Skip that asks why before it lets the task go. */
function YoursNotice({
  task,
  view,
  onOpen,
}: {
  task: BuildTaskView
  view: BuildHandlers
  onOpen: (taskId: string) => void
}): ReactNode {
  const [skipping, setSkipping] = useState(false)
  // An agent's task is the user's only after three red tries (D10-07).
  const title = task.executor === 'agent' ? 'Came back after three red tries' : 'Your task'
  return (
    <>
      <NoticeRow
        name={`${task.label} is yours`}
        head={`${task.label} · ${task.title}`}
        title={title}
        line={task.criteria}
        refuse={{ label: 'Skip…', onPress: () => setSkipping(true) }}
        others={[{ label: 'Open', onPress: () => onOpen(task.id) }]}
        accept={{ label: 'Done', onPress: () => view.onTaskDone(task.id) }}
      />
      <SkipDialog
        open={skipping}
        onOpenChange={setSkipping}
        label={task.label}
        dependants={dependantsOf(task.label, view.build.tasks)}
        onSkip={(reason, unblock) => {
          setSkipping(false)
          view.onTaskSkip(task.id, reason, unblock)
        }}
      />
    </>
  )
}

/** The rows of what the build waits for the user on, in the order the view lists them. */
export function buildNoticeItems(
  view: BuildHandlers,
  onOpen: (taskId: string) => void,
): NoticeItem[] {
  const { build } = view
  if (build.phase === 'accepted' || build.phase === 'stopped') return []
  const items: NoticeItem[] = []
  for (const task of build.tasks) {
    if (task.state === 'yours') {
      items.push({
        id: `yours:${task.id}`,
        content: <YoursNotice task={task} view={view} onOpen={onOpen} />,
      })
    }
    const blocker = openBlockerOf(task, build.blockers)
    if (blocker !== undefined) {
      items.push({
        id: `blocker:${blocker.id}`,
        content: (
          <NoticeRow
            name={`Blocker on ${task.label}`}
            head={`${task.label} · ${blocker.reason}`}
            title="Contradicts the Spec"
            line={blocker.reason}
            refuse={{
              label: 'The Spec stands',
              onPress: () => view.onDismissBlocker(blocker.id, null),
            }}
            accept={{ label: 'Open', onPress: () => onOpen(task.id) }}
          />
        ),
      })
    }
  }
  return items
}

/** The build's kind of the Session's notices, with the rows `buildNoticeItems` draws. */
export function buildNotices(view: BuildHandlers, onOpen: (taskId: string) => void): NoticeGroup {
  return {
    kind: 'build',
    label: 'Build',
    title: 'Answer the build',
    tone: 'build',
    icon: <IconHammer size="md" aria-hidden="true" />,
    items: buildNoticeItems(view, onOpen),
  }
}
