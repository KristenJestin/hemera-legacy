import { AnimatePresence, motion } from 'motion/react'
import { type ReactNode, useState } from 'react'
import { fn } from 'storybook/test'

import { BuildSpecPanel } from '../../build/build-spec-panel.tsx'
import { BUILDING, NOW } from '../../build/build-fixtures.ts'
import { buildNotices } from '../../build/build-notices.tsx'
import { BuildView, type BuildViewProps } from '../../build/build-view.tsx'
import { Composer } from '../../composer/composer.tsx'
import { IconShield } from '../../icons.ts'
import { MessageScroller } from '../../message/scroller/scroller.tsx'
import { CROSSFADE, crossfade, useTransition } from '../../motion.ts'
import { GOING_ON } from '../../session/going-on-fixtures.ts'
import { GoingOnLine } from '../../session/going-on-line.tsx'
import { NoticeRow } from '../../session/notice-row.tsx'
import { RunCommand } from '../../session/run-command.tsx'
import { type NoticeGroup, SessionNotices } from '../../session/session-notices.tsx'
import { SessionHeader } from '../../session/session.tsx'
import { READY } from '../../spec/spec-fixtures.ts'
import { HELPERS, type Helper } from './fixtures.ts'
import { HelperChips } from './helper-line.tsx'
import { HelperIcon } from './helper-icons.tsx'
import { HelperSession } from './helper-session.tsx'
import { MAIN_THREAD } from './threads.tsx'

/**
 * What the three layouts share: the build Session's head across the whole page — the line of what
 * goes on, runs and helper agents, and the head's ⓘ and `…` — the main agent's chat, the notices,
 * and the stage where the build view stands, or a helper's session in its place.
 *
 * The head is across the page and not over the chat, which is the one change every variant needs:
 * nothing important may live only in the chat, and the line is what says what goes on.
 */

/** What every variant is handed. */
export interface VariantProps {
  /** Whether the chat opens folded, closed or on the other tab. */
  chatOpen: boolean
  /** The helper whose session opens with the story. */
  openHelper?: string | null | undefined
  /** The glance open as the line is drawn. */
  glance?: string | null | undefined
  helpers?: readonly Helper[] | undefined
}

/** The actions the build view hands back, nothing of them wired. */
const ACTIONS = {
  onPause: fn(),
  onResume: fn(),
  onAccept: fn(),
  onStop: fn(),
  onTaskDone: fn(),
  onTaskSkip: fn(),
  onDismissBlocker: fn(),
  onOpenChat: fn(),
}

const CATALOGUE = [
  { name: 'dev', command: 'pnpm dev', type: 'serve' as const, running: true },
  { name: 'test', command: 'pnpm test', type: 'test' as const, running: true },
]

/** The line under the head: the runs as `GoingOnLine` draws them, the helpers after them. */
export function Head({
  start,
  helpers,
  openHelper,
  onOpenHelper,
  glance,
}: {
  /** What stands before the line: the variant's way to the chat. */
  start?: ReactNode
  helpers: readonly Helper[]
  openHelper: string | null
  onOpenHelper: (id: string) => void
  glance?: string | null | undefined
}): ReactNode {
  return (
    <div className="shrink-0 border-b border-border px-4 py-2">
      <SessionHeader title="Build CSV export" onRename={fn()} onOpenDetails={fn()}>
        <div className="flex min-w-0 flex-1 items-center gap-2">
          {start}
          <GoingOnLine
            items={GOING_ON.few}
            onStop={fn()}
            onOpenUrl={fn()}
            onAddToCatalogue={fn()}
            end={
              <>
                <HelperChips
                  helpers={helpers}
                  open={openHelper}
                  onOpen={onOpenHelper}
                  defaultGlance={glance}
                />
                <RunCommand
                  catalogue={CATALOGUE}
                  workspace="csv-export"
                  onRunCommand={fn()}
                  onRunOnce={fn()}
                />
              </>
            }
          />
        </div>
      </SessionHeader>
    </div>
  )
}

/** A permission a helper asked, among the main Session's notices and never in its own view. */
function helperPermissions(): NoticeGroup {
  return {
    kind: 'permission',
    label: 'Permissions',
    title: 'Run once',
    icon: <IconShield size="md" aria-hidden="true" />,
    urgent: true,
    tone: 'warning',
    items: [
      {
        id: 'ask-sample',
        content: (
          <NoticeRow
            name="Ledger sample asks to run a command"
            head="pnpm add -D csv-parse"
            mono
            title="Run command"
            line="pnpm add -D csv-parse"
            place={
              <span className="flex items-center gap-1.5">
                <HelperIcon name="free" size="sm" />
                Ledger sample · by T2
              </span>
            }
            refuse={{ label: 'Refuse', onPress: fn() }}
            accept={{ label: 'Run once', onPress: fn() }}
          />
        ),
      },
    ],
  }
}

/** The build of the story, and everything that reads it: the view's props and the notices. */
export function useBuild() {
  const [selected, setSelected] = useState<string | null>(null)
  const view = {
    build: BUILDING,
    now: NOW,
    stories: READY.stories,
    selected,
    onSelect: setSelected,
    ...ACTIONS,
  }
  return {
    view,
    notices: <SessionNotices groups={[helperPermissions(), buildNotices(view, setSelected)]} />,
  }
}

/** The main agent's thread, and the composer with the notices on its edge. */
export function MainChat({
  notices,
  focus = false,
  onFocusTaken,
}: {
  notices?: ReactNode
  /** Whether the composer takes the caret: a quick message asked from elsewhere. */
  focus?: boolean | undefined
  onFocusTaken?: (() => void) | undefined
}): ReactNode {
  const [value, setValue] = useState('')
  const [files, setFiles] = useState<string[]>([])
  return (
    <div className="flex min-h-0 min-w-0 flex-1 flex-col">
      <MessageScroller
        className="flex-1"
        label="The thread of this Session"
        entries={MAIN_THREAD}
      />
      <div className="mx-auto flex w-full max-w-3xl flex-col gap-2 px-6 pb-4">
        <MainComposer
          value={value}
          onValueChange={setValue}
          files={files}
          onFilesChange={setFiles}
          notices={notices}
          focus={focus}
          onFocusTaken={onFocusTaken}
        />
      </div>
    </div>
  )
}

/** The composer to the main agent, the only one of a build Session. */
export function MainComposer({
  value,
  onValueChange,
  files,
  onFilesChange,
  notices,
  focus = false,
  onFocusTaken,
}: {
  value: string
  onValueChange: (value: string) => void
  files: string[]
  onFilesChange: (files: string[]) => void
  notices?: ReactNode
  focus?: boolean | undefined
  onFocusTaken?: (() => void) | undefined
}): ReactNode {
  return (
    <Composer
      value={value}
      onValueChange={onValueChange}
      files={files}
      onFilesChange={onFilesChange}
      onSearchFiles={() => Promise.resolve([])}
      variant="inline"
      action="Send"
      placeholder="Say something to the main agent…"
      onSend={() => Promise.resolve(null)}
      running
      onStop={fn()}
      notices={notices}
      takeFocus={focus}
      onFocusTaken={onFocusTaken}
    />
  )
}

/**
 * The stage: the build view, the frozen Spec in its place while "Spec" is pressed, or a helper's
 * session. What changes cross-fades in place; the stage itself never moves.
 */
export function Stage({
  view,
  helper,
  helpers,
  onBack,
}: {
  view: Omit<BuildViewProps, 'specOpen' | 'onToggleSpec'>
  helper: Helper | undefined
  helpers: readonly Helper[]
  onBack: () => void
}): ReactNode {
  const [specOpen, setSpecOpen] = useState(false)
  const fade = useTransition(crossfade)
  const showing = helper !== undefined ? `helper-${helper.id}` : specOpen ? 'spec' : 'build'
  return (
    <div className="relative flex min-h-0 min-w-0 flex-1 flex-col">
      <AnimatePresence initial={false}>
        <motion.div
          key={showing}
          className="absolute inset-0 flex flex-col"
          initial={CROSSFADE.from}
          animate={CROSSFADE.to}
          exit={CROSSFADE.from}
          transition={fade}
        >
          {helper !== undefined ? (
            <HelperSession helper={helper} helpers={helpers} onBack={onBack} />
          ) : specOpen ? (
            <BuildSpecPanel spec={READY} onClose={() => setSpecOpen(false)} />
          ) : (
            <BuildView {...view} specOpen={false} onToggleSpec={() => setSpecOpen(true)} />
          )}
        </motion.div>
      </AnimatePresence>
    </div>
  )
}

/** The helpers and which one's session is open, as every variant holds them. */
export function useHelpers(props: VariantProps) {
  const helpers = props.helpers ?? HELPERS
  const [open, setOpen] = useState<string | null>(props.openHelper ?? null)
  return { helpers, open, setOpen, helper: helpers.find((one) => one.id === open) }
}
