/**
 * The app tester's findings on files (#300): one file a finding, the same problem reported again
 * as one more occurrence of it, the index written again after every change, everything masked,
 * and two reports at once never losing one.
 */

import { mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import {
  type FindingContext,
  type ReportedFinding,
  newFinding,
  writeFindingFile,
} from '@hemera/core'
import { Effect } from 'effect'
import { afterEach, beforeEach, describe, expect, test } from 'vite-plus/test'

import { TesterFindings, readFindingFile, testerFindingsLayer } from '#engine/tester/findings.ts'

let folder: string

beforeEach(() => {
  folder = join(tmpdir(), `hemera-tester-${String(Date.now())}-${String(Math.random())}`)
  mkdirSync(folder, { recursive: true })
})

afterEach(() => {
  rmSync(folder, { recursive: true, force: true })
})

const REDIRECT: ReportedFinding = {
  title: 'commands_run cannot redirect output with >',
  kind: 'missing_capability',
  place: 'commands_run',
  severity: 'hurts',
  trying: 'Keep the output of the tests in a file.',
  happened: 'The `>` reached pnpm as an argument.',
  expected: 'A redirection, or a sentence saying there is no shell.',
  steps: 'Run `pnpm test > out.txt` through commands_run.',
  files: ['package.json'],
  callId: 'toolu_01',
  error: 'ERR_PNPM_NO_SCRIPT Missing script: >',
  code: '1',
}

const CALL = {
  tool: 'commands_run',
  id: 'toolu_01',
  state: 'failed',
  summary: 'exited with 1',
  arguments: '{"line":"pnpm test > out.txt"}',
  ms: 812,
  seq: 41,
}

const CONTEXT: FindingContext = {
  at: '2026-09-30T16:32:08.000+02:00',
  hemera: {
    version: '0.5.0-dev.3-g1a2b3c4',
    channel: 'dev',
    commit: '1a2b3c4',
    os: 'Linux 7.2.3',
    platform: 'linux-x64',
  },
  agent: { name: 'claude-code', version: '0.79.0', model: 'opus', effort: null, mode: 'default' },
  auto: 'hemera-auto',
  project: { id: 'p-atlas', name: 'Atlas' },
  workspace: { name: 'main', path: '/home/someone/atlas' },
  session: { id: 's-parser', title: 'Fix the parser', mission: 'free' },
  build: null,
  call: CALL,
  entries: { from: 36, to: 44 },
}

/** Runs a program against the findings of the test's data folder. */
function withFindings<A, E>(program: Effect.Effect<A, E, TesterFindings>, told = () => undefined) {
  return Effect.runPromise(
    program.pipe(
      Effect.provide(
        testerFindingsLayer({ directory: folder, version: '0.5.0', channel: 'dev' }, told),
      ),
    ),
  )
}

const report = (reported: ReportedFinding, context = CONTEXT, secrets: readonly string[] = []) =>
  Effect.gen(function* () {
    return yield* (yield* TesterFindings).report(reported, context, secrets)
  })

const findingsFolder = () => join(folder, 'tester', 'findings')

describe('A report becomes a file of its own', () => {
  test('the first report of a problem is new #1, in tester/findings', async () => {
    const answer = await withFindings(report(REDIRECT))
    expect(answer).toEqual({
      number: 1,
      added: false,
      occurrences: 1,
      file: '0001-commands-run-cannot-redirect-output-with.md',
      title: REDIRECT.title,
    })
    const written = readFileSync(join(findingsFolder(), answer.file), 'utf8')
    expect(written.startsWith('---\nnumber: 1\n')).toBe(true)
    expect(readFindingFile(written)?.head.projectId).toBe('p-atlas')
  })

  test('its file reads back as it was written', () => {
    const { head, body } = newFinding(7, REDIRECT, CONTEXT)
    expect(readFindingFile(writeFindingFile(head, body))).toEqual({ head, body })
  })

  test('a file that is not a finding reads as nothing', () => {
    expect(readFindingFile('# notes\n')).toBeNull()
    expect(readFindingFile('---\nnumber: seven\n---\n')).toBeNull()
  })
})

describe('The same problem reported again is one more occurrence', () => {
  test('same kind, same place, a similar title: added to #1, not a second file', async () => {
    const told: string[] = []
    const answers = await withFindings(
      Effect.gen(function* () {
        const first = yield* report(REDIRECT)
        const again = yield* report(
          { ...REDIRECT, title: "commands_run can't redirect output to a file" },
          {
            ...CONTEXT,
            at: '2026-09-30T17:00:00.000+02:00',
            session: { id: 's-deploy', title: 'Deploy', mission: 'build' },
          },
        )
        return [first, again]
      }),
      () => void told.push('changed'),
    )
    expect(answers[1]).toMatchObject({ number: 1, added: true, occurrences: 2 })
    expect(readdirSync(findingsFolder())).toEqual([answers[0]?.file])
    const read = readFindingFile(
      readFileSync(join(findingsFolder(), answers[0]?.file ?? ''), 'utf8'),
    )
    expect(read?.head).toMatchObject({
      occurrences: 2,
      lastSeen: '2026-09-30T17:00:00.000+02:00',
      sessions: ['s-parser', 's-deploy'],
    })
    expect(read?.body).toContain('### Occurrence 2')
    // The window is told after each write.
    expect(told).toEqual(['changed', 'changed'])
  })

  test('another place is new #2', async () => {
    const answer = await withFindings(
      Effect.gen(function* () {
        yield* report(REDIRECT)
        return yield* report({ ...REDIRECT, place: 'commands_output' })
      }),
    )
    expect(answer).toMatchObject({ number: 2, added: false })
    expect(readdirSync(findingsFolder())).toHaveLength(2)
  })

  test('two reports at once are two occurrences of one finding', async () => {
    const answers = await withFindings(
      Effect.all([report(REDIRECT), report(REDIRECT), report(REDIRECT)], {
        concurrency: 'unbounded',
      }),
    )
    expect(answers.map((one) => one.occurrences).toSorted()).toEqual([1, 2, 3])
    expect(readdirSync(findingsFolder())).toHaveLength(1)
  })

  test('a number is never taken again, even from a file that no longer reads', async () => {
    mkdirSync(findingsFolder(), { recursive: true })
    writeFileSync(join(findingsFolder(), '0004-broken.md'), 'no front matter')
    const answer = await withFindings(report(REDIRECT))
    expect(answer.number).toBe(5)
  })
})

describe('The index lists them all', () => {
  test('tester/README.md is written again after every change', async () => {
    await withFindings(
      Effect.gen(function* () {
        yield* report(REDIRECT)
        yield* report({
          ...REDIRECT,
          title: 'fs_read drops the last line',
          kind: 'hemera_bug',
          place: 'fs_read',
          severity: 'blocks',
        })
      }),
    )
    const index = readFileSync(join(folder, 'tester', 'README.md'), 'utf8')
    expect(index).toContain('2 findings · 2 occurrences')
    expect(index).toContain('[#2](findings/0002-fs-read-drops-the-last-line.md)')
    expect(index.indexOf('## Hemera bug')).toBeLessThan(index.indexOf('## Missing capability'))
  })

  test('the list reads the folder, the latest seen first', async () => {
    const listed = await withFindings(
      Effect.gen(function* () {
        yield* report(REDIRECT)
        yield* report(
          { ...REDIRECT, title: 'The notice never came', kind: 'interface', place: 'notices' },
          { ...CONTEXT, at: '2026-09-30T18:00:00.000+02:00' },
        )
        return yield* (yield* TesterFindings).list
      }),
    )
    expect(listed.map((one) => one.head.number)).toEqual([2, 1])
  })

  test('an empty folder lists nothing', async () => {
    const listed = await withFindings(
      Effect.gen(function* () {
        return yield* (yield* TesterFindings).list
      }),
    )
    expect(listed).toEqual([])
  })
})

describe('A finding is masked as Hemera Auto masks', () => {
  test('secrets by their shape, the Workspace credentials by their value, credential fields whole', async () => {
    const answer = await withFindings(
      report(
        {
          ...REDIRECT,
          happened: 'The call sent Authorization: Bearer abc.def and the key sk-live1234567890.',
          error: 'fetch failed for https://kris:hunter2@example.com with s3cr3t-value',
          steps: 'Run it with API_TOKEN=s3cr3t-value.',
        },
        {
          ...CONTEXT,
          call: {
            ...CALL,
            arguments: '{"line":"deploy","token":"plain-token","note":"uses s3cr3t-value"}',
          },
        },
        ['s3cr3t-value'],
      ),
    )
    const written = readFileSync(join(findingsFolder(), answer.file), 'utf8')
    for (const secret of [
      'abc.def',
      'sk-live1234567890',
      'hunter2',
      's3cr3t-value',
      'plain-token',
    ]) {
      expect(written).not.toContain(secret)
    }
    expect(written).toContain('[REDACTED]')
    // A destination stays readable: the host of a URL is kept.
    expect(written).toContain('example.com')
  })
})
