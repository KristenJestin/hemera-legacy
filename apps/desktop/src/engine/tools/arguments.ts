/**
 * What each tool is asked with, declared once (design D6-03).
 *
 * One declaration serves three readers: the schema handed to the agent so it knows what to send,
 * the guard that reads what arrived, and the tool itself, which reads fields and not a document
 * of its own. A tool that took its arguments from somewhere else would be a tool whose contract
 * is two things that drift.
 *
 * The arguments are flat on purpose — a string, a number, a boolean, or nothing at all — because
 * MCP is what carries them and a nested document is a document nobody validates twice.
 */

import {
  COMMAND_SCOPES,
  COMMAND_TYPES,
  PHASE_IDS,
  RECIPE_KINDS,
  QUESTION_RULE,
  READ_PAGE_BYTES,
  SEARCH_MATCH_LIMIT,
  SEARCH_SCAN_BYTES,
  SECTION_NAMES,
  SPEC_PAGE_CHARACTERS,
  SPEC_TYPES,
  TASK_EXECUTORS,
  type ToolName,
} from '@hemera/core'
import { z } from 'zod'

import { OUTPUT_KEPT_BYTES } from '../commands/service.ts'

/** The arguments of a tool as they arrived: flat, JSON, and not yet read. */
export type ToolArguments = Readonly<Record<string, string | number | boolean | null>>

/** What an argument was refused with, said so that the agent can send better ones. */
export type ParsedCall =
  | { readonly tool: 'fs_read'; readonly arguments: z.infer<(typeof TOOL_ARGUMENTS)['fs_read']> }
  | { readonly tool: 'fs_edit'; readonly arguments: z.infer<(typeof TOOL_ARGUMENTS)['fs_edit']> }
  | { readonly tool: 'fs_write'; readonly arguments: z.infer<(typeof TOOL_ARGUMENTS)['fs_write']> }
  | { readonly tool: 'fs_list'; readonly arguments: z.infer<(typeof TOOL_ARGUMENTS)['fs_list']> }
  | { readonly tool: 'search'; readonly arguments: z.infer<(typeof TOOL_ARGUMENTS)['search']> }
  | {
      readonly tool: 'commands_list'
      readonly arguments: z.infer<(typeof TOOL_ARGUMENTS)['commands_list']>
    }
  | {
      readonly tool: 'commands_run'
      readonly arguments: z.infer<(typeof TOOL_ARGUMENTS)['commands_run']>
    }
  | {
      readonly tool: 'commands_output'
      readonly arguments: z.infer<(typeof TOOL_ARGUMENTS)['commands_output']>
    }
  | {
      readonly tool: 'commands_stop'
      readonly arguments: z.infer<(typeof TOOL_ARGUMENTS)['commands_stop']>
    }
  | {
      readonly tool: 'commands_propose'
      readonly arguments: z.infer<(typeof TOOL_ARGUMENTS)['commands_propose']>
    }
  | {
      readonly tool: 'project_get'
      readonly arguments: z.infer<(typeof TOOL_ARGUMENTS)['project_get']>
    }
  | {
      readonly tool: 'setup_read'
      readonly arguments: z.infer<(typeof TOOL_ARGUMENTS)['setup_read']>
    }
  | {
      readonly tool: 'setup_propose'
      readonly arguments: z.infer<(typeof TOOL_ARGUMENTS)['setup_propose']>
    }
  | {
      readonly tool: 'session_get'
      readonly arguments: z.infer<(typeof TOOL_ARGUMENTS)['session_get']>
    }
  | {
      readonly tool: 'spec_read'
      readonly arguments: z.infer<(typeof TOOL_ARGUMENTS)['spec_read']>
    }
  | {
      readonly tool: 'spec_write'
      readonly arguments: z.infer<(typeof TOOL_ARGUMENTS)['spec_write']>
    }
  | {
      readonly tool: 'spec_propose'
      readonly arguments: z.infer<(typeof TOOL_ARGUMENTS)['spec_propose']>
    }
  | {
      readonly tool: 'build_read'
      readonly arguments: z.infer<(typeof TOOL_ARGUMENTS)['build_read']>
    }
  | {
      readonly tool: 'task_finished'
      readonly arguments: z.infer<(typeof TOOL_ARGUMENTS)['task_finished']>
    }
  | {
      readonly tool: 'task_blocked'
      readonly arguments: z.infer<(typeof TOOL_ARGUMENTS)['task_blocked']>
    }

/**
 * The key an idempotency key may be, so that a key is a name and not a document.
 *
 * Every write, edit and run carries one (D6-03): a lost answer and a second call look the same
 * from where the agent stands, and without a key the second one would act twice.
 */
const KEY = z.string().min(1).max(200)

/** How long `commands_run` waits for a command to end when it is not told: 30 seconds. */
export const RUN_WAIT_MS = 30_000

/** The longest it may be told to wait: 10 minutes. */
export const RUN_WAIT_LONGEST_MS = 600_000

/** How many lines of a run's output one `commands_output` call hands back. */
export const OUTPUT_PAGE_LINES = 200

/** How many entries of the thread `session_get` hands back. */
export const THREAD_TAIL = 20

/**
 * A list sent as JSON text inside one argument, read against its schema.
 *
 * The arguments stay flat (see the head of this file), and the stories, the tasks, the options of
 * a question and the assumptions of a phase are lists: each is one string argument holding a JSON
 * array, read here, where a list that does not read is refused with the reason, like any argument.
 */
export function jsonList<T>(item: z.ZodType<T>) {
  return z
    .string()
    .transform((text, context) => {
      try {
        return JSON.parse(text)
      } catch {
        context.addIssue({ code: 'custom', message: 'is not JSON' })
        return z.NEVER
      }
    })
    .pipe(z.array(item))
}

/** One story of `spec_write`, as its JSON text reads. */
export const STORY_SENT = z.object({
  id: z.string().min(1).optional(),
  title: z.string().min(1),
  narrative: z.string(),
  priority: z.string().nullable().optional(),
  criteria: z.array(z.string().min(1)),
})

/** One task of `spec_write`, as its JSON text reads. */
export const TASK_SENT = z.object({
  id: z.string().min(1).optional(),
  title: z.string().min(1),
  result: z.string(),
  type: z.string(),
  executor: z.enum(TASK_EXECUTORS),
  criteria: z.string(),
  dependsOn: z.array(z.string().min(1)).default([]),
  stories: z.array(z.string().min(1)).default([]),
})

/** One answer a question of `spec_write` offers, as its JSON text reads. */
export const OPTION_SENT = z.object({
  id: z.string().min(1),
  label: z.string().min(1),
  recommended: z.boolean().optional(),
})

/** A text an agent may leave out, read as nothing when it is blank. */
const OPTIONAL_TEXT = z
  .string()
  .optional()
  .transform((text) => (text === undefined || text.trim() === '' ? null : text.trim()))

/**
 * One change of `setup_propose`, as its JSON text reads (#218): what the Project settings would
 * be asked, field by field, with the settings' own defaults for what is left out.
 */
export const CHANGE_SENT = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('repository'), path: z.string().trim().min(1) }),
  z.object({
    kind: z.literal('command'),
    name: z.string().trim().min(1),
    line: z.string().trim().min(1),
    type: z.enum(COMMAND_TYPES),
    repository: OPTIONAL_TEXT,
    folder: OPTIONAL_TEXT,
    scope: z.enum(COMMAND_SCOPES).default('workspace'),
    portless: z.boolean().default(false),
    portlessName: OPTIONAL_TEXT,
    runAtOpen: z.boolean().default(false),
    lineWindows: OPTIONAL_TEXT,
    lineLinux: OPTIONAL_TEXT,
  }),
  z.object({
    kind: z.literal('step'),
    step: z.enum(RECIPE_KINDS),
    repository: OPTIONAL_TEXT,
    path: OPTIONAL_TEXT,
    command: OPTIONAL_TEXT,
    line: OPTIONAL_TEXT,
    lineWindows: OPTIONAL_TEXT,
    lineLinux: OPTIONAL_TEXT,
  }),
  z.object({
    kind: z.literal('variable'),
    name: z.string().trim().min(1),
    value: z.string(),
    workspace: OPTIONAL_TEXT,
  }),
  z.object({ kind: z.literal('workspace_create'), name: z.string().trim().min(1) }),
  z.object({
    kind: z.enum(['workspace_prepare', 'workspace_resume', 'workspace_cleanup']),
    workspace: z.string().trim().min(1),
  }),
])

export type ChangeSent = z.infer<typeof CHANGE_SENT>

/** The most changes one `setup_propose` call may carry: a Project set up, not a migration. */
export const CHANGES_PER_CALL = 20

/** How long a list of the Spec tools may be, as the JSON text it is sent as. */
const LIST_CHARACTERS = SPEC_PAGE_CHARACTERS

/** What `spec_write` writes: exactly one of these. */
const SPEC_WRITES = ['section', 'stories', 'tasks', 'question', 'title', 'type'] as const

/** What `spec_propose` hands over. */
export const PROPOSALS = ['phase_done', 'ready', 'spec', 'existing'] as const

/**
 * The arguments of every tool, as the agent is told them and as they are read back.
 *
 * A path is always relative to the Workspace root: an absolute path is accepted and judged, but
 * a relative one is what an agent should send, because it is the one that survives the project
 * being moved.
 */
export const TOOL_ARGUMENTS = {
  fs_read: z.object({
    path: z.string().min(1).describe('the file, relative to the Workspace root'),
    offset: z.number().int().min(0).optional().describe('the byte to start at; 0 without it'),
    limit: z
      .number()
      .int()
      .min(1)
      .max(READ_PAGE_BYTES)
      .optional()
      .describe(`how many bytes at most; ${READ_PAGE_BYTES} without it`),
  }),
  fs_edit: z.object({
    path: z.string().min(1).describe('the file, relative to the Workspace root'),
    old: z.string().min(1).describe('the text to replace, which must appear exactly once'),
    new: z.string().describe('what to replace it with; an empty string deletes it'),
    key: KEY.describe('an idempotency key, so a retry does not edit twice'),
  }),
  fs_write: z.object({
    path: z.string().min(1).describe('the file, relative to the Workspace root'),
    content: z.string().describe('what the whole file becomes; the folders are created'),
    key: KEY.describe('an idempotency key, so a retry does not write twice'),
  }),
  fs_list: z.object({
    path: z.string().optional().describe('the folder, relative to the Workspace root'),
  }),
  search: z.object({
    query: z.string().min(1).describe('what to look for, as it is written'),
    path: z.string().optional().describe('a folder or a file to search in, instead of everything'),
    cursor: z.string().optional().describe('where to continue from, as the last answer gave it'),
  }),
  commands_list: z.object({}),
  commands_run: z.object({
    name: z.string().min(1).optional().describe('a command of the Project catalogue, by name'),
    line: z.string().min(1).optional().describe('a one-off command line, instead of a name'),
    folder: z
      .string()
      .optional()
      .describe(
        'where to run a one-off line: a repository of the Project, or a path in the Workspace; a catalogue command runs in its own folder',
      ),
    key: KEY.describe('an idempotency key, so a retry does not start it twice'),
    timeout: z
      .number()
      .int()
      .min(0)
      .max(RUN_WAIT_LONGEST_MS)
      .optional()
      .describe(
        `how long to wait for it to end, in milliseconds: ${RUN_WAIT_MS} by default, ${RUN_WAIT_LONGEST_MS} at most`,
      ),
    background: z
      .boolean()
      .optional()
      .describe('true to answer as soon as it has started, without waiting for it to end'),
  }),
  commands_output: z.object({
    run: z
      .string()
      .min(1)
      .optional()
      .describe('which run, as commands_list names it; the one running, or the last, without it'),
    from: z
      .number()
      .int()
      .min(1)
      .optional()
      .describe(
        `the first line to read, counted from 1: ${OUTPUT_PAGE_LINES} lines from there; the last ${OUTPUT_PAGE_LINES} without it`,
      ),
  }),
  commands_stop: z.object({
    run: z.string().min(1).optional().describe('which run; the only one running without it'),
  }),
  // What a proposal carries (D8-11): what the catalogue entry would be, and why the agent thinks
  // it is worth keeping, which is what the human reads before deciding.
  commands_propose: z.object({
    name: z.string().trim().min(1).describe('the name it would have in the catalogue'),
    line: z.string().trim().min(1).describe('the line it runs'),
    type: z
      .enum(COMMAND_TYPES)
      .describe('what it is for: serve stays up, the others end with an exit code'),
    folder: z
      .string()
      .optional()
      .describe('the repository of the Project it runs in; the Workspace root without it'),
    why: z.string().trim().min(1).describe('why it is worth keeping, for the human who decides'),
  }),
  project_get: z.object({}),
  setup_read: z.object({}),
  // What a setup proposal carries (#218): the changes, one card each, and why, which is what the
  // human reads before deciding. A key, because a lost answer would otherwise propose twice.
  setup_propose: z
    .object({
      changes: z
        .string()
        .max(LIST_CHARACTERS)
        .describe(
          'the changes, in the order they apply, as a JSON array; each one of: {"kind": "repository", "path"} to declare a repository relative to the Project root; {"kind": "command", "name", "line", "type", "repository"?, "folder"?, "scope"?: "workspace"|"project", "portless"?, "portlessName"?, "runAtOpen"?, "lineWindows"?, "lineLinux"?} to add a command, or change the one of that name; {"kind": "step", "step": "copy"|"link"|"run", "repository"?, "path"?, "command"?, "line"?, "lineWindows"?, "lineLinux"?} to add a preparation step; {"kind": "variable", "name", "value", "workspace"?} to set a variable on the Project or on one Workspace; {"kind": "workspace_create", "name"} to create a Workspace and prepare it; {"kind": "workspace_prepare"|"workspace_resume"|"workspace_cleanup", "workspace"} for an existing Workspace, by name',
        ),
      why: z
        .string()
        .trim()
        .min(1)
        .max(2000)
        .describe('why these changes, for the human who decides'),
      key: KEY.describe('an idempotency key, so a retry does not propose twice'),
    })
    .superRefine((sent, context) => {
      const listed = jsonList(CHANGE_SENT).safeParse(sent.changes)
      if (!listed.success) {
        for (const issue of listed.error.issues) {
          context.addIssue({
            code: 'custom',
            path: ['changes', ...issue.path],
            message: issue.message,
          })
        }
        return
      }
      if (listed.data.length === 0) {
        context.addIssue({
          code: 'custom',
          path: ['changes'],
          message: 'propose one change at least',
        })
      }
      if (listed.data.length > CHANGES_PER_CALL) {
        context.addIssue({
          code: 'custom',
          path: ['changes'],
          message: `propose at most ${CHANGES_PER_CALL} changes in one call`,
        })
      }
    }),
  session_get: z.object({}),
  spec_read: z.object({
    revision: z
      .number()
      .int()
      .min(1)
      .optional()
      .describe('a revision of the Spec, by number, to read as it was; the current one without it'),
    offset: z.number().int().min(0).optional().describe('the character to start at; 0 without it'),
    limit: z
      .number()
      .int()
      .min(1)
      .max(SPEC_PAGE_CHARACTERS)
      .optional()
      .describe(`how many characters at most; ${SPEC_PAGE_CHARACTERS} without it`),
  }),
  spec_write: z
    .object({
      section: z
        .enum(SECTION_NAMES)
        .optional()
        .describe('the section to write; send body and baseVersion with it'),
      body: z
        .string()
        .max(SPEC_PAGE_CHARACTERS)
        .optional()
        .describe('with section: the whole Markdown text the section becomes'),
      baseVersion: z
        .number()
        .int()
        .min(0)
        .optional()
        .describe(
          'with section: the version you read the section at, as spec_read shows it; 0 for a section the Spec does not hold yet',
        ),
      stories: z
        .string()
        .max(LIST_CHARACTERS)
        .optional()
        .describe(
          'every story of the Spec, in order, as a JSON array of {"id"?, "title", "narrative", "priority"?, "criteria": ["…"]}: it replaces them all; keep the id of a story you keep',
        ),
      tasks: z
        .string()
        .max(LIST_CHARACTERS)
        .optional()
        .describe(
          'every task of the contract, in order, as a JSON array of {"id"?, "title", "result", "type", "executor": "agent"|"human", "criteria", "dependsOn"?: ["task id or title"], "stories"?: ["story id or title"]}: it replaces them all',
        ),
      question: z
        .string()
        .min(1)
        .max(SPEC_PAGE_CHARACTERS)
        .optional()
        .describe(
          'one question for the user, shown to them as a question card: every question to the user is asked here, never as text in your reply; send blocking with it',
        ),
      blocking: z
        .boolean()
        .optional()
        .describe('with question: true when the Spec cannot be ready until it is answered'),
      phase: z.enum(PHASE_IDS).optional().describe('with question: the phase it belongs to'),
      options: z
        .string()
        .max(LIST_CHARACTERS)
        .optional()
        .describe(
          'with question: the answers offered, as a JSON array of {"id", "label", "recommended"?}, your recommendation marked "recommended": true; none for an answer in the user\'s own words. Hemera labels them A, B, C… and adds an "Other" answer itself: no letter, no "other" answer and no "(recommended)" in a label',
        ),
      title: z
        .string()
        .trim()
        .min(1)
        .max(200)
        .optional()
        .describe('the title the Spec takes, short, as the user would name it'),
      type: z
        .enum(SPEC_TYPES)
        .optional()
        .describe(
          'the type the Spec takes, feature, bug or maintenance, once the user confirmed it',
        ),
      revision: z
        .number()
        .int()
        .min(1)
        .optional()
        .describe('the revision you read; a write naming one that is not the current is refused'),
      key: KEY.describe('an idempotency key, so a retry does not write twice'),
    })
    .superRefine((sent, context) => {
      const writes = SPEC_WRITES.filter((write) => sent[write] !== undefined)
      if (writes.length !== 1) {
        context.addIssue({
          code: 'custom',
          message: `send exactly one of section, stories, tasks, question, title or type, not ${writes.length === 0 ? 'none' : writes.join(' and ')}`,
        })
      }
      if (
        sent.section !== undefined &&
        (sent.body === undefined || sent.baseVersion === undefined)
      ) {
        context.addIssue({
          code: 'custom',
          message: 'a section is sent with its body and baseVersion',
        })
      }
      if (sent.question !== undefined && sent.blocking === undefined) {
        context.addIssue({ code: 'custom', message: 'a question is sent with blocking' })
      }
      const lists = [
        ['stories', STORY_SENT],
        ['tasks', TASK_SENT],
        ['options', OPTION_SENT],
      ] as const
      for (const [field, item] of lists) {
        const text = sent[field]
        if (text === undefined) continue
        const listed = jsonList<z.infer<typeof item>>(item).safeParse(text)
        for (const issue of listed.success ? [] : listed.error.issues) {
          context.addIssue({ code: 'custom', path: [field, ...issue.path], message: issue.message })
        }
      }
    }),
  spec_propose: z
    .object({
      kind: z
        .enum(PROPOSALS)
        .describe(
          'phase_done: declare a phase finished, with a summary; ready: attest the contract is complete, for the user to mark it ready; spec: from a free Session, propose the user a Spec to create, with a title and a type; existing: from a free Session, point the user to a Spec the Project already has, by its key',
        ),
      phase: z.enum(PHASE_IDS).optional().describe('with phase_done: the phase declared finished'),
      summary: z
        .string()
        .min(1)
        .max(SPEC_PAGE_CHARACTERS)
        .optional()
        .describe('with phase_done: what the phase settled, kept with the phase'),
      supporting: z
        .string()
        .max(SPEC_PAGE_CHARACTERS)
        .optional()
        .describe('with phase_done: the elements of the Spec that support it'),
      assumptions: z
        .string()
        .max(LIST_CHARACTERS)
        .optional()
        .describe(
          'with phase_done: the assumptions and questions still open, as a JSON array of strings',
        ),
      title: z.string().trim().min(1).max(200).optional().describe('with spec: its title'),
      type: z.enum(SPEC_TYPES).optional().describe('with spec: feature, bug or maintenance'),
      spec: z
        .string()
        .trim()
        .min(1)
        .max(40)
        .optional()
        .describe('with existing: the key of the Spec, as project_get lists it'),
      key: KEY.describe('an idempotency key, so a retry is answered once and not declared twice'),
    })
    .superRefine((sent, context) => {
      if (sent.kind === 'phase_done' && (sent.phase === undefined || sent.summary === undefined)) {
        context.addIssue({
          code: 'custom',
          message: 'phase_done is sent with a phase and a summary',
        })
      }
      if (sent.kind === 'spec' && (sent.title === undefined || sent.type === undefined)) {
        context.addIssue({ code: 'custom', message: 'spec is sent with a title and a type' })
      }
      if (sent.kind === 'existing' && sent.spec === undefined) {
        context.addIssue({ code: 'custom', message: 'existing is sent with the key of the Spec' })
      }
      if (sent.assumptions === undefined) return
      const listed = jsonList(z.string()).safeParse(sent.assumptions)
      for (const issue of listed.success ? [] : listed.error.issues) {
        context.addIssue({
          code: 'custom',
          path: ['assumptions', ...issue.path],
          message: issue.message,
        })
      }
    }),
  // The build's three (D10-13): a task is named by its label, `T2`, as the briefs list it.
  build_read: z.object({
    task: z
      .string()
      .min(1)
      .optional()
      .describe(
        'a task by its label, T2, to read it with its attempts; the whole build without it',
      ),
    offset: z.number().int().min(0).optional().describe('the character to start at; 0 without it'),
  }),
  task_finished: z.object({
    task: z.string().min(1).describe('the task you finished, by its label: T2'),
    summary: z
      .string()
      .max(SPEC_PAGE_CHARACTERS)
      .optional()
      .describe("what you did, in a few lines, written in the Journal beside the task's line"),
  }),
  task_blocked: z.object({
    task: z.string().min(1).describe('the task that contradicts the Spec, by its label: T3'),
    reason: z
      .string()
      .trim()
      .min(1)
      .max(SPEC_PAGE_CHARACTERS)
      .describe('what in the Spec it contradicts, for the user who decides'),
  }),
} as const

/** What each tool is, in the words the agent reads before it asks. */
export const TOOL_DESCRIPTIONS: Record<ToolName, string> = {
  fs_read: `Read a file inside the Workspace root. A long file is paginated: one call returns at most ${READ_PAGE_BYTES} bytes, each line comes with its number in front of it, a page ends on a whole line, and the answer ends with the range read as JSON: offset, end, size, truncated and next, the offset of the next page.`,
  fs_edit: `Replace a piece of text in a file of the Workspace root. The text must appear exactly once: none, or several, is refused and the refusal says how many were found. Send a key so that a retry after a lost answer does not edit twice.`,
  fs_write: `Write a file inside the Workspace root, creating the folders it needs; the whole file becomes what you send. Send a key so that a retry after a lost answer does not write twice.`,
  fs_list:
    'List one level of a folder of the Workspace root: the name, the kind and the size of what it holds.',
  search: `Search the files of the Workspace root for a piece of text, \`.gitignore\` respected. One call returns at most ${SEARCH_MATCH_LIMIT} matches and scans at most ${SEARCH_SCAN_BYTES} bytes: the answer says which limit stopped it, gives the cursor to continue from, and names the files it did not read (binary or unreadable).`,
  commands_list:
    "The commands the Project's catalogue holds: name, line, kind, and the folder each runs in. Then the runs of this Session, whoever started them, you or the user from the Commands panel: run id, name, state, the exit code once it ended, catalogue or one-off, and the line.",
  commands_run: `Ask for a command of the Project's catalogue to run, by name, or a one-off line, which the user is asked to allow before it runs. A serve command that is already running is handed back rather than started twice. Any other type is waited for, up to timeout, and answers with its exit code and the end of its output; one still running then is left running in the background and its run id is given, so there is nothing to poll for. background: true answers at once. A serve command is left running as soon as it has started. The output, and the address it published, come back as they stand. Send a key so that a retry after a lost answer does not start it twice.`,
  commands_output: `What a run of this Session has printed, whoever started it, the address it published, and how it ended if it has. One call returns at most ${OUTPUT_PAGE_LINES} lines: the last ones, or those from the line from names; the answer says which lines of how many it holds.`,
  commands_stop: 'Stop a run and everything it started.',
  commands_propose:
    "Proposes a command worth keeping in the Project's catalogue. A human accepts or declines it in the Session; nothing enters the catalogue by this call.",
  project_get:
    'The Project this Session belongs to: its name, where its Workspace root is, what it reads from, and its Specs, one per line with their key, type, status and title.',
  setup_read:
    "The Project's whole setup, as its settings show it: its repositories with the Git state of each in main, whether a Workspace includes it and its icon; the folder and the branch prefix of its Workspaces; its commands and services, with their type, where they run, their scope, Portless and whether they run when Hemera opens; its preparation recipe, step by step; its variables, by name only, never their values; and each Workspace with its state, the Spec it was made for, its preparation step by step, its variables by name and the services running in it.",
  setup_propose:
    "Propose changes to the Project's setup: declare a repository, add or change a command or a service, add a preparation step, set a variable, create and prepare a Workspace, resume a failed preparation, or clean a Workspace up. Nothing is changed by this call: each change is shown to the user as a card they accept or decline, and the changes of one call can be accepted together. Hemera checks each change as the settings would, and refuses the whole call with the reason when one would be refused. A variable's value is held until the user decides and is never shown back, in the thread or anywhere else: send one only when the user gave it or it is in the Project's files. Read setup_read first. Send a key so that a retry after a lost answer does not propose twice.",
  session_get:
    'This Session: its title, its Project, its agent, and the last entries of its thread.',
  spec_read: `Read the Spec this Session defines, rendered as Markdown: its key, type, status and revision, each section with its version as <!-- version: n -->, the stories with their criteria, the tasks, the phases and the open questions. The current revision, or an older one by number, which is read-only. One call returns at most ${SPEC_PAGE_CHARACTERS} characters and ends with the range read as JSON: offset, end, size, truncated and next.`,
  spec_write: `Write the current draft of the Spec this Session defines, and only while this Session holds its write right. Exactly one of: a section, with its whole body and the version you read it at; every story; every task; a question for the user; the title; or the type. A section that changed since the version you send, a Spec that is not a draft, an older revision, and a Session that does not hold the write right are refused, and nothing is written. Send a key so that a retry after a lost answer does not write twice. ${QUESTION_RULE}`,
  spec_propose:
    "Hand the Spec this Session defines over to Hemera's checks. phase_done declares a phase finished with a summary, the elements of the Spec that support it and the assumptions still open: Hemera runs the phase's exit checks, and either finishes it and opens the phases that wait on it, or answers what fails and changes nothing. ready attests the contract is complete and executable: the user's Mark ready is what freezes it, never this call. Both only while this Session holds the write right. spec is for a free Session, which defines no Spec yet: it proposes one, a title and a type, and the user creates it or not; in a Session started by New Spec the user asked for it already, and Hemera creates it at once. existing is for a free Session too: when the Project already has the Spec the user asks for, it points to that one by its key, as project_get lists it, and the user continues it or not. Send a key so that a retry after a lost answer is answered once.",
  build_read: `Read the frozen Spec this build executes, with the label of each task, and where the build stands: each task's state, its attempts, their files changed and their checks' verdicts. Name a task, T2, to read it alone. One call returns at most ${SPEC_PAGE_CHARACTERS} characters and ends with the range read as JSON: offset, end, size, truncated and next.`,
  task_finished:
    "Say you finished a task, by its label. This is not a verdict: Hemera runs the Project's checks on it and decides whether it is done; a red check comes back to you with its failures.",
  task_blocked:
    'Say a task contradicts the frozen Spec, by its label, with the reason. The task and the tasks that depend on it are suspended until the user decides; the others go on. Never for a task that is merely hard.',
}

/**
 * The limit each tool is held to, in one line, as the Context view lists it (design D6-10).
 *
 * The same numbers the descriptions give the agent, said for the reader: a tool offered with a
 * limit is a different promise from a tool offered, which is why the limit is on the line.
 */
export const TOOL_BOUNDS: Record<ToolName, string> = {
  fs_read: `${READ_PAGE_BYTES / 1024} KiB a page, inside the Workspace root`,
  fs_edit: 'one unique match, inside the Workspace root',
  fs_write: 'the whole file, inside the Workspace root',
  fs_list: 'one level, inside the Workspace root',
  search: `${SEARCH_MATCH_LIMIT} matches and ${SEARCH_SCAN_BYTES / 1024 / 1024} MiB scanned a call`,
  commands_list: "the Project's catalogue, and this Session's last runs",
  commands_run: 'the catalogue, or a one-off line the user allows',
  commands_output: `the last ${OUTPUT_KEPT_BYTES / 1024} KiB a run printed`,
  commands_stop: 'a run of this Project, and all it started',
  commands_propose: 'a proposal a human decides; nothing written to the catalogue',
  project_get: 'this Project and the list of its Specs',
  setup_read: "this Project's setup; variables by name, never their values",
  setup_propose: `at most ${CHANGES_PER_CALL} changes a call, each a card the user decides; nothing applied by the call`,
  session_get: `this Session and its last ${THREAD_TAIL} entries`,
  spec_read: `this Session's Spec, ${SPEC_PAGE_CHARACTERS / 1024} K characters a page`,
  spec_write: "one write of this Session's draft, on its current version",
  spec_propose:
    'a phase declared finished, the contract attested, or a Spec proposed or pointed to; never marked ready',
  build_read: `this Session's build, ${SPEC_PAGE_CHARACTERS / 1024} K characters a page`,
  task_finished: "a signal Hemera answers with the Project's checks; never a task's state",
  task_blocked: 'a blocker the user decides; never a change to the Spec',
}

/** What one reading of the arguments answered. */
export type ArgumentsDecision =
  | { readonly ok: true; readonly call: ParsedCall }
  | { readonly ok: false; readonly reason: string }

/** Reads what arrived against the schema of one tool. */
function read<A>(
  schema: z.ZodType<A>,
  raw: ToolArguments,
): { readonly ok: true; readonly value: A } | { readonly ok: false; readonly reason: string } {
  const parsed = schema.safeParse(raw)
  if (parsed.success) return { ok: true, value: parsed.data }
  return {
    ok: false,
    reason: parsed.error.issues
      .map((issue) => `${issue.path.join('.') || 'the arguments'}: ${issue.message}`)
      .join('; '),
  }
}

/** The value when it read, and the sentence to answer with when it did not. */
function decide<T extends ToolName, A>(
  tool: T,
  reading:
    | { readonly ok: true; readonly value: A }
    | { readonly ok: false; readonly reason: string },
): ArgumentsDecision {
  if (!reading.ok) return { ok: false, reason: reading.reason }
  // SAFETY: `reading` is the result of the schema this very switch names for `tool`, and the
  // union below lists exactly the pairs the switch can produce: the tool and its arguments are
  // read from the same schema, in the same call, one line above.
  return { ok: true, call: { tool, arguments: reading.value } as ParsedCall }
}

/**
 * The arguments of a call, read once.
 *
 * Every tool goes through here, so a call whose arguments do not read never reaches a tool: the
 * first thing a tool does is trust its own fields, and that trust is bought exactly here.
 */
export function parseCall(tool: ToolName, raw: ToolArguments): ArgumentsDecision {
  switch (tool) {
    case 'fs_read':
      return decide(tool, read(TOOL_ARGUMENTS['fs_read'], raw))
    case 'fs_edit':
      return decide(tool, read(TOOL_ARGUMENTS['fs_edit'], raw))
    case 'fs_write':
      return decide(tool, read(TOOL_ARGUMENTS['fs_write'], raw))
    case 'fs_list':
      return decide(tool, read(TOOL_ARGUMENTS['fs_list'], raw))
    case 'search':
      return decide(tool, read(TOOL_ARGUMENTS.search, raw))
    case 'commands_list':
      return decide(tool, read(TOOL_ARGUMENTS['commands_list'], raw))
    case 'commands_run':
      return decide(tool, read(TOOL_ARGUMENTS['commands_run'], raw))
    case 'commands_output':
      return decide(tool, read(TOOL_ARGUMENTS['commands_output'], raw))
    case 'commands_stop':
      return decide(tool, read(TOOL_ARGUMENTS['commands_stop'], raw))
    case 'commands_propose':
      return decide(tool, read(TOOL_ARGUMENTS['commands_propose'], raw))
    case 'project_get':
      return decide(tool, read(TOOL_ARGUMENTS['project_get'], raw))
    case 'setup_read':
      return decide(tool, read(TOOL_ARGUMENTS['setup_read'], raw))
    case 'setup_propose':
      return decide(tool, read(TOOL_ARGUMENTS['setup_propose'], raw))
    case 'session_get':
      return decide(tool, read(TOOL_ARGUMENTS['session_get'], raw))
    case 'spec_read':
      return decide(tool, read(TOOL_ARGUMENTS['spec_read'], raw))
    case 'spec_write':
      return decide(tool, read(TOOL_ARGUMENTS['spec_write'], raw))
    case 'spec_propose':
      return decide(tool, read(TOOL_ARGUMENTS['spec_propose'], raw))
    case 'build_read':
      return decide(tool, read(TOOL_ARGUMENTS['build_read'], raw))
    case 'task_finished':
      return decide(tool, read(TOOL_ARGUMENTS['task_finished'], raw))
    case 'task_blocked':
      return decide(tool, read(TOOL_ARGUMENTS['task_blocked'], raw))
  }
}

/**
 * What an MCP client sent, as the flat arguments a tool is read from.
 *
 * The one place where what arrived is trusted: a value the agent sent that is not a string, a
 * number, a boolean or null is dropped, and a schema that then wants it says so. Nothing here
 * decides anything — it is the shape, and the reading is `parseCall`'s.
 */
export function flatArguments(
  entries: readonly (readonly [string, string | number | boolean | null | undefined])[],
) {
  return Object.fromEntries(carried(entries))
}

/** The entries that carry a value, which are the ones a tool can be read from. */
function carried(
  entries: readonly (readonly [string, string | number | boolean | null | undefined])[],
): readonly (readonly [string, string | number | boolean | null])[] {
  return entries.filter(
    (pair): pair is readonly [string, string | number | boolean | null] => pair[1] !== undefined,
  )
}
