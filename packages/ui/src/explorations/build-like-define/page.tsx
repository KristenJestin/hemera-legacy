import { AnimatePresence, motion } from 'motion/react'
import { type ReactNode, useState } from 'react'
import { fn } from 'storybook/test'

import { BuildSpecPanel } from '../../build/build-spec-panel.tsx'
import { BUILDING, NOW } from '../../build/build-fixtures.ts'
import { buildNotices } from '../../build/build-notices.tsx'
import { BuildView } from '../../build/build-view.tsx'
import { waitsOf } from '../../build/model.ts'
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
import { BuildDock } from './build-dock.tsx'
import { HELPERS, type Helper } from './fixtures.ts'
import { HelperChips } from './helper-chips.tsx'
import { HelperIcon } from './helper-icons.tsx'
import { HelperThread } from './helper-thread.tsx'
import { MAIN_THREAD } from './threads.tsx'

/**
 * A `build` Session laid as a `define` Session is (issue #77, the maintainer's design of 30
 * September): the Session's head line across the whole page — the runs, the helper agents, Run,
 * ⓘ and `…` — and under it the row of `BuildDock`: the main agent's chat on the left, the build on
 * the right in the Spec panel's frame, which folds as the Spec does and lays itself over the chat.
 *
 * A helper's thread opens from its chip, read only, in one of two places:
 *
 * - `column` (recommended) · in the chat column, in the main agent's chat's place, with the way
 *   back to it and no composer. Pressed while the build covers the chat, the chip takes the build
 *   back to its place first, so the thread is seen beside the build.
 * - `panel` · in the build panel, in the build view's place, with the way back to the build. A
 *   folded panel unfolds to show it; a panel over the chat stays over it.
 */

export type Placement = 'column' | 'panel'

export interface BuildSessionProps {
  placement: Placement
  helpers?: readonly Helper[] | undefined
  /** Whether the build covers the chat as the story opens. */
  defaultOver?: boolean | undefined
  defaultFolded?: boolean | undefined
  /** The helper whose thread is open as the story opens. */
  defaultHelper?: string | null | undefined
}

/** The two runs of the build: its dev server and its tests. */
const RUNS = GOING_ON.few.slice(0, 2)

const CATALOGUE = [
  { name: 'dev', command: 'pnpm dev', type: 'serve' as const, running: true },
  { name: 'test', command: 'pnpm test', type: 'test' as const, running: true },
]

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

const HEAD = 'shrink-0 px-6 pt-4 pb-1'

const PAGE = 'flex h-screen flex-col bg-background text-foreground'

/** What cross-fades in place: nothing of it travels. */
const LAYER = 'absolute inset-0 flex flex-col'

const STACK = 'relative flex min-h-0 min-w-0 flex-1 flex-col'

/** A permission a helper asked, among the main Session's notices and never in its own thread. */
function helperPermission(): NoticeGroup {
  return {
    kind: 'permission',
    label: 'Permissions',
    title: 'Run once',
    icon: <IconShield size="md" aria-hidden="true" />,
    urgent: true,
    tone: 'warning',
    items: [
      {
        id: 'ask-credit',
        content: (
          <NoticeRow
            name="Credit notes asks to run a command"
            head="pnpm add -D csv-parse"
            mono
            title="Run command"
            line="pnpm add -D csv-parse"
            place={
              <span className="flex items-center gap-1.5">
                <HelperIcon name="free" size="sm" />
                Credit notes
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

export function BuildSession({
  placement,
  helpers = HELPERS,
  defaultOver = false,
  defaultFolded = false,
  defaultHelper = null,
}: BuildSessionProps): ReactNode {
  const [folded, setFolded] = useState(defaultFolded)
  const [over, setOver] = useState(defaultOver)
  const [open, setOpen] = useState<string | null>(defaultHelper)
  const [specOpen, setSpecOpen] = useState(false)
  const [selected, setSelected] = useState<string | null>(null)
  const helper = helpers.find((one) => one.id === open)
  const view = { build: BUILDING, now: NOW, stories: READY.stories, selected, ...ACTIONS }
  const groups = [helperPermission(), buildNotices({ ...view, onSelect: setSelected }, setSelected)]

  function press(id: string): void {
    const next = open === id ? null : id
    setOpen(next)
    if (next === null) return
    if (placement === 'column') setOver(false)
    else setFolded(false)
  }

  function fold(next: boolean): void {
    setFolded(next)
    // Folded from over the chat, it unfolds back beside it.
    if (next) setOver(false)
  }

  const inColumn = placement === 'column' ? helper : undefined
  const inPanel = placement === 'panel' ? helper : undefined
  const showing = inPanel !== undefined ? `helper-${inPanel.id}` : specOpen ? 'spec' : 'build'

  return (
    <div className={PAGE}>
      <div className={HEAD}>
        <SessionHeader title="Build CSV export" onRename={fn()} onOpenDetails={fn()}>
          <GoingOnLine
            items={RUNS}
            onStop={fn()}
            onOpenUrl={fn()}
            onAddToCatalogue={fn()}
            end={
              <>
                <HelperChips helpers={helpers} open={open} onPress={press} />
                <RunCommand
                  catalogue={CATALOGUE}
                  workspace="csv-export"
                  onRunCommand={fn()}
                  onRunOnce={fn()}
                />
              </>
            }
          />
        </SessionHeader>
      </div>
      <BuildDock
        folded={folded}
        over={over}
        waits={waitsOf(BUILDING)}
        onFold={fold}
        onOver={setOver}
        chat={
          <ChatColumn
            helper={inColumn}
            onBack={() => setOpen(null)}
            notices={<SessionNotices groups={groups} />}
          />
        }
        body={
          <Swapped showing={showing}>
            {inPanel !== undefined ? (
              <HelperThread helper={inPanel} back="Build" onBack={() => setOpen(null)} />
            ) : specOpen ? (
              <BuildSpecPanel spec={READY} onClose={() => setSpecOpen(false)} />
            ) : (
              <BuildView
                {...view}
                onSelect={setSelected}
                specOpen={false}
                onToggleSpec={() => setSpecOpen(true)}
              />
            )}
          </Swapped>
        }
        foot={<SessionNotices groups={groups} />}
      />
    </div>
  )
}

/** What stands in one place, cross-faded when it changes; the place itself never moves. */
function Swapped({ showing, children }: { showing: string; children: ReactNode }): ReactNode {
  const fade = useTransition(crossfade)
  return (
    <AnimatePresence initial={false}>
      <motion.div
        key={showing}
        className={LAYER}
        initial={CROSSFADE.from}
        animate={CROSSFADE.to}
        exit={CROSSFADE.from}
        transition={fade}
      >
        {children}
      </motion.div>
    </AnimatePresence>
  )
}

/**
 * The chat column: the main agent's chat, the only one the user writes in, or a helper's thread in
 * its place. The chat stays drawn under the thread, so what was written in its box is still there
 * on the way back; it is out of reach meanwhile.
 */
function ChatColumn({
  helper,
  onBack,
  notices,
}: {
  helper: Helper | undefined
  onBack: () => void
  notices: ReactNode
}): ReactNode {
  const [value, setValue] = useState('')
  const [files, setFiles] = useState<string[]>([])
  const fade = useTransition(crossfade)
  const away = helper !== undefined
  return (
    <div className={STACK}>
      <motion.div
        inert={away}
        aria-hidden={away ? true : undefined}
        className={LAYER}
        initial={false}
        animate={away ? CROSSFADE.from : CROSSFADE.to}
        transition={fade}
      >
        <MessageScroller
          className="flex-1"
          label="The thread of this Session"
          entries={MAIN_THREAD}
        />
        <div className="mx-auto flex w-full max-w-3xl flex-col gap-2 px-6 pb-4">
          <Composer
            value={value}
            onValueChange={setValue}
            files={files}
            onFilesChange={setFiles}
            onSearchFiles={() => Promise.resolve([])}
            variant="inline"
            action="Send"
            placeholder="Say something to the main agent…"
            onSend={() => Promise.resolve(null)}
            running
            onStop={fn()}
            notices={notices}
          />
        </div>
      </motion.div>
      <AnimatePresence initial={false}>
        {helper !== undefined && (
          <motion.div
            key={helper.id}
            className={LAYER}
            initial={CROSSFADE.from}
            animate={CROSSFADE.to}
            exit={CROSSFADE.from}
            transition={fade}
          >
            <HelperThread helper={helper} back="Main agent" onBack={onBack} />
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}
