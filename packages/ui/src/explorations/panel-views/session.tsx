import { type ReactNode, useState } from 'react'

import { ACCEPTED, BUILDING, NOW, READY_TO_ACCEPT } from '../../build/build-fixtures.ts'
import { BuildView } from '../../build/build-view.tsx'
import type { BuildViewData } from '../../build/model.ts'
import { Composer } from '../../composer/composer.tsx'
import { TooltipProvider } from '../../components/tooltip/tooltip.tsx'
import { IconHammer } from '../../icons.ts'
import { AgentText } from '../../message/agent-text.tsx'
import { MessageScroller, type ScrollerEntry } from '../../message/scroller/scroller.tsx'
import { SessionRow } from '../../session/session-row.tsx'
import { SessionHeader } from '../../session/session.tsx'
import { MissionBrief } from '../../spec/mission-brief.tsx'
import { READY } from '../../spec/spec-fixtures.ts'
import { PanelFrame } from './frame.tsx'
import {
  type FrameState,
  type PanelView,
  type Variant,
  closeView,
  layView,
  openView,
  showView,
} from './model.ts'
import { type ViewContext, type ViewId, viewOf } from './views.tsx'

/**
 * A `build` Session drawn whole for the exploration: its head across the page, the chat and its
 * composer, and the frame on the right, the build at its base. From the build, Spec opens the frozen
 * Spec, a task opens its detail, the review card opens the round and Accept the delivery; from a
 * task or a round, Spec opens the Spec over them.
 */

/** What the frame shows as the page opens. */
export type Case = 'base' | 'spec' | 'task' | 'review' | 'delivery' | 'deep'

/** The build under each case, at the moment the view it opens belongs to. */
const BUILDS: Record<Case, BuildViewData> = {
  base: READY_TO_ACCEPT,
  spec: BUILDING,
  task: BUILDING,
  review: READY_TO_ACCEPT,
  delivery: ACCEPTED,
  deep: READY_TO_ACCEPT,
}

/** The views each case opens, in order: the last one is shown. */
const OPENED: Record<Case, readonly ViewId[]> = {
  base: [],
  spec: ['spec'],
  task: ['task:bt-2'],
  review: ['review'],
  delivery: ['delivery'],
  deep: ['review', 'spec'],
}

/**
 * No task of the build has this id: the base unfolds no task in place, and picking one opens its
 * view on top instead.
 */
const NONE = 'none'

const THREAD: ScrollerEntry[] = [
  {
    id: 'brief',
    content: (
      <MissionBrief
        title="What the agent was told · Building"
        detail="10:28"
        brief="**Building** · work through the ready tasks of `ATL-7`."
      />
    ),
  },
  {
    id: 'answer',
    content: (
      <AgentText text="T2 was red on the header order: the ledger wants the number before the client. I am fixing the writer, then T3 from the same query." />
    ),
  },
]

export interface PanelViewsSessionProps {
  variant: Variant
  case: Case
  /** Whether the frame lies over the chat as the page opens, for what it shows then. */
  over: boolean
}

export function PanelViewsSession({
  variant,
  case: shown,
  over,
}: PanelViewsSessionProps): ReactNode {
  const build = BUILDS[shown]
  const context: ViewContext = { build, spec: READY, now: NOW, onOpenSpec: () => open('spec') }
  const widthOf = (id: ViewId) => viewOf(id, context)?.width ?? 'beside'
  const [state, setState] = useState<FrameState>(() => {
    let first: FrameState = { open: [], shown: null, baseOver: false }
    for (const id of OPENED[shown]) first = openView(first, variant, id, widthOf(id))
    return layView(first, over)
  })

  function open(id: ViewId): void {
    setState((was) => openView(was, variant, id, widthOf(id)))
  }

  const views = new Map<string, PanelView>()
  for (const one of state.open) {
    const view = viewOf(one.id, context)
    if (view !== null) views.set(one.id, view)
  }

  const base: PanelView = {
    title: `Build ${build.specKey}`,
    icon: <IconHammer size="sm" aria-hidden="true" />,
    width: 'beside',
    body: (
      <BuildView
        build={build}
        now={NOW}
        stories={READY.stories}
        selected={NONE}
        onSelect={(id) => {
          if (id !== null) open(`task:${id}`)
        }}
        specOpen={state.open.some((one) => one.id === 'spec')}
        onToggleSpec={() => open('spec')}
        onPause={() => undefined}
        onResume={() => undefined}
        onAccept={() => open('delivery')}
        onStop={() => undefined}
        onTaskDone={() => undefined}
        onTaskSkip={() => undefined}
        onDismissBlocker={() => undefined}
        onOpenChat={() => open('review')}
      />
    ),
  }

  return (
    <TooltipProvider>
      <div className="flex h-screen min-h-0 flex-col bg-background text-foreground">
        <div className="shrink-0 px-6 pt-6 pb-1">
          <SessionHeader title="Build CSV export" onRename={() => undefined} />
        </div>
        <SessionRow chat={<Chat />}>
          <PanelFrame
            variant={variant}
            base={base}
            views={views}
            state={state}
            onState={setState}
            onShow={(id) => setState((was) => showView(was, variant, id))}
            onClose={(id) => setState((was) => closeView(was, variant, id))}
          />
        </SessionRow>
      </div>
    </TooltipProvider>
  )
}

/** The chat of the Session: its thread and its composer. */
function Chat(): ReactNode {
  const [value, setValue] = useState('')
  const [files, setFiles] = useState<string[]>([])
  return (
    <div className="flex min-h-0 min-w-0 flex-1 flex-col">
      <MessageScroller className="flex-1" label="The thread of this Session" entries={THREAD} />
      <div className="mx-auto flex w-full max-w-3xl flex-col gap-2 px-6 pb-4">
        <Composer
          value={value}
          onValueChange={setValue}
          files={files}
          onFilesChange={setFiles}
          onSearchFiles={() => Promise.resolve([])}
          variant="inline"
          action="Send"
          placeholder="Say something to the agent…"
          onSend={() => Promise.resolve(null)}
          running
          onStop={() => undefined}
        />
      </div>
    </div>
  )
}
