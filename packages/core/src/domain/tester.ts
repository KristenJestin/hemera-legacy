/**
 * The app tester mode (#300): while it is on, every Session's agent also tests Hemera, and records
 * what goes wrong on Hemera's side as findings the maintainer reads later.
 *
 * A finding is a Markdown file of its own, a small front matter over a body: the front matter is
 * what a finding is recognised and listed by, the body is what a reader reads, and each report of
 * the same problem appends one occurrence to it. Everything here is text in and text out; the
 * folder, the writes and the masking are the engine's.
 *
 * The agent says the human part — the title, what it tried, what happened, what it expected, the
 * steps, the severity — and Hemera says everything it knows itself: the environment, the Project,
 * the Workspace, the Session, the build, the call and where in the thread it happened.
 */

import type { Mission } from './session.ts'

/** What a finding is about, in the order the index lists them. */
export const FINDING_KINDS = [
  'hemera_bug',
  'missing_capability',
  'tool_error',
  'auto_decision',
  'mcp',
  'interface',
  'other',
] as const

export type FindingKind = (typeof FINDING_KINDS)[number]

/** How much it gets in the way, worst first. */
export const FINDING_SEVERITIES = ['blocks', 'hurts', 'cosmetic'] as const

export type FindingSeverity = (typeof FINDING_SEVERITIES)[number]

/** What a reader calls each kind. */
export const FINDING_KIND_TITLES: Readonly<Record<FindingKind, string>> = {
  hemera_bug: 'Hemera bug',
  missing_capability: 'Missing capability',
  tool_error: 'Tool error',
  auto_decision: 'Hemera Auto decision',
  mcp: 'MCP',
  interface: 'Interface',
  other: 'Other',
}

/** What a reader calls each severity. */
export const FINDING_SEVERITY_TITLES: Readonly<Record<FindingSeverity, string>> = {
  blocks: 'Blocks',
  hurts: 'Hurts',
  cosmetic: 'Cosmetic',
}

/** The two tools of the mode, offered only while it is on. */
export const TESTER_TOOLS = ['hemera_report', 'hemera_reports'] as const

/**
 * The standing brief every Session's agent is given while the mode is on, word for word.
 *
 * A product sentence, like the base: what the agent is asked to do is read here without reading a
 * service. It names the two tools, and says the one thing that keeps the conversation the user's.
 */
export const APP_TESTER_BRIEF = [
  'You also test Hemera, the application you work inside.',
  "When you notice a problem with Hemera itself, not with the user's project, report it with `hemera_report`: a Hemera tool that fails or answers badly, a capability you need and do not have, an MCP problem, a confusing answer, a Hemera Auto decision that looks wrong, a notice that never came, a context that was missing.",
  'Say what you were trying to do, what happened, what you expected and the steps to reproduce it, and give the id of the call it is about: Hemera adds the environment, the Session and the call itself. Never paste the content of a file, only its path.',
  'Read `hemera_reports` before reporting: the same problem reported again adds an occurrence to it.',
  'Do not mention any of this to the user unless it blocks the work.',
].join('\n')

/** The path the brief is recorded under among what a Session was provided. */
export const APP_TESTER_PATH = 'app-tester'

/** What the agent says of a problem: the human part, each text already masked by the engine. */
export interface ReportedFinding {
  readonly title: string
  readonly kind: FindingKind
  /** Where: the tool, the screen or the feature. */
  readonly place: string
  readonly severity: FindingSeverity
  /** What the agent was trying to do. */
  readonly trying: string
  readonly happened: string
  readonly expected: string
  /** The steps to reproduce it, as the agent understands them. */
  readonly steps: string
  /** The files concerned, relative to the Workspace: paths, never their content. */
  readonly files: readonly string[]
  /** The id of the call it is about, as the agent knows it. */
  readonly callId: string | null
  readonly error: string | null
  /** An exit code or an HTTP status. */
  readonly code: string | null
}

/** A call of the thread a finding is about, as Hemera found it there. */
export interface FindingCall {
  readonly tool: string
  readonly id: string
  readonly state: string | null
  /** The line the thread shows for it, masked. */
  readonly summary: string | null
  /** Its arguments as the thread kept them, masked. */
  readonly arguments: string | null
  readonly ms: number | null
  /** Its entry in the thread. */
  readonly seq: number
}

/** What Hemera knows of one occurrence by itself. */
export interface FindingContext {
  /** When, in ISO with its time zone. */
  readonly at: string
  readonly hemera: {
    readonly version: string
    readonly channel: string
    readonly commit: string | null
    readonly os: string
    readonly platform: string
  }
  readonly agent: {
    readonly name: string
    readonly version: string | null
    readonly model: string | null
    readonly effort: string | null
    readonly mode: string | null
  }
  /** Hemera Auto's level as the settings stand. */
  readonly auto: string
  readonly project: { readonly id: string; readonly name: string }
  readonly workspace: { readonly name: string; readonly path: string }
  readonly session: { readonly id: string; readonly title: string; readonly mission: Mission }
  /** The build of a `build` Session: its phase and the tasks under way; null otherwise. */
  readonly build: { readonly phase: string; readonly tasks: readonly string[] } | null
  readonly call: FindingCall | null
  /** The entries of the thread around it, by their `seq`, to find it in the database later. */
  readonly entries: { readonly from: number; readonly to: number } | null
}

/**
 * The front matter of a finding: what it is recognised and listed by, and the environment of its
 * latest occurrence. Every occurrence keeps its own in the body.
 */
export interface FindingHead {
  readonly number: number
  readonly title: string
  readonly kind: FindingKind
  readonly place: string
  /** The worst it was reported with. */
  readonly severity: FindingSeverity
  readonly occurrences: number
  readonly firstSeen: string
  readonly lastSeen: string
  /** The Sessions it was seen in, first seen first. */
  readonly sessions: readonly string[]
  readonly version: string
  readonly channel: string
  readonly commit: string | null
  readonly os: string
  readonly platform: string
  readonly agent: string
  readonly agentVersion: string | null
  readonly model: string | null
  readonly effort: string | null
  readonly mode: string | null
  readonly auto: string
  readonly project: string
  readonly projectId: string
  readonly workspace: string
  readonly workspacePath: string
}

/** A finding: its front matter and its body. */
export interface Finding {
  readonly head: FindingHead
  readonly body: string
}

/** Words a title is not recognised by. */
const STOP_WORDS: ReadonlySet<string> = new Set([
  'the',
  'an',
  'of',
  'to',
  'in',
  'on',
  'for',
  'with',
  'and',
  'or',
  'is',
  'are',
  'it',
  'its',
  'at',
  'by',
  'from',
  'when',
  'as',
  'be',
])

/** The words of a title, as two titles are compared by. */
function wordsOf(title: string): Set<string> {
  return new Set(
    title
      .toLowerCase()
      .split(/[^a-z0-9]+/)
      .filter((word) => word.length > 1 && !STOP_WORDS.has(word))
      // A plural is its singular: "calls" and "call" are one word.
      .map((word) => (word.length > 3 && word.endsWith('s') ? word.slice(0, -1) : word)),
  )
}

/** How alike two titles are, from 0 to 1: the words they share over the words either has. */
export function titleSimilarity(one: string, other: string): number {
  const left = wordsOf(one)
  const right = wordsOf(other)
  const union = new Set([...left, ...right])
  if (union.size === 0) return 0
  const shared = [...left].filter((word) => right.has(word)).length
  return shared / union.size
}

/** How alike two titles must be for two reports of one kind and one place to be one finding. */
export const SIMILAR_TITLE = 0.5

/** A place as it is compared: its case, its quotes and its spacing do not count. */
function placeOf(place: string): string {
  return place.toLowerCase().replace(/[`'"]/g, '').replace(/\s+/g, ' ').trim()
}

/**
 * The finding a report is one more occurrence of, or null for a new one: the same kind, the same
 * place, and the most similar title at `SIMILAR_TITLE` or above, the oldest on a tie.
 */
export function matchingFinding<
  T extends {
    readonly number: number
    readonly kind: FindingKind
    readonly place: string
    readonly title: string
  },
>(existing: readonly T[], reported: Pick<ReportedFinding, 'kind' | 'place' | 'title'>): T | null {
  let best: { finding: T; similarity: number } | null = null
  for (const finding of existing) {
    if (finding.kind !== reported.kind) continue
    if (placeOf(finding.place) !== placeOf(reported.place)) continue
    const similarity = titleSimilarity(finding.title, reported.title)
    if (similarity < SIMILAR_TITLE) continue
    if (
      best === null ||
      similarity > best.similarity ||
      (similarity === best.similarity && finding.number < best.finding.number)
    ) {
      best = { finding, similarity }
    }
  }
  return best?.finding ?? null
}

/** The file a finding is written in: its number, and its title as a slug. */
export function findingFileName(number: number, title: string): string {
  const slug = title
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 48)
    .replace(/-+$/, '')
  return `${String(number).padStart(4, '0')}-${slug === '' ? 'finding' : slug}.md`
}

/** The front matter's keys, in the order they are written, and the head field each holds. */
const FINDING_HEAD_KEYS = [
  ['number', 'number'],
  ['title', 'title'],
  ['kind', 'kind'],
  ['place', 'place'],
  ['severity', 'severity'],
  ['occurrences', 'occurrences'],
  ['first_seen', 'firstSeen'],
  ['last_seen', 'lastSeen'],
  ['sessions', 'sessions'],
  ['version', 'version'],
  ['channel', 'channel'],
  ['commit', 'commit'],
  ['os', 'os'],
  ['platform', 'platform'],
  ['agent', 'agent'],
  ['agent_version', 'agentVersion'],
  ['model', 'model'],
  ['effort', 'effort'],
  ['mode', 'mode'],
  ['auto', 'auto'],
  ['project', 'project'],
  ['project_id', 'projectId'],
  ['workspace', 'workspace'],
  ['workspace_path', 'workspacePath'],
] as const satisfies readonly (readonly [string, keyof FindingHead])[]

/**
 * A finding as its file: the front matter, one key a line, each value written as JSON — which a
 * YAML reader reads as well — then the body.
 */
export function writeFindingFile(head: FindingHead, body: string): string {
  const lines = FINDING_HEAD_KEYS.map(([key, field]) => `${key}: ${JSON.stringify(head[field])}`)
  return `---\n${lines.join('\n')}\n---\n${body}`
}

/** A text as one fenced block, whatever fences it holds itself. */
function fenced(text: string): string {
  const longest = Math.max(2, ...[...text.matchAll(/`+/g)].map((run) => run[0].length))
  const fence = '`'.repeat(longest + 1)
  return `${fence}text\n${text}\n${fence}`
}

/** A text in inline code, whatever backticks it holds. */
function code(text: string): string {
  const longest = Math.max(0, ...[...text.matchAll(/`+/g)].map((run) => run[0].length))
  const ticks = '`'.repeat(longest + 1)
  return longest === 0 ? `${ticks}${text}${ticks}` : `${ticks} ${text} ${ticks}`
}

/** The parts of a list that are known, joined as one line reads them. */
function joined(parts: readonly (string | null)[]): string {
  return parts.filter((part): part is string => part !== null && part !== '').join(' · ')
}

/** The head of a finding as the environment of one occurrence says it. */
function environmentOf(context: FindingContext) {
  return {
    version: context.hemera.version,
    channel: context.hemera.channel,
    commit: context.hemera.commit,
    os: context.hemera.os,
    platform: context.hemera.platform,
    agent: context.agent.name,
    agentVersion: context.agent.version,
    model: context.agent.model,
    effort: context.agent.effort,
    mode: context.agent.mode,
    auto: context.auto,
    project: context.project.name,
    projectId: context.project.id,
    workspace: context.workspace.name,
    workspacePath: context.workspace.path,
  }
}

/** The human part of a report, as the sections of the top of a finding say it. */
const HUMAN_PARTS = [
  ['trying', 'Trying to'],
  ['happened', 'What happened'],
  ['expected', 'Expected'],
  ['steps', 'Steps to reproduce'],
] as const

/** One occurrence as its section says it: every fact Hemera knows, then what differs. */
function occurrenceSection(
  number: number,
  reported: ReportedFinding,
  context: FindingContext,
  first: ReportedFinding | null,
): string {
  const { hemera, agent, call } = context
  const lines = [
    `### Occurrence ${number} · ${context.at}`,
    '',
    `- Severity: ${FINDING_SEVERITY_TITLES[reported.severity]}`,
    `- Hemera: ${joined([hemera.version, hemera.channel, hemera.commit === null ? null : `commit ${hemera.commit}`, hemera.os, hemera.platform])}`,
    `- Agent: ${joined([agent.version === null ? agent.name : `${agent.name} ${agent.version}`, agent.model === null ? null : `model ${agent.model}`, agent.effort === null ? null : `effort ${agent.effort}`, agent.mode === null ? null : `mode ${agent.mode}`])}`,
    `- Hemera Auto: ${context.auto}`,
    `- Project: ${context.project.name} (${code(context.project.id)})`,
    `- Workspace: ${context.workspace.name} at ${code(context.workspace.path)}`,
    `- Session: ${context.session.title} (${code(context.session.id)}) · ${context.session.mission}`,
  ]
  if (context.build !== null) {
    lines.push(`- Build: ${joined([context.build.phase, context.build.tasks.join(', ')])}`)
  }
  if (reported.files.length > 0) {
    lines.push(`- Files: ${reported.files.map(code).join(', ')}`)
  }
  if (call !== null) {
    lines.push(
      `- Call: ${joined([`${code(call.tool)} ${code(call.id)}`, call.state, call.ms === null ? null : `${call.ms} ms`, `entry ${call.seq}`])}`,
    )
    if (call.arguments !== null) lines.push(`  - Arguments: ${code(call.arguments)}`)
    if (call.summary !== null) lines.push(`  - Answer: ${call.summary}`)
  } else if (reported.callId !== null) {
    lines.push(`- Call: ${code(reported.callId)}, not found in the thread`)
  }
  if (reported.code !== null) lines.push(`- Code: ${reported.code}`)
  if (context.entries !== null) {
    lines.push(`- Thread entries: ${context.entries.from} to ${context.entries.to}`)
  }
  // The first occurrence's story is the top of the file; a later one says only what differs.
  if (first !== null) {
    for (const [field, title] of HUMAN_PARTS) {
      if (reported[field] !== first[field]) lines.push('', `${title}:`, '', reported[field])
    }
  }
  if (reported.error !== null) lines.push('', 'Error:', '', fenced(reported.error))
  return `${lines.join('\n')}\n`
}

/** The worse of two severities. */
function worse(one: FindingSeverity, other: FindingSeverity): FindingSeverity {
  return FINDING_SEVERITIES.indexOf(one) <= FINDING_SEVERITIES.indexOf(other) ? one : other
}

/**
 * The first report of a problem, as a finding. The first report's human part stays in a comment
 * at the end of the body, so a later occurrence can say what differs from it.
 */
export function newFinding(
  number: number,
  reported: ReportedFinding,
  context: FindingContext,
): Finding {
  const top = [
    `# #${number} ${reported.title}`,
    '',
    `${FINDING_KIND_TITLES[reported.kind]} · ${FINDING_SEVERITY_TITLES[reported.severity]} · ${code(reported.place)}`,
    ...HUMAN_PARTS.flatMap(([field, title]) => ['', `## ${title}`, '', reported[field]]),
    '',
    '## Occurrences',
    '',
  ].join('\n')
  return {
    head: {
      number,
      title: reported.title,
      kind: reported.kind,
      place: reported.place,
      severity: reported.severity,
      occurrences: 1,
      firstSeen: context.at,
      lastSeen: context.at,
      sessions: [context.session.id],
      ...environmentOf(context),
    },
    body: `${top}\n${occurrenceSection(1, reported, context, null)}`,
  }
}

/** The first report's human part, read back from the top of a finding's body. */
function firstReportOf(finding: Finding): ReportedFinding {
  const sections = new Map<string, string>()
  const body = finding.body.split('\n## Occurrences\n')[0] ?? ''
  for (const [field, title] of HUMAN_PARTS) {
    const start = body.indexOf(`\n## ${title}\n\n`)
    if (start < 0) continue
    const from = start + `\n## ${title}\n\n`.length
    const next = body.indexOf('\n\n## ', from)
    sections.set(field, body.slice(from, next < 0 ? undefined : next).replace(/\n+$/, ''))
  }
  return {
    title: finding.head.title,
    kind: finding.head.kind,
    place: finding.head.place,
    severity: finding.head.severity,
    trying: sections.get('trying') ?? '',
    happened: sections.get('happened') ?? '',
    expected: sections.get('expected') ?? '',
    steps: sections.get('steps') ?? '',
    files: [],
    callId: null,
    error: null,
    code: null,
  }
}

/**
 * One more occurrence of a finding: a section appended to its body, the count, the last seen, the
 * Session if it is a new one, the worst severity, and the environment of this occurrence.
 */
export function recordOccurrence(
  finding: Finding,
  reported: ReportedFinding,
  context: FindingContext,
): Finding {
  const { head } = finding
  const occurrences = head.occurrences + 1
  const section = occurrenceSection(occurrences, reported, context, firstReportOf(finding))
  return {
    head: {
      ...head,
      severity: worse(head.severity, reported.severity),
      occurrences,
      lastSeen: context.at,
      sessions: head.sessions.includes(context.session.id)
        ? head.sessions
        : [...head.sessions, context.session.id],
      ...environmentOf(context),
    },
    body: `${finding.body.replace(/\n*$/, '\n')}\n${section}`,
  }
}

/** A text as one cell of a Markdown table. */
function cell(text: string): string {
  return text.replace(/\r?\n/g, ' ').replace(/\|/g, '\\|')
}

/**
 * The index of the findings, `README.md` of the folder: a count, then one section per kind and
 * one table per severity under it, the latest seen first, each finding linking its file.
 */
export function findingsIndex(
  findings: readonly { readonly head: FindingHead; readonly file: string }[],
): string {
  const occurrences = findings.reduce((sum, one) => sum + one.head.occurrences, 0)
  const lines = ['# Hemera app tester findings', '']
  if (findings.length === 0) return `${[...lines, 'No finding yet.'].join('\n')}\n`
  lines.push(
    `${findings.length} ${findings.length === 1 ? 'finding' : 'findings'} · ${occurrences} ${occurrences === 1 ? 'occurrence' : 'occurrences'}`,
  )
  for (const kind of FINDING_KINDS) {
    const ofKind = findings.filter((one) => one.head.kind === kind)
    if (ofKind.length === 0) continue
    lines.push('', `## ${FINDING_KIND_TITLES[kind]}`)
    for (const severity of FINDING_SEVERITIES) {
      const rows = ofKind
        .filter((one) => one.head.severity === severity)
        .toSorted((one, other) => (one.head.lastSeen < other.head.lastSeen ? 1 : -1))
      if (rows.length === 0) continue
      lines.push(
        '',
        `### ${FINDING_SEVERITY_TITLES[severity]}`,
        '',
        '| # | Title | Where | Seen | Last seen |',
        '| --- | --- | --- | --- | --- |',
        ...rows.map(
          ({ head, file }) =>
            `| [#${head.number}](findings/${file}) | ${cell(head.title)} | ${cell(code(head.place))} | ${head.occurrences} | ${cell(head.lastSeen)} |`,
        ),
      )
    }
  }
  return `${lines.join('\n')}\n`
}
