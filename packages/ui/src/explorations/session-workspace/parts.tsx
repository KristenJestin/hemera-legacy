import { motion } from 'motion/react'
import { type ReactNode, useState } from 'react'

import { CommandRun } from '../../activity/command-run.tsx'
import { COMMAND_TYPE_ICONS } from '../../activity/command-type.ts'
import { Composer } from '../../composer/composer.tsx'
import { Badge } from '../../components/badge/badge.tsx'
import { Button } from '../../components/button/button.tsx'
import { Input } from '../../components/field/field.tsx'
import { StatusDot, type StatusTone } from '../../components/status-dot/status-dot.tsx'
import {
  IconActivity,
  IconBrain,
  IconFileText,
  IconGitFork,
  IconHammer,
  IconPlayerPlay,
  IconPlayerStop,
  IconServer,
  IconTerminal,
} from '../../icons.ts'
import { AgentText } from '../../message/agent-text.tsx'
import { MessageGroup } from '../../message/message.tsx'
import { MessageScroller, type ScrollerEntry } from '../../message/scroller/scroller.tsx'
import { CROSSFADE, crossfade, useTransition } from '../../motion.ts'
import { ContextView } from '../../session/context-view.tsx'
import { PlanPanel } from '../../session/plan-panel.tsx'
import { SessionHeader } from '../../session/session.tsx'
import { ServiceUrl } from '../../workspace/service-list.tsx'
import { PreparationSteps } from '../../workspace/preparation-steps.tsx'
import {
  BUILD_TASKS,
  type BuildTask,
  type Mission,
  type Place,
  type SessionFacts,
  TITLES,
} from './fixtures.ts'

/**
 * The pieces all three variants are drawn with (issue #219): the conversation of a Session, what
 * it works with said place by place, and a stand-in of the build panel. A variant decides where
 * these live and how one goes to them and back; what each place holds is the same in all three, so
 * the variants are compared on where things are and not on how a list is drawn.
 */

/** The icon each place is named with, wherever a variant names it. */
export const PLACE_ICONS: Record<Place, ReactNode> = {
  workspace: <IconGitFork size="sm" aria-hidden="true" />,
  commands: <IconTerminal size="sm" aria-hidden="true" />,
  services: <IconServer size="sm" aria-hidden="true" />,
  activity: <IconActivity size="sm" aria-hidden="true" />,
  context: <IconBrain size="sm" aria-hidden="true" />,
}

/** What a place says of itself at rest, for a variant that shows it without opening it. */
export interface Glance {
  /** A few words: `csv-export · Ready`, `2 running`, `1 up`. */
  words: string
  /** The dot beside them, or none when nothing is going on. */
  tone: StatusTone | null
}

const STATE_WORDS = { preparing: 'Preparing', ready: 'Ready', failed: 'Failed' } as const

const STATE_TONES = { preparing: 'running', ready: 'success', failed: 'failure' } as const

const STATE_BADGES = { preparing: 'info', ready: 'success', failed: 'destructive' } as const

/** What each place says at rest, in the words and the dot a glance takes in. */
export function glanceOf(place: Place, facts: SessionFacts): Glance {
  switch (place) {
    case 'workspace':
      return facts.workspace === null
        ? { words: 'No Workspace', tone: null }
        : {
            words: `${facts.workspace.name} · ${STATE_WORDS[facts.workspace.state]}`,
            tone: STATE_TONES[facts.workspace.state],
          }
    case 'commands': {
      const running = facts.runs.filter((run) => run.state === 'running').length
      return running === 0
        ? { words: 'Nothing running', tone: null }
        : { words: `${String(running)} running`, tone: 'running' }
    }
    case 'services':
      return facts.services.length === 0
        ? { words: 'No service', tone: null }
        : { words: `${String(facts.services.length)} up`, tone: 'success' }
    case 'activity': {
      const done = facts.plan.filter((entry) => entry.status === 'completed').length
      return facts.plan.length === 0
        ? { words: 'No plan yet', tone: null }
        : { words: `${String(done)} of ${String(facts.plan.length)}`, tone: null }
    }
    case 'context':
      return { words: facts.context === null ? 'Not read yet' : 'AGENTS.md', tone: null }
  }
}

/** A content that takes the height its box is given, for a box whose content scrolls inside. */
const FILL = 'flex min-h-0 flex-1 flex-col'

/**
 * A place's content, faded in as it is chosen: the room stays, what it shows changes. `fill` lays
 * it at the height of its box rather than its own, for a content that scrolls inside that box.
 */
export function Crossfaded({
  fill = false,
  children,
}: {
  fill?: boolean | undefined
  children: ReactNode
}): ReactNode {
  const transition = useTransition(crossfade)
  return (
    <motion.div
      className={fill ? FILL : undefined}
      initial={CROSSFADE.from}
      animate={CROSSFADE.to}
      transition={transition}
    >
      {children}
    </motion.div>
  )
}

const SECTION = 'flex flex-col gap-3'

const LINE = 'flex min-w-0 flex-wrap items-center gap-2'

const NAME = 'min-w-0 truncate text-sm font-medium text-foreground'

const MONO = 'min-w-0 truncate font-mono text-xs text-muted-foreground'

const NOTE = 'text-sm text-muted-foreground'

const ROWS = 'flex flex-col gap-1'

const ROW = 'flex min-w-0 items-center gap-2 rounded-md px-2 py-1.5 hover:bg-accent'

const ROW_ICON = 'flex shrink-0 text-muted-foreground'

const ROW_TEXT = 'flex min-w-0 flex-1 flex-col'

const LABEL = 'text-xs font-medium text-muted-foreground'

/** The Workspace: its name and state, its repositories with their branch, its preparation. */
export function WorkspacePart({
  facts,
  onResume,
}: {
  facts: SessionFacts
  onResume: () => void
}): ReactNode {
  const workspace = facts.workspace
  if (workspace === null) {
    return (
      <div className={SECTION}>
        <p className={NAME}>No Workspace</p>
        <p className={NOTE}>
          This Session works in no Workspace: nothing is prepared for it, and no command runs for
          it. Choose one on the composer&apos;s Workspace pill before the agent starts.
        </p>
      </div>
    )
  }
  return (
    <div className={SECTION}>
      <div className="flex flex-col gap-1">
        <div className={LINE}>
          <span className={NAME}>{workspace.name}</span>
          <Badge tone={STATE_BADGES[workspace.state]}>{STATE_WORDS[workspace.state]}</Badge>
        </div>
        <span className={MONO}>{workspace.folder}</span>
      </div>
      {/* Before the repositories while it is not ready: where it stands is what is read first. */}
      {workspace.state !== 'ready' && (
        <PreparationSteps
          steps={workspace.steps}
          onResume={workspace.state === 'failed' ? onResume : undefined}
        />
      )}
      <div className="flex flex-col gap-1">
        <span className={LABEL}>Repositories</span>
        <ul className={ROWS} aria-label={`Repositories of ${workspace.name}`}>
          {workspace.repositories.map((repository) => (
            <li key={repository.path} className={ROW}>
              <span className={ROW_ICON}>
                <IconGitFork size="sm" aria-hidden="true" />
              </span>
              <span className={ROW_TEXT}>
                <span className="min-w-0 truncate font-mono text-sm">{repository.path}</span>
                <span className={MONO}>
                  {workspace.state === 'ready'
                    ? `${repository.branch} · ${repository.changes}`
                    : repository.branch}
                </span>
              </span>
            </li>
          ))}
        </ul>
      </div>
    </div>
  )
}

/**
 * The commands: the Project's catalogue with Run and Stop, the runs of this Session with their
 * output, and the line a one-off is run from.
 */
export function CommandsPart({
  facts,
  wide = false,
  onRun,
  onStop,
  onOpenUrl,
}: {
  facts: SessionFacts
  /** Whether the part has a window's width: the runs' output then takes most of it. */
  wide?: boolean | undefined
  onRun: (line: string) => void
  onStop: (id: string) => void
  onOpenUrl: (url: string) => void
}): ReactNode {
  const [line, setLine] = useState('')
  const ready = facts.workspace?.state === 'ready'
  const catalogue = (
    <div className="flex flex-col gap-1">
      <span className={LABEL}>Catalogue</span>
      <ul className={ROWS} aria-label="Catalogue">
        {facts.catalogue.map((command) => {
          const Type = COMMAND_TYPE_ICONS[command.type]
          return (
            <li key={command.name} className={ROW}>
              <span className={ROW_ICON}>
                <Type size="sm" aria-hidden="true" />
              </span>
              <span className={ROW_TEXT}>
                <span className="text-sm">{command.name}</span>
                <span className={MONO}>{command.command}</span>
              </span>
              {command.running ? (
                <Button
                  variant="secondary"
                  size="sm"
                  className="shrink-0"
                  aria-label={`Stop ${command.name}`}
                  onClick={() => onStop(command.name)}
                >
                  <IconPlayerStop size="sm" aria-hidden="true" />
                  Stop
                </Button>
              ) : (
                <Button
                  variant="ghost"
                  size="sm"
                  className="shrink-0"
                  aria-label={`Run ${command.name}`}
                  disabled={!ready}
                  onClick={() => onRun(command.name)}
                >
                  <IconPlayerPlay size="sm" aria-hidden="true" />
                  Run
                </Button>
              )}
            </li>
          )
        })}
      </ul>
      {!ready && (
        <p className={NOTE}>
          {facts.workspace === null
            ? 'A command runs in a Workspace, and this Session has none.'
            : 'The commands run once the Workspace is ready.'}
        </p>
      )}
    </div>
  )
  const runs =
    facts.runs.length === 0 ? null : (
      <div className="flex flex-col gap-2">
        <span className={LABEL}>Runs of this Session</span>
        {facts.runs.map(({ id, ...run }) => (
          <CommandRun key={id} {...run} onStop={() => onStop(id)} onOpenUrl={onOpenUrl} />
        ))}
      </div>
    )
  const oneOff = (
    <Input
      label="Run a one-off line"
      placeholder="pnpm vitest csv.stream"
      value={line}
      onValueChange={setLine}
      disabled={!ready}
      action={
        <Button
          variant="secondary"
          size="sm"
          disabled={!ready || line.trim() === ''}
          onClick={() => {
            onRun(line)
            setLine('')
          }}
        >
          Run
        </Button>
      }
    />
  )
  if (wide) {
    return (
      <div className="grid grid-cols-3 gap-6">
        <div className={SECTION}>
          {catalogue}
          {oneOff}
        </div>
        <div className="col-span-2">
          {runs ?? <p className={NOTE}>Nothing has run in this Session yet.</p>}
        </div>
      </div>
    )
  }
  return (
    <div className={SECTION}>
      {catalogue}
      {runs}
      {oneOff}
    </div>
  )
}

/** The services up in the Workspace: their state, their address, and Stop. */
export function ServicesPart({
  facts,
  onStop,
  onOpenUrl,
}: {
  facts: SessionFacts
  onStop: (id: string) => void
  onOpenUrl: (url: string) => void
}): ReactNode {
  if (facts.services.length === 0) {
    return <p className={NOTE}>No service is up. A serve command shows here once it starts.</p>
  }
  return (
    <ul className={ROWS} aria-label="Services">
      {facts.services.map((service) => (
        <li key={service.id} className={ROW}>
          <StatusDot status="success" label="Up" />
          <span className={ROW_TEXT}>
            <span className="text-sm">{service.name}</span>
            <ServiceUrl url={service.url} readiness="ready" onOpenUrl={onOpenUrl} />
          </span>
          <Button
            variant="secondary"
            size="sm"
            className="shrink-0"
            aria-label={`Stop the service ${service.name}`}
            onClick={() => onStop(service.id)}
          >
            <IconPlayerStop size="sm" aria-hidden="true" />
            Stop
          </Button>
        </li>
      ))}
    </ul>
  )
}

/** What the Session has been doing: its plan, the files it touched, and its trace. */
export function ActivityPart({
  facts,
  onOpenTrace,
}: {
  facts: SessionFacts
  onOpenTrace?: (() => void) | undefined
}): ReactNode {
  return (
    <div className={SECTION}>
      {facts.plan.length === 0 && facts.files.length === 0 && (
        <p className={NOTE}>No plan and no file touched in this Session yet.</p>
      )}
      {facts.plan.length > 0 && <PlanPanel entries={facts.plan} defaultOpen />}
      {facts.files.length > 0 && (
        <div className="flex flex-col gap-1">
          <span className={LABEL}>Files</span>
          <ul className={ROWS} aria-label="Files touched">
            {facts.files.map((file) => (
              <li key={file.path} className="flex min-w-0 items-baseline gap-2 px-2">
                <span className={MONO}>{file.path}</span>
                <span className="ml-auto shrink-0 font-mono text-xs text-success-muted-foreground">
                  {`+${String(file.added)}`}
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}
      {onOpenTrace !== undefined && (
        <div className="flex">
          <Button variant="secondary" size="sm" onClick={onOpenTrace}>
            <IconFileText size="sm" aria-hidden="true" />
            Open the trace
          </Button>
        </div>
      )}
    </div>
  )
}

/** What the agent works from. */
export function ContextPart({ facts }: { facts: SessionFacts }): ReactNode {
  if (facts.context === null) return <p className={NOTE}>Hemera has nothing to say about it yet.</p>
  return <ContextView {...facts.context} />
}

/** What a variant hands every place: the Session's surroundings and what a press asks for. */
export interface PlaceActions {
  onRun: (line: string) => void
  onStop: (id: string) => void
  onOpenUrl: (url: string) => void
  onResume: () => void
  onOpenTrace?: (() => void) | undefined
  onOpenFolder: () => void
}

/** One place's content. */
export function PlacePart({
  place,
  facts,
  actions,
  wide = false,
}: {
  place: Place
  facts: SessionFacts
  actions: PlaceActions
  /** Whether the place has a window's width rather than a panel's. */
  wide?: boolean | undefined
}): ReactNode {
  switch (place) {
    case 'workspace':
      return <WorkspacePart facts={facts} onResume={actions.onResume} />
    case 'commands':
      return (
        <CommandsPart
          facts={facts}
          wide={wide}
          onRun={actions.onRun}
          onStop={actions.onStop}
          onOpenUrl={actions.onOpenUrl}
        />
      )
    case 'services':
      return <ServicesPart facts={facts} onStop={actions.onStop} onOpenUrl={actions.onOpenUrl} />
    case 'activity':
      return <ActivityPart facts={facts} onOpenTrace={actions.onOpenTrace} />
    case 'context':
      return <ContextPart facts={facts} />
  }
}

/** A message of the reader's, as the thread draws one. */
function yours(id: string, at: string, body: string): ScrollerEntry {
  return {
    id,
    mark: body,
    content: (
      <MessageGroup
        author="user"
        name="You"
        at={at}
        atLabel={`Today at ${at}`}
        state="saved"
        lines={[{ id: `${id}-1`, body }]}
      />
    ),
  }
}

function agents(id: string, text: string): ScrollerEntry {
  return { id, content: <AgentText text={text} /> }
}

/** The conversation of each Session: long enough to scroll, short enough to read. */
export const THREADS: Record<Mission, ScrollerEntry[]> = {
  free: [
    yours('ask', '10:31', 'The billing page is blank since the last merge. Can you look?'),
    agents(
      'answer',
      'I started `dev` to see it: the page loads, then the invoice list throws on a `null` currency. The last merge made `currency` optional in `invoice.ts` and the list still reads it as a string.\n\nI am running `test` on the api to see what else reads it.',
    ),
    yours('more', '10:36', 'Keep the fix in the list, the type change was on purpose.'),
    agents(
      'again',
      'Understood: the list falls back to the account currency, and the type stays optional. The tests are running.',
    ),
  ],
  define: [
    yours(
      'ask',
      '10:31',
      'Accountants need a month of invoices as one CSV they can import into their ledger, from the billing page.',
    ),
    agents(
      'answer',
      'Shape is finished: the problem, the outcome, the scope and two stories are in the Spec. I am writing the plan: the export can reuse the invoice query of `export.service.ts` and stream its rows.\n\nI started `test` on the api to see what the query already covers.',
    ),
  ],
  build: [
    agents(
      'start',
      'Build of ATL-7 started from revision 2, in the Workspace `csv-export`. T1 is done: the query of a month of invoices, with its test.',
    ),
    agents(
      'task',
      'T2: streaming the rows as CSV. `dev` is up on http://localhost:5173/ so the export button can be tried from the billing page, and `test` is running on the api.',
    ),
  ],
}

const HEAD_COLUMN = 'mx-auto flex w-full max-w-3xl flex-col gap-3 px-6 pt-6 pb-4'

const FOOT_COLUMN = 'mx-auto flex w-full max-w-3xl flex-col gap-2 px-6 pb-4'

/**
 * The conversation of a Session: its head, its thread and its composer, on the one column the page
 * lays them on. `under` is what a variant lays between the head and the thread.
 */
export function Conversation({
  mission,
  workspace,
  onOpenDetails,
  under,
}: {
  mission: Mission
  workspace: string | undefined
  /** The ⓘ of the head, where a variant keeps it. */
  onOpenDetails?: (() => void) | undefined
  under?: ReactNode
}): ReactNode {
  const [value, setValue] = useState('')
  const [files, setFiles] = useState<string[]>([])
  return (
    <div className="flex min-h-0 min-w-0 flex-1 flex-col" data-conversation>
      <div className={HEAD_COLUMN}>
        <SessionHeader
          title={TITLES[mission]}
          onRename={() => undefined}
          onStartEditing={() => undefined}
          onArchive={() => undefined}
          onOpenDetails={onOpenDetails}
        />
        {under}
      </div>
      <MessageScroller
        className="flex-1"
        label="The thread of this Session"
        entries={THREADS[mission]}
      />
      <div className={FOOT_COLUMN}>
        <Composer
          value={value}
          onValueChange={setValue}
          files={files}
          onFilesChange={setFiles}
          onSearchFiles={() => Promise.resolve([])}
          variant="inline"
          action="Send"
          placeholder="Say something to Claude…"
          onSend={() => Promise.resolve(null)}
          workspaces={[{ name: 'main' }, ...(workspace === undefined ? [] : [{ name: workspace }])]}
          workspace={workspace ?? 'main'}
          workspaceFixed
        />
      </div>
    </div>
  )
}

const TASK = 'flex min-w-0 items-center gap-2 rounded-md px-2 py-1.5'

const TASK_TONES: Record<BuildTask['state'], StatusTone> = {
  done: 'success',
  running: 'running',
  pending: 'pending',
  yours: 'pending',
}

const TASK_WORDS: Record<BuildTask['state'], string> = {
  done: 'Done',
  running: 'Running',
  pending: 'Pending',
  yours: 'Yours',
}

/**
 * The build of a `build` Session, as a stand-in: its tasks and where each stands, drawn after the
 * build panel of lot 5 (`feature/22-build`), which this branch does not have. What matters here is
 * that it is there, where it stands and how much room it takes, not what it shows.
 */
export function BuildTasks(): ReactNode {
  return (
    <div className="flex flex-col gap-2 p-3">
      <div className={LINE}>
        <span className="flex text-muted-foreground">
          <IconHammer size="sm" aria-hidden="true" />
        </span>
        <span className={NAME}>ATL-7 · CSV invoice export</span>
        <Badge tone="build">Building</Badge>
      </div>
      <ul className={ROWS} aria-label="Tasks of the build">
        {BUILD_TASKS.map((task) => (
          <li key={task.key} className={TASK}>
            <StatusDot status={TASK_TONES[task.state]} label={TASK_WORDS[task.state]} />
            <span className="shrink-0 font-mono text-xs text-muted-foreground">{task.key}</span>
            <span className="min-w-0 flex-1 truncate text-sm">{task.label}</span>
            {task.state === 'yours' && <Badge tone="warning">Yours</Badge>}
          </li>
        ))}
      </ul>
    </div>
  )
}

/**
 * The build panel of a `build` Session, standing where it does in lot 5: beside the chat, a share
 * of the row, the whole height of it.
 */
export function BuildPanel(): ReactNode {
  return (
    <section
      aria-label="Build ATL-7"
      className="flex h-full min-h-0 w-spec-panel shrink-0 flex-col py-3 pr-3"
    >
      <div className="flex min-h-0 flex-1 flex-col rounded-xl border border-border bg-surface-rim p-1.5">
        <header className="flex items-center gap-2 px-2.5 pt-1 pb-2.5">
          <IconHammer size="sm" aria-hidden="true" />
          <h2 className="text-sm font-medium">Build</h2>
        </header>
        <div className="flex min-h-0 flex-1 flex-col overflow-auto rounded-lg border border-border bg-surface-body shadow-sm">
          <BuildTasks />
        </div>
      </div>
    </section>
  )
}
