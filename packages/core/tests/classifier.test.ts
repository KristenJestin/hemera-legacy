import { describe, expect, test } from 'vite-plus/test'

import {
  classifierVerdictFromScores,
  localClassifierVerdict,
  nativePermissionMode,
} from '#index.ts'

test('Hemera Auto reserves native permission modes but preserves independent planning', () => {
  const mode = { id: 'session-mode', category: 'mode' }
  expect(nativePermissionMode(mode, 'acceptEdits')).toBe(true)
  expect(nativePermissionMode(mode, 'plan')).toBe(false)
  expect(nativePermissionMode({ id: 'model', category: 'model' }, 'plan')).toBe(false)
})

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

describe('Risk and authorization thresholds are applied in order', () => {
  const decide = (risk: number, approval: number, userRequested: number, hasHumanContext = true) =>
    classifierVerdictFromScores({ risk, approval, userRequested, hasHumanContext })

  test('the destructive threshold wins even when the user asked', () => {
    expect(decide(2.499, 0, 1)).toBe('allow')
    expect(decide(2.5, 0, 1)).toBe('deny')
    expect(decide(3, 1, 1)).toBe('deny')
  })

  test('medium risk or high approval needs supported human intent', () => {
    expect(decide(1.499, 0.749, 0)).toBe('allow')
    expect(decide(1.5, 0, 0.849)).toBe('ask')
    expect(decide(1.5, 0, 0.85)).toBe('allow')
    expect(decide(0, 0.75, 0.849)).toBe('ask')
    expect(decide(0, 0.75, 0.85)).toBe('allow')
    expect(decide(1.5, 1, 1, false)).toBe('ask')
  })

  test('invalid scores can never allow', () => {
    expect(decide(Number.NaN, 0, 0)).toBe('ask')
    expect(decide(0, Number.POSITIVE_INFINITY, 0)).toBe('ask')
    expect(decide(0, 0, -0.1)).toBe('ask')
    expect(decide(3.1, 0, 0)).toBe('ask')
  })
})
