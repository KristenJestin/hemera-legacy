import { AnimatePresence, motion } from 'motion/react'
import { type FunctionComponent, type ReactNode, useState } from 'react'

import { Disclosure } from '../activity/disclosure.tsx'
import { Button } from '../components/button/button.tsx'
import { Card } from '../components/card/card.tsx'
import { Checkbox } from '../components/checkbox/checkbox.tsx'
import { Select, type SelectItem } from '../components/select/select.tsx'
import { StatusDot, type StatusTone } from '../components/status-dot/status-dot.tsx'
import {
  IconBrandHemeraAuto,
  IconBrandTypeSafe,
  IconBrowser,
  IconBug,
  IconCircleDashed,
  IconClock,
  IconDots,
  IconFileText,
  IconFolder,
  type IconProps,
  IconListCheck,
  IconPuzzle,
  IconServer,
  IconTool,
  IconUser,
} from '../icons.ts'
import { collapse, expand, fold, useTransition } from '../motion.ts'

/**
 * What Hemera does behind the scenes (#294), for whoever builds it: one card per panel, so a
 * panel added later is one more card and nothing else. Hemera Auto's latest decisions across every
 * Session come first; the diagnostics, moved here from the Profile, follow.
 *
 * States are icons and dots, never word badges: who decided is an icon, the verdict is a dot, and
 * the word of each is its name and its hover. A row that comes or goes with a filter or a new
 * decision grows and folds its own height, pushing the rows under it.
 */
const NOTE = 'text-sm text-muted-foreground'

const LIST = 'flex flex-col'

const FILTERS = 'flex flex-wrap gap-2'

/** The line of a row: when, where, what, then who and how it ended. */
const LINE = 'flex w-full min-w-0 flex-col gap-0.5'

const HEAD = 'flex w-full min-w-0 items-center gap-2'

const TIME = 'shrink-0 font-mono text-xs text-muted-foreground'

/** The Session a decision was taken in: a press of its own, over the row's fold. */
const SESSION =
  'pointer-events-auto shrink-0 truncate rounded-sm text-sm text-primary-muted-foreground outline-none focus-ring hover:text-primary'

const TOOL = 'shrink-0 font-mono text-xs text-foreground'

const CALL = 'min-w-0 flex-1 truncate font-mono text-xs text-muted-foreground'

const MARKS = 'ml-auto flex shrink-0 items-center gap-2'

/** What the judge said of the call and how long it took, under the line. */
const DETAIL = 'flex flex-wrap gap-x-3 font-mono text-xs text-muted-foreground'

/** The whole decision record, kept as it was stored. */
const RECORD =
  'scroll-quiet max-h-60 overflow-auto rounded-md border border-border bg-muted px-2 py-1.5 font-mono text-xs whitespace-pre-wrap text-foreground'

/** Who settled a call: the rules, the judge, the human, its expiry, or nobody. */
export type DecisionBy = 'rules' | 'judge' | 'human' | 'expired' | 'nobody'

/** How a call ended. */
export type DecisionVerdict = 'allowed' | 'refused' | 'cancelled'

/** One of Hemera Auto's decisions, as a row shows it. */
export interface DecisionLine {
  id: string
  /** When it was taken, already written. */
  at: string
  sessionId: string
  /** The Session's title. */
  session: string
  tool: string
  /** A short form of the call: its line or its path, masked. */
  call: string
  by: DecisionBy
  /** What the classifier had settled before a human was asked, when one was. */
  judged?: DecisionBy | undefined
  verdict: DecisionVerdict
  scores?: { risk: number; approval: number; userRequested: number } | undefined
  model?: string | undefined
  /** How long Jev took to answer, when it was asked. */
  roundTripMs?: number | undefined
  /** The whole decision record, already written. */
  record: string
}

const BY: Record<DecisionBy, { icon: FunctionComponent<IconProps>; word: string; label: string }> =
  {
    rules: { icon: IconListCheck, word: 'Rules', label: 'Decided by the rules' },
    judge: { icon: IconBrandTypeSafe, word: 'Judge', label: 'Decided by the judge' },
    human: { icon: IconUser, word: 'Human', label: 'Decided by you' },
    expired: { icon: IconClock, word: 'Expired', label: 'Expired before it ran' },
    nobody: { icon: IconCircleDashed, word: 'Nobody', label: 'Settled by nobody' },
  }

const VERDICT: Record<DecisionVerdict, { tone: StatusTone; word: string }> = {
  allowed: { tone: 'success', word: 'Allowed' },
  refused: { tone: 'failure', word: 'Refused' },
  cancelled: { tone: 'cancelled', word: 'Cancelled' },
}

/** What a row's icon is named: who decided, and why a human was asked when the judge was not. */
function byLabelOf(line: DecisionLine): string {
  if (line.by === 'human' && line.judged === 'nobody')
    return 'Decided by you, the judge did not answer'
  return BY[line.by].label
}

/** Every value of a filter, "any" first. */
type Any = 'any'

const VERDICTS: SelectItem<DecisionVerdict | Any>[] = [
  { value: 'any', label: 'Any verdict' },
  ...(['allowed', 'refused', 'cancelled'] as const).map((verdict) => ({
    value: verdict,
    label: VERDICT[verdict].word,
    icon: <StatusDot status={VERDICT[verdict].tone} />,
  })),
]

const DECIDERS: SelectItem<DecisionBy | Any>[] = [
  { value: 'any', label: 'Anyone' },
  ...(['rules', 'judge', 'human', 'expired', 'nobody'] as const).map((by) => {
    const Icon = BY[by].icon
    return { value: by, label: BY[by].word, icon: <Icon size="sm" aria-hidden="true" /> }
  }),
]

export interface DecisionsPanelProps {
  /** The latest decisions, newest first; null while the engine has not answered. */
  decisions: readonly DecisionLine[] | null
  /** Opens the Session a decision was taken in. */
  onOpenSession: (sessionId: string) => void
}

/** Hemera Auto's latest decisions across every Session, filtered by verdict, decider and Session. */
export function DecisionsPanel({ decisions, onOpenSession }: DecisionsPanelProps): ReactNode {
  const [verdict, setVerdict] = useState<DecisionVerdict | Any>('any')
  const [by, setBy] = useState<DecisionBy | Any>('any')
  const [session, setSession] = useState<string>('any')
  const folding = useTransition(fold)

  const sessions: SelectItem<string>[] = [
    { value: 'any', label: 'Every Session' },
    ...[...new Map((decisions ?? []).map((line) => [line.sessionId, line.session]))].map(
      ([id, title]) => ({ value: id, label: title }),
    ),
  ]
  const shown = (decisions ?? []).filter(
    (line) =>
      (verdict === 'any' || line.verdict === verdict) &&
      (by === 'any' || line.by === by) &&
      (session === 'any' || line.sessionId === session),
  )

  return (
    <Card title="Hemera Auto decisions">
      {decisions === null ? (
        <p className={NOTE}>Hemera Auto decisions cannot be read yet.</p>
      ) : decisions.length === 0 ? (
        <p className={NOTE}>No decision yet.</p>
      ) : (
        <>
          <div className={FILTERS}>
            <Select label="Verdict" items={VERDICTS} value={verdict} onValueChange={setVerdict} />
            <Select label="Decided by" items={DECIDERS} value={by} onValueChange={setBy} />
            <Select label="Session" items={sessions} value={session} onValueChange={setSession} />
          </div>
          {shown.length === 0 && <p className={NOTE}>No decision matches.</p>}
          <ul aria-label="Hemera Auto decisions" className={LIST}>
            <AnimatePresence initial={false}>
              {shown.map((line) => (
                <motion.li
                  key={line.id}
                  className="overflow-hidden"
                  initial={collapse}
                  animate={expand}
                  exit={collapse}
                  transition={folding}
                >
                  <DecisionRow line={line} onOpenSession={onOpenSession} />
                </motion.li>
              ))}
            </AnimatePresence>
          </ul>
        </>
      )}
    </Card>
  )
}

/** One decision: its line, folded on the whole record. */
function DecisionRow({
  line,
  onOpenSession,
}: {
  line: DecisionLine
  onOpenSession: (sessionId: string) => void
}): ReactNode {
  const Decider = BY[line.by].icon
  const deciderLabel = byLabelOf(line)
  const verdict = VERDICT[line.verdict]
  const took = line.roundTripMs === undefined ? null : `${line.roundTripMs} ms`
  return (
    <Disclosure
      holdsPress
      summary={
        <span className={LINE}>
          <span className="sr-only">Details of the decision: </span>
          <span className={HEAD}>
            <span className={TIME}>{line.at}</span>
            <button type="button" className={SESSION} onClick={() => onOpenSession(line.sessionId)}>
              {line.session}
            </button>
            <span className={TOOL}>{line.tool}</span>
            <span className={CALL}>{line.call}</span>
            <span className={MARKS}>
              <span
                role="img"
                aria-label={deciderLabel}
                title={deciderLabel}
                className="inline-flex text-muted-foreground"
              >
                <Decider size="sm" aria-hidden="true" />
              </span>
              <StatusDot status={verdict.tone} label={verdict.word} title={verdict.word} />
            </span>
          </span>
          {(line.scores !== undefined || line.model !== undefined || took !== null) && (
            <span className={DETAIL}>
              {line.scores !== undefined && (
                <span
                  aria-label={`risk ${line.scores.risk}, approval ${line.scores.approval}, user-requested ${line.scores.userRequested}`}
                  title="risk · approval · user-requested"
                >
                  {line.scores.risk} · {line.scores.approval} · {line.scores.userRequested}
                </span>
              )}
              {line.model !== undefined ? (
                <span>{took === null ? line.model : `${line.model} · ${took}`}</span>
              ) : (
                took !== null && <span>{took}</span>
              )}
            </span>
          )}
        </span>
      }
    >
      <pre aria-label="Decision record" className={RECORD}>
        {line.record}
      </pre>
    </Disclosure>
  )
}

/** What an app tester finding is about (#300). */
export type FindingKind =
  | 'hemera_bug'
  | 'missing_capability'
  | 'tool_error'
  | 'auto_decision'
  | 'mcp'
  | 'interface'
  | 'other'

/** How much a finding gets in the way. */
export type FindingSeverity = 'blocks' | 'hurts' | 'cosmetic'

/** One app tester finding, as a row shows it: its file's front matter and its body. */
export interface FindingLine {
  /** Its file in the tester folder, which is what a row is keyed by. */
  file: string
  number: number
  title: string
  kind: FindingKind
  /** Where: the tool, the screen or the feature. */
  place: string
  severity: FindingSeverity
  occurrences: number
  /** When it was last seen, already written. */
  lastSeen: string
  /** The body of its file, as the folder holds it. */
  body: string
}

const KIND: Record<FindingKind, { icon: FunctionComponent<IconProps>; word: string }> = {
  hemera_bug: { icon: IconBug, word: 'Hemera bug' },
  missing_capability: { icon: IconPuzzle, word: 'Missing capability' },
  tool_error: { icon: IconTool, word: 'Tool error' },
  auto_decision: { icon: IconBrandHemeraAuto, word: 'Hemera Auto decision' },
  mcp: { icon: IconServer, word: 'MCP' },
  interface: { icon: IconBrowser, word: 'Interface' },
  other: { icon: IconDots, word: 'Other' },
}

const SEVERITY: Record<FindingSeverity, { tone: StatusTone; word: string }> = {
  blocks: { tone: 'failure', word: 'Blocks' },
  hurts: { tone: 'pending', word: 'Hurts' },
  cosmetic: { tone: 'cancelled', word: 'Cosmetic' },
}

const KINDS: SelectItem<FindingKind | Any>[] = [
  { value: 'any', label: 'Any kind' },
  ...(
    [
      'hemera_bug',
      'missing_capability',
      'tool_error',
      'auto_decision',
      'mcp',
      'interface',
      'other',
    ] as const
  ).map((kind) => {
    const Icon = KIND[kind].icon
    return { value: kind, label: KIND[kind].word, icon: <Icon size="sm" aria-hidden="true" /> }
  }),
]

const SEVERITIES: SelectItem<FindingSeverity | Any>[] = [
  { value: 'any', label: 'Any severity' },
  ...(['blocks', 'hurts', 'cosmetic'] as const).map((severity) => ({
    value: severity,
    label: SEVERITY[severity].word,
    icon: <StatusDot status={SEVERITY[severity].tone} />,
  })),
]

/** How many findings and occurrences a list holds, in words. */
function countOf(findings: readonly FindingLine[]): string {
  const seen = findings.reduce((sum, one) => sum + one.occurrences, 0)
  return `${findings.length} ${findings.length === 1 ? 'finding' : 'findings'} · ${seen} ${seen === 1 ? 'occurrence' : 'occurrences'}`
}

/** The count beside the filters, pushed to the end of their line. */
const COUNT = 'ml-auto self-center text-sm text-muted-foreground'

const NUMBER = 'shrink-0 font-mono text-xs text-muted-foreground'

const TITLE = 'min-w-0 flex-1 truncate text-sm text-foreground'

export interface TesterPanelProps {
  /** Whether every Session's agent also tests Hemera (#300). */
  on: boolean
  onChange: (on: boolean) => void
  /** The findings, the latest seen first; null while the folder was not read. */
  findings: readonly FindingLine[] | null
  /** Opens the tester folder, one file a finding. */
  onOpenFolder: () => void
  /** Opens the index of the findings. */
  onOpenIndex: () => void
}

/**
 * The app tester (#300): the switch, the findings the agents reported, filtered by kind and
 * severity, and the folder they are files of. Nothing is sent anywhere: the folder is the list.
 */
export function TesterPanel({
  on,
  onChange,
  findings,
  onOpenFolder,
  onOpenIndex,
}: TesterPanelProps): ReactNode {
  const [kind, setKind] = useState<FindingKind | Any>('any')
  const [severity, setSeverity] = useState<FindingSeverity | Any>('any')
  const folding = useTransition(fold)
  const shown = (findings ?? []).filter(
    (one) =>
      (kind === 'any' || one.kind === kind) && (severity === 'any' || one.severity === severity),
  )
  return (
    <Card title="App tester">
      <Checkbox checked={on} onCheckedChange={onChange} label="App tester mode" />
      {findings === null ? (
        <p className={NOTE}>Findings cannot be read yet.</p>
      ) : findings.length === 0 ? (
        <p className={NOTE}>No finding yet.</p>
      ) : (
        <>
          <div className={FILTERS}>
            <Select label="Kind" items={KINDS} value={kind} onValueChange={setKind} />
            <Select
              label="Severity"
              items={SEVERITIES}
              value={severity}
              onValueChange={setSeverity}
            />
            <span className={COUNT}>{countOf(shown)}</span>
          </div>
          {shown.length === 0 && <p className={NOTE}>No finding matches.</p>}
          <ul aria-label="Findings" className={LIST}>
            <AnimatePresence initial={false}>
              {shown.map((line) => (
                <motion.li
                  key={line.file}
                  className="overflow-hidden"
                  initial={collapse}
                  animate={expand}
                  exit={collapse}
                  transition={folding}
                >
                  <FindingRow line={line} />
                </motion.li>
              ))}
            </AnimatePresence>
          </ul>
        </>
      )}
      <div className="flex flex-wrap gap-2">
        <Button variant="secondary" size="sm" onClick={onOpenFolder}>
          <IconFolder size="sm" />
          Open the folder
        </Button>
        <Button
          variant="secondary"
          size="sm"
          onClick={onOpenIndex}
          disabled={findings === null || findings.length === 0}
        >
          <IconFileText size="sm" />
          Open the index
        </Button>
      </div>
    </Card>
  )
}

/** One finding: its line, folded on its file. */
function FindingRow({ line }: { line: FindingLine }): ReactNode {
  const Kind = KIND[line.kind].icon
  const severity = SEVERITY[line.severity]
  const seen = `Seen ${line.occurrences} ${line.occurrences === 1 ? 'time' : 'times'}`
  return (
    <Disclosure
      summary={
        <span className={HEAD}>
          <span className="sr-only">Details of the finding: </span>
          <span className={NUMBER}>#{line.number}</span>
          <span
            role="img"
            aria-label={KIND[line.kind].word}
            title={KIND[line.kind].word}
            className="inline-flex shrink-0 text-muted-foreground"
          >
            <Kind size="sm" aria-hidden="true" />
          </span>
          <span className={TITLE}>{line.title}</span>
          <span className={TOOL}>{line.place}</span>
          <span className={MARKS}>
            <span aria-label={seen} title={seen} className={TIME}>
              ×{line.occurrences}
            </span>
            <span className={TIME}>{line.lastSeen}</span>
            <StatusDot status={severity.tone} label={severity.word} title={severity.word} />
          </span>
        </span>
      }
    >
      <pre aria-label="Finding file" className={RECORD}>
        {line.body}
      </pre>
    </Disclosure>
  )
}

export interface DiagnosticsPanelProps {
  /** Whether the ACP trace of each Session is written (issue #131). */
  acpTrace?: boolean | undefined
  /** Turns it on or off; absent, the switch is not drawn. */
  onAcpTraceChange?: ((on: boolean) => void) | undefined
  onOpenDiagnostic: () => void
}

/**
 * What Hemera writes down to find out why an agent went quiet (issue #131): the ACP trace of each
 * Session, off unless turned on, beside diagnostic.log.
 */
export function DiagnosticsPanel({
  acpTrace = false,
  onAcpTraceChange,
  onOpenDiagnostic,
}: DiagnosticsPanelProps): ReactNode {
  return (
    <Card title="Diagnostics">
      {onAcpTraceChange !== undefined && (
        <Checkbox
          checked={acpTrace}
          onCheckedChange={onAcpTraceChange}
          label="Write an ACP trace of each Session"
          description="Every message between Hemera and the agent, with its time, beside diagnostic.log. Prompts, files and secrets are written as their size only. Takes effect from the next message."
        />
      )}
      <div className="flex flex-wrap gap-2">
        <Button variant="secondary" size="sm" onClick={onOpenDiagnostic}>
          <IconFileText size="sm" />
          Open diagnostic.log
        </Button>
      </div>
    </Card>
  )
}

export interface DeveloperSectionProps extends DecisionsPanelProps, DiagnosticsPanelProps {
  /** The app tester (#300); absent, its card is not drawn. */
  tester?: TesterPanelProps | undefined
}

/** The Developer section: one card per panel, in the order they are read. */
export function DeveloperSection({
  decisions,
  onOpenSession,
  acpTrace,
  onAcpTraceChange,
  onOpenDiagnostic,
  tester,
}: DeveloperSectionProps): ReactNode {
  return (
    <div className="flex flex-col gap-4">
      <DecisionsPanel decisions={decisions} onOpenSession={onOpenSession} />
      {tester !== undefined && <TesterPanel {...tester} />}
      <DiagnosticsPanel
        acpTrace={acpTrace}
        onAcpTraceChange={onAcpTraceChange}
        onOpenDiagnostic={onOpenDiagnostic}
      />
    </div>
  )
}
