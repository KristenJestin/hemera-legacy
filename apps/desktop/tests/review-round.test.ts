/**
 * A review round of a build (issue #278): what it freezes of each repository when it opens, what it
 * refuses the build's agent while it is open, when it goes stale, and the feedback the user leaves
 * on it.
 *
 * Each suite is named after the scenario of the issue it covers, over the whole engine on the fake
 * agent and the machine's own `git`. Every repository is made for the suite under the temporary
 * directory, and removed after it.
 */

import { mkdtempSync, realpathSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { Effect } from 'effect'
import { afterEach, beforeEach, describe, expect, test } from 'vite-plus/test'

import { ReviewRounds } from '#engine/review/round.ts'
import { SqliteClient } from '#engine/storage/database.ts'

import {
  aReadySpec,
  buildAgent,
  buildOf,
  eventually,
  journalOf,
  launched,
} from './build-harness.ts'
import { git } from './repositories.ts'
import { type OpenWindow, openWindow } from './window.ts'

let dataFolder: string
let opened: OpenWindow | undefined

beforeEach(() => {
  dataFolder = realpathSync.native(mkdtempSync(join(tmpdir(), 'hemera-review-round-')))
})

afterEach(async () => {
  await opened?.close()
  opened = undefined
  rmSync(dataFolder, { recursive: true, force: true })
})

/** An agent that answers `prepare` and then does nothing with what it is handed. */
const idleAgent = () => buildAgent({ execute: () => [] }).agent

/**
 * A build of a Spec over two repositories, `sources/api` and `sources/front`, whose results the
 * suite writes by hand: `README.md` committed then changed in the first, `README.md` new and
 * untracked in the second.
 */
const aBuildWithTwoReadmes = Effect.gen(function* () {
  const spec = yield* aReadySpec(
    dataFolder,
    [{ title: 'Write the exporter' }],
    ['Export'],
    ['sources/api', 'sources/front'],
  )
  const api = join(spec.main, 'sources', 'api')
  const front = join(spec.main, 'sources', 'front')
  writeFileSync(join(api, 'README.md'), '# API\n')
  git(api, 'add', 'README.md')
  git(api, 'commit', '-q', '-m', 'readme')
  const sessionId = yield* launched(spec.specId, spec.workspaceId)
  writeFileSync(join(api, 'README.md'), '# API\n\nExports the journal.\n')
  writeFileSync(join(front, 'README.md'), '# Front\n')
  return { ...spec, sessionId, api, front }
})

describe('A round freezes each repository when it opens', () => {
  test('two repositories with a README.md each are two rows, and the untracked one says so', async () => {
    opened = await openWindow(dataFolder, idleAgent())
    const seen = await opened.running(
      Effect.gen(function* () {
        const build = yield* aBuildWithTwoReadmes
        const rounds = yield* ReviewRounds
        const round = yield* rounds.open(build.sessionId)
        return { build, round, view: yield* buildOf(build.sessionId) }
      }),
    )
    const { build, round } = seen
    expect(round.number).toBe(1)
    // A review of the Spec: nothing opens a review of the code yet.
    expect(round.kind).toBe('spec')
    expect(round.state).toBe('open')
    expect(round.stale).toBe(false)
    const [api, front] = round.repositories
    expect(api?.repository).toBe('sources/api')
    expect(api?.head).toBe(git(build.api, 'rev-parse', 'HEAD'))
    // The base is where the repository was when nothing of the build's was in it: no worktree was
    // made in `main`, so it is its `HEAD`, and the tree holds the change that was not committed.
    expect(api?.baseCommit).toBe(api?.head)
    expect(git(build.api, 'show', `${api?.tree ?? ''}:README.md`)).toBe(
      '# API\n\nExports the journal.',
    )
    expect(api?.files).toEqual([
      { path: 'README.md', status: 'M', added: 2, removed: 0, untracked: false },
    ])
    expect(front?.repository).toBe('sources/front')
    expect(front?.files).toEqual([
      { path: 'README.md', status: 'A', added: 1, removed: 0, untracked: true },
    ])
    expect(api?.staleAt).toBeNull()
    expect(front?.staleAt).toBeNull()
    // The build view carries the round as the IPC read does.
    expect(seen.view.rounds).toEqual([round])
    const read = await opened.bridge.invoke('review.read', { sessionId: build.sessionId })
    expect(read).toEqual([round])
  })

  test('a second round is refused while one is open, and numbered after it once closed', async () => {
    opened = await openWindow(dataFolder, idleAgent())
    const seen = await opened.running(
      Effect.gen(function* () {
        const build = yield* aBuildWithTwoReadmes
        const rounds = yield* ReviewRounds
        yield* rounds.open(build.sessionId)
        const twice = yield* Effect.flip(rounds.open(build.sessionId))
        const fixing = yield* rounds.move(build.sessionId, 'fixing')
        const closed = yield* rounds.move(build.sessionId, 'closed')
        const next = yield* rounds.open(build.sessionId)
        return { twice, fixing, closed, next, journal: yield* journalOf(build.sessionId) }
      }),
    )
    expect(seen.twice.message).toMatch(/already open/)
    expect(seen.fixing.state).toBe('fixing')
    expect(seen.closed.state).toBe('closed')
    expect(seen.closed.closedAt).not.toBeNull()
    expect(seen.next.number).toBe(2)
    expect(
      seen.journal.map((line) => line.type).filter((type) => type.startsWith('review.')),
    ).toEqual([
      'review.round_opened',
      'review.round_moved',
      'review.round_moved',
      'review.round_opened',
    ])
  })
})

describe('An open round refuses the agent its writes', () => {
  test('a write and a command are refused with the reason, and a read goes through', async () => {
    let deliveries = 0
    let release: () => void = () => undefined
    const gate = new Promise<void>((resolve) => {
      release = resolve
    })
    const { agent } = buildAgent(
      {
        execute: () => [
          {
            does: 'uses',
            call: 'fs_write',
            arguments: { path: 'sources/api/late.ts', content: 'x', key: 'late' },
          },
          { does: 'uses', call: 'commands_run', arguments: { line: 'echo hi', key: 'echo' } },
          { does: 'uses', call: 'fs_read', arguments: { path: 'sources/api/README.md' } },
        ],
      },
      {
        // `prepare` is answered at once; the tasks wait for the round to be open.
        holdsDelivery: async () => {
          deliveries += 1
          if (deliveries >= 2) await gate
        },
      },
    )
    opened = await openWindow(dataFolder, agent)
    const build = await opened.running(
      Effect.gen(function* () {
        const made = yield* aBuildWithTwoReadmes
        yield* eventually(buildOf(made.sessionId), (view) => view.phase === 'execute')
        yield* (yield* ReviewRounds).open(made.sessionId)
        return made
      }),
    )
    release()
    await opened.running(
      eventually(
        Effect.sync(() => agent.answers.used.length),
        (count) => count >= 3,
      ),
    )
    const [write, run, read] = agent.answers.used
    expect(write?.isError).toBe(true)
    expect(write?.text).toMatch(/review round/)
    expect(run?.isError).toBe(true)
    expect(run?.text).toMatch(/review round/)
    expect(read?.isError).toBe(false)
    expect(git(build.api, 'status', '--porcelain')).not.toContain('late.ts')
  })
})

describe('A round goes stale when a repository changes outside', () => {
  test('a file touched in one repository marks that one stale, when the view is read', async () => {
    opened = await openWindow(dataFolder, idleAgent())
    const seen = await opened.running(
      Effect.gen(function* () {
        const build = yield* aBuildWithTwoReadmes
        const rounds = yield* ReviewRounds
        yield* rounds.open(build.sessionId)
        const untouched = yield* buildOf(build.sessionId)
        writeFileSync(join(build.front, 'README.md'), '# Front, edited in an editor\n')
        const touched = yield* buildOf(build.sessionId)
        const again = yield* buildOf(build.sessionId)
        return { untouched, touched, again, journal: yield* journalOf(build.sessionId) }
      }),
    )
    expect(seen.untouched.rounds[0]?.stale).toBe(false)
    const round = seen.touched.rounds[0]
    expect(round?.stale).toBe(true)
    expect(round?.repositories.map((one) => [one.repository, one.staleAt !== null])).toEqual([
      ['sources/api', false],
      ['sources/front', true],
    ])
    // Not hidden, not fixed: the files are those of the tree the round opened on.
    expect(round?.repositories[1]?.files).toEqual([
      { path: 'README.md', status: 'A', added: 1, removed: 0, untracked: true },
    ])
    expect(seen.again.rounds[0]?.repositories[1]?.staleAt).toBe(round?.repositories[1]?.staleAt)
    expect(seen.journal.filter((line) => line.type === 'review.round_stale')).toHaveLength(1)
  })

  test('the timer marks it while the round is open, and the window hears of it', async () => {
    opened = await openWindow(dataFolder, idleAgent())
    const window = opened
    const sessionId = await window.running(
      Effect.gen(function* () {
        const build = yield* aBuildWithTwoReadmes
        yield* (yield* ReviewRounds).open(build.sessionId)
        writeFileSync(join(build.api, 'extra.ts'), 'export {}\n')
        return build.sessionId
      }),
    )
    const heardBefore = window.built.length
    const marked = await window.running(
      eventually(
        Effect.gen(function* () {
          const sql = yield* SqliteClient
          return yield* sql<{ repository: string; stale_at: string | null }>`
            SELECT repository, stale_at FROM review_round_repositories ORDER BY repository`
        }),
        (rows) => rows.some((row) => row.stale_at !== null),
      ),
    )
    expect(marked.map((row) => [row.repository, row.stale_at !== null])).toEqual([
      ['sources/api', true],
      ['sources/front', false],
    ])
    const heard = await window.running(
      eventually(
        Effect.sync(() => window.built.slice(heardBefore)),
        (since) => since.includes(sessionId),
      ),
    )
    expect(heard).toContain(sessionId)
  })
})

describe('A round stays readable once its Workspace is gone', () => {
  test('its files are read from the database after the repositories are removed', async () => {
    opened = await openWindow(dataFolder, idleAgent())
    const seen = await opened.running(
      Effect.gen(function* () {
        const build = yield* aBuildWithTwoReadmes
        const rounds = yield* ReviewRounds
        const round = yield* rounds.open(build.sessionId)
        yield* rounds.move(build.sessionId, 'closed')
        rmSync(join(build.main, 'sources'), { recursive: true, force: true })
        return { round, after: yield* rounds.read(build.sessionId) }
      }),
    )
    expect(seen.after[0]?.state).toBe('closed')
    expect(seen.after[0]?.stale).toBe(false)
    expect(seen.after[0]?.repositories).toEqual(seen.round.repositories)
  })
})

describe('Feedback only accumulates', () => {
  test('the user adds and withdraws feedback on the open round, and nothing starts', async () => {
    const { agent, handed } = buildAgent({ execute: () => [] })
    opened = await openWindow(dataFolder, agent)
    const window = opened
    const build = await window.running(
      Effect.gen(function* () {
        const made = yield* aBuildWithTwoReadmes
        yield* eventually(buildOf(made.sessionId), (view) => view.phase === 'execute')
        yield* (yield* ReviewRounds).open(made.sessionId)
        return made
      }),
    )
    const deliveredBefore = handed.length
    const storyId = (await window.running(buildOf(build.sessionId))).stories[0]?.id ?? ''
    const product = await window.bridge.invoke('review.addFeedback', {
      sessionId: build.sessionId,
      kind: 'product',
      body: 'The export drops the header row.',
      anchor: { kind: 'spec', storyId, criterion: 0 },
    })
    const asked = await window.bridge.invoke('review.addFeedback', {
      sessionId: build.sessionId,
      kind: 'question',
      body: 'Why a file per day?',
      anchor: null,
    })
    await expect(
      window.bridge.invoke('review.addFeedback', {
        sessionId: build.sessionId,
        kind: 'general',
        body: 'Line 3 is odd.',
        anchor: {
          kind: 'code',
          repository: 'sources/api',
          path: 'README.md',
          lines: { start: 3, end: 3 },
          side: 'new',
        },
      }),
    ).rejects.toThrow(/spec round takes no code anchor/)
    await expect(
      window.bridge.invoke('review.addFeedback', {
        sessionId: build.sessionId,
        kind: 'product',
        body: 'The second criterion fails.',
        anchor: { kind: 'spec', storyId, criterion: 1 },
      }),
    ).rejects.toThrow(/1 criteria/)
    const firstId = asked.feedback[0]?.id ?? ''
    const withdrawn = await window.bridge.invoke('review.withdrawFeedback', {
      sessionId: build.sessionId,
      feedbackId: firstId,
    })
    await expect(
      window.bridge.invoke('review.addFeedback', {
        sessionId: build.sessionId,
        kind: 'general',
        body: '  ',
        anchor: null,
      }),
    ).rejects.toThrow(/empty/)
    await expect(
      window.bridge.invoke('review.withdrawFeedback', {
        sessionId: build.sessionId,
        feedbackId: firstId,
      }),
    ).rejects.toThrow(/already withdrawn/)

    expect(product.feedback.map((one) => [one.kind, one.body, one.anchor])).toEqual([
      ['product', 'The export drops the header row.', { kind: 'spec', storyId, criterion: 0 }],
    ])
    expect(withdrawn.feedback.map((one) => [one.kind, one.withdrawnAt !== null])).toEqual([
      ['product', true],
      ['question', false],
    ])
    expect(handed.length).toBe(deliveredBefore)
    const view = await window.running(buildOf(build.sessionId))
    expect(view.rounds[0]?.state).toBe('open')
    expect(view.rounds[0]?.feedback).toEqual(withdrawn.feedback)
  })

  test('a round being fixed takes no more feedback', async () => {
    opened = await openWindow(dataFolder, idleAgent())
    const window = opened
    const sessionId = await window.running(
      Effect.gen(function* () {
        const build = yield* aBuildWithTwoReadmes
        const rounds = yield* ReviewRounds
        yield* rounds.open(build.sessionId)
        yield* rounds.move(build.sessionId, 'fixing')
        return build.sessionId
      }),
    )
    await expect(
      window.bridge.invoke('review.addFeedback', {
        sessionId,
        kind: 'general',
        body: 'Late.',
        anchor: null,
      }),
    ).rejects.toThrow(/being fixed/)
  })
})
