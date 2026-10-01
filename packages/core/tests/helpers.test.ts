/**
 * Helper agents as data (issue #77): the defined helpers, written one file each against one schema,
 * its brief and how its answer is read.
 */

import { existsSync } from 'node:fs'
import { join } from 'node:path'

import { z } from 'zod'
import { describe, expect, test } from 'vite-plus/test'

import {
  HELPERS,
  HELPER_MISSION_BRIEF,
  TOOL_NAMES,
  composeHelperBrief,
  helperDefinition,
  helperNamed,
  helperResult,
  helpersAtOnce,
  helpersFor,
} from '#index.ts'
import type { BriefTask } from '#index.ts'

const FOLDER = join(import.meta.dirname, '..', 'src', 'protocols', 'helpers')

/** A definition as a file writes it, before the schema reads it. */
const aDefinition = (more: Record<string, string | boolean | readonly string[]> = {}) => ({
  id: 'review-tests',
  name: 'Test review',
  description: 'Reviews tests.',
  missions: ['build'],
  receives: { role: 'You review tests.', inputs: ['task'] },
  tools: ['fs_read'],
  writes: false,
  returns: z.object({ verdict: z.string() }),
  ...more,
})

const T2: BriefTask = {
  label: 'T2',
  title: 'Write the reader',
  result: 'The reader reads',
  criteria: 'Its tests pass',
  type: 'code',
  executor: 'agent',
  state: 'in_progress',
  dependsOn: [],
  covers: [],
  attempts: [],
  snapshots: [],
  reason: null,
}

describe('Defined helpers are data, one file each, validated by one schema', () => {
  test('Hemera ships Test review, Security review, Documenter and Prototyper', () => {
    expect(HELPERS.map((definition) => definition.name)).toEqual([
      'Test review',
      'Security review',
      'Documenter',
      'Prototyper',
    ])
    expect(new Set(HELPERS.map((definition) => definition.id)).size).toBe(HELPERS.length)
  })

  test('each lives in a file of its own, named after its id', () => {
    for (const definition of HELPERS) {
      expect(existsSync(join(FOLDER, `${definition.id}.ts`))).toBe(true)
    }
  })

  test('each parses, its tools are Hemera’s, and its result is an object', () => {
    for (const definition of HELPERS) {
      expect(helperDefinition.safeParse(definition).success).toBe(true)
      for (const tool of definition.tools) expect(TOOL_NAMES).toContain(tool)
      expect(definition.returns).toBeInstanceOf(z.ZodObject)
      expect(definition.description.trim()).not.toBe('')
      expect(definition.receives.role.trim()).not.toBe('')
    }
  })

  test('the reviewers are read-only, the documenter and the prototyper write', () => {
    for (const id of ['review-tests', 'review-security']) {
      const reviewer = helperNamed(id)
      expect(reviewer?.writes).toBe(false)
      expect(reviewer?.tools).not.toContain('fs_write')
      expect(reviewer?.tools).not.toContain('fs_edit')
    }
    expect(helperNamed('documenter')?.writes).toBe(true)
    expect(helperNamed('prototyper')?.missions).toEqual(['define'])
    expect(helperNamed('nobody')).toBeNull()
  })

  test('the schema refuses a read-only helper that writes, and a tool Hemera does not have', () => {
    expect(helperDefinition.safeParse(aDefinition()).success).toBe(true)
    expect(helperDefinition.safeParse(aDefinition({ tools: ['fs_write'] })).success).toBe(false)
    expect(helperDefinition.safeParse(aDefinition({ tools: ['rm_rf'] })).success).toBe(false)
    expect(
      helperDefinition.safeParse(aDefinition({ missions: ['define'], tools: ['task_finished'] }))
        .success,
    ).toBe(false)
    expect(helperDefinition.safeParse({ ...aDefinition(), returns: z.string() }).success).toBe(
      false,
    )
  })

  test('the main agent of a build reads the helpers it may launch, the prototyper not among them', () => {
    const listed = helpersFor('build')
    expect(listed).toContain('review-tests (Test review)')
    expect(listed).toContain('documenter (Documenter)')
    expect(listed).not.toContain('prototyper')
  })
})

describe('A helper is briefed for one piece of work', () => {
  test('a free helper reads the helper mission, its launcher’s brief and what to return', () => {
    const brief = composeHelperBrief({
      definition: null,
      brief: 'Rename exportRows to exportJournal everywhere.',
      depth: 1,
      task: null,
      spec: '# ATL-7',
    })
    expect(brief.startsWith(HELPER_MISSION_BRIEF)).toBe(true)
    expect(brief).toContain('# Your brief\n\nRename exportRows to exportJournal everywhere.')
    expect(brief).toContain('# What you return')
    expect(brief).toContain('# Your own helpers')
    // A free helper tied to no task is not handed the Spec.
    expect(brief).not.toContain('# ATL-7')
  })

  test('a defined helper on a task reads its role, its task, the Spec and the shape it returns', () => {
    const brief = composeHelperBrief({
      definition: helperNamed('review-tests'),
      brief: 'Review T2.',
      depth: 2,
      task: T2,
      spec: '# ATL-7 · Export',
    })
    expect(brief).toContain('# Your role: Test review')
    expect(brief).toContain('## T2 · Write the reader')
    expect(brief).toContain('task_finished({ task: "T2" })')
    expect(brief).toContain('# The Spec\n\n# ATL-7 · Export')
    expect(brief).toContain('"verdict"')
    expect(brief).not.toContain('# Your own helpers')
  })
})

describe('A helper’s answer is read against what it returns', () => {
  test('a free helper’s answer is its result as it said it', () => {
    expect(helperResult(null, '  Renamed in 4 files.  ')).toEqual({
      matched: true,
      text: 'Renamed in 4 files.',
    })
  })

  test('a defined helper’s JSON block that matches is its result', () => {
    const answer = 'Done.\n```json\n{ "verdict": "pass", "findings": [] }\n```'
    const read = helperResult(helperNamed('review-tests'), answer)
    expect(read.matched).toBe(true)
    expect(JSON.parse(read.text)).toEqual({ verdict: 'pass', findings: [] })
  })

  test('an answer that does not match says why, and keeps what was said', () => {
    const read = helperResult(helperNamed('review-tests'), '{ "verdict": "maybe" }')
    expect(read).toMatchObject({ matched: false, text: '{ "verdict": "maybe" }' })
    expect(read.matched ? '' : read.reason).toContain('verdict')
    expect(helperResult(helperNamed('documenter'), 'I wrote the README.')).toMatchObject({
      matched: false,
      reason: 'its answer holds no JSON object',
    })
  })
})

describe('A Project lets from one to six helpers run at once', () => {
  test('three until the user changes it, and nothing outside one to six', () => {
    expect(helpersAtOnce(3)).toBe(3)
    expect(helpersAtOnce(1)).toBe(1)
    expect(helpersAtOnce(6)).toBe(6)
    for (const refused of [0, 7, 2.5]) expect(() => helpersAtOnce(refused)).toThrow(/1 to 6/)
  })
})
