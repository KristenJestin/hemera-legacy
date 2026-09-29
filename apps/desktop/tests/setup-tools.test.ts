/**
 * The agent sets the Project up through Hemera's tools, and the human decides (issue #218).
 *
 * The whole engine over the fake provider, as `proposals.test.ts` runs it: the agent calls
 * `setup_read` and `setup_propose` over MCP with its token, through the guard, and the human
 * answers each card through the `SetupProposals` service, which is what the card calls. What is
 * read is what each side reads: the thread, the Project's settings, the Journal and the answer the
 * agent was given. Each suite is named after the scenario it plays: reading, proposing,
 * accepting, declining and refused.
 */

import {
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  realpathSync,
  rmSync,
  writeFileSync,
} from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, test } from 'vite-plus/test'
import { Effect, Layer } from 'effect'

import { type SessionEntry, offeredTools } from '@hemera/core'
import { setupProposalSchema } from '@hemera/ipc'

import { fakeAgent } from '#engine/agents/fake.ts'
import { NoNotices } from '#engine/agents/notices.ts'
import { AgentRuntime } from '#engine/agents/runtime.ts'
import { StderrSink } from '#engine/agents/supervisor.ts'
import { ProposalDecidedError } from '#engine/commands/proposals.ts'
import { Commands } from '#engine/commands/service.ts'
import { contextOf } from '#engine/context/view.ts'
import { Journal } from '#engine/journal.ts'
import { Projects } from '#engine/projects.ts'
import { Sessions } from '#engine/sessions.ts'
import { SetupProposals, SetupRefusedError, setupProposalsLayer } from '#engine/setup/proposals.ts'
import { SqliteClient } from '#engine/storage/database.ts'
import { TOOL_BOUNDS } from '#engine/tools/arguments.ts'
import { Launches } from '#engine/workspaces/launches.ts'
import { hostLinks, preparationLayer } from '#engine/workspaces/preparation.ts'
import { Recipe } from '#engine/workspaces/recipe.ts'
import { Variables } from '#engine/workspaces/variables.ts'
import { Workspaces } from '#engine/workspaces/workspaces.ts'

import { threadOf, toolApplication, until } from './application.ts'
import { repository } from './repositories.ts'

let dataFolder: string
let main: string
/** The engine's diagnostic log, every line of it: where a value would show if one leaked. */
let diagnosed: string[] = []

beforeEach(() => {
  diagnosed = []
  dataFolder = mkdtempSync(join(tmpdir(), 'hemera-setup-'))
  main = realpathSync.native(mkdtempSync(join(tmpdir(), 'hemera-setup-main-')))
  repository(join(main, 'sources', 'api'))
  repository(join(main, 'sources', 'front'))
  writeFileSync(join(main, 'sources', 'api', '.env.example'), 'PORT=3000\n')
  mkdirSync(join(main, 'docs'), { recursive: true })
})

afterEach(() => {
  rmSync(dataFolder, { recursive: true, force: true, maxRetries: 20, retryDelay: 100 })
  rmSync(main, { recursive: true, force: true, maxRetries: 20, retryDelay: 100 })
})

/** The value the agent was given for a variable: never to be read anywhere but the variable. */
const SECRET = 'sk-live-7f3a9c'

/**
 * The launches, left out: a Workspace that becomes ready hands a build over to them, and nothing
 * here asks for one.
 */
const noLaunches = Layer.succeed(Launches, {
  one: () => Effect.die('this suite has no launch to read'),
  request: () => Effect.die('this suite starts no build'),
  retry: () => Effect.die('this suite starts no build'),
  workspaceReady: () => Effect.void,
  forSpec: () => Effect.die('this suite reads no panel'),
  recover: () => Effect.void,
})

/**
 * The human's decisions, as the engine builds them: over the very Workspaces, recipe and values
 * the tools read, and a preparation run for real.
 */
const deciding = setupProposalsLayer.pipe(
  Layer.provide(
    preparationLayer.pipe(
      Layer.provide(
        Layer.mergeAll(
          hostLinks,
          noLaunches,
          Layer.succeed(StderrSink, {
            write: (line: string) =>
              Effect.sync(() => {
                diagnosed.push(line)
              }),
          }),
        ),
      ),
    ),
  ),
  Layer.provide(NoNotices),
)

/** `Atlas` on the suite's `main`, declaring `./sources/api`, and a Session of it. */
const aProjectSession = Effect.gen(function* () {
  const projects = yield* Projects
  const sessions = yield* Sessions
  const created = yield* projects.create({ name: 'Atlas', tone: 'primary', mainPath: main })
  const project = yield* projects.addRepository(created.id, created.version, './sources/api')
  return yield* sessions.create(project.id, 'claude')
})

/** A call to `setup_propose`, as the agent sends it: the changes as one JSON text. */
const proposing = (key: string, changes: readonly Record<string, string | boolean>[]) => ({
  does: 'uses' as const,
  call: 'setup_propose',
  arguments: {
    changes: JSON.stringify(changes),
    why: 'the README says how the Project is run, and you asked me to set it up',
    key,
  },
})

const reading = { does: 'uses' as const, call: 'setup_read', arguments: {} }

/** The setup proposals of a thread, as the card reads them. */
const proposalsIn = (entries: readonly SessionEntry[]) =>
  entries
    .filter((entry) => entry.kind === 'setup_proposal')
    .map((entry) => {
      const proposal = setupProposalSchema.parse(JSON.parse(entry.payload))
      // The entry's own state is what the card draws, and the payload's must agree with it.
      expect(proposal.state).toBe(entry.state)
      return Object.assign(proposal, { body: entry.body })
    })

/**
 * Every file the engine wrote into its data folder but the database itself — the logs, the traces,
 * whatever lands there — as text: the database holds the variable, and nothing else may.
 */
function filesWritten(folder: string): string {
  return readdirSync(folder, { recursive: true, withFileTypes: true })
    .filter((entry) => entry.isFile() && !entry.name.includes('.sqlite'))
    .map((entry) => readFileSync(join(entry.parentPath, entry.name), 'utf8'))
    .join('\n')
}

/** Everything the thread and the Journal hold, as text: where a secret would show if it leaked. */
const everythingWritten = (entries: readonly SessionEntry[], journal: readonly object[]) =>
  JSON.stringify([...entries, ...journal])

describe('The agent reads the Project setup freely', () => {
  test('repositories, commands, recipe, Workspaces and variable names, never a value', async () => {
    const agent = fakeAgent({ steps: [reading] })

    await toolApplication(dataFolder)(agent)(
      Effect.gen(function* () {
        const runtime = yield* AgentRuntime
        const commands = yield* Commands
        const variables = yield* Variables
        const recipe = yield* Recipe
        const session = yield* aProjectSession
        yield* commands.save(
          {
            projectId: session.projectId,
            name: 'api',
            line: 'pnpm dev',
            lineWindows: null,
            lineLinux: null,
            type: 'serve',
            folderBase: './sources/api',
            folder: null,
            scope: 'project',
            portless: true,
            portlessName: 'atlas-api',
            runAtOpen: true,
          },
          false,
        )
        yield* recipe.add(session.projectId, {
          kind: 'copy',
          base: './sources/api',
          path: '.env.example',
          commandId: null,
          line: null,
          lineWindows: null,
          lineLinux: null,
        })
        yield* variables.set(session.projectId, null, 'DATABASE_URL', 'postgres://secret@db')
        yield* runtime.prompt(session.id, 'what is set up?')
      }),
    )

    const answer = agent.answers.used[0]
    expect(answer?.isError).toBe(false)
    const text = answer?.text ?? ''
    expect(text).toContain('./sources/api  included in a new Workspace: yes')
    expect(text).toMatch(/\.\/sources\/api .* on \S+ at \S+/)
    expect(text).toContain(
      'api  serve  in ./sources/api  pnpm dev  (scope project; portless as atlas-api; runs when Hemera opens)',
    )
    expect(text).toContain('1. copies ./.env.example under ./sources/api')
    expect(text).toContain('variables of the Project (names only): DATABASE_URL')
    expect(text).toContain('main  ready')
    // The name, never the value.
    expect(text).not.toContain('postgres://secret@db')
  })
})

describe('Every change is a proposal the user accepts', () => {
  test('nothing changes before the click; one change, then the rest in one press', async () => {
    const agent = fakeAgent({
      steps: [
        proposing('setup-1', [
          { kind: 'repository', path: 'sources/front' },
          {
            kind: 'command',
            name: 'web',
            line: 'pnpm dev',
            type: 'serve',
            repository: './sources/front',
            portless: true,
            runAtOpen: true,
          },
          { kind: 'step', step: 'copy', repository: './sources/api', path: '.env.example' },
          { kind: 'variable', name: 'API_KEY', value: SECRET },
        ]),
      ],
    })

    const seen = await toolApplication(dataFolder, diagnosed)(agent)(
      Effect.gen(function* () {
        const runtime = yield* AgentRuntime
        const projects = yield* Projects
        const commands = yield* Commands
        const recipe = yield* Recipe
        const variables = yield* Variables
        const journal = yield* Journal
        const setup = yield* SetupProposals
        const session = yield* aProjectSession
        const settings = () =>
          Effect.gen(function* () {
            const project = (yield* projects.list()).find((one) => one.id === session.projectId)
            return {
              repositories: project?.repositories ?? [],
              commands: yield* commands.list(session.projectId),
              recipe: yield* recipe.list(session.projectId),
              variables: yield* variables.list(session.projectId, null),
            }
          })

        yield* runtime.prompt(session.id, 'set this Project up')
        const proposed = proposalsIn(yield* threadOf(session.id))
        // What the Context tab lists while the value waits in memory for the click.
        const context = yield* contextOf(session.id)
        const before = yield* settings()
        const first = yield* setup.accept(session.id, proposed[0]?.proposalId ?? '')
        const afterOne = yield* settings()
        const rest = yield* setup.acceptAll(session.id, proposed[0]?.batchId ?? '')
        const after = yield* settings()
        const entries = yield* threadOf(session.id)
        const read = yield* journal.read({ projectId: session.projectId })
        return {
          proposed,
          context,
          before,
          first,
          afterOne,
          rest,
          after,
          entries,
          lines: read.entries,
        }
      }).pipe(Effect.provide(deciding)),
    )

    // The agent is told a human decides, and the four cards wait in the thread, one batch.
    expect(agent.answers.used[0]?.isError).toBe(false)
    expect(agent.answers.used[0]?.text).toContain('nothing is changed yet')
    expect(seen.proposed.map((one) => [one.body, one.state])).toEqual([
      ['Declare the repository ./sources/front', 'pending'],
      ['Add the command web', 'pending'],
      ['Add a preparation step that copies ./.env.example', 'pending'],
      ['Set the variable API_KEY', 'pending'],
    ])
    expect(new Set(seen.proposed.map((one) => one.batchId)).size).toBe(1)
    // Nothing of the setup changed before a click.
    expect(seen.before).toEqual({
      repositories: ['./sources/api'],
      commands: [],
      recipe: [],
      variables: [],
    })
    // One accepted on its own, then the three others in one press.
    expect(seen.first.accepted).toBe(1)
    expect(seen.afterOne.repositories).toEqual(['./sources/api', './sources/front'])
    expect(seen.afterOne.commands).toEqual([])
    expect(seen.rest.accepted).toBe(3)
    expect(
      seen.after.commands.map((one) => [
        one.name,
        one.type,
        one.folderBase,
        one.portless,
        one.runAtOpen,
      ]),
    ).toEqual([['web', 'serve', './sources/front', true, true]])
    expect(seen.after.recipe.map((step) => [step.kind, step.base, step.path])).toEqual([
      ['copy', './sources/api', './.env.example'],
    ])
    expect(seen.after.variables).toEqual([{ key: 'API_KEY', value: SECRET, workspaceId: null }])
    expect(proposalsIn(seen.entries).map((one) => one.state)).toEqual([
      'accepted',
      'accepted',
      'accepted',
      'accepted',
    ])
    // Each is journaled as the agent's proposal and the human's acceptance of it, beside the
    // settings' own event.
    const setupLines = seen.lines
      .filter((line) => line.type.startsWith('setup.'))
      .toSorted((left, right) => left.sequence - right.sequence)
      .map((line) => [line.type, line.author])
    expect(setupLines).toEqual([
      ['setup.proposed', 'agent'],
      ['setup.proposed', 'agent'],
      ['setup.proposed', 'agent'],
      ['setup.proposed', 'agent'],
      ['setup.accepted', 'human'],
      ['setup.accepted', 'human'],
      ['setup.accepted', 'human'],
      ['setup.accepted', 'human'],
    ])
    expect(seen.lines.map((line) => line.type)).toContain('project.repository_added')
    // The value was set, and is shown nowhere: not in the thread, not in the Journal, not in the
    // Context tab, not in the engine's log nor in any file of the data folder but the database.
    expect(everythingWritten(seen.entries, seen.lines)).not.toContain(SECRET)
    expect(JSON.stringify(seen.context)).not.toContain(SECRET)
    expect(diagnosed.join('\n')).not.toContain(SECRET)
    expect(filesWritten(dataFolder)).not.toContain(SECRET)
  })
})

describe('A declined change leaves the setup as it was', () => {
  test('the repository is not declared, and the card is not decided again', async () => {
    const agent = fakeAgent({
      steps: [proposing('setup-1', [{ kind: 'variable', name: 'TOKEN', value: SECRET }])],
    })

    const seen = await toolApplication(dataFolder)(agent)(
      Effect.gen(function* () {
        const runtime = yield* AgentRuntime
        const variables = yield* Variables
        const setup = yield* SetupProposals
        const session = yield* aProjectSession
        yield* runtime.prompt(session.id, 'set the token')
        const proposalId = proposalsIn(yield* threadOf(session.id))[0]?.proposalId ?? ''
        yield* setup.decline(session.id, proposalId)
        const again = yield* Effect.flip(setup.accept(session.id, proposalId))
        return {
          again,
          proposals: proposalsIn(yield* threadOf(session.id)),
          variables: yield* variables.list(session.projectId, null),
        }
      }).pipe(Effect.provide(deciding)),
    )

    expect(seen.proposals.map((one) => one.state)).toEqual(['declined'])
    expect(seen.variables).toEqual([])
    expect(seen.again).toBeInstanceOf(ProposalDecidedError)
  })
})

describe('The engine refuses what the settings refuse, with their reasons', () => {
  test('a path outside the Project and a command under no repository are handed back', async () => {
    const agent = fakeAgent({
      steps: [
        proposing('outside', [{ kind: 'repository', path: '../elsewhere' }]),
        proposing('nowhere', [
          { kind: 'command', name: 'web', line: 'pnpm dev', type: 'serve', repository: 'web' },
        ]),
        proposing('main', [{ kind: 'workspace_cleanup', workspace: 'main' }]),
      ],
    })

    const seen = await toolApplication(dataFolder)(agent)(
      Effect.gen(function* () {
        const runtime = yield* AgentRuntime
        const session = yield* aProjectSession
        yield* runtime.prompt(session.id, 'set it up')
        return proposalsIn(yield* threadOf(session.id))
      }),
    )

    expect(agent.answers.used.map((one) => one.isError)).toEqual([true, true, true])
    expect(agent.answers.used[0]?.text).toBe(
      'change 1 (repository) is refused: the repository location "../elsewhere" is refused: it resolves outside the workspace root',
    )
    expect(agent.answers.used[1]?.text).toBe(
      "change 1 (command) is refused: a command runs under the Workspace root or under one of the Project's repositories, and web is neither",
    )
    expect(agent.answers.used[2]?.text).toBe(
      'change 1 (workspace_cleanup) is refused: main cannot be cleaned up',
    )
    // Nothing of a refused call reaches the thread.
    expect(seen).toEqual([])
  })

  test('a Workspace created and prepared on acceptance is not cleaned up while a build uses it', async () => {
    const agent = fakeAgent({
      turns: [
        [proposing('create', [{ kind: 'workspace_create', name: 'feature-login' }])],
        [proposing('cleanup', [{ kind: 'workspace_cleanup', workspace: 'feature-login' }])],
      ],
    })

    const seen = await toolApplication(dataFolder)(agent)(
      Effect.gen(function* () {
        const runtime = yield* AgentRuntime
        const workspaces = yield* Workspaces
        const setup = yield* SetupProposals
        const sql = yield* SqliteClient
        const session = yield* aProjectSession
        yield* runtime.prompt(session.id, 'make me a Workspace')
        const created = proposalsIn(yield* threadOf(session.id))[0]
        yield* setup.accept(session.id, created?.proposalId ?? '')
        const listed = yield* until(workspaces.list(session.projectId), (all) =>
          all.some((one) => one.name === 'feature-login' && one.state === 'ready'),
        )
        const made = listed.find((one) => one.name === 'feature-login')
        // The build Session a launch writes, still open: the folder is where it works.
        const at = '2026-09-27T08:00:00.000Z'
        yield* sql`INSERT INTO sessions
          (id, project_id, title, title_source, mission, workspace_id, created_at, last_written_at)
          VALUES ('build-1', ${session.projectId}, 'Build it', 'derived', 'build', ${made?.id ?? ''},
            ${at}, ${at})`
        yield* runtime.prompt(session.id, 'clean it up')
        return { made, proposals: proposalsIn(yield* threadOf(session.id)) }
      }).pipe(Effect.provide(deciding)),
    )

    expect(seen.made?.state).toBe('ready')
    expect(seen.made?.repositories.map((one) => one.relativePath)).toEqual(['./sources/api'])
    expect(agent.answers.used.map((one) => one.isError)).toEqual([false, true])
    expect(agent.answers.used[1]?.text).toBe(
      'change 1 (workspace_cleanup) is refused: the build of feature-login is still open',
    )
    expect(seen.proposals.map((one) => [one.body, one.state])).toEqual([
      ['Create and prepare the Workspace feature-login', 'accepted'],
    ])
  })

  test("another Spec's dedicated Workspace is refused to a Session of a Spec", async () => {
    const agent = fakeAgent({
      steps: [
        proposing('other', [{ kind: 'variable', name: 'PORT', value: '4000', workspace: 'hem-7' }]),
      ],
    })

    await toolApplication(dataFolder)(agent)(
      Effect.gen(function* () {
        const runtime = yield* AgentRuntime
        const workspaces = yield* Workspaces
        const sql = yield* SqliteClient
        const session = yield* aProjectSession
        const at = '2026-09-27T08:00:00.000Z'
        for (const key of ['HEM-7', 'HEM-8']) {
          yield* sql`INSERT INTO specs (id, project_id, key, slug, status, current_revision_id, created_at, updated_at)
            VALUES (${key}, ${session.projectId}, ${key}, 'a-spec', 'ready', ${`${key}-r1`}, ${at}, ${at})`
          yield* sql`INSERT INTO spec_revisions (id, spec_id, number, title, type, created_by, created_at)
            VALUES (${`${key}-r1`}, ${key}, 1, 'A Spec', 'feature', 'human', ${at})`
        }
        // A Workspace made for HEM-7, and this Session working for HEM-8.
        const folder = join(dataFolder, 'hem-7')
        mkdirSync(folder, { recursive: true })
        const made = yield* workspaces.createOnFolder(session.projectId, folder, 'hem-7')
        yield* sql`UPDATE workspaces SET spec_id = 'HEM-7' WHERE id = ${made.id}`
        yield* sql`UPDATE sessions SET spec_id = 'HEM-8' WHERE id = ${session.id}`
        yield* runtime.prompt(session.id, 'give it a port')
      }),
    )

    expect(agent.answers.used[0]?.isError).toBe(true)
    expect(agent.answers.used[0]?.text).toBe(
      'change 1 (variable) is refused: the Workspace hem-7 was made for HEM-7: a Spec is built in a Workspace of its own',
    )
  })

  test('a change the use case refuses at the click stays pending, with its reason', async () => {
    const agent = fakeAgent({
      steps: [proposing('step', [{ kind: 'step', step: 'copy', path: 'docs' }])],
    })

    const seen = await toolApplication(dataFolder)(agent)(
      Effect.gen(function* () {
        const runtime = yield* AgentRuntime
        const setup = yield* SetupProposals
        const session = yield* aProjectSession
        yield* runtime.prompt(session.id, 'copy the docs')
        const proposalId = proposalsIn(yield* threadOf(session.id))[0]?.proposalId ?? ''
        // The folder is gone before the user answers: the recipe refuses it, as the settings do.
        rmSync(join(main, 'docs'), { recursive: true })
        const refused = yield* Effect.flip(setup.accept(session.id, proposalId))
        return { refused, proposals: proposalsIn(yield* threadOf(session.id)) }
      }).pipe(Effect.provide(deciding)),
    )

    expect(seen.refused).toBeInstanceOf(SetupRefusedError)
    expect(seen.refused.message).toBe(
      `${join(main, 'docs')} does not exist in main: a copy needs its source`,
    )
    expect(seen.proposals.map((one) => one.state)).toEqual(['pending'])
  })

  test('a call refused for a change of a kind it does not know still hides its value', async () => {
    const agent = fakeAgent({
      steps: [proposing('secret', [{ kind: 'secret', name: 'API_KEY', value: SECRET }])],
    })

    const seen = await toolApplication(dataFolder)(agent)(
      Effect.gen(function* () {
        const runtime = yield* AgentRuntime
        const journal = yield* Journal
        const session = yield* aProjectSession
        yield* runtime.prompt(session.id, 'set the key')
        const read = yield* journal.read({ projectId: session.projectId })
        return { entries: yield* threadOf(session.id), lines: read.entries }
      }),
    )

    expect(agent.answers.used[0]?.isError).toBe(true)
    // Written like any refused call: Hemera's entry of it, and the agent's report of it.
    expect(seen.entries.map((entry) => entry.kind)).toEqual(
      expect.arrayContaining(['hemera_tool_call', 'tool_call']),
    )
    expect(everythingWritten(seen.entries, seen.lines)).not.toContain(SECRET)
  })
})

describe('Accept all stops at the first refusal', () => {
  test('what comes before is accepted, the refused change and what follows stay pending', async () => {
    const agent = fakeAgent({
      steps: [
        proposing('batch', [
          { kind: 'repository', path: 'sources/front' },
          { kind: 'step', step: 'copy', path: 'docs' },
          { kind: 'variable', name: 'API_KEY', value: SECRET },
        ]),
      ],
    })

    const seen = await toolApplication(dataFolder)(agent)(
      Effect.gen(function* () {
        const runtime = yield* AgentRuntime
        const projects = yield* Projects
        const recipe = yield* Recipe
        const variables = yield* Variables
        const setup = yield* SetupProposals
        const session = yield* aProjectSession
        yield* runtime.prompt(session.id, 'set it up')
        const batchId = proposalsIn(yield* threadOf(session.id))[0]?.batchId ?? ''
        // The second change's source is gone before the user presses Accept all.
        rmSync(join(main, 'docs'), { recursive: true })
        const refused = yield* Effect.flip(setup.acceptAll(session.id, batchId))
        const project = (yield* projects.list()).find((one) => one.id === session.projectId)
        return {
          refused,
          proposals: proposalsIn(yield* threadOf(session.id)),
          repositories: project?.repositories ?? [],
          recipe: yield* recipe.list(session.projectId),
          variables: yield* variables.list(session.projectId, null),
        }
      }).pipe(Effect.provide(deciding)),
    )

    expect(seen.refused).toBeInstanceOf(SetupRefusedError)
    expect(seen.proposals.map((one) => one.state)).toEqual(['accepted', 'pending', 'pending'])
    expect(seen.repositories).toEqual(['./sources/api', './sources/front'])
    expect(seen.recipe).toEqual([])
    expect(seen.variables).toEqual([])
  })
})

describe('The Context tab lists the setup tools lent', () => {
  test('a free Session is lent both, each with its bound', async () => {
    const agent = fakeAgent({ steps: [] })

    const seen = await toolApplication(dataFolder)(agent)(
      Effect.gen(function* () {
        const session = yield* aProjectSession
        return yield* contextOf(session.id)
      }),
    )

    expect(offeredTools('free')).toEqual(expect.arrayContaining(['setup_read', 'setup_propose']))
    expect(seen.tools.filter((tool) => tool.name.startsWith('setup_'))).toEqual([
      { name: 'setup_read', bound: TOOL_BOUNDS.setup_read },
      { name: 'setup_propose', bound: TOOL_BOUNDS.setup_propose },
    ])
  })
})
