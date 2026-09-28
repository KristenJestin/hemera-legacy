import { type ReactNode, useEffect, useRef, useState } from 'react'

import { HemeraToolCall } from '../../activity/hemera-tool-call.tsx'
import { TooltipProvider } from '../../components/tooltip/tooltip.tsx'
import { AgentText } from '../../message/agent-text.tsx'
import { MessageDaySeparator, MessageGroup } from '../../message/message.tsx'
import { MessageScroller, type ScrollerEntry } from '../../message/scroller/scroller.tsx'
import type { CommandLine } from '../../project/model.ts'
import type { GoingOnRun, GoingOnShell } from '../../session/going-on.ts'
import { GoingOnDetails } from '../../session/going-on-details.tsx'
import { TurnLine } from '../../session/turn-line.tsx'
import { type CatalogueActions, useCatalogueEditor } from './catalogue.tsx'
import { type DetailsTab, QuietDetails } from './details.tsx'
import {
  ASKED,
  type Asked,
  CATALOGUE,
  DEV,
  entryOf,
  type Held,
  held,
  LINT,
  ONE_OFF,
  pending,
  PROPOSALS,
  type ProposalAnswer,
  type Proposed,
  SHELLS,
  SLEEP,
  TEST_RUNNING,
  V2_CHECK,
} from './fixtures.ts'
import { SessionComposer, SessionHead } from './head.tsx'
import {
  Arrive,
  AskedThreadEntry,
  Dock,
  KeepButton,
  LINGER_MS,
  type LineActions,
  placeOf,
  QuietLine,
  RULES,
  RunMenu,
  ThreadRun,
  type Variant,
} from './parts.tsx'
import { DeckDock, DeckThreadEntry } from './variant-deck.tsx'
import { PillDock, PillThreadEntry } from './variant-pill.tsx'
import { TrayDock, TrayThreadEntry } from './variant-tray.tsx'

/**
 * A Session of the exploration, held together by the state the renderer would hold: its runs, the
 * lines of the agent's shell, what waits for the reader and the Project's catalogue. `live` plays a
 * short script as it opens — a one-off starts, ends well and leaves the line by the variant's rule; the agent proposes six
 * commands, then asks to run a one-off — which is what the motion is judged on.
 */

export type Scene = 'running' | 'failed' | 'proposals' | 'permission' | 'answered' | 'live'

export interface QuietSessionProps {
  variant: Variant
  scene: Scene
  onOpenUrl: (url: string) => void
  /** Opens the tray's review or the pill's list as the Session is drawn. */
  reviewing?: boolean | undefined
  /** The tab the ⓘ details are open on as the Session is drawn, or none. */
  details?: DetailsTab | null | undefined
  /** The chip whose glance is open as the Session is drawn. */
  glance?: string | null | undefined
  /** Whether Run's menu is open as the Session is drawn. */
  runOpen?: boolean | undefined
}

/** When each step of the `live` script happens, from the Session opening. */
export const SCRIPT = {
  start: 800,
  pass: 3200,
  propose: 3200 + LINGER_MS + 1400,
  ask: 3200 + LINGER_MS + 3400,
} as const

/** How long a run started from the Session takes to end, in the stories. */
const ONE_RUN_MS = 2600

function runsOf(scene: Scene): Held[] {
  if (scene === 'running') return held([SLEEP, LINT, DEV, TEST_RUNNING])
  if (scene === 'failed') return held([LINT, DEV, ONE_OFF, V2_CHECK])
  if (scene === 'permission') return held([LINT, DEV])
  if (scene === 'live') return held([SLEEP, LINT, DEV])
  return []
}

function shellsOf(scene: Scene): GoingOnShell[] {
  return scene === 'proposals' || scene === 'answered' ? [] : [...SHELLS]
}

function proposalsOf(scene: Scene): Proposed[] | null {
  if (scene === 'proposals') return pending()
  if (scene === 'answered') {
    return PROPOSALS.map((proposal) => ({
      proposal,
      answer: proposal.id === 'proposed-migrate' ? 'declined' : 'accepted',
    }))
  }
  return null
}

const ASK: Record<Scene, string> = {
  running: 'Run the API tests while I check the export in the browser.',
  failed: 'Check v2 before I merge it into the export.',
  proposals: 'Set this Project up: find the commands it needs.',
  permission: 'Run only the CSV stream tests, verbose.',
  answered: 'Set this Project up: find the commands it needs.',
  live: 'Run the API tests while I check the export in the browser.',
}

function user(id: string, text: string, at: string): ScrollerEntry {
  return {
    id,
    mark: text,
    content: (
      <MessageGroup
        author="user"
        name="You"
        at={at}
        atLabel={`Today at ${at}`}
        state="saved"
        lines={[{ id: `${id}-line`, body: text }]}
      />
    ),
  }
}

function said(id: string, text: string): ScrollerEntry {
  return { id, content: <AgentText text={text} /> }
}

/** The tab of the details a variant keeps its catalogue in. */
function catalogueTab(variant: Variant): DetailsTab {
  return RULES[variant].catalogue === 'tabs' ? 'catalogue' : 'commands'
}

export function QuietSession({
  variant,
  scene,
  onOpenUrl,
  reviewing = false,
  details = null,
  glance = null,
  runOpen = false,
}: QuietSessionProps): ReactNode {
  const rules = RULES[variant]
  const [runs, setRuns] = useState<Held[]>(() => runsOf(scene))
  const [shells] = useState<GoingOnShell[]>(() => shellsOf(scene))
  const [proposals, setProposals] = useState<Proposed[] | null>(() => proposalsOf(scene))
  const [asked, setAsked] = useState<Asked | null>(() => (scene === 'permission' ? ASKED : null))
  const [catalogue, setCatalogue] = useState<readonly CommandLine[]>(CATALOGUE)
  // What arrived while the page was looked at, which is what grows into place.
  const [fresh, setFresh] = useState<ReadonlySet<string>>(() => new Set())
  const [detail, setDetail] = useState<GoingOnRun | null>(null)
  const [detailsOpen, setDetailsOpen] = useState(details !== null)
  const [tab, setTab] = useState<DetailsTab>(details ?? 'activity')
  const timers = useRef<number[]>([])
  const count = useRef(0)

  function later(ms: number, step: () => void): void {
    timers.current.push(window.setTimeout(step, ms))
  }

  useEffect(() => () => timers.current.forEach((timer) => window.clearTimeout(timer)), [])

  function arrived(...ids: string[]): void {
    setFresh((before) => new Set([...before, ...ids]))
  }

  function patch(id: string, change: (one: Held) => Held): void {
    setRuns((before) => before.map((one) => (one.run.id === id ? change(one) : one)))
  }

  /** A run ends while it is looked at: it is not settled until it has lingered. */
  function end(id: string, run: Partial<GoingOnRun>): void {
    patch(id, (one) => ({ ...one, run: { ...one.run, ...run }, settled: false }))
    later(LINGER_MS, () => patch(id, (one) => ({ ...one, settled: true })))
  }

  function start(run: GoingOnRun, ms: number, ended: Partial<GoingOnRun>): void {
    setRuns((was) => [...was, { run, seen: false, settled: false, removed: false, before: false }])
    arrived(`thread-${run.id}`)
    later(ms, () => end(run.id, ended))
  }

  function propose(): void {
    setProposals(pending())
    arrived('proposed', 'proposed-said', ...PROPOSALS.map(({ id }) => `proposal-${id}`))
  }

  function ask(): void {
    setAsked(ASKED)
    arrived('asked')
  }

  // The script of `live`, played once as the Session opens.
  const played = useRef(false)
  useEffect(() => {
    if (scene !== 'live' || played.current) return
    played.current = true
    later(SCRIPT.start, () =>
      start(
        { ...ONE_OFF, id: 'run-live', state: 'running', exitCode: undefined, output: '' },
        SCRIPT.pass - SCRIPT.start,
        { state: 'finished', exitCode: 0, output: ONE_OFF.output },
      ),
    )
    later(SCRIPT.propose, propose)
    later(SCRIPT.ask, ask)
  })

  /** Runs a line, from the catalogue or once, as the reader asked it. */
  function launch(line: string, like?: GoingOnRun): void {
    const known = catalogue.find((entry) => entry.command === line)
    count.current += 1
    const id = `run-${String(count.current)}-${line}`
    start(
      {
        ...BASE_RUN,
        id,
        name: known?.name ?? like?.name ?? line,
        command: line,
        type: known?.type ?? like?.type ?? 'script',
        folder: like?.folder ?? BASE_RUN.folder,
        oneOff: known === undefined,
        output: `$ ${line}\n`,
      },
      ONE_RUN_MS,
      { state: 'finished', exitCode: 0, output: `$ ${line}\ndone` },
    )
  }

  function keep(one: GoingOnRun): void {
    setCatalogue((before) => [...before, entryOf(one.command, one.command, one.type)])
    setRuns((before) =>
      before.map((other) =>
        other.run.command === one.command
          ? { ...other, run: { ...other.run, oneOff: false, name: one.command } }
          : other,
      ),
    )
    setDetail(null)
  }

  const actions: LineActions = {
    onStop: (one) => end(one.id, { state: 'stopped' }),
    onRunAgain: (one) => launch(one.command, one),
    onOpenUrl,
    onKeep: keep,
    onSeen: (id) => patch(id, (one) => ({ ...one, seen: true })),
    onRemove: (one) =>
      setRuns((before) =>
        before.map((other) =>
          other.run.id === one.id || (one.oneOff !== true && other.run.name === one.name)
            ? { ...other, removed: true }
            : other,
        ),
      ),
  }

  const catalogueActions: CatalogueActions = {
    onRun: (entry) => launch(entry.command),
    onSave: (entry, was) => {
      setCatalogue((before) =>
        was === null ? [...before, entry] : before.map((one) => (one.id === was.id ? entry : one)),
      )
      return Promise.resolve(null)
    },
    onRemove: (entry) => setCatalogue((before) => before.filter((one) => one.id !== entry.id)),
  }

  const editor = useCatalogueEditor(catalogueActions)

  function answer(id: string, given: Exclude<ProposalAnswer, 'pending'>): void {
    const proposal = PROPOSALS.find((one) => one.id === id)
    if (given === 'accepted' && proposal !== undefined) {
      setCatalogue((before) => [
        ...before.filter((entry) => entry.name !== proposal.name),
        entryOf(proposal.name, proposal.line, proposal.type),
      ])
    }
    setProposals((before) => {
      const next = (before ?? []).map((one) =>
        one.proposal.id === id ? { proposal: one.proposal, answer: given } : one,
      )
      if (next.every((one) => one.answer !== 'pending')) arrived('proposed-answered')
      return next
    })
  }

  function answerAll(given: Exclude<ProposalAnswer, 'pending'>): void {
    for (const { proposal, answer: was } of proposals ?? []) {
      if (was === 'pending') answer(proposal.id, given)
    }
  }

  function decide(given: 'allowed' | 'refused'): void {
    setAsked((before) => (before === null ? null : { ...before, answer: given }))
    if (given === 'allowed') {
      count.current += 1
      start(
        {
          ...BASE_RUN,
          id: `run-${String(count.current)}-asked`,
          name: ASKED.subject,
          command: ASKED.subject,
          folder: ASKED.folder,
          startedBy: 'agent',
        },
        ONE_RUN_MS,
        { state: 'finished', exitCode: 0, output: ONE_OFF.output },
      )
    }
  }

  function openDetails(on: DetailsTab): void {
    setTab(on)
    setDetailsOpen(true)
  }

  const gone = runs
    .filter((one) => placeOf(rules, one) === 'gone' && one.run.oneOff === true)
    .map((one) => one.run)
    .toReversed()

  const entries = threadOf({
    variant,
    scene,
    runs,
    proposals,
    asked,
    fresh,
    keepIn: rules.keep === 'entry' ? keep : null,
    onSeen: actions.onSeen,
  })

  const waitingProposals = proposals?.some(({ answer: given }) => given === 'pending') ?? false
  const waiting = waitingProposals || asked?.answer === 'pending'
  const running = runs.filter((one) => one.run.state === 'running').map((one) => one.run.name)
  const turning = scene === 'running' || scene === 'permission' || scene === 'live'

  return (
    <TooltipProvider>
      <div className="flex h-screen min-h-0 flex-col bg-background text-foreground">
        <div className="mx-auto flex w-full max-w-3xl flex-col px-6 pt-4 pb-2">
          <SessionHead
            onOpenDetails={() => openDetails('activity')}
            line={
              <QuietLine
                rules={rules}
                runs={runs}
                actions={actions}
                defaultOpen={glance}
                end={
                  <RunMenu
                    catalogue={catalogue}
                    running={running}
                    earlier={rules.oneOff === 'fade' ? gone : []}
                    keepHere={rules.keep === 'menu'}
                    catalogueHere={rules.catalogue === 'grouped'}
                    onRun={(line) => launch(line)}
                    onKeep={keep}
                    onDetails={setDetail}
                    onOpenCatalogue={() => openDetails(catalogueTab(variant))}
                    onEdit={editor.edit}
                    defaultOpen={runOpen}
                  />
                }
              />
            }
          />
        </div>
        <MessageScroller className="flex-1" label="The thread of this Session" entries={entries} />
        <div className="mx-auto flex w-full max-w-3xl flex-col gap-2 px-6 pb-4">
          <Dock shown={waiting}>
            {variant === 'tray' && (
              <TrayDock
                proposals={proposals}
                asked={asked}
                onAnswer={answer}
                onAcceptAll={() => answerAll('accepted')}
                onDecide={decide}
                defaultReviewing={reviewing}
              />
            )}
            {variant === 'pill' && (
              <PillDock
                proposals={proposals}
                asked={asked}
                onAnswer={answer}
                onAcceptAll={() => answerAll('accepted')}
                onDeclineAll={() => answerAll('declined')}
                onDecide={decide}
                defaultOpen={reviewing}
              />
            )}
            {variant === 'deck' && (
              <DeckDock
                proposals={proposals}
                asked={asked}
                onAnswer={answer}
                onAcceptAll={() => answerAll('accepted')}
                onDecide={decide}
              />
            )}
          </Dock>
          <TurnLine
            activity={null}
            usage={{ used: 12400, size: 200000, cost: { amount: 0.42, currency: 'EUR' } }}
          />
          <SessionComposer running={turning} />
        </div>
        {detail !== null && (
          <GoingOnDetails
            item={detail}
            onClose={() => setDetail(null)}
            onStop={actions.onStop}
            onOpenUrl={onOpenUrl}
            onAddToCatalogue={keep}
          />
        )}
        <QuietDetails
          rules={rules}
          open={detailsOpen}
          onOpenChange={setDetailsOpen}
          tab={tab}
          onTabChange={setTab}
          runs={runs}
          shells={shells}
          catalogue={catalogue}
          running={running}
          history={{ onRunAgain: actions.onRunAgain, onStop: actions.onStop }}
          actions={catalogueActions}
          onEdit={editor.edit}
        />
        {editor.dialog}
      </div>
    </TooltipProvider>
  )
}

const BASE_RUN: GoingOnRun = {
  ...ONE_OFF,
  state: 'running',
  exitCode: undefined,
  folder: '.',
  startedBy: 'user',
  at: '10:50',
}

/** The thread of a scene, as the renderer would draw it from its entries. */
function threadOf({
  variant,
  scene,
  runs,
  proposals,
  asked,
  fresh,
  keepIn,
  onSeen,
}: {
  variant: Variant
  scene: Scene
  runs: readonly Held[]
  proposals: readonly Proposed[] | null
  asked: Asked | null
  fresh: ReadonlySet<string>
  keepIn: ((run: GoingOnRun) => void) | null
  onSeen: (id: string) => void
}): ScrollerEntry[] {
  const entries: ScrollerEntry[] = [
    { id: 'day', day: true as const, content: <MessageDaySeparator day="Today" /> },
    user('ask', ASK[scene], '10:10'),
  ]
  if (scene === 'proposals' || scene === 'answered') {
    entries.push(
      said('reading', 'I will read how the repository builds, tests and serves itself.'),
      {
        id: 'read',
        content: (
          <HemeraToolCall
            tool="fs_read"
            label="Read file"
            mark="read-file"
            subject={{ text: 'package.json' }}
            status="completed"
            summary="64 lines"
          />
        ),
      },
      {
        id: 'list',
        content: (
          <HemeraToolCall
            tool="fs_list"
            label="List folder"
            mark="list-folder"
            subject={{ text: 'sources' }}
            status="completed"
            summary="3 folders"
          />
        ),
      },
    )
  }
  for (const one of runs) {
    const { run } = one
    const id = `thread-${run.id}`
    entries.push({
      id,
      content: (
        <Arrive fresh={fresh.has(id)}>
          <ThreadRun
            held={one}
            onSeen={() => onSeen(run.id)}
            keep={
              keepIn !== null && run.oneOff === true && run.state !== 'running' ? (
                <KeepButton run={run} onKeep={() => keepIn(run)} />
              ) : undefined
            }
          />
        </Arrive>
      ),
    })
  }
  if (scene === 'failed') {
    entries.push(
      said(
        'failed-said',
        'The v2 check failed on one type error: `csv.stream.ts:42` writes a currency that can be `null`.',
      ),
    )
  }
  if (scene === 'running' || scene === 'live') {
    entries.push(said('running-said', 'The tests run; I will read them once they are over.'))
  }
  if (proposals !== null) {
    entries.push(...proposalEntries(variant, proposals, fresh))
    entries.push({
      id: 'proposed-said',
      content: (
        <Arrive fresh={fresh.has('proposed-said')}>
          <AgentText text="I proposed 6 commands for the catalogue: the server, the tests, lint, typecheck, the build and the migrations." />
        </Arrive>
      ),
    })
  }
  if (asked !== null) {
    entries.push({
      id: 'asked',
      content: (
        <Arrive fresh={fresh.has('asked')}>
          <AskedThreadEntry asked={asked} />
        </Arrive>
      ),
    })
  }
  return entries
}

/** Where each variant puts the proposals in the thread. */
function proposalEntries(
  variant: Variant,
  proposals: readonly Proposed[],
  fresh: ReadonlySet<string>,
): ScrollerEntry[] {
  if (variant === 'tray') {
    return [
      {
        id: 'proposed',
        content: (
          <Arrive fresh={fresh.has('proposed')}>
            <TrayThreadEntry proposals={proposals} />
          </Arrive>
        ),
      },
    ]
  }
  if (variant === 'pill') {
    return proposals.map((proposed) => {
      const id = `proposal-${proposed.proposal.id}`
      return {
        id,
        content: (
          <Arrive fresh={fresh.has(id)}>
            <PillThreadEntry proposed={proposed} />
          </Arrive>
        ),
      }
    })
  }
  if (proposals.some(({ answer }) => answer === 'pending')) return []
  return [
    {
      id: 'proposed-answered',
      content: (
        <Arrive fresh={fresh.has('proposed-answered')}>
          <DeckThreadEntry proposals={proposals} />
        </Arrive>
      ),
    },
  ]
}
