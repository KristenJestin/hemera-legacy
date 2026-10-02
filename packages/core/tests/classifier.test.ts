import { describe, expect, test } from 'vite-plus/test'

import {
  CLASSIFIER_POLICY_VERSION,
  CLASSIFIER_STRICTNESS_LEVELS,
  classifierVerdictFromScores,
  DEFAULT_CLASSIFIER_STRICTNESS,
  judgedByClassifier,
  localClassifierVerdict,
  type ClassifierStrictness,
} from '#index.ts'

describe('Local rules settle only understood calls', () => {
  const run = (
    words: readonly string[],
    platform: string,
    options: { resolved?: string | null; shell?: boolean; target?: 'inside' | 'outside' } = {},
  ) =>
    localClassifierVerdict({
      tool: 'commands_run',
      target: options.target ?? 'inside',
      command: {
        program: words[0] ?? '',
        args: words.slice(1),
        shell: options.shell ?? false,
        platform,
        resolved: options.resolved === undefined ? null : options.resolved,
      },
    })

  test('a contained read-only tool needs no evaluator', () => {
    for (const tool of ['fs_read', 'fs_list', 'search']) {
      expect(localClassifierVerdict({ tool, target: 'inside' })).toBe('allow')
    }
  })

  test.each([
    ['linux', ['ls'], '/usr/bin/ls'],
    ['linux', ['ls', 'src'], '/usr/bin/ls'],
    ['linux', ['ls', '-la', 'src/app', 'docs'], '/bin/ls'],
    ['linux', ['/usr/bin/ls', '-1'], '/usr/bin/ls'],
    ['linux', ['dir', 'src'], '/usr/bin/dir'],
    ['darwin', ['ls', '-lh'], '/bin/ls'],
    ['win32', ['ls', 'src\\app'], 'C:\\Program Files\\Git\\usr\\bin\\ls.exe'],
  ])('on %s, %j resolved on the PATH is a contained listing', (platform, words, resolved) => {
    expect(run(words, platform, { resolved })).toBe('allow')
  })

  test.each([
    ['linux', ['rm', '-rf', '.git']],
    ['linux', ['rm', '-fr', '.git']],
    ['linux', ['rm', '-r', '-f', '.git']],
    ['linux', ['rm', '-rf', '.git/']],
    ['linux', ['rm', '-rf', './.git']],
    ['linux', ['rm', '-rf', '/home/me/repo/.git']],
    ['linux', ['rm', '--recursive', '--force', '.git/objects']],
    ['linux', ['sh', '-c', 'cd repo && rm -rf .git']],
    ['linux', ['portless', 'web', 'rm', '-rf', '.git']],
    ['darwin', ['/bin/rm', '-Rf', '.git']],
    ['win32', ['rm.exe', '-rf', '.git']],
    ['win32', ['rmdir', '/s', '/q', '.git']],
    ['win32', ['rd', '/s', '/q', 'C:\\repo\\.git\\']],
    ['win32', ['del', '/s', '/q', '.GIT']],
    ['win32', ['cmd', '/c', 'rmdir /s /q .git']],
    ['win32', ['powershell', '-Command', 'Remove-Item -Recurse -Force .git']],
    ['win32', ['pwsh.exe', '-c', 'ri -r .git']],
  ])('on %s, %j deletes the repository and is refused', (platform, words) => {
    expect(run(words, platform, { resolved: null })).toBe('deny')
  })

  test.each([
    ['linux', ['ls', '&&', 'rm', '-rf', 'build'], '/usr/bin/ls'],
    ['linux', ['ls', '../outside'], '/usr/bin/ls'],
    ['linux', ['ls', '/etc'], '/usr/bin/ls'],
    ['linux', ['ls', '--hide=x'], '/usr/bin/ls'],
    ['linux', ['ls', '$(rm -rf build)'], '/usr/bin/ls'],
    ['linux', ['ls', 'src;rm'], '/usr/bin/ls'],
    ['linux', ['ls', '*'], '/usr/bin/ls'],
    ['linux', ['ls'], null],
    ['linux', ['ls'], '/tmp/evil/ls-wrapper'],
    ['linux', ['./ls'], '/work/ls'],
    ['linux', ['rm', '.gitignore'], '/usr/bin/rm'],
    ['linux', ['rm', '-rf', '.github'], '/usr/bin/rm'],
    ['win32', ['dir'], null],
    ['win32', ['ls', 'C:\\Windows'], 'C:\\Git\\usr\\bin\\ls.exe'],
  ])('on %s, %j is neither allowed nor refused locally', (platform, words, resolved) => {
    expect(run(words, platform, { resolved })).toBe('defer')
  })

  test('a listing through a shell or outside the Workspace is not allowed locally', () => {
    expect(run(['ls'], 'linux', { resolved: '/usr/bin/ls', shell: true })).toBe('defer')
    expect(run(['ls'], 'linux', { resolved: '/usr/bin/ls', target: 'outside' })).toBe('defer')
    expect(localClassifierVerdict({ tool: 'fs_list', target: 'outside' })).toBe('defer')
    expect(localClassifierVerdict({ tool: 'fs_list', target: 'unknown' })).toBe('defer')
  })

  test('a deletion of the repository is refused wherever it runs', () => {
    expect(run(['rm', '-rf', '.git'], 'linux', { target: 'outside' })).toBe('deny')
  })
})

describe('Jev asks instead of refusing, at the strictness the user chose', () => {
  const decide = (
    strictness: ClassifierStrictness,
    risk: number,
    approval: number,
    userRequested: number,
    hasHumanContext = true,
  ) => classifierVerdictFromScores({ risk, approval, userRequested, hasHumanContext }, strictness)

  test('the policy that records the strictness is a new version', () => {
    expect(CLASSIFIER_POLICY_VERSION).toBe('3')
    expect(CLASSIFIER_STRICTNESS_LEVELS).toEqual(['careful', 'normal', 'permissive'])
    expect(DEFAULT_CLASSIFIER_STRICTNESS).toBe('normal')
  })

  test.each(CLASSIFIER_STRICTNESS_LEVELS)(
    'at %s, the rm -rf judged live (risk 2.96, approval 0.88, asked 0.18) asks',
    (strictness) => {
      expect(decide(strictness, 2.96, 0.88, 0.18)).toBe('ask')
    },
  )

  test.each(CLASSIFIER_STRICTNESS_LEVELS)('at %s, the judge never refuses', (strictness) => {
    for (const risk of [0, 0.75, 1.5, 2.5, 3]) {
      for (const approval of [0, 0.5, 0.75, 1]) {
        for (const userRequested of [0, 0.85, 1]) {
          expect(decide(strictness, risk, approval, userRequested)).not.toBe('deny')
          expect(decide(strictness, risk, approval, userRequested, false)).not.toBe('deny')
        }
      }
    }
  })

  // strictness, risk, approval, userRequested, verdict
  test.each([
    // Careful: a read passes; a change beyond the smallest asks unless the user asked for it; a
    // significant change asks even then.
    ['careful', 0.749, 0.499, 0, 'allow'],
    ['careful', 0.75, 0, 0.849, 'ask'],
    ['careful', 0.75, 0, 0.85, 'allow'],
    ['careful', 0, 0.5, 0.849, 'ask'],
    ['careful', 0, 0.5, 0.85, 'allow'],
    ['careful', 1.499, 0.9, 0.85, 'allow'],
    ['careful', 1.5, 0, 1, 'ask'],
    ['careful', 3, 1, 1, 'ask'],
    // Normal: the thresholds of policy 1, with the destructive band asking where it refused.
    ['normal', 1.499, 0.749, 0, 'allow'],
    ['normal', 1.5, 0, 0.849, 'ask'],
    ['normal', 1.5, 0, 0.85, 'allow'],
    ['normal', 0, 0.75, 0.849, 'ask'],
    ['normal', 0, 0.75, 0.85, 'allow'],
    ['normal', 2.499, 1, 0.85, 'allow'],
    ['normal', 2.5, 0, 1, 'ask'],
    ['normal', 3, 1, 1, 'ask'],
    // Permissive: only a destructive call asks, and not when the user clearly asked for it.
    ['permissive', 2.499, 1, 0, 'allow'],
    ['permissive', 2.5, 0, 0.849, 'ask'],
    ['permissive', 2.5, 0, 0.85, 'allow'],
    ['permissive', 3, 1, 1, 'allow'],
  ] as const)(
    'at %s, risk %d, approval %d, asked %d: %s',
    (strictness, risk, approval, asked, verdict) => {
      expect(decide(strictness, risk, approval, asked)).toBe(verdict)
    },
  )

  test.each(CLASSIFIER_STRICTNESS_LEVELS)(
    'at %s, what the user asked for lifts nothing without their words',
    (strictness) => {
      expect(decide(strictness, 2.5, 0, 1, false)).toBe('ask')
      expect(decide(strictness, 0, 0.75, 1, false)).toBe(
        strictness === 'permissive' ? 'allow' : 'ask',
      )
    },
  )

  test.each(CLASSIFIER_STRICTNESS_LEVELS)('at %s, invalid scores can never allow', (strictness) => {
    expect(decide(strictness, Number.NaN, 0, 0)).toBe('ask')
    expect(decide(strictness, 0, Number.POSITIVE_INFINITY, 0)).toBe('ask')
    expect(decide(strictness, 0, 0, -0.1)).toBe('ask')
    expect(decide(strictness, 3.1, 0, 0)).toBe('ask')
  })

  test('a stricter level asks for everything a looser one asks for', () => {
    const scores = [0, 0.5, 0.75, 1, 1.5, 2, 2.5, 3]
    const shares = [0, 0.5, 0.75, 0.85, 1]
    for (const risk of scores) {
      for (const approval of shares) {
        for (const userRequested of shares) {
          const asks = (level: ClassifierStrictness) =>
            decide(level, risk, approval, userRequested) === 'ask'
          if (asks('permissive')) expect(asks('normal')).toBe(true)
          if (asks('normal')) expect(asks('careful')).toBe(true)
        }
      }
    }
  })
})

describe("Hemera's own workflow tools are not judged again", () => {
  test('reports, proposals, stops and Spec edits keep their own interaction', () => {
    for (const tool of [
      'task_finished',
      'task_blocked',
      'spec_propose',
      'spec_write',
      'commands_propose',
      'commands_stop',
      'project_get',
      'session_get',
      'spec_read',
      'build_read',
      'commands_list',
      'commands_output',
    ]) {
      expect(judgedByClassifier(tool)).toBe(false)
    }
  })

  test('what touches files or starts a process is judged', () => {
    for (const tool of ['fs_read', 'fs_list', 'search', 'fs_write', 'fs_edit', 'commands_run']) {
      expect(judgedByClassifier(tool)).toBe(true)
    }
  })
})
