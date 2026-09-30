import { AnimatePresence, motion } from 'motion/react'
import { type ReactNode, useMemo, useRef, useState } from 'react'
import { fn } from 'storybook/test'

import { Composer } from '../../composer/composer.tsx'
import { IconButton } from '../../components/button/button.tsx'
import { StatusDot } from '../../components/status-dot/status-dot.tsx'
import { Tooltip } from '../../components/tooltip/tooltip.tsx'
import { IconChevronLeft, IconHammer, IconShield } from '../../icons.ts'
import { MessageScroller, type ScrollerEntry } from '../../message/scroller/scroller.tsx'
import { CROSSFADE, crossfade, instant, swap, useTransition } from '../../motion.ts'
import { GOING_ON } from '../../session/going-on-fixtures.ts'
import { GoingOnLine } from '../../session/going-on-line.tsx'
import { NoticeRow } from '../../session/notice-row.tsx'
import { RunCommand } from '../../session/run-command.tsx'
import { type NoticeGroup, SessionNotices } from '../../session/session-notices.tsx'
import { SessionHeader } from '../../session/session.tsx'
import { SpecColumn } from '../../spec/spec-column.tsx'
import { MID_PLAN, READY } from '../../spec/spec-fixtures.ts'
import { SpecFrame } from '../../spec/spec-frame.tsx'
import { phasesOf } from '../../spec/spec-phases.ts'
import { BuildTasks, type Grouping } from './build-tasks.tsx'
import { BuildWide } from './build-wide.tsx'
import { DefineWide } from './define-wide.tsx'
import { DEFINE_HELPERS, FREE_HELPERS, type Helper, STUCK } from './fixtures.ts'
import { HelperChips } from './helper-chips.tsx'
import { HelperIcon } from './helper-icons.tsx'
import { HelperViewer } from './helper-viewer.tsx'
import { PanelDock } from './panel-dock.tsx'
import { BOARD } from './tasks-fixtures.ts'
import { DEFINE_THREAD, FREE_THREAD, MAIN_THREAD } from './threads.tsx'

/**
 * A Session of any kind as the exploration lays it (issue #77, maintainer's feedback of 30
 * September): the head line, the chat, the side panel of `define` and `build` — one mechanism,
 * `PanelDock` — and the helpers' threads opened from their chips by one mechanism too,
 * `HelperViewer`, whatever the kind.
 *
 * The head line stands in one of two places, for the maintainer to choose:
 *
 * - `page` (A) · across the whole page, over the chat and the panel;
 * - `chat` (B) · over the chat only, as `define` has it today; it goes into the panel's head
 *   while the panel covers the chat.
 */

export type Kind = 'free' | 'define' | 'build'

export type HeadPlacement = 'page' | 'chat'

export interface SessionPageProps {
  kind: Kind
  head?: HeadPlacement | undefined
  helpers?: readonly Helper[] | undefined
  defaultOver?: boolean | undefined
  defaultFolded?: boolean | undefined
  /** The helper whose thread is open as the page is drawn. */
  defaultHelper?: string | null | undefined
  defaultGrouping?: Grouping | undefined
  defaultTask?: string | null | undefined
}

/** The two runs of the Session: its dev server and its tests. */
const RUNS = GOING_ON.few.slice(0, 2)

const CATALOGUE = [
  { name: 'dev', command: 'pnpm dev', type: 'serve' as const, running: true },
  { name: 'test', command: 'pnpm test', type: 'test' as const, running: true },
]

const HELPERS: Record<Kind, readonly Helper[]> = {
  free: FREE_HELPERS,
  define: DEFINE_HELPERS,
  build: STUCK,
}

const THREADS: Record<Kind, ScrollerEntry[]> = {
  free: FREE_THREAD,
  define: DEFINE_THREAD,
  build: MAIN_THREAD,
}

const TITLES: Record<Kind, string> = {
  free: 'Rounding cent',
  define: 'Spec CSV',
  build: 'Build CSV export',
}

const PAGE = 'flex h-full min-h-0 flex-col bg-background text-foreground'

const PAGE_HEAD = 'shrink-0 px-6 pt-4 pb-1'

const CHAT_HEAD = 'mx-auto w-full max-w-3xl shrink-0 px-6 pt-4 pb-2'

const STAGE = 'relative flex min-h-0 flex-1 flex-col'

const LAYER = 'absolute inset-0 flex flex-col'

const PANEL_TITLE = 'flex min-w-0 items-center gap-2 text-sm'

/** The small frame of the build, as the Spec's is drawn: its rim, the unfold, its body. */
const RIM = 'flex w-spec-frame flex-col rounded-xl border border-border bg-surface-rim p-1.5'

const RIM_TOP = 'flex shrink-0 justify-end pt-1.5 pr-1.5 pb-1.5'

const RIM_BODY =
  'flex flex-col items-center gap-2 rounded-lg border border-border bg-surface-body py-2 text-muted-foreground shadow-sm'

export function SessionPage({
  kind,
  head = 'page',
  helpers = HELPERS[kind],
  defaultOver = false,
  defaultFolded = false,
  defaultHelper = null,
  defaultGrouping = 'story',
  defaultTask = null,
}: SessionPageProps): ReactNode {
  const [folded, setFolded] = useState(defaultFolded)
  const [over, setOver] = useState(defaultOver)
  const [open, setOpen] = useState<string | null>(defaultHelper)
  const [answered, setAnswered] = useState(false)
  const [specShown, setSpecShown] = useState(false)
  const [grouping, setGrouping] = useState<Grouping>(defaultGrouping)
  const [task, setTask] = useState<string | null>(defaultTask)
  const [value, setValue] = useState('')
  const [files, setFiles] = useState<string[]>([])
  const stage = useRef<HTMLDivElement>(null)
  const asker = helpers.find((one) => one.icon === 'free') ?? helpers[0]
  const groups: NoticeGroup[] =
    answered || asker === undefined ? [] : [permissionOf(asker, () => setAnswered(true))]

  function press(id: string): void {
    if (open === id) close()
    else setOpen(id)
  }

  function close(): void {
    const was = open
    setOpen(null)
    if (was === null) return
    // The keyboard goes back to the chip that opened it, the one of the line in view.
    requestAnimationFrame(() => {
      const chips = stage.current?.ownerDocument.querySelectorAll<HTMLElement>(
        `[data-helper="${was}"]`,
      )
      const shown = [...(chips ?? [])].find((chip) => chip.closest('[inert]') === null)
      shown?.focus()
    })
  }

  function fold(next: boolean): void {
    setFolded(next)
    if (next) setOver(false)
  }

  const line = (
    <SessionHeader title={TITLES[kind]} onRename={fn()} onOpenDetails={fn()}>
      <GoingOnLine
        items={kind === 'define' ? [] : RUNS}
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
  )

  const chat = (
    <ChatColumn thread={THREADS[kind]} head={head === 'chat' ? line : null}>
      <ChatFoot
        value={value}
        onValueChange={setValue}
        files={files}
        onFilesChange={setFiles}
        notices={<SessionNotices groups={groups} />}
      />
    </ChatColumn>
  )
  const foot = (
    <ChatFoot value={value} onValueChange={setValue} files={files} onFilesChange={setFiles} />
  )

  const notices = <SessionNotices groups={groups} />
  const tasks = {
    specKey: 'ATL-7',
    title: 'CSV invoice export',
    tasks: BOARD,
    grouping,
    onGrouping: setGrouping,
    open: task,
    onOpen: setTask,
    specShown: over && specShown,
    // Beside the chat, the Spec takes the panel over the chat, to be read beside its tasks.
    onSpec: () => {
      if (over) {
        setSpecShown(!specShown)
        return
      }
      setSpecShown(true)
      setOver(true)
    },
  }
  const inPanel = head === 'chat' ? line : undefined

  return (
    <div className={PAGE}>
      {head === 'page' && <div className={PAGE_HEAD}>{line}</div>}
      <div ref={stage} className={STAGE}>
        {kind === 'free' && <div className="flex min-h-0 flex-1 flex-col">{chat}</div>}
        {kind === 'define' && (
          <DefineDock
            chat={chat}
            line={inPanel}
            notices={notices}
            foot={foot}
            folded={folded}
            over={over}
            onFold={fold}
            onOver={setOver}
          />
        )}
        {kind === 'build' && (
          <PanelDock
            label="Build ATL-7"
            chat={chat}
            line={inPanel}
            notices={notices}
            foot={foot}
            folded={folded}
            over={over}
            onFold={fold}
            onOver={setOver}
            title={
              <span className={PANEL_TITLE}>
                <IconHammer size="sm" aria-hidden="true" />
                <span className="font-medium">Build</span>
              </span>
            }
            frame={<BuildFrame onUnfold={() => fold(false)} />}
            body={
              <Swapped showing={over ? 'wide' : 'beside'}>
                {over ? <BuildWide {...tasks} frozen={READY} /> : <BuildTasks {...tasks} />}
              </Swapped>
            }
          />
        )}
        <HelperViewer helpers={helpers} open={open} onClose={close} />
      </div>
    </div>
  )
}

interface DockProps {
  chat: ReactNode
  line: ReactNode
  notices: ReactNode
  foot: ReactNode
  folded: boolean
  over: boolean
  onFold: (folded: boolean) => void
  onOver: (over: boolean) => void
}

/** `define`'s Spec in the same panel: its key and title on the head, its column, its frame. */
function DefineDock(props: DockProps): ReactNode {
  const spec = MID_PLAN
  const groups = useMemo(() => phasesOf(spec), [spec])
  const column = useRef<HTMLDivElement>(null)
  const still = useTransition(swap.move) === instant
  return (
    <PanelDock
      {...props}
      label={`Spec ${spec.key}`}
      title={
        <span className={PANEL_TITLE}>
          <span className="font-mono text-xs text-muted-foreground">{spec.key}</span>
          <span className="truncate font-semibold">{spec.title}</span>
        </span>
      }
      frame={
        <SpecFrame
          specKey={spec.key}
          groups={groups}
          writing={spec.focus}
          onUnfold={() => props.onFold(false)}
        />
      }
      body={
        <Swapped showing={props.over ? 'wide' : 'beside'}>
          {props.over ? (
            <DefineWide spec={spec} groups={groups} still={still} />
          ) : (
            <SpecColumn spec={spec} groups={groups} column={column} still={still} />
          )}
        </Swapped>
      }
    />
  )
}

/** The build folded: the unfold, the hammer, and the dot of what waits for the hand. */
function BuildFrame({ onUnfold }: { onUnfold: () => void }): ReactNode {
  return (
    <div className={RIM}>
      <div className={RIM_TOP}>
        <Tooltip label="Unfold the panel" side="left">
          <IconButton
            variant="ghost"
            size="sm"
            icon={<IconChevronLeft size="sm" />}
            aria-label="Unfold the panel"
            data-unfold
            onClick={onUnfold}
          />
        </Tooltip>
      </div>
      <div className={RIM_BODY}>
        <IconHammer size="md" aria-hidden="true" />
        <StatusDot status="running" label="Something in the build waits for you" />
      </div>
    </div>
  )
}

/** A permission a helper asked, among the Session's notices and never in its own thread. */
function permissionOf(helper: Helper, onAnswer: () => void): NoticeGroup {
  return {
    kind: 'permission',
    label: 'Permissions',
    title: 'Run once',
    icon: <IconShield size="md" aria-hidden="true" />,
    urgent: true,
    tone: 'warning',
    items: [
      {
        id: 'ask-helper',
        content: (
          <NoticeRow
            name={`${helper.name} asks to run a command`}
            head="pnpm add -D csv-parse"
            mono
            title="Run command"
            line="pnpm add -D csv-parse"
            place={
              <span className="flex items-center gap-1.5">
                <HelperIcon name={helper.icon} size="sm" />
                {helper.name}
              </span>
            }
            refuse={{ label: 'Refuse', onPress: onAnswer }}
            accept={{ label: 'Run once', onPress: onAnswer }}
          />
        ),
      },
    ],
  }
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

/** The chat column: the head line in placement B, the thread, and its foot. */
function ChatColumn({
  thread,
  head,
  children,
}: {
  thread: ScrollerEntry[]
  head: ReactNode
  children: ReactNode
}): ReactNode {
  return (
    <>
      {head !== null && <div className={CHAT_HEAD}>{head}</div>}
      <MessageScroller className="flex-1" label="The thread of this Session" entries={thread} />
      {children}
    </>
  )
}

/** The chat's foot: the one composer, and the notices on its edge. */
function ChatFoot({
  value,
  onValueChange,
  files,
  onFilesChange,
  notices,
}: {
  value: string
  onValueChange: (value: string) => void
  files: string[]
  onFilesChange: (files: string[]) => void
  notices?: ReactNode
}): ReactNode {
  return (
    <div className="mx-auto flex w-full max-w-3xl flex-col px-6 pb-4">
      <Composer
        value={value}
        onValueChange={onValueChange}
        files={files}
        onFilesChange={onFilesChange}
        onSearchFiles={() => Promise.resolve([])}
        variant="inline"
        action="Send"
        placeholder="Say something to the agent…"
        onSend={() => Promise.resolve(null)}
        running
        onStop={fn()}
        notices={notices}
      />
    </div>
  )
}
