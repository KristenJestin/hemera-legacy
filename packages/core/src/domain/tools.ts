/**
 * The capabilities Hemera lends an agent, and the limits it lends them with (D6-03, D6-04).
 *
 * The names are the interface's: an agent asks for `fs_read`, and what it is asked with is a
 * bounded argument, never a command line of its own. The four sizes below are part of the
 * contract and not of the implementation — the tool description carries them, every result
 * repeats them, and a reader that never saw this file still learns from one call that a read is
 * paginated and a search is bounded.
 *
 * The mission is the seam and not a choice: a Session is offered the set of its mission — a
 * `free` Session the code tools, a `define` one the Spec tools beside a read-only code set
 * (D7-14), a `build` one the code tools and the build's own (D10-13). The guard is a function of
 * what is offered and what is asked for, so a tool the Session should never have been offered is
 * refused by the same code path as one that was offered and used wrongly (D6-03).
 */

import type { Mission } from './session.ts'
import { TESTER_TOOLS } from './tester.ts'

/**
 * Everything Hemera can lend, named as the model sees it once it has gone through MCP.
 *
 * The name here is the tool's own name and not the wire name: each agent prefixes what it
 * registers — `mcp__hemera__fs.read` on Claude Code and Codex, `hemera_fs.read` on OpenCode —
 * and a name that carried one of those prefixes would be a name that is wrong on two agents.
 */
export const TOOL_NAMES = [
  'fs_read',
  'fs_edit',
  'fs_write',
  'fs_list',
  'search',
  'commands_list',
  'commands_run',
  'commands_output',
  'commands_stop',
  'commands_propose',
  'project_get',
  'setup_read',
  'setup_propose',
  'session_get',
  'spec_read',
  'spec_write',
  'spec_propose',
  'build_read',
  'task_finished',
  'task_blocked',
  'reproduction_replayed',
  // The app tester's two (#300), offered only while the mode is on.
  'hemera_report',
  'hemera_reports',
] as const

export type ToolName = (typeof TOOL_NAMES)[number]

/**
 * The mark a tool is drawn with in the thread: one per tool, so that two tools never share a
 * picture (recette 3 of 23 September 2026). The design system holds the icon of each; this is
 * the name both ends agree on.
 */
export type ToolMark =
  | 'read-file'
  | 'list-folder'
  | 'search'
  | 'write-file'
  | 'edit-file'
  | 'run-command'
  | 'stop-command'
  | 'list-commands'
  | 'command-output'
  | 'propose-command'
  | 'project'
  | 'read-setup'
  | 'propose-setup'
  | 'session'
  | 'read-spec'
  | 'write-spec'
  | 'propose-spec'
  | 'read-build'
  | 'finish-task'
  | 'block-task'
  | 'replay-reproduction'
  | 'report-finding'
  | 'read-findings'

/** What a reader calls a tool, the mark it wears, and what the turn is doing while it runs. */
export interface ToolLabel {
  readonly label: string
  readonly mark: ToolMark
  /**
   * What the turn is doing while the tool runs, as a phrase of its own: "Writing the Spec". The
   * row above the box reads it whole, where "Running" and the label read "Running Write Spec"
   * (issue #170).
   */
  readonly doing: string
}

/**
 * What a reader calls each tool, and the mark it wears.
 *
 * The catalogue's name is the agent's word and stays on the line, quieter; the label is the
 * reader's, and it is what the line is read by.
 */
export const TOOL_LABELS: Readonly<Record<ToolName, ToolLabel>> = {
  fs_read: { label: 'Read file', mark: 'read-file', doing: 'Reading a file' },
  fs_list: { label: 'List folder', mark: 'list-folder', doing: 'Listing a folder' },
  search: { label: 'Search', mark: 'search', doing: 'Searching the code' },
  fs_write: { label: 'Write file', mark: 'write-file', doing: 'Writing a file' },
  fs_edit: { label: 'Edit file', mark: 'edit-file', doing: 'Editing a file' },
  commands_run: { label: 'Run command', mark: 'run-command', doing: 'Running a command' },
  commands_stop: { label: 'Stop command', mark: 'stop-command', doing: 'Stopping a command' },
  commands_list: { label: 'List commands', mark: 'list-commands', doing: 'Listing the commands' },
  commands_output: {
    label: 'Command output',
    mark: 'command-output',
    doing: 'Reading the output of a command',
  },
  commands_propose: {
    label: 'Propose command',
    mark: 'propose-command',
    doing: 'Proposing a command',
  },
  project_get: { label: 'Project', mark: 'project', doing: 'Reading the Project' },
  setup_read: { label: 'Project setup', mark: 'read-setup', doing: 'Reading the Project setup' },
  setup_propose: {
    label: 'Propose setup',
    mark: 'propose-setup',
    doing: 'Proposing changes to the Project setup',
  },
  session_get: { label: 'Session', mark: 'session', doing: 'Reading the Session' },
  spec_read: { label: 'Read Spec', mark: 'read-spec', doing: 'Reading the Spec' },
  spec_write: { label: 'Write Spec', mark: 'write-spec', doing: 'Writing the Spec' },
  spec_propose: { label: 'Propose', mark: 'propose-spec', doing: 'Proposing a Spec' },
  build_read: { label: 'Read build', mark: 'read-build', doing: 'Reading the build' },
  task_finished: { label: 'Task finished', mark: 'finish-task', doing: 'Finishing a task' },
  task_blocked: { label: 'Task blocked', mark: 'block-task', doing: 'Blocking a task' },
  reproduction_replayed: {
    label: 'Reproduction replayed',
    mark: 'replay-reproduction',
    doing: 'Replaying the reproduction',
  },
  hemera_report: {
    label: 'Report to Hemera',
    mark: 'report-finding',
    doing: 'Reporting a problem with Hemera',
  },
  hemera_reports: {
    label: 'Hemera reports',
    mark: 'read-findings',
    doing: 'Reading the problems reported to Hemera',
  },
}

/** The most `fs_read` hands back in one call, and the page a long file is read in. */
export const READ_PAGE_BYTES = 256 * 1024

/** The most `spec_read` hands back in one call, in characters of the Spec rendered for the agent. */
export const SPEC_PAGE_CHARACTERS = 64 * 1024

/** How many matches a search may return before it stops and says so. */
export const SEARCH_MATCH_LIMIT = 200

/** How many bytes a search may scan in one call, `.gitignore` respected (D6-04). */
export const SEARCH_SCAN_BYTES = 1024 * 1024

/** What a search hit is: where it is, and the line as it was found. */
export interface SearchHit {
  readonly path: string
  readonly line: number
  readonly text: string
}

/** How many of the files a search passed over it names; the rest are counted. */
export const SEARCH_SKIPS_LISTED = 20

/** A file a search did not read, and why: what looks binary, or what could not be read. */
export interface SearchSkip {
  readonly path: string
  readonly reason: 'binary' | 'unreadable'
}

/** Which of the two limits stopped a search, and null when neither did. */
export type SearchLimit = 'matches' | 'scanned'

export interface SearchResult {
  readonly hits: readonly SearchHit[]
  /** The limit that was hit, and null for a search that ran to the end of what it scanned. */
  readonly stoppedBy: SearchLimit | null
  readonly scanned: number
  /** Where to continue from, and null when there is nothing left to read. */
  readonly cursor: string | null
  /** The first files it passed over, at most `SEARCH_SKIPS_LISTED`, said rather than hidden. */
  readonly skipped: readonly SearchSkip[]
  /** How many files it passed over in all. */
  readonly skippedCount: number
}

/** The Spec tools only a `define` Session writes its Spec with. */
const SPEC_WRITING: ReadonlySet<ToolName> = new Set(['spec_read', 'spec_write'])

/**
 * The build's own, which only a `build` Session is offered (D10-13): its three, and the replay of a
 * bug's reproduction its final checks wait for (issue #203).
 */
const BUILDING: ReadonlySet<ToolName> = new Set([
  'build_read',
  'task_finished',
  'task_blocked',
  'reproduction_replayed',
])

/** The app tester's own (#300), which no mission is offered unless the mode is on. */
const TESTING: ReadonlySet<ToolName> = new Set<ToolName>(TESTER_TOOLS)

/** What a `define` Session reads the code with: nothing that writes a file or runs a command. */
const READ_ONLY_CODE_TOOLS = [
  'fs_read',
  'fs_list',
  'search',
  'project_get',
  'session_get',
  'commands_list',
  'commands_output',
] as const satisfies readonly ToolName[]

/**
 * The tools of a Session, by its mission.
 *
 * A `free` Session is offered the code tools, the setup tools (#218), and of the Spec's only
 * `spec_propose`: it has no Spec to read or write, and proposes one to the human through it (D7-07). A `define` Session
 * produces a Spec and not code (D7-14): it reads the Workspace, never writes to it nor runs
 * anything, and writes its Spec through the three Spec tools. A `build` Session executes a frozen
 * Spec (D10-13): the code tools, the setup tools, and the build's own — `build_read` reads the frozen Spec and
 * where the build stands, `task_finished` and `task_blocked` are the agent's only words about a
 * task, and Hemera decides its state; `reproduction_replayed` says what the replay of a bug's
 * reproduction showed (issue #203). No Spec tool: the contract does not move during a build.
 * Neither of the other two missions is offered a build tool.
 *
 * While the app tester mode is on (#300), every mission is offered its two tools besides its own.
 */
export function offeredTools(mission: Mission, tester = false): readonly ToolName[] {
  const own = ((): readonly ToolName[] => {
    switch (mission) {
      case 'free':
        return TOOL_NAMES.filter(
          (name) => !SPEC_WRITING.has(name) && !BUILDING.has(name) && !TESTING.has(name),
        )
      case 'define':
        return [...READ_ONLY_CODE_TOOLS, 'spec_read', 'spec_write', 'spec_propose']
      case 'build':
        return TOOL_NAMES.filter(
          (name) => !SPEC_WRITING.has(name) && name !== 'spec_propose' && !TESTING.has(name),
        )
    }
  })()
  return tester ? [...own, ...TESTER_TOOLS] : own
}

/**
 * The tool of Hemera's a name an agent reports designates, or null for one of the agent's own
 * (D6-06).
 *
 * Every agent reports the calls it makes, Hemera's included, as its own: the name is the tool's
 * under the agent's prefix — `mcp__hemera__fs_read` on Claude Code and Codex, `hemera_fs_read`
 * on OpenCode — or the bare name. A tool whose own name starts with `hemera_` (#300) is itself
 * once the prefix is gone, and read as it stands when taking one more off names nothing.
 */
export function hemeraToolNamed(title: string): ToolName | null {
  const once = title.replace(/^mcp__hemera__/i, '').toLowerCase()
  const bare = once.replace(/^hemera_/, '')
  return (
    TOOL_NAMES.find((name) => name === bare) ?? TOOL_NAMES.find((name) => name === once) ?? null
  )
}

/** What the guard answers: the call goes through, or it does not and says why. */
export type GuardDecision =
  | { readonly admitted: true }
  | { readonly admitted: false; readonly reason: string }

/**
 * Whether a call may go through, asked for every call and never remembered.
 *
 * Two refusals and one admission, and the reason is a sentence because it is shown to the agent
 * and written in the thread: a name no tool of Hemera has — which is how an action reserved to
 * the human stays unreachable (D6-05) — and a tool the Session's set does not hold, refused
 * just the same even when it was on the list handed to the agent. Technical reachability is not
 * an authorisation, which is why the question is asked again for every call.
 */
export function admitTool(offered: readonly ToolName[], tool: string): GuardDecision {
  const named = TOOL_NAMES.find((name) => name === tool)
  if (named === undefined) {
    return { admitted: false, reason: `Hemera has no tool named ${tool}` }
  }
  if (!offered.includes(named)) {
    return { admitted: false, reason: `the tool ${tool} is not offered to this Session` }
  }
  return { admitted: true }
}
