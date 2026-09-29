import { Fragment, useEffect, useRef, useState, useSyncExternalStore } from 'react'
import type { ReactNode } from 'react'

import type {
  Command,
  CommandRun,
  ConfigOption,
  ContextView as Provided,
  PlanRepository,
  Session,
  SessionEntry,
  SpecRevision,
  SpecSnapshot,
  WorkspacePlan,
} from '@hemera/ipc'
import {
  ActionGroup,
  AgentModelMenu,
  Button,
  Composer,
  ContextView,
  MessageDaySeparator,
  MessageGroup,
  MessageScroller,
  MessageText,
  SessionEmpty,
  CreateWorkspaceDialog,
  GoingOnLine,
  RunCommand,
  SessionDetails,
  SessionHeader,
  SessionNotices,
  SpecPanel,
  TurnLine,
  STUCK_AFTER_MS,
  type MessageLine,
  type MessageState,
  type NoticeGroup,
  type NoticeItem,
  type RepositoryLine,
  SessionCatalogue,
  type SessionCatalogueProps,
  SessionHistory,
  type OfferedAgent,
  type PermissionOption,
  type RunRepository,
  type ScrollerEntry,
  type UsageMeterProps,
} from '@hemera/ui'
import { IconBookmarkPlus, IconFlag, IconMessageQuestion, IconShield } from '@hemera/ui/icons'

import {
  hasEnded,
  hasTrace,
  heardSince,
  openTrace,
  specWritingOf,
  turnRowOf,
  type Activity,
  type AgentSessionState,
} from '../agent-store.ts'
import { type Grouping, groupActions, groupingOf } from '../action-groups.ts'
import { effortDefaultOf, effortStage, modeStage, modelStage } from '../agent-options.ts'
import {
  type AgentContext,
  drawEntry,
  drawNotice,
  planOf,
  touchedOf,
  usageOf,
} from '../agent-blocks.tsx'
import { agentShellCallsOf, commandProposalOf, foldedCallsOf } from '../agent-tool-payloads.ts'
import { callLinksOf } from '../call-links.ts'
import { whenOf } from '../journal-lines.ts'
import { type CommandWrite, commandLineOf, commandWriteOf } from '../project-lines.ts'
import { asksToRunALine, NOTICE_KINDS, type NoticeKind, waitingAs } from '../notices.ts'
import {
  contextListsOf,
  detailsTabsOf,
  goingOnOf,
  lineOf,
  openingTabOf,
  overBefore,
} from '../session-details.ts'
import {
  linesSnapshot,
  markSeen,
  marksOf,
  removeFromLine,
  subscribeToLines,
} from '../line-store.ts'
import { openSessions, type OfferedWorkspace } from '../sessions-store.ts'
import { selectEntry } from '../shell-store.ts'
import { type DefinedSpec, questionMarkOf } from '../spec-entries.ts'
import {
  answerQuestion,
  askForBuild,
  createSpec,
  declineSpecProposal,
  joinSpec,
  markReady,
  resumeBuildWorkspace,
  retryBuild,
  rework,
  selectRevision,
  specSnapshot,
  startBuild,
  subscribeToSpec,
  takeOver,
} from '../spec-store.ts'
import {
  launchOf,
  provisionalViewOf,
  readerOf,
  specViewOf,
  specWorkspacesOf,
} from '../spec-views.ts'
import {
  closePlanReading,
  createForSpec,
  isPlanReadingOpen,
  openPlanReading,
  pickWorkspacesFolder,
  planForSpec,
  readPlanRepositories,
} from '../workspaces-store.ts'
import { planLinesOf, worktreesOf } from '../workspace-details.ts'

/**
 * The page of a Session: what it is called, what was said in it, and the way to say more
 * (design D4b-02, D4b-08, D5-12, D5-14, D5-17).
 *
 * It is an adapter and nothing else: the engine holds the Session, its thread and its agent, and
 * every surface here comes from `@hemera/ui`, where it was drawn and accepted on fixtures before
 * a database existed. Nothing is decided here — not what a title may be, not which block draws an
 * entry, not whether a message landed.
 *
 * The thread is what the engine read back when the Session was opened, and what has arrived since:
 * an entry the agent is still writing comes again with more of it rather than as a second entry,
 * so the two are one list, read in the order it was written. A Session with no agent is one the
 * user writes into and nothing answers — which is a Session, not an empty one, and the foot is
 * where the difference is drawn.
 */

/** A run of messages written on the same day, which is how the thread is separated. */
interface Run {
  day: string
  lines: MessageLine[]
  /** When its first line was written, which is the time the head shows under the hand. */
  at: number
  /** Its first line as plain text, which is what the scroller remembers the run by. */
  mark: string
  /** Whether the agent said something in the middle of it, which starts a new run after it. */
  broken: boolean
}

/**
 * The thread as one list: what was read back, with what has arrived since in its place.
 *
 * An entry written again — the same identifier, with more of it — takes the place of the one the
 * read-back held, and an entry nobody had seen yet goes at the end, where it was written.
 */
function together(read: readonly SessionEntry[], live: readonly SessionEntry[]): SessionEntry[] {
  const since = new Map(live.map((entry) => [entry.id, entry]))
  const known = new Set(read.map((entry) => entry.id))
  return [
    ...read.map((entry) => since.get(entry.id) ?? entry),
    ...live.filter((entry) => !known.has(entry.id)),
  ]
}

/** How often a running turn's silence is measured again: the line counts it by fives. */
const QUIET_TICK_MS = 5_000

/**
 * The clock a running turn's silence is read on, moving every few seconds while it is asked to
 * and standing still otherwise: a page that rendered every second for a line that changes every
 * five would be a thread redrawn for nothing.
 */
function useTicking(active: boolean): number {
  const [now, setNow] = useState(() => Date.now())
  useEffect(() => {
    if (!active) return undefined
    setNow(Date.now())
    const timer = setInterval(() => setNow(Date.now()), QUIET_TICK_MS)
    return () => clearInterval(timer)
  }, [active])
  return now
}

/** Whether a Session has a trace to open, asked each time `asking` turns true. */
function useTrace(sessionId: string, asking: boolean): boolean {
  const [traced, setTraced] = useState(false)
  useEffect(() => {
    if (!asking) return undefined
    let current = true
    void hasTrace(sessionId).then((held) => {
      if (current) setTraced(held)
    })
    return () => {
      current = false
    }
  }, [sessionId, asking])
  return traced
}

/**
 * The row above the box (`TurnLine`): what the turn is doing and what the Session has spent. The
 * running turn is told how long it has heard nothing (issue #131): past half a minute its line
 * says so, and past two it offers Stop and, when the settings had it written, the trace of what
 * the agent and Hemera said. Its own component, so the clock it ticks on redraws the row and not
 * the thread.
 */
function TurnRow({
  activity,
  usage,
  since,
  sessionId,
  onStop,
  notched,
}: {
  activity: Activity | null
  usage: UsageMeterProps | null
  since: number | null
  sessionId: string
  onStop: () => void
  /** Whether the Session's notices stand in the middle of the row. */
  notched: boolean
}): ReactNode {
  const listening = activity !== null && since !== null && !hasEnded(activity)
  const now = useTicking(listening)
  const quietMs = listening ? Math.max(0, now - since) : undefined
  const stuck = quietMs !== undefined && quietMs >= STUCK_AFTER_MS
  const traced = useTrace(sessionId, stuck)
  return (
    <TurnLine
      activity={
        activity === null
          ? null
          : {
              ...activity,
              quietMs,
              onStop,
              onOpenTrace: traced ? () => void openTrace(sessionId) : undefined,
            }
      }
      usage={usage}
      notched={notched}
    />
  )
}

/** When a run was written, `HH:MM`, in the one reading the whole window uses. */
function timeOf(at: number): string {
  return new Date(at).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })
}

/** The whole date behind that time, for the reader who asks a time three days old which day it is. */
function dateOf(at: number): string {
  return new Date(at).toLocaleString('en-GB')
}

/** The Spec a Session defines as its first revision named it, once it is read (D7-07). */
function definedOf(
  snapshot: SpecSnapshot | null,
  revisions: readonly SpecRevision[],
): DefinedSpec | null {
  const first = revisions.find((one) => one.number === 1)
  if (snapshot === null || first === undefined) return null
  return { key: snapshot.spec.key, title: first.title, type: first.type }
}

/** What the last act of a thread was refused with, when the engine refused it. */
export interface SessionPageProps {
  session: Session
  /** The thread, oldest first, as the engine read it back. */
  entries: SessionEntry[]
  /** Whether the thread has come back, so an empty thread is drawn only once it is known. */
  loaded: boolean
  /** What "today" means for this render, so the separators are read once. */
  now: number
  /** Whether the title is being typed into, which the page that called this one decides. */
  editing: boolean
  /** What the last act was refused with, in the engine's own words, or null. */
  refusal: string | null
  /** What the engine has pushed for this Session since it was opened. */
  agent: AgentSessionState
  /** The Sessions of the Project, which name the Session that writes a Spec this one reads. */
  sessions: readonly Session[]
  /** Whether a turn is running in a Session: a reader does not take the right from under one. */
  running: (sessionId: string) => boolean
  /**
   * The agent this Session runs, as the menu lists it: one, and never another.
   *
   * A Session keeps the agent it was made with (D5-06), so the first stage of the menu is a
   * list of one that is already chosen — it is there because the model and the effort below it
   * belong to that agent, and reading which agent answers is half of reading them.
   */
  agents: OfferedAgent[]
  /** What the agent of this Session offers, as its own handshake answered. */
  options: readonly ConfigOption[]
  onWrite: (body: string) => Promise<string | null>
  /**
   * Says something to the agent, which writes the user's own message itself.
   *
   * A Session with an agent does not go through `onWrite`: the engine writes the message as part
   * of the prompt, and writing it here as well would put the same sentence in the thread twice.
   * Nothing is awaited — a turn lasts as long as it lasts, and what the composer's own state
   * tracks is the write rather than the answer (D5-12).
   */
  onSay: (text: string) => void
  /** Cancels the running turn, when there is one. */
  onStop: () => void
  /** Answers the question the block of `toolCallId` was drawn for. */
  onDecide: (toolCallId: string, option: PermissionOption) => void
  /** Sets one of the agent's own options for the turn to come. */
  onChooseOption: (optionId: string, value: string) => void
  onRename: (title: string) => void
  onStartEditing: () => void
  onCancelEditing: () => void
  onArchive: () => void
  onSearchFiles: (query: string) => Promise<string[]>
  onPickFiles: () => Promise<string[]>
  /** Opens one of the files the turn touched, when the page around this one can open one. */
  onOpenFile?: ((path: string) => void) | undefined
  /** The runs of this Session, as the engine last pushed them (D6-12). */
  commandRuns: readonly CommandRun[]
  /** Opens the address a run published, in the browser. */
  onOpenUrl: (url: string) => void
  /** Stops a run and everything it started. */
  onStopRun: (runId: string) => void
  /** Runs a run of the Session again, from its chip or the history (issue #237). */
  onRunAgain: (runId: string) => void
  /** Hands the agent again what waits for it, after a delivery it did not take (issue #211). */
  onHandOver: () => void
  /** The Workspace root, which is what a run's folder is said relative to; null until known. */
  root: string | null
  /** The Project's repositories, which a place is said as rather than as a folder (#239). */
  repositories: readonly RunRepository[]
  /** Runs a line from the Run of the line: a command of the catalogue by name, or a one-off. */
  onRunCommand: (line: string) => void
  /** The Project's catalogue, which the Run of the line offers. */
  catalogue: readonly Command[]
  /** What this Session was provided, may consult, and keeps to its agent; null until read. */
  context: Provided | null
  /**
   * The Workspaces of the Project, the Session's own among them (D8-08): what its Workspace is
   * named by. The Session's composer offers no choice of it since issue #241.
   */
  workspaces: readonly OfferedWorkspace[]
  /** Accepts a command the agent proposed; answers the engine's refusal, or null (D8-11). */
  onAcceptProposal: (proposalId: string) => Promise<string | null>
  /** Declines it; answers the engine's refusal, or null. */
  onDeclineProposal: (proposalId: string) => Promise<string | null>
  /** Keeps a one-off run in the catalogue; answers the engine's refusal, or null (D8-11). */
  onAddToCatalogue: (run: CommandRun) => Promise<string | null>
  /**
   * The catalogue as the Session's details edit it (issue #237): the Project's repositories a
   * command may run from, whether Portless is here, the Project's name, and the writes.
   */
  catalogueEditing: CatalogueEditing
}

/** What the Catalogue tab of the details needs to edit the Project's catalogue (issue #237). */
export interface CatalogueEditing {
  repositories: readonly RepositoryLine[]
  portlessInstalled: boolean
  projectName: string
  /** Writes a command, new or of the same name; answers the engine's refusal, or null. */
  onSave: (command: CommandWrite, existing: boolean) => Promise<string | null>
  onRemove: (name: string) => void
  onListFolder: NonNullable<SessionCatalogueProps['onListFolder']>
}

export function SessionPage({
  session,
  entries,
  loaded,
  now,
  editing,
  refusal,
  agent,
  sessions,
  running,
  agents,
  options,
  onWrite,
  onSay,
  onStop,
  onDecide,
  onChooseOption,
  onRename,
  onStartEditing,
  onCancelEditing,
  onArchive,
  onSearchFiles,
  onPickFiles,
  onOpenFile,
  commandRuns,
  catalogue,
  onOpenUrl,
  onStopRun,
  onRunAgain,
  onHandOver,
  root,
  repositories,
  onRunCommand,
  context,
  workspaces,
  onAcceptProposal,
  onDeclineProposal,
  onAddToCatalogue,
  catalogueEditing,
}: SessionPageProps): ReactNode {
  const [value, setValue] = useState('')
  const [files, setFiles] = useState<string[]>([])
  const [writes, setWrites] = useState<MessageState>('saved')
  const [failure, setFailure] = useState<string | undefined>(undefined)
  /** What was last handed to the engine, so `Retry` has something to send again. */
  const [attempted, setAttempted] = useState<string | null>(null)
  /** Whether the reader has the Session details open: only the head's button opens them. */
  const [detailsOpen, setDetailsOpen] = useState(false)
  // Whether the details have a trace to offer, asked each time they open (#131).
  const traced = useTrace(session.id, detailsOpen)
  /**
   * What the reader's last decision in the thread was refused with — a proposal or a one-off
   * run whose name the catalogue already holds (D8-11) — or null once one went through. Said
   * where the page's other refusals are, and before them: it answers the last press.
   */
  const [refused, setRefused] = useState<string | null>(null)
  const deciding = (decision: Promise<string | null>): void => {
    void decision.then(setRefused)
  }
  const stored = useSyncExternalStore(subscribeToSpec, specSnapshot, specSnapshot)
  // What the reader did to the line of this Session, and when the Session was opened: a one-off
  // over by then is not news (issue #237).
  const lines = useSyncExternalStore(subscribeToLines, linesSnapshot, linesSnapshot)
  const opened = useRef(Date.now())
  // Whether this Session was free when the page opened it: its Spec panel, once there, is one the
  // proposal just made, and it arrives rather than standing there (issue #130). The page is
  // keyed by the Session, so this is read once per Session opened.
  const openedFree = useRef(session.mission === 'free')
  const defined = stored.snapshot?.spec.id === session.specId ? stored.snapshot : null
  // New Spec's provisional Spec, while this Session has no Spec of its own (issue #198).
  const provisional = stored.provisional.get(session.id) ?? null
  const thread = together(entries, agent.entries)
  const spec =
    defined === null
      ? null
      : specViewOf({
          snapshot: defined,
          revisions: stored.revisions,
          journal: stored.journal,
          readyRefused: stored.readyRefused,
          // The part a `spec_write` of the running turn is writing, as the thread says it: the
          // section says so at once, and goes back to what it held if the write fails.
          writing: agent.running ? specWritingOf(thread) : null,
        })
  /** The plan the Workspace dialog is open on, and what it is to leave behind. */
  const [workspacePlan, setWorkspacePlan] = useState<WorkspacePlan | null>(null)
  /** What Git has answered of that plan so far, in the order the answers arrived (#110). */
  const [workspaceReads, setWorkspaceReads] = useState<readonly PlanRepository[]>([])
  const [intent, setIntent] = useState<'start' | 'only' | null>(null)
  /**
   * Prepares a Workspace for this Spec (D8-12): the plan is asked for first — its branches are
   * named after the Spec (D8-04) — and the dialog opens on it at once, because it takes its rows
   * as it opens; each location of the plan is read on its own afterwards, so a repository that
   * is slow, refused or gone holds back its own row alone (#110). Both ways in go through it:
   * the Workspace is named and its branches chosen by the hand either way, and `start` is the
   * only thing that differs afterwards.
   */
  const prepareWorkspace = (start: boolean): void => {
    const held = defined
    if (held === null) return
    // The opening is taken here, before the plan is asked: this dialog is the one these answers
    // belong to, and a dialog closed or opened again on another Spec takes the next one (#110).
    const reading = openPlanReading()
    void planForSpec(session.projectId, held.spec.key, held.spec.slug).then((planned) => {
      if (planned === null || !isPlanReadingOpen(reading)) return
      setWorkspacePlan(planned)
      setWorkspaceReads([])
      setIntent(start ? 'start' : 'only')
      void readPlanRepositories(
        session.projectId,
        held.spec.key,
        held.spec.slug,
        planned.repositories,
        reading,
        (read) => {
          setWorkspaceReads((current) => [...current, read])
        },
      )
    })
  }

  /**
   * Opens the build Session the launch started. The list is read again first: the engine made
   * that Session on its own, and the page it opens is a page this window knows. What the window
   * shows is the shell's own entry, which is why going there is `selectEntry` — the thread
   * follows, read by the window when its entry becomes the one on screen.
   */
  const openBuild = (): void => {
    const launched = stored.launches?.launch
    if (launched === null || launched === undefined || launched.sessionId === null) return
    const id = launched.sessionId
    void openSessions(session.projectId).then(() => selectEntry(id))
  }

  const write = async (body: string): Promise<string | null> => {
    setAttempted(body)
    setFailure(undefined)
    setWrites('saving')
    if (session.provider !== null) {
      onSay(body)
      setWrites('saved')
      return null
    }
    const said = await onWrite(body)
    setWrites(said === null ? 'saved' : 'failed')
    setFailure(said ?? undefined)
    return said
  }

  // The Workspace the Session works in, on the pill: it can be changed until the agent has
  // started, and is fixed from then on, which the pill says in words (D8-08). A run in another
  // one — a Project-scoped service, in `main` — names it on its block.
  const workspace = workspaces.find((one) => one.id === session.workspaceId)

  /**
   * The user's messages cut into the days they were written on.
   *
   * A day is named once, over the first message of that day: two messages written in the same
   * sitting are one run, and a day the user came back to later is another.
   */
  const runs: Run[] = []
  for (const entry of thread) {
    if (entry.role !== 'user' || entry.kind !== 'message') {
      // Anything the agent reported ends the run of what the user wrote.
      const open = runs.at(-1)
      if (open !== undefined) open.broken = true
      continue
    }
    const day = whenOf(entry.createdAt, now)
    const line: MessageLine = { id: entry.id, body: <MessageText body={entry.body} /> }
    const last = runs.at(-1)
    if (last === undefined || last.day !== day || last.broken) {
      runs.push({ day, lines: [line], at: entry.createdAt, mark: entry.body, broken: false })
      continue
    }
    last.lines.push(line)
  }

  /**
   * The thread in order, which is the user's runs and the agent's blocks in one list.
   *
   * Walking the entries a second time rather than the runs alone: a run belongs where its first
   * line was written, and what the agent reported stands between two of them.
   */
  const byLine = new Map(runs.map((run, index) => [run.lines[0]?.id ?? '', index]))
  const byEntry = new Map<string, ScrollerEntry>()
  // What each block is to a run of tool calls, which the thread folds into one group (#149).
  const groupings = new Map<string, Grouping>()
  // A call to one of Hemera's tools is drawn once, as Hemera's block, where the agent reported
  // it: the agent's own report of it stays in the thread and is not drawn a second time (D6-06).
  const folded = foldedCallsOf(thread)
  // What became of each of Hemera's calls — its permission, its run, its proposal — drawn with the
  // call, and not a second and a third time on rows of their own (review of #250).
  const links = callLinksOf(thread, folded)
  // The agent's reports of its calls, by the identifier it gave each: a question it asks about one
  // is headed by that call's line.
  const reported = new Map<string, SessionEntry>()
  for (const entry of thread) {
    const id = entry.correlationId ?? ''
    if (entry.kind === 'tool_call' && id.startsWith('call:'))
      reported.set(id.slice('call:'.length), entry)
  }
  // The ids of the current revision's questions, null until the Spec is read.
  const asked =
    stored.current?.spec.id === session.specId
      ? new Set(stored.current.questions.map((one) => one.id))
      : null
  /**
   * What waits for a human, by kind (issue #237): the Session's notices, on the composer's edge,
   * whatever the thread's scroll. Each entry of it is drawn there with what answers it, and the
   * thread keeps its quiet record where it was asked.
   */
  const waitingByKind = new Map<NoticeKind, NoticeItem[]>(NOTICE_KINDS.map((kind) => [kind, []]))
  /** The proposals that wait, which `Add all` answers in one press. */
  const proposalsWaiting: string[] = []
  /** Whether every permission that waits is a line to run once, which its group's head says. */
  let linesOnly = true
  for (let at = 0; at < thread.length; at += 1) {
    const entry = thread[at]
    if (entry === undefined || folded.hidden.has(entry.id)) continue
    const next = thread[at + 1]
    const drawn = folded.inPlaceOf.get(entry.id) ?? entry
    const drawing: AgentContext = {
      now,
      nextAt: next === undefined ? null : next.createdAt,
      onDecide,
      runs: commandRuns,
      workspace: workspace?.name,
      root,
      repositories,
      onOpenUrl,
      onHandOver,
      onSeenRun: (runId) => markSeen(session.id, runId),
      callLink: (drawnId) => links.byCall.get(drawnId),
      reportedCall: (toolCallId) => reported.get(toolCallId),
      onAcceptProposal: (proposalId) => deciding(onAcceptProposal(proposalId)),
      onDeclineProposal: (proposalId) => deciding(onDeclineProposal(proposalId)),
      spec: {
        thread,
        specId: session.specId,
        defined: definedOf(defined, stored.revisions),
        asked,
        onAnswer: (questionId, answer) => void answerQuestion(questionId, answer),
        onCreate: (title, type) => void createSpec(session.id, type, title),
        onJoin: (proposalId) => void joinSpec(session.id, proposalId),
        onDecline: (proposalId) => deciding(declineSpecProposal(session.id, proposalId)),
      },
    }
    const kind = waitingAs(entry, thread, session.specId, asked)
    if (kind !== null) {
      const notice = drawNotice(drawn, drawing)
      if (notice !== null) waitingByKind.get(kind)?.push({ id: entry.id, content: notice })
      const proposal = kind === 'proposal' ? commandProposalOf(entry) : null
      if (proposal !== null) proposalsWaiting.push(proposal.proposalId)
      if (kind === 'permission' && !asksToRunALine(entry)) linesOnly = false
    }
    // Carried by its call: drawn with it, never on its own row.
    if (links.absorbed.has(entry.id)) continue
    const block = drawEntry(drawn, drawing)
    // No mark: the rail is navigated by what the reader wrote, and a tick for every block of a
    // turn was forty ticks for one question (trial of 22 September 2026).
    if (block === null) continue
    // An answer to a question is the reader's, and marked on the rail as their messages are (issue
    // #149), by what they typed or the choice they made; the card that holds it carries the mark.
    const mark = entry.kind === 'spec_question' ? questionMarkOf(entry, thread, asked) : undefined
    byEntry.set(entry.id, { id: entry.id, mark, content: block })
    groupings.set(entry.id, groupingOf(drawn))
  }

  /** Accepts every proposal that waits, one after the other, until the engine refuses one. */
  const acceptAll = (): void => {
    const ids = [...proposalsWaiting]
    void (async () => {
      for (const id of ids) {
        // One at a time, in the order they were proposed: each is a write of the catalogue.
        // oxlint-disable-next-line no-await-in-loop -- the catalogue is written one command at a time
        const said = await onAcceptProposal(id)
        if (said !== null) {
          setRefused(said)
          return
        }
      }
      setRefused(null)
    })()
  }
  const itemsOf = (kind: NoticeKind): NoticeItem[] => waitingByKind.get(kind) ?? []
  const notices: NoticeGroup[] = [
    {
      kind: 'permission',
      label: 'Permissions',
      title: linesOnly ? 'Run once' : 'Allow once',
      icon: <IconShield size="md" aria-hidden="true" />,
      urgent: true,
      tone: 'warning',
      items: itemsOf('permission'),
    },
    {
      kind: 'question',
      label: 'Questions',
      title: 'Questions',
      tone: 'info',
      icon: <IconMessageQuestion size="md" aria-hidden="true" />,
      items: itemsOf('question'),
    },
    {
      kind: 'spec',
      label: 'Spec proposed',
      title: 'Start a Spec',
      tone: 'success',
      icon: <IconFlag size="md" aria-hidden="true" />,
      items: itemsOf('spec'),
    },
    {
      kind: 'proposal',
      label: 'Proposed commands',
      title: 'Add to the catalogue',
      tone: 'primary',
      icon: <IconBookmarkPlus size="md" aria-hidden="true" />,
      items: itemsOf('proposal'),
      actions:
        proposalsWaiting.length > 1 ? (
          <Button variant="link" size="sm" onClick={acceptAll}>
            Add all
          </Button>
        ) : undefined,
    },
  ]
  /** Whether anything waits for the reader, which the row above the box says as long as it does. */
  const waitsForYou = notices.some((group) => group.items.length > 0)

  const scroller: ScrollerEntry[] = []
  /**
   * The agent's blocks since the last thing the user wrote, waiting to be laid out: every run of
   * two tool calls or more between two things the agent said is one row, folded (issue #149).
   */
  let pending: { item: ScrollerEntry; grouping: Grouping }[] = []
  const lay = (): void => {
    for (const piece of groupActions(pending)) {
      if (piece.kind === 'one') {
        scroller.push(piece.item)
        continue
      }
      scroller.push({
        // Named after its first row, which stays its first row however long the run grows: the
        // group the reader unfolded is the same group when the next call arrives in it.
        id: `actions-${piece.items[0]?.id ?? ''}`,
        content: (
          <ActionGroup count={piece.count} status={piece.status} latest={piece.latest}>
            {piece.items.map((one) => (
              <Fragment key={one.id}>{one.content}</Fragment>
            ))}
          </ActionGroup>
        ),
      })
    }
    pending = []
  }
  /** The day last named over the thread, so a run that follows the agent's words repeats nothing. */
  let named: string | null = null
  for (const entry of thread) {
    const run = byLine.get(entry.id)
    if (run !== undefined) {
      lay()
      const held = runs[run]
      const last = run === runs.length - 1
      const day = held?.day ?? ''
      if (day !== named) {
        named = day
        scroller.push({
          id: `day-${day}`,
          day: true as const,
          content: <MessageDaySeparator day={day} />,
        })
      }
      scroller.push({
        id: `run-${String(run)}`,
        mark: held?.mark ?? '',
        content: (
          <MessageGroup
            author="user"
            name="You"
            lines={held?.lines ?? []}
            // The time of the run, which the head shows under the hand and hides again with it:
            // a thread read downwards is dated by its separators, and a reader who wonders about
            // one run wonders about that one (D4b-08).
            at={held === undefined ? undefined : timeOf(held.at)}
            atLabel={held === undefined ? undefined : dateOf(held.at)}
            state={last ? writes : undefined}
            error={last ? failure : undefined}
            onRetry={
              attempted === null
                ? undefined
                : () => {
                    void write(attempted)
                  }
            }
          />
        ),
      })
      continue
    }
    // The agent said something: what the user writes next opens a run of its own, and the day
    // is named again over it rather than over a message that has moved down the thread.
    const held = runs.at(-1)
    if (held !== undefined) held.broken = true
    const block = byEntry.get(entry.id)
    if (block !== undefined)
      pending.push({ item: block, grouping: groupings.get(entry.id) ?? null })
  }
  lay()

  /**
   * What the turn is doing, for as long as it runs (design D17-04, trial of 22 September 2026).
   *
   * It is drawn on the row the meter is on and no longer as the last entry of the thread: a
   * block at the end of the scroller grew the thread every time the turn changed its mind, and
   * it stood right-aligned, on the reader's own side of the column. The row below the thread is
   * the one place a running turn is said — on the left of it, where the agent's content is.
   *
   * Once the turn is over the row stays, quiet, and says how it ended — "Done in 12 s",
   * "Stopped", "Failed" — for as long as that end is the last thing that happened: the next
   * message sets a turn running again, and the row goes back to saying what that one is doing
   * (`turnRowOf`).
   */
  const activity = turnRowOf(thread, agent.running, agent.latest, waitsForYou)

  // What the agent is on is the agent's own answer, read back after every change: this page
  // draws what it was told and never a value it remembers (D5-13).
  const model = modelStage(options)
  const effort = effortStage(options)
  const mode = modeStage(options)

  // What the Session details hold: the plan the agent last published and the files the turn has
  // touched. Both are states rather than events, and they are read here because the meter above
  // the box and the details are two readings of the same turn.
  const plan = planOf(thread)
  // The commands the agent ran in its own shell, which the line and the history list (#219, #237).
  const shells = agentShellCallsOf(thread)
  // Everything the Session ran, in the order it began: the line's and the history's (issue #237).
  const goingOn = goingOnOf(commandRuns, shells, root, workspace?.name, repositories)
  const touched = touchedOf(thread)
  const usage = usageOf(thread)
  // Which tabs have something to show, which is what the details open on.
  const tabs = detailsTabsOf(plan.length, touched.length, context)

  /**
   * The panel beside the chat, chosen by the Session's mission here and nowhere else. A `define`
   * Session has its Spec. A `free` Session has no panel and nothing that offers one: a Spec begins
   * with the agent's proposal in the thread (D7-07). `build` plugs in here, with the panel of its
   * tasks, workers and evidence. The Spec panel is its own slot of the row: folded to a small frame
   * at the window's edge, and swapped for the open panel, which pushes the chat (issue #164).
   */
  function missionPanel(): ReactNode {
    // New Spec's Spec before it exists (issue #198): the same panel, on a provisional Spec, until
    // the real one is read — it then takes its place in the panel already there, with no jump.
    if (spec === null && provisional !== null) {
      return (
        <SpecPanel
          spec={provisionalViewOf(provisional)}
          arrives={openedFree.current}
          onMarkReady={() => undefined}
          onRework={() => undefined}
          onPickRevision={() => undefined}
          onTakeOver={() => undefined}
        />
      )
    }
    if (session.mission !== 'define' || spec === null || defined === null) return null
    return (
      <SpecPanel
        spec={spec}
        arrives={openedFree.current}
        reader={readerOf(defined, session.id, sessions, running)}
        onMarkReady={() => void markReady(session.id)}
        onRework={(reason) => void rework(session.id, reason)}
        onPickRevision={(revision) => {
          const current = stored.revisions.find((one) => one.id === defined.spec.currentRevisionId)
          void selectRevision(revision === current?.number ? null : revision)
        }}
        onTakeOver={() => void takeOver(session.id)}
        // Where the build of this ready Spec stands, and what is to be pressed next (D8-12,
        // D8-13): the panel's footer holds it (issue #135), and the whole journey it
        // opens — the plan, the Workspace, the launch — belongs here.
        build={{
          launch: launchOf(stored.launches, defined.spec),
          ...specWorkspacesOf(stored.launches),
          onPrepareAndStart: () => prepareWorkspace(true),
          onPrepareOnly: () => prepareWorkspace(false),
          onUseWorkspace: (id) => void askForBuild(id),
          onStart: () => void startBuild(),
          onResume: () => void resumeBuildWorkspace(),
          onRetry: () => void retryBuild(),
          onOpen: openBuild,
        }}
      />
    )
  }

  return (
    /*
      One column (review of #40, defect 2): the header, the thread and the composer share one
      width and one left edge, and nothing stands beside them but the Spec of a `define` Session —
      the Session details are a dialog the reader opens from the head (second review of #18). The
      screen runs under the frame all the same, and the page's own scroll is the thread's. The row
      is the container the unfolded Spec panel's width is a share of. The chat takes what the
      panel leaves it and no more: never wider than that for what it holds, which would push the
      row past the window and make it scroll sideways (issue #181).
    */
    <div className="@container flex h-full min-h-0">
      <div className="flex min-h-0 min-w-0 flex-1 flex-col">
        <div className="mx-auto w-full max-w-3xl px-6 pt-6 pb-4">
          {/*
            One row (issue #241): what goes on in the Session — the runs Hemera holds, the commands
            the agent ran in its own shell, and the Run a command is started from (issue #219) — and
            the head's ⓘ and `…` at its end. No title: the sidebar says it. A Session nothing
            answers has no agent to lend a command to, and offers no Run.
          */}
          <SessionHeader
            title={session.title}
            onRename={onRename}
            editing={editing}
            onStartEditing={onStartEditing}
            onCancelEditing={onCancelEditing}
            onArchive={onArchive}
            // A Session nothing was ever written in is one the user made by mistake far more often
            // than one they are done with, and putting it away is a press they would come to
            // regret: the archive is where threads go.
            archiveDisabled={thread.length === 0}
            // The one way to the Session details: nothing the agent does opens them.
            onOpenDetails={() => setDetailsOpen(true)}
          >
            <GoingOnLine
              items={lineOf(goingOn, {
                ...marksOf(session.id, lines),
                before: overBefore(commandRuns, shells, opened.current),
              })}
              emptyLabel={`Nothing running in ${workspace?.name ?? 'main'}`}
              onStop={(run) => onStopRun(run.id)}
              onRunAgain={(run) => onRunAgain(run.id)}
              onRemove={(item) => removeFromLine(session.id, item.id)}
              onSeen={(item) => markSeen(session.id, item.id)}
              onOpenUrl={onOpenUrl}
              onAddToCatalogue={(shown) => {
                const run = commandRuns.find((one) => one.id === shown.id)
                if (run !== undefined) deciding(onAddToCatalogue(run))
              }}
              end={
                session.provider === null ? undefined : (
                  <RunCommand
                    catalogue={catalogue.map((command) => ({
                      name: command.name,
                      command: command.line,
                      type: command.type,
                      running: commandRuns.some(
                        (run) => run.commandId === command.id && run.state === 'running',
                      ),
                    }))}
                    workspace={workspace?.name ?? 'main'}
                    onRunCommand={(entry) => onRunCommand(entry.name)}
                    onRunOnce={onRunCommand}
                  />
                )
              }
            />
          </SessionHeader>
        </div>
        {/*
          The thread is given the whole width under the head, and lays its own column on the one
          the head and the composer are laid on: a wheel anywhere beside the thread scrolls it
          (trial of 22 September 2026, evening). An empty Session has nothing to scroll, and its
          sentence stands in the column like everything else.
        */}
        {thread.length === 0 ? (
          <div className="mx-auto flex min-h-0 w-full max-w-3xl flex-1 flex-col px-6">
            {loaded ? <SessionEmpty /> : null}
          </div>
        ) : (
          <MessageScroller
            className="flex-1"
            label="The thread of this Session"
            entries={scroller}
          />
        )}
        {/*
          What the turn has spent stands above the box: the box has no foot (issue #241), its send
          is an icon on its own row, and a figure read at a glance is a figure that must not be
          what makes a row wrap. A Session no agent has accounted for yet shows no meter at all —
          a meter drawn at zero is a figure that says nothing (D5-20).

          What the turn is doing shares that row, at its other end: the two are one reading of
          one turn — what it is doing, and what it has cost — and a row drawn for one of them is
          a row the other would have asked for anyway. The row is drawn as soon as either has
          something to say, and the meter keeps its end of it whether or not a turn is running.
        */}
        <div className="mx-auto flex w-full max-w-3xl flex-col gap-2 px-6 pb-4">
          <TurnRow
            activity={activity}
            usage={usage}
            since={agent.running ? heardSince(agent, thread) : null}
            sessionId={session.id}
            onStop={onStop}
            notched={waitsForYou}
          />
          {/*
            What the page's last act was refused with — a rename, an archive, a thread that could
            not be read, a Workspace changed once the agent had started (D8-08) — said here and
            not on the send: those are refusals of the header and of the opening, and a Session
            whose archive was refused is one that can still be written in. It stands in the same
            stack as the meter rather than over the thread, so what it moves is itself and nothing
            above it (D4b-02). A build that could not be asked for is said here too, as a sentence
            (#132), until the build's actions have a place of their own to say it.
          */}
          {(refused ?? refusal ?? stored.refusal ?? stored.buildRefused) !== null && (
            <p role="alert" className="text-sm text-muted-foreground">
              {refused ?? refusal ?? stored.refusal ?? stored.buildRefused}
            </p>
          )}
          <Composer
            value={value}
            onValueChange={setValue}
            files={files}
            onFilesChange={setFiles}
            onSearchFiles={onSearchFiles}
            onPickFiles={onPickFiles}
            variant="inline"
            action={session.provider === null ? 'Write' : 'Send'}
            placeholder={
              session.provider === null
                ? 'Write to this Session…'
                : `Say something to ${session.provider}…`
            }
            onSend={write}
            // Nothing is handed over here: a refusal of this page is not a reason not to write,
            // and a write that is refused answers `write` itself — which is what the composer
            // shows under the box, on the sentence that was not written (D4b-02).
            agentMenu={
              <AgentModelMenu
                agents={agents}
                agent={session.provider}
                // The agent of a Session is the one it was made with and cannot be changed:
                // `fixed` takes the agent stage out of the panel altogether, and the panel opens
                // on the models of the agent that is answering (D17-11).
                fixed
                onAgentChange={() => undefined}
                models={model?.choices ?? []}
                model={model?.current ?? null}
                onModelChange={(chosen) => {
                  if (model !== null) onChooseOption(model.optionId, chosen)
                }}
                efforts={effort?.choices ?? []}
                effort={effort?.current ?? null}
                onEffortChange={(chosen) => {
                  if (effort !== null) onChooseOption(effort.optionId, chosen)
                }}
                // The level the agent recommends, which the scale marks.
                effortDefault={effortDefaultOf(options)}
                // The mode is a row of that same panel since the trial of 22 September 2026: it
                // is one of the four things the agent is set on, and a control of its own beside
                // the menu was a second control asking about one agent.
                modes={mode?.choices ?? []}
                mode={mode?.current ?? null}
                onModeChange={(chosen) => {
                  if (mode !== null) onChooseOption(mode.optionId, chosen)
                }}
              />
            }
            running={agent.running}
            onStop={onStop}
            // Everything that waits for the reader, on the box's edge (issue #237): it rises from
            // behind the box when something starts waiting, and goes back there when nothing does.
            notices={<SessionNotices groups={notices} />}
          />
        </div>
      </div>
      {/*
        The Session details: a centred dialog the reader opens from the head, and nothing else
        opens (second review of #18). A permission, a run or a plan that arrives updates the thread
        and, while the dialog is open, the tab it concerns — never which tab is shown.
      */}
      <SessionDetails
        open={detailsOpen}
        onOpenChange={setDetailsOpen}
        plan={plan}
        files={touched}
        onSelectFile={onOpenFile}
        onOpenTrace={traced ? () => void openTrace(session.id) : undefined}
        // Everything the Session ran, whoever started it, in order (issue #237): the line keeps
        // what matters now, and this keeps the whole trace.
        history={
          <SessionHistory
            items={goingOn}
            onRunAgain={(run) => onRunAgain(run.id)}
            onStop={(run) => onStopRun(run.id)}
          />
        }
        // The Project's catalogue, seen, run and edited without leaving the Session (issue #237).
        catalogue={
          session.provider === null ? undefined : (
            <SessionCatalogue
              commands={catalogue.map(commandLineOf)}
              running={catalogue
                .filter((command) =>
                  commandRuns.some(
                    (run) => run.commandId === command.id && run.state === 'running',
                  ),
                )
                .map((command) => command.name)}
              repositories={catalogueEditing.repositories}
              portlessInstalled={catalogueEditing.portlessInstalled}
              projectName={catalogueEditing.projectName}
              onRun={(command) => onRunCommand(command.name)}
              onAdd={async (line) => await catalogueEditing.onSave(commandWriteOf(line), false)}
              onUpdate={async (line) => await catalogueEditing.onSave(commandWriteOf(line), true)}
              onRemove={(command) => catalogueEditing.onRemove(command.name)}
              onListFolder={catalogueEditing.onListFolder}
            />
          )
        }
        // What the agent works from, its Workspace, instructions and tools (D6-10), once the engine
        // has said it and the Session's Workspace is known: no root is guessed before (D8-08).
        context={
          context === null || root === null ? undefined : (
            <ContextView {...contextListsOf(context, root, workspace?.name)} />
          )
        }
        // The tab it opens on is what the turn has done when it has done anything, and the Context
        // otherwise. It is read when the dialog opens, so an open dialog never changes tab under
        // the reader.
        defaultTab={openingTabOf(tabs)}
      />
      {/*
        The panel of the Session's mission, beside the chat: the working surface the thread gave
        up width for, where the side column stood before the Session details took its plan and its
        files into a dialog. It opens folded to a small frame at the window's edge, and is swapped
        for its panel, which pushes the chat aside, when the hand or the agent asks (issue #164).
      */}
      {missionPanel()}
      {workspacePlan !== null && (
        <CreateWorkspaceDialog
          open={intent !== null}
          onOpenChange={(open) => {
            if (!open) {
              closePlanReading()
              setIntent(null)
            }
          }}
          root={workspacePlan.root}
          temporary={workspacePlan.temporary}
          onBrowse={pickWorkspacesFolder}
          defaultName={workspacePlan.name}
          repositories={planLinesOf(workspacePlan, workspaceReads)}
          gitMissing={!workspacePlan.gitAvailable}
          // No `branchOf`: the branches follow the Spec, which the plan they came with already
          // names (D8-04), and a name typed here does not rename the Spec.
          onCreate={async (draft) => {
            const held = defined
            if (held === null) return null
            const made = await createForSpec(
              session.projectId,
              held.spec.id,
              draft.name,
              worktreesOf(draft),
              draft.root,
            )
            if (made.workspace === null) return made.refusal
            // A build asked for while the preparation runs waits for it, then starts (D8-13):
            // asking now is asking for the build this Workspace was made for.
            if (intent === 'start') await askForBuild(made.workspace.id)
            setIntent(null)
            return null
          }}
        />
      )}
    </div>
  )
}
